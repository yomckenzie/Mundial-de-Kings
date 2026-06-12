-- ════════════════════════════════════════════════════════════════════════════
-- Migración 2026-06-11-003 (v2)
-- UNIQUE constraints faltantes para natural keys del sync layer
-- ════════════════════════════════════════════════════════════════════════════
-- Ejecutar en Supabase SQL Editor. Idempotente.
--
-- ⚠️ POR QUÉ ES NECESARIO:
--   El código en db.js usa NATURAL_KEYS para upserts con ON CONFLICT.
--   Estas tablas TIENEN natural key definida pero NO tienen UNIQUE constraint
--   en Supabase, causando error 42P10 en cada sync.
--
--   Error en logs: "there is no unique or exclusion constraint matching
--   the ON CONFLICT specification"
--
--   Aunque el código tiene fallback a ON CONFLICT(id), el error inicial
--   ralentiza el sync y en tablas como referrals/commissions puede causar
--   duplicados cuando el id local no existe en la nube.
--
-- ⚠️ IMPORTANTE: Usamos ALTER TABLE ... ADD CONSTRAINT (UNIQUE constraints),
--    NO índices parciales ni funcionales. PostgREST genera ON CONFLICT con
--    los nombres de columna exactos, y debe matchear con una constraint
--    o índice que tenga ESA MISMA especificación.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 0) DROPEAR índices incorrectos de la v1 (si se ejecutaron) ───
-- La v1 usaba CREATE UNIQUE INDEX con WHERE/COALESCE que NO matchean
-- con ON CONFLICT(fixture_id) ni ON CONFLICT(to_email, match_id, level).
DROP INDEX IF EXISTS uq_matches_fixture_notnull;
DROP INDEX IF EXISTS uq_referral_commissions_target;


-- ─── 1. Referrals: un referente solo puede referir a cada persona UNA vez ───
-- Natural key: (referrer_email, referred_email)
DO $$
BEGIN
  -- Primero limpiar duplicados existentes (conservar el más antiguo)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY referrer_email, referred_email
      ORDER BY created_date ASC NULLS LAST, id ASC
    ) AS rn
    FROM referrals
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM referrals WHERE id IN (SELECT id FROM to_delete);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_referrals_pair'
  ) THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT uq_referrals_pair UNIQUE (referrer_email, referred_email);
  END IF;
END $$;


-- ─── 2. Referral commissions: una comisión por (to_email, match_id, level) ───
-- Natural key: (to_email, match_id, level)
-- ⚠️ Usamos UNIQUE CONSTRAINT regular. PostgreSQL permite múltiples NULLs en
--    unique constraints, así que match_id=NULL no se bloquea. La app maneja
--    la deduplicación de comisiones por registro en memoria.
DO $$
BEGIN
  -- Limpiar duplicados existentes (conservar la de mayor points_earned)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY to_email, COALESCE(match_id, ''), level
      ORDER BY points_earned DESC NULLS LAST, created_date DESC NULLS LAST
    ) AS rn
    FROM referral_commissions
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM referral_commissions WHERE id IN (SELECT id FROM to_delete);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_referral_commissions_target'
  ) THEN
    ALTER TABLE public.referral_commissions
      ADD CONSTRAINT uq_referral_commissions_target UNIQUE (to_email, match_id, level);
  END IF;
END $$;


-- ─── 3. Matches: un fixture_id solo puede existir UNA vez ───
-- Natural key: fixture_id
-- ⚠️ Usamos UNIQUE CONSTRAINT regular. PostgreSQL permite múltiples NULLs.
--    PostgREST genera ON CONFLICT(fixture_id) que MATCHEA esta constraint.
DO $$
BEGIN
  -- Limpiar duplicados existentes (conservar el que tenga más datos)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY fixture_id
      ORDER BY
        (CASE WHEN result_team1 IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN result_team2 IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN status IS NOT NULL THEN 1 ELSE 0 END) DESC,
        created_date ASC NULLS LAST
    ) AS rn
    FROM matches
    WHERE fixture_id IS NOT NULL
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM matches WHERE id IN (SELECT id FROM to_delete);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_matches_fixture'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT uq_matches_fixture UNIQUE (fixture_id);
  END IF;
END $$;


-- ─── 4. Users: cada email debe ser único ───
-- Natural key: email
DO $$
BEGIN
  -- Limpiar duplicados existentes (conservar el más completo)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY email
      ORDER BY
        (CASE WHEN profile_complete THEN 1 ELSE 0 END +
         CASE WHEN full_name IS NOT NULL AND full_name != '' THEN 1 ELSE 0 END) DESC,
        created_date ASC NULLS LAST
    ) AS rn
    FROM users
    WHERE email IS NOT NULL
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM users WHERE id IN (SELECT id FROM to_delete);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_email'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT uq_users_email UNIQUE (email);
  END IF;
END $$;


-- ─── 5. App settings: cada key debe ser única ───
-- Natural key: key
DO $$
BEGIN
  -- Limpiar duplicados existentes (conservar el último por key)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY key
      ORDER BY created_date DESC NULLS LAST, id DESC
    ) AS rn
    FROM app_settings
    WHERE key IS NOT NULL
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM app_settings WHERE id IN (SELECT id FROM to_delete);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_app_settings_key'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT uq_app_settings_key UNIQUE (key);
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  expected_names TEXT[] := ARRAY[
    'uq_referrals_pair', 'uq_referral_commissions_target',
    'uq_matches_fixture', 'uq_users_email', 'uq_app_settings_key'
  ];
  missing_constraints TEXT[] := ARRAY[]::TEXT[];
  c TEXT;
  total_constraints INT;
BEGIN
  FOREACH c IN ARRAY expected_names LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c) THEN
      missing_constraints := array_append(missing_constraints, c);
    END IF;
  END LOOP;

  SELECT count(*) INTO total_constraints FROM pg_constraint
    WHERE conname = ANY(expected_names);

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Migración 2026-06-11-003 (v2) — Constraints creadas: %/5', total_constraints;
  IF array_length(missing_constraints, 1) > 0 THEN
    RAISE WARNING '⚠️  NO creadas: %', array_to_string(missing_constraints, ', ');
  ELSE
    RAISE NOTICE '✅ Todas las 5 UNIQUE constraints creadas exitosamente';
  END IF;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
