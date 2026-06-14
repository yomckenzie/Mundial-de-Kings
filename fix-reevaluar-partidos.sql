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
