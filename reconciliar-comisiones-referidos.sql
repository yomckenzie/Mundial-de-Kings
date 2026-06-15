-- ════════════════════════════════════════════════════════════════════════════
-- RECONCILIAR COMISIONES DE REFERIDO POR ACIERTO  (idempotente)
--
-- REGLA DE NEGOCIO (decidida 15 jun 2026): el referente gana 5 pts por CADA
-- referido que acierta — incluso si varios referidos aciertan el MISMO partido
-- (ej. arnold: 4 referidos acertaron el partido pxv8yf → 20 pts, no 5).
--
-- PROBLEMA QUE ARREGLA:
--   1) La comisión de 5 pts solo se otorgaba por el navegador
--      (evaluateMatchPredictions → awardReferralCommission). Si un partido se
--      evaluó/corrigió por SQL (fix-reevaluar-partidos.sql tras un dedup), las
--      comisiones nunca se crearon ni se sumaron a referral_points.
--   2) Una restricción de un dedup viejo —UNIQUE(to_email, match_id, level)—
--      forzaba "1 comisión por partido", impidiendo pagar por cada referido.
--      Se reemplaza por UNIQUE(from_email, to_email, match_id, level).
--
-- QUÉ HACE (solo aciertos; NO toca comisiones/puntos de registro):
--   1) Reemplaza la restricción única por la regla correcta (por referido).
--   2) Crea la comisión faltante (5 pts) por cada acierto de un referido.
--   3) Suma esos pts a referral_points y recalcula total_points canónicamente.
--
-- IDEMPOTENTE: re-correrlo no duplica nada. Supabase → SQL Editor → RUN.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Corregir la restricción única: de "por partido" a "por referido" ───
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS uq_referral_commissions_target;
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS uq_referral_commissions;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_referral_commissions_per_referral') THEN
    ALTER TABLE public.referral_commissions
      ADD CONSTRAINT uq_referral_commissions_per_referral
      UNIQUE (from_email, to_email, match_id, level);
  END IF;
END $$;

-- ─── 2) Backfill de comisiones faltantes + sumar puntos ───
WITH should_have AS (
  SELECT DISTINCT
    p.user_email AS from_email,
    r.email      AS to_email,
    p.match_id
  FROM public.predictions p
  JOIN public.users predictor ON predictor.email = p.user_email
  JOIN public.users r         ON r.referral_code = predictor.referred_by
  WHERE p.scored = true
    AND p.is_correct = true
    AND p.match_id IS NOT NULL
    AND predictor.referred_by IS NOT NULL
    AND predictor.email <> r.email                       -- no auto-referido
    AND (predictor.role <> 'admin' OR predictor.role IS NULL)
),
missing AS (
  SELECT s.* FROM should_have s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.referral_commissions c
    WHERE c.from_email = s.from_email
      AND c.to_email   = s.to_email
      AND c.match_id   = s.match_id
  )
),
inserted AS (
  INSERT INTO public.referral_commissions
    (id, from_email, to_email, match_id, level, points_earned, created_date)
  SELECT
    (extract(epoch FROM clock_timestamp()) * 1000)::bigint::text
      || '_' || substr(md5(random()::text || m.from_email || m.match_id), 1, 6),
    m.from_email, m.to_email, m.match_id, 1, 5, now()
  FROM missing m
  RETURNING to_email, points_earned
)
UPDATE public.users u
SET referral_points = COALESCE(u.referral_points, 0) + agg.pts,
    total_points    = COALESCE(u.prediction_points, 0)
                      + COALESCE(u.bonus_points, 0)
                      + COALESCE(u.referral_points, 0) + agg.pts,
    updated_at      = now()
FROM (
  SELECT to_email, SUM(points_earned)::int AS pts
  FROM inserted
  GROUP BY to_email
) agg
WHERE u.email = agg.to_email;

-- ─── VERIFICACIÓN ───

-- a) Comisiones por acierto totales (debería pasar de 2 a 9)
SELECT 'comisiones acierto totales' AS chequeo, COUNT(*) AS valor
FROM public.referral_commissions WHERE match_id IS NOT NULL;

-- b) arnold debería quedar con referral_points = 90 (antes 70)
SELECT email, prediction_points, bonus_points, referral_points, total_points
FROM public.users WHERE email = 'arnold.perez0218@gmail.com';

-- c) ¿Quedan aciertos de referidos sin comisión? Debería ser 0.
WITH should_have AS (
  SELECT DISTINCT p.user_email AS from_email, r.email AS to_email, p.match_id
  FROM public.predictions p
  JOIN public.users predictor ON predictor.email = p.user_email
  JOIN public.users r ON r.referral_code = predictor.referred_by
  WHERE p.scored = true AND p.is_correct = true AND p.match_id IS NOT NULL
    AND predictor.referred_by IS NOT NULL AND predictor.email <> r.email
    AND (predictor.role <> 'admin' OR predictor.role IS NULL)
)
SELECT 'aciertos de referido sin comision' AS chequeo, COUNT(*) AS valor
FROM should_have s
WHERE NOT EXISTS (
  SELECT 1 FROM public.referral_commissions c
  WHERE c.from_email = s.from_email AND c.to_email = s.to_email AND c.match_id = s.match_id
);

COMMIT;
