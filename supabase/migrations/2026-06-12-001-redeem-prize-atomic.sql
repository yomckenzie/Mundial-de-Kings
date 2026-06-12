-- ════════════════════════════════════════════════════════════════════════════
-- Chess King — Migración 2026-06-12-001
-- Canje atómico server-side: redeem_prize()
--
-- PROBLEMA QUE RESUELVE:
-- Si dos usuarios canjean el mismo premio al mismo tiempo desde dispositivos
-- distintos, ambos pasaban la validación del navegador (cada uno ve stock=1)
-- y se creaban 2 canjes para 1 unidad. Esta función valida stock y puntos
-- DENTRO de una transacción de Postgres con lock en la fila del premio:
-- los canjes concurrentes del mismo premio se procesan EN SERIE y el
-- segundo recibe error OUT_OF_STOCK al instante. Nunca se crean duplicados
-- ni se vende de más. El inventario NO se modifica (sigue siendo cálculo
-- dinámico: units_available - canjes activos).
--
-- INSTRUCCIONES:
-- 1. Abrí Supabase Dashboard → SQL Editor
-- 2. Pegá TODO este archivo
-- 3. Click RUN
--
-- Esta migración es IDEMPOTENTE: la podés correr varias veces sin romper.
-- ════════════════════════════════════════════════════════════════════════════

-- Registrar en versionado (si existe la tabla de migraciones)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations') THEN
    INSERT INTO schema_migrations (version, description)
    VALUES ('2026-06-12-001', 'Canje atomico server-side: redeem_prize() anti race-condition')
    ON CONFLICT (version) DO NOTHING;
  END IF;
END $$;

-- Índice para que el conteo de canjes activos por premio sea rápido
CREATE INDEX IF NOT EXISTS idx_redemptions_prize_status
  ON redemptions (prize_id, status);

CREATE INDEX IF NOT EXISTS idx_redemptions_user_status
  ON redemptions (user_email, status);

-- ─── Función principal ───
CREATE OR REPLACE FUNCTION public.redeem_prize(
  p_user_email   TEXT,
  p_prize_id     TEXT,
  p_id           TEXT DEFAULT NULL,
  p_created_date TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_prize    prizes%ROWTYPE;
  v_user     users%ROWTYPE;
  v_reserved INT;
  v_spent    INT;
  v_id       TEXT;
  v_created  TIMESTAMPTZ;
  v_row      redemptions%ROWTYPE;
BEGIN
  -- 1) Lock de la fila del premio: serializa canjes concurrentes del MISMO
  --    premio. El segundo usuario espera aquí hasta que el primero termine,
  --    y entonces ve el canje recién insertado al contar el stock.
  SELECT * INTO v_prize FROM prizes WHERE id = p_prize_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRIZE_NOT_FOUND';
  END IF;
  IF COALESCE(v_prize.status, '') <> 'active' THEN
    RAISE EXCEPTION 'PRIZE_NOT_ACTIVE';
  END IF;

  -- 2) Lock de la fila del usuario: serializa canjes del MISMO usuario
  --    sobre premios distintos (evita gastar los mismos puntos dos veces).
  SELECT * INTO v_user FROM users WHERE email = p_user_email FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  -- 3) Stock dinámico: unidades totales menos canjes activos.
  --    Los rechazados NO cuentan (la unidad regresó al inventario).
  SELECT COUNT(*) INTO v_reserved
  FROM redemptions
  WHERE prize_id = p_prize_id
    AND status IN ('pending', 'approved', 'delivered');

  IF COALESCE(v_prize.units_available, 0) - v_reserved <= 0 THEN
    RAISE EXCEPTION 'OUT_OF_STOCK';
  END IF;

  -- 4) Puntos disponibles: total menos puntos reservados en canjes activos.
  SELECT COALESCE(SUM(points_spent), 0) INTO v_spent
  FROM redemptions
  WHERE user_email = p_user_email
    AND status IN ('pending', 'approved', 'delivered');

  IF COALESCE(v_user.total_points, 0) - v_spent < COALESCE(v_prize.points_cost, 0) THEN
    RAISE EXCEPTION 'INSUFFICIENT_POINTS';
  END IF;

  -- 5) Insertar el canje en estado pending.
  --    id y created_date los puede mandar el cliente (mismo formato que
  --    makeId()/getNow() de la app); si no, se generan aquí.
  v_id := COALESCE(
    NULLIF(p_id, ''),
    (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT::TEXT
      || '_' || substr(md5(random()::text), 1, 6)
  );
  v_created := COALESCE(NULLIF(p_created_date, '')::TIMESTAMPTZ, now());

  INSERT INTO redemptions (id, created_date, user_email, prize_id, prize_name, points_spent, status, updated_at)
  VALUES (v_id, v_created, p_user_email, p_prize_id, v_prize.name, COALESCE(v_prize.points_cost, 0), 'pending', v_created)
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- La app usa la anon key (sin Supabase Auth), así que ambos roles necesitan EXECUTE
GRANT EXECUTE ON FUNCTION public.redeem_prize(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ─── Verificación ───
SELECT '✅ redeem_prize() instalada — canjes ahora son atómicos' AS resultado;
