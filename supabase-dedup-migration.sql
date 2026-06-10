-- ============================================================
-- CHESS KING — DEDUPLICACIÓN + UNIQUE CONSTRAINTS
-- Ejecutar en: SQL Editor de Supabase
-- https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================
-- OBJETIVO:
--   1) Limpiar filas duplicadas que ya están en la BD
--   2) Agregar UNIQUE constraints para que NO vuelvan a aparecer
-- ============================================================
-- ANTES DE EJECUTAR:
--   - Haz un backup de la BD (Dashboard > Settings > Backups)
--   - O exporta las tablas afectadas desde el Table Editor
-- IDEMPOTENTE: seguro de correr varias veces.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 0) DIAGNÓSTICO: ver cuántas filas duplicadas hay
-- ════════════════════════════════════════════════════════════
-- (Solo lectura. No modifica nada. Útil para ver el daño antes/después.)

SELECT 'predictions (user_email, match_id)' AS tabla, COUNT(*) AS total_filas_duplicadas
  FROM (
    SELECT user_email, match_id
    FROM public.predictions
    GROUP BY user_email, match_id
    HAVING COUNT(*) > 1
  ) d;

SELECT 'referrals (referrer_email, referred_email)' AS tabla, COUNT(*) AS total_filas_duplicadas
  FROM (
    SELECT referrer_email, referred_email
    FROM public.referrals
    GROUP BY referrer_email, referred_email
    HAVING COUNT(*) > 1
  ) d;

SELECT 'referral_commissions (to_email, match_id, level)' AS tabla, COUNT(*) AS total_filas_duplicadas
  FROM (
    SELECT to_email, match_id, level
    FROM public.referral_commissions
    GROUP BY to_email, match_id, level
    HAVING COUNT(*) > 1
  ) d;

SELECT 'matches (fixture_id)' AS tabla, COUNT(*) AS total_filas_duplicadas
  FROM (
    SELECT fixture_id
    FROM public.matches
    WHERE fixture_id IS NOT NULL
    GROUP BY fixture_id
    HAVING COUNT(*) > 1
  ) d;

SELECT 'users (email)' AS tabla, COUNT(*) AS total_filas_duplicadas
  FROM (
    SELECT email
    FROM public.users
    GROUP BY email
    HAVING COUNT(*) > 1
  ) d;


-- ════════════════════════════════════════════════════════════
-- 1) LIMPIAR DUPLICADOS EN PREDICTIONS
--    Estrategia: conservar la fila MÁS RECIENTE por (user_email, match_id)
--    Si hay varias con la misma created_date, conservar la de mayor
--    puntos_earned (o la primera en orden de id como desempate).
-- ════════════════════════════════════════════════════════════

DELETE FROM public.predictions p
USING public.predictions p2
WHERE p.user_email = p2.user_email
  AND p.match_id   = p2.match_id
  AND (
    p.created_date < p2.created_date
    OR (
      p.created_date = p2.created_date
      AND COALESCE(p.points_earned, 0) < COALESCE(p2.points_earned, 0)
    )
  );


-- ════════════════════════════════════════════════════════════
-- 2) LIMPIAR DUPLICADOS EN REFERRALS
--    Conservar el registro MÁS ANTIGUO (primera vez que se refirieron).
-- ════════════════════════════════════════════════════════════

DELETE FROM public.referrals r
USING public.referrals r2
WHERE r.referrer_email = r2.referrer_email
  AND r.referred_email = r2.referred_email
  AND r.created_date > r2.created_date;


-- ════════════════════════════════════════════════════════════
-- 3) LIMPIAR DUPLICADOS EN REFERRAL_COMMISSIONS
--    Conservar la fila MÁS RECIENTE (último cálculo de comisión gana).
-- ════════════════════════════════════════════════════════════

DELETE FROM public.referral_commissions c
USING public.referral_commissions c2
WHERE c.to_email  = c2.to_email
  AND c.match_id IS NOT DISTINCT FROM c2.match_id
  AND c.level    = c2.level
  AND c.created_date < c2.created_date;


-- ════════════════════════════════════════════════════════════
-- 4) LIMPIAR DUPLICADOS EN MATCHES (por fixture_id)
--    Conservar el que tenga predicciones asociadas;
--    si ninguno tiene, conservar el más reciente.
--    Los demás se eliminan (y se re-apuntan las predicciones
--    al match conservado).
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
  keep_id text;
  dup_ids text[];
  repointed_count int := 0;
  deleted_count int := 0;
BEGIN
  FOR r IN
    SELECT fixture_id
    FROM public.matches
    WHERE fixture_id IS NOT NULL
    GROUP BY fixture_id
    HAVING COUNT(*) > 1
  LOOP
    -- 1) Elegir cuál conservar:
    --    a) Si alguno tiene predicciones → ese
    --    b) Si ninguno tiene predicciones → el de created_date más reciente
    SELECT m.id INTO keep_id
    FROM public.matches m
    LEFT JOIN (
      SELECT match_id, COUNT(*) AS n
      FROM public.predictions
      GROUP BY match_id
    ) p ON p.match_id = m.id
    WHERE m.fixture_id = r.fixture_id
    ORDER BY COALESCE(p.n, 0) DESC, m.created_date DESC, m.id ASC
    LIMIT 1;

    -- 2) IDs a eliminar
    SELECT array_agg(m.id) INTO dup_ids
    FROM public.matches m
    WHERE m.fixture_id = r.fixture_id
      AND m.id != keep_id;

    IF dup_ids IS NOT NULL THEN
      -- 3) Re-apuntar predicciones de los duplicados al partido conservado
      UPDATE public.predictions
      SET match_id = keep_id
      WHERE match_id = ANY(dup_ids);
      GET DIAGNOSTICS repointed_count = ROW_COUNT;

      -- 4) Eliminar los partidos duplicados
      DELETE FROM public.matches
      WHERE id = ANY(dup_ids);
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ matches: duplicados eliminados y predicciones re-apuntadas';
END $$;


-- ════════════════════════════════════════════════════════════
-- 5) LIMPIAR DUPLICADOS EN USERS (por email)
--    Conservar: la cuenta ADMIN si hay alguna con ese email,
--    sino la más reciente (última created_date).
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
  keep_id text;
  dup_ids text[];
BEGIN
  FOR r IN
    SELECT email
    FROM public.users
    GROUP BY email
    HAVING COUNT(*) > 1
  LOOP
    -- Preferir la fila admin; si ninguna es admin, la más reciente
    SELECT id INTO keep_id
    FROM public.users
    WHERE email = r.email
    ORDER BY (role = 'admin') DESC, created_date DESC, id ASC
    LIMIT 1;

    SELECT array_agg(id) INTO dup_ids
    FROM public.users
    WHERE email = r.email
      AND id != keep_id;

    IF dup_ids IS NOT NULL THEN
      -- Re-apuntar predicciones/redemptions del duplicado a la cuenta conservada
      UPDATE public.predictions
      SET user_email = (SELECT email FROM public.users WHERE id = keep_id)
      WHERE user_email IN (SELECT email FROM public.users WHERE id = ANY(dup_ids));

      UPDATE public.redemptions
      SET user_email = (SELECT email FROM public.users WHERE id = keep_id)
      WHERE user_email IN (SELECT email FROM public.users WHERE id = ANY(dup_ids));

      UPDATE public.points_bonuses
      SET user_email = (SELECT email FROM public.users WHERE id = keep_id)
      WHERE user_email IN (SELECT email FROM public.users WHERE id = ANY(dup_ids));

      UPDATE public.support_tickets
      SET user_email = (SELECT email FROM public.users WHERE id = keep_id)
      WHERE user_email IN (SELECT email FROM public.users WHERE id = ANY(dup_ids));

      UPDATE public.referrals
      SET referrer_email = (SELECT email FROM public.users WHERE id = keep_id)
      WHERE referrer_email IN (SELECT email FROM public.users WHERE id = ANY(dup_ids));

      UPDATE public.referrals
      SET referred_email = (SELECT email FROM public.users WHERE id = keep_id)
      WHERE referred_email IN (SELECT email FROM public.users WHERE id = ANY(dup_ids));

      UPDATE public.referral_commissions
      SET to_email = (SELECT email FROM public.users WHERE id = keep_id)
      WHERE to_email IN (SELECT email FROM public.users WHERE id = ANY(dup_ids));

      UPDATE public.referral_commissions
      SET from_email = (SELECT email FROM public.users WHERE id = keep_id)
      WHERE from_email IN (SELECT email FROM public.users WHERE id = ANY(dup_ids));

      -- Eliminar los usuarios duplicados
      DELETE FROM public.users WHERE id = ANY(dup_ids);
    END IF;
  END LOOP;

  RAISE NOTICE '✅ users: duplicados eliminados y referencias re-apuntadas';
END $$;


-- ════════════════════════════════════════════════════════════
-- 6) AGREGAR UNIQUE CONSTRAINTS (anti-duplicación a futuro)
--    Hacerlo en un DO block para que sea idempotente.
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- 6.1) predictions: UN usuario, UN pronóstico por partido
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_predictions_user_match') THEN
    -- Primero convertir/crear el índice UNIQUE (necesario para ON CONFLICT)
    -- Si el índice simple idx_predictions_user_match existe, lo reemplazamos
    DROP INDEX IF EXISTS public.idx_predictions_user_match;
    ALTER TABLE public.predictions
      ADD CONSTRAINT uq_predictions_user_match UNIQUE (user_email, match_id);
    RAISE NOTICE '✅ UNIQUE constraint agregado a predictions(user_email, match_id)';
  END IF;

  -- 6.2) referrals: un referido solo cuenta UNA vez por referente
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_referrals_pair') THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT uq_referrals_pair UNIQUE (referrer_email, referred_email);
    RAISE NOTICE '✅ UNIQUE constraint agregado a referrals(referrer_email, referred_email)';
  END IF;

  -- 6.3) referral_commissions: una comisión por (recipient, partido, nivel)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_referral_commissions') THEN
    ALTER TABLE public.referral_commissions
      ADD CONSTRAINT uq_referral_commissions
      UNIQUE (to_email, match_id, level);
    RAISE NOTICE '✅ UNIQUE constraint agregado a referral_commissions(to_email, match_id, level)';
  END IF;

  -- 6.4) matches: UN partido por fixture_id (los NULL se permiten múltiples — eso está bien)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_matches_fixture_id') THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT uq_matches_fixture_id UNIQUE (fixture_id);
    RAISE NOTICE '✅ UNIQUE constraint agregado a matches(fixture_id)';
  END IF;

  -- 6.5) users: email ya tiene UNIQUE por el schema, pero por si acaso
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_email') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT uq_users_email UNIQUE (email);
    RAISE NOTICE '✅ UNIQUE constraint agregado a users(email)';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- 7) VERIFICACIÓN FINAL
-- ════════════════════════════════════════════════════════════

-- 7.1) Confirmar que no quedan duplicados
DO $$
DECLARE
  dup_predictions int;
  dup_referrals int;
  dup_commissions int;
  dup_matches int;
  dup_users int;
BEGIN
  SELECT COUNT(*) INTO dup_predictions FROM (
    SELECT user_email, match_id FROM public.predictions
    GROUP BY user_email, match_id HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO dup_referrals FROM (
    SELECT referrer_email, referred_email FROM public.referrals
    GROUP BY referrer_email, referred_email HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO dup_commissions FROM (
    SELECT to_email, match_id, level FROM public.referral_commissions
    GROUP BY to_email, match_id, level HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO dup_matches FROM (
    SELECT fixture_id FROM public.matches
    WHERE fixture_id IS NOT NULL
    GROUP BY fixture_id HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO dup_users FROM (
    SELECT email FROM public.users
    GROUP BY email HAVING COUNT(*) > 1
  ) d;

  RAISE NOTICE '─── VERIFICACIÓN POST-DEDUP ───';
  RAISE NOTICE 'Duplicados restantes en predictions: %', dup_predictions;
  RAISE NOTICE 'Duplicados restantes en referrals: %', dup_referrals;
  RAISE NOTICE 'Duplicados restantes en referral_commissions: %', dup_commissions;
  RAISE NOTICE 'Duplicados restantes en matches: %', dup_matches;
  RAISE NOTICE 'Duplicados restantes en users: %', dup_users;

  IF dup_predictions + dup_referrals + dup_commissions + dup_matches + dup_users > 0 THEN
    RAISE WARNING '⚠️  Aún quedan duplicados. Revisa los datos manualmente.';
  ELSE
    RAISE NOTICE '✅ Todo limpio. Las UNIQUE constraints previenen nuevos duplicados.';
  END IF;
END $$;

-- 7.2) Confirmar que las constraints están aplicadas
SELECT conname, contype
FROM pg_constraint
WHERE conname IN (
  'uq_predictions_user_match',
  'uq_referrals_pair',
  'uq_referral_commissions',
  'uq_matches_fixture_id',
  'uq_users_email'
)
ORDER BY conname;
