-- ════════════════════════════════════════════════════════════════════════════
-- FIX: pronósticos "sin evaluar" (scored = NULL) en 2 partidos terminados
--
-- Problema: durante la limpieza/dedup del 9-10 jun, 13 pronósticos quedaron
-- con scored=NULL en 2 partidos ya finalizados. Como el recálculo de puntos
-- solo cuenta scored=true + is_correct=true, esos aciertos nunca se pagaron.
-- El único ACERTADO entre ellos es Eliza (rutgaona354) — Corea 2-1.
--
-- Garantías de seguridad:
--   • Solo toca filas con scored IS NULL (no toca a nadie ya evaluado).
--   • El recálculo de puntos es SET (aciertos × 100), NO suma → NO puede duplicar.
--   • Recalcula SOLO a los usuarios que tenían filas sin evaluar (7 usuarios).
--   • Todo en una transacción: revisás la verificación y COMMIT o ROLLBACK.
--
-- Resultados reales de los partidos:
--   Corea (Rep. de Corea) 2 - 1 Chequia (Rep. Checa)   → match 1779587441340_pxv8yf
--   México 2 - 0 Sudáfrica                              → match 1779587441340_r9vbge
--
-- CÓMO USAR:
--   1) Supabase Dashboard → SQL Editor → New query
--   2) Pegá TODO este bloque y RUN
--   3) Mirá la verificación final (Eliza debe quedar 100/200; el resto igual)
--   4) Si está bien: cambiá el ROLLBACK del final por COMMIT y volvé a correr,
--      o simplemente ejecutá "COMMIT;" si dejaste la transacción abierta.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0) Capturar los usuarios afectados (los que tienen filas sin evaluar) ───
CREATE TEMP TABLE afectados ON COMMIT DROP AS
  SELECT DISTINCT user_email
  FROM public.predictions
  WHERE match_id IN ('1779587441340_pxv8yf', '1779587441340_r9vbge')
    AND scored IS NULL;

-- ─── 1) Evaluar SOLO las filas sin evaluar de Corea-Chequia (2-1) ───
UPDATE public.predictions p
SET scored        = true,
    is_correct    = (p.pred_team1 = 2 AND p.pred_team2 = 1),
    points_earned = CASE WHEN (p.pred_team1 = 2 AND p.pred_team2 = 1) THEN 100 ELSE 0 END
WHERE p.match_id = '1779587441340_pxv8yf'
  AND p.scored IS NULL;

-- ─── 2) Evaluar SOLO las filas sin evaluar de México-Sudáfrica (2-0) ───
UPDATE public.predictions p
SET scored        = true,
    is_correct    = (p.pred_team1 = 2 AND p.pred_team2 = 0),
    points_earned = CASE WHEN (p.pred_team1 = 2 AND p.pred_team2 = 0) THEN 100 ELSE 0 END
WHERE p.match_id = '1779587441340_r9vbge'
  AND p.scored IS NULL;

-- ─── 3) Recalcular puntos SOLO de los usuarios afectados (idempotente, sin duplicar) ───
--      prediction_points = (aciertos únicos por partido) × 100
--      total_points      = prediction_points + bonus_points + referral_points
WITH correctos AS (
  SELECT user_email, COUNT(DISTINCT match_id) AS aciertos
  FROM public.predictions
  WHERE user_email IN (SELECT user_email FROM afectados)
    AND scored = true
    AND is_correct = true
  GROUP BY user_email
)
UPDATE public.users u
SET prediction_points = COALESCE(c.aciertos, 0) * 100,
    total_points      = COALESCE(c.aciertos, 0) * 100
                        + COALESCE(u.bonus_points, 0)
                        + COALESCE(u.referral_points, 0),
    updated_at        = now()
FROM afectados a
LEFT JOIN correctos c ON c.user_email = a.user_email
WHERE u.email = a.user_email;

-- ─── 4) VERIFICACIÓN (revisar antes de confirmar) ───

-- 4a) Deben quedar 0 pronósticos sin evaluar en esos 2 partidos
SELECT 'sin evaluar restantes' AS chequeo, COUNT(*) AS valor
FROM public.predictions
WHERE match_id IN ('1779587441340_pxv8yf', '1779587441340_r9vbge')
  AND scored IS NULL;

-- 4b) Estado de los usuarios afectados (Eliza debe quedar 100 / 200; el resto 0 / 100)
SELECT u.email, u.prediction_points, u.bonus_points, u.referral_points, u.total_points
FROM public.users u
JOIN afectados a ON a.user_email = u.email
ORDER BY u.prediction_points DESC, u.email;

-- 4c) Control: usuarios que YA estaban bien NO deben cambiar (deben seguir 100/200)
SELECT email, prediction_points, total_points
FROM public.users
WHERE email IN ('beliza0678@gmail.com', 'anabellepitti@gmail.com');

-- ════════════════════════════════════════════════════════════════════════════
-- CONFIRMAR los cambios. (Es seguro re-correr este script: los UPDATE solo
-- tocan filas con scored IS NULL, así que una vez aplicado no vuelve a cambiar nada.)
-- ════════════════════════════════════════════════════════════════════════════
COMMIT;
