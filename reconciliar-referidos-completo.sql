-- ════════════════════════════════════════════════════════════════════════════
-- RECONCILIAR REFERIDOS — bono de registro (+10) y comisión por acierto (+5)
--                          + función server-side confiable. IDEMPOTENTE.
--
-- PROBLEMAS QUE ARREGLA (15 jun 2026):
--   1) El bono de +10 por invitar casi nunca se acreditaba: se otorgaba desde el
--      navegador del NUEVO usuario (caché local vacío/parcial + carrera con el
--      redirect + RLS), así que el referente no recibía sus 10 pts.
--   2) La comisión de +5 por acierto de referido solo se creaba por el navegador
--      (no al re-evaluar por SQL).
--   3) Restricción vieja UNIQUE(to_email,match_id,level) impedía pagar por cada
--      referido. Se reemplaza por UNIQUE NULLS NOT DISTINCT(from,to,match,level).
--
-- MODELO CANÓNICO: referral_points = SUMA de todas las comisiones del usuario
--   (registro 10 + aciertos 5). total_points = prediction + bonus + referral.
--   Nada más escribe referral_points, así que recalcular es seguro.
--
-- Supabase → SQL Editor → pegar TODO → RUN. Se puede re-correr sin duplicar.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Restricción correcta: una comisión por (from, to, match, level) ───
--     NULLS NOT DISTINCT → también deduplica el bono de registro (match_id NULL).
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS uq_referral_commissions_target;
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS uq_referral_commissions;
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS uq_referral_commissions_per_referral;
ALTER TABLE public.referral_commissions
  ADD CONSTRAINT uq_referral_commissions_per_referral
  UNIQUE NULLS NOT DISTINCT (from_email, to_email, match_id, level);

-- ─── 2) Función server-side confiable para el bono de registro (+10) ───
--     SECURITY DEFINER: ignora RLS. Idempotente: no duplica.
CREATE OR REPLACE FUNCTION public.award_referral_bonus(
  p_referrer_code TEXT,
  p_referred_email TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref public.users%ROWTYPE; v_id TEXT;
BEGIN
  IF p_referrer_code IS NULL OR p_referred_email IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_ref FROM public.users WHERE lower(referral_code) = lower(p_referrer_code) LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF lower(v_ref.email) = lower(p_referred_email) THEN RETURN NULL; END IF;  -- no auto-referido
  -- Idempotente: si ya existe el bono de registro para este par, no repetir
  IF EXISTS (SELECT 1 FROM public.referral_commissions
             WHERE from_email = p_referred_email AND to_email = v_ref.email AND match_id IS NULL) THEN
    RETURN to_jsonb(v_ref);
  END IF;
  v_id := (extract(epoch FROM clock_timestamp())*1000)::bigint::text
          || '_' || substr(md5(random()::text || p_referred_email), 1, 6);
  INSERT INTO public.referral_commissions (id, from_email, to_email, match_id, level, points_earned, created_date)
  VALUES (v_id, p_referred_email, v_ref.email, NULL, 1, 10, now());
  UPDATE public.users
  SET referral_points = COALESCE(referral_points, 0) + 10,
      total_points    = COALESCE(prediction_points, 0) + COALESCE(bonus_points, 0) + COALESCE(referral_points, 0) + 10,
      updated_at      = now()
  WHERE id = v_ref.id;
  RETURN to_jsonb(v_ref);
END $$;
GRANT EXECUTE ON FUNCTION public.award_referral_bonus(TEXT, TEXT) TO anon, authenticated;

-- ─── 3) Backfill: crear el bono de registro faltante (10 pts) por cada referido ───
INSERT INTO public.referral_commissions (id, from_email, to_email, match_id, level, points_earned, created_date)
SELECT
  (extract(epoch FROM clock_timestamp())*1000)::bigint::text
    || '_' || substr(md5(random()::text || referido.email || r.email), 1, 6),
  referido.email, r.email, NULL, 1, 10, COALESCE(referido.created_date, now())
FROM public.users referido
JOIN public.users r ON r.referral_code = referido.referred_by
WHERE referido.referred_by IS NOT NULL
  AND referido.email <> r.email
  AND NOT EXISTS (
    SELECT 1 FROM public.referral_commissions c
    WHERE c.from_email = referido.email AND c.to_email = r.email AND c.match_id IS NULL
  );

-- ─── 4) Recalcular referral_points = SUMA de comisiones; total canónico ───
WITH sums AS (
  SELECT to_email, SUM(points_earned)::int AS pts
  FROM public.referral_commissions
  GROUP BY to_email
)
UPDATE public.users u
SET referral_points = COALESCE(s.pts, 0),
    total_points    = COALESCE(u.prediction_points, 0) + COALESCE(u.bonus_points, 0) + COALESCE(s.pts, 0),
    updated_at      = now()
FROM sums s
WHERE u.email = s.to_email
  AND (u.referral_points IS DISTINCT FROM COALESCE(s.pts, 0)
       OR u.total_points IS DISTINCT FROM COALESCE(u.prediction_points,0)+COALESCE(u.bonus_points,0)+COALESCE(s.pts,0));

-- ─── VERIFICACIÓN ───
-- a) Comisiones de registro creadas (match_id NULL)
SELECT 'comisiones de registro' AS chequeo, COUNT(*) AS valor
FROM public.referral_commissions WHERE match_id IS NULL;

-- b) Muestra: referentes con sus puntos ya correctos (referidos*10 + aciertos*5)
SELECT u.email,
       (SELECT COUNT(*) FROM public.users x WHERE x.referred_by = u.referral_code) AS referidos,
       (SELECT COUNT(*) FROM public.referral_commissions c WHERE c.to_email = u.email AND c.match_id IS NOT NULL) AS aciertos,
       u.referral_points, u.total_points
FROM public.users u
WHERE u.referral_code IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.users x WHERE x.referred_by = u.referral_code)
ORDER BY u.referral_points DESC;

COMMIT;
