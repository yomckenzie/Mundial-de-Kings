-- ════════════════════════════════════════════════════════════════════════════
-- ARREGLO CORRECTIVO — re-evaluar partidos terminados y recalcular puntos
--
-- Problema detectado (14 jun 2026): ~208 predicciones de partidos ya terminados
-- quedaron sin evaluar (scored=null) o mal marcadas (is_correct=false aunque
-- coincidían), y los puntos de los usuarios quedaron de un cálculo anterior →
-- ranking y puntos inconsistentes. Causa probable: un cliente con caché vieja
-- re-sincronizó y pisó las predicciones ya evaluadas en la nube.
--
-- Este script deja TODO consistente de forma idempotente:
--   1) Re-evalúa TODAS las predicciones de los 6 partidos terminados contra el
--      resultado oficial (corrige tanto los scored=null como los is_correct
--      mal puestos).
--   2) Recalcula prediction_points y total_points de TODOS los usuarios desde
--      cero (aciertos únicos por partido × 100 + bonus + referido). No suma →
--      no puede duplicar.
--
-- IMPORTANTE: usa los resultados que están HOY en la tabla `matches`. Si algún
-- resultado está mal (ej. Catar-Suiza), corregilo en `matches` ANTES de correr.
--
-- CÓMO USAR: Supabase → SQL Editor → pegar TODO → RUN. Revisar la verificación.
-- Termina en COMMIT (seguro re-correrlo).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Resultados oficiales (tomados de la tabla matches al 14 jun) ───
CREATE TEMP TABLE res(match_id text, r1 int, r2 int) ON COMMIT DROP;
INSERT INTO res VALUES
  ('1780086065484_w5vc11', 1, 1),  -- Brasil 1 - 1 Marruecos
  ('1779587441340_5x7bd0', 4, 1),  -- Estados Unidos 4 - 1 Paraguay
  ('1779917659182_nobhk8', 1, 1),  -- Canadá 1 - 1 Bosnia
  ('1779587441340_ihskxm', 1, 1),  -- Catar 1 - 1 Suiza
  ('1779587441340_pxv8yf', 2, 1),  -- Rep. de Corea 2 - 1 Rep. Checa
  ('1779587441340_r9vbge', 2, 0);  -- México 2 - 0 Sudáfrica

-- ─── 1) Re-evaluar TODAS las predicciones de esos partidos ───
UPDATE public.predictions p
SET scored        = true,
    is_correct    = (p.pred_team1 = r.r1 AND p.pred_team2 = r.r2),
    points_earned = CASE WHEN (p.pred_team1 = r.r1 AND p.pred_team2 = r.r2) THEN 100 ELSE 0 END
FROM res r
WHERE p.match_id = r.match_id;

-- ─── 2) Recalcular puntos de TODOS los usuarios (idempotente, dedup por partido) ───
WITH correct AS (
  SELECT user_email, COUNT(DISTINCT match_id) AS aciertos
  FROM public.predictions
  WHERE scored = true AND is_correct = true
  GROUP BY user_email
)
UPDATE public.users u
SET prediction_points = COALESCE(c.aciertos, 0) * 100,
    total_points      = COALESCE(c.aciertos, 0) * 100
                        + COALESCE(u.bonus_points, 0)
                        + COALESCE(u.referral_points, 0),
    updated_at        = now()
FROM correct c
RIGHT JOIN public.users uu ON uu.email = c.user_email
WHERE u.email = uu.email
  AND (uu.role <> 'admin' OR uu.role IS NULL);

-- ─── 2b) Reconciliar comisiones de referido por acierto (idempotente) ───
-- IMPORTANTE: re-evaluar por SQL no creaba las comisiones de 5 pts al referente
-- (eso solo ocurría en el navegador). Esto las crea para todo acierto de un
-- referido que aún no tenga su comisión, y suma los 5 pts a referral_points.
-- Regla: 5 pts por CADA referido que acierta (aunque varios acierten el mismo
-- partido). Se corrige la restricción única vieja que lo impedía.
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

WITH should_have AS (
  SELECT DISTINCT p.user_email AS from_email, r.email AS to_email, p.match_id
  FROM public.predictions p
  JOIN public.users predictor ON predictor.email = p.user_email
  JOIN public.users r ON r.referral_code = predictor.referred_by
  WHERE p.scored = true AND p.is_correct = true AND p.match_id IS NOT NULL
    AND predictor.referred_by IS NOT NULL AND predictor.email <> r.email
    AND (predictor.role <> 'admin' OR predictor.role IS NULL)
),
missing AS (
  SELECT s.* FROM should_have s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.referral_commissions c
    WHERE c.from_email = s.from_email AND c.to_email = s.to_email AND c.match_id = s.match_id
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
    total_points    = COALESCE(u.prediction_points, 0) + COALESCE(u.bonus_points, 0)
                      + COALESCE(u.referral_points, 0) + agg.pts,
    updated_at      = now()
FROM (SELECT to_email, SUM(points_earned)::int AS pts FROM inserted GROUP BY to_email) agg
WHERE u.email = agg.to_email;

-- ─── VERIFICACIÓN ───

-- 3a) Deben quedar 0 sin evaluar en partidos terminados
SELECT 'sin evaluar en finished' AS chequeo, COUNT(*) AS valor
FROM public.predictions p
JOIN res r ON r.match_id = p.match_id
WHERE p.scored IS NULL;

-- 3b) Ricardo debería quedar 300 (3 aciertos: México 2-0, Corea 2-1, Canadá 1-1)
SELECT email, prediction_points, bonus_points, total_points
FROM public.users WHERE email = 'dandy507@gmail.com';

-- 3c) Top 10 del ranking ya corregido
SELECT instagram, prediction_points, total_points
FROM public.users
WHERE role <> 'admin' OR role IS NULL
ORDER BY prediction_points DESC, total_points DESC
LIMIT 10;

-- ════════════════════════════════════════════════════════════════════════════
-- Si la verificación está OK → ya está aplicado (COMMIT abajo).
-- Si algo se ve mal → cambiá COMMIT por ROLLBACK y avisame.
-- ════════════════════════════════════════════════════════════════════════════
COMMIT;
