-- ============================================================================
-- Migración: re-evaluar predicciones v1 (legacy pre-28 jun) en la BD
-- ============================================================================
-- CONTEXTO:
--   El trigger v1 original revisaba pred_penalty_team1/2 + pred_winner +
--   pred_method, todos NULL para predicciones del modelo v1 legacy (que
--   solo guardaban pred_team1/2 con el marcador exacto). Resultado:
--   TODAS las predicciones v1 quedaron con points_earned = 0 aunque el
--   usuario hubiera acertado el marcador.
--
-- FIX:
--   Re-evaluar manualmente cada predicción v1 comparando pred_team1/2
--   contra el resultado del partido (m.result_team1/2). 100 pts si
--   coincide exacto. Volver a calcular users.prediction_points y
--   total_points desde cero.
--
-- Se identifica "predicción v1" por:
--   - pred_score_team1 IS NULL AND pred_score_team2 IS NULL (no es v2)
--   - pred_team1 IS NOT NULL AND pred_team2 IS NOT NULL (sí es v1)
--   - match.result_team1 IS NOT NULL AND match.result_team2 IS NOT NULL
--     (el partido ya tiene resultado publicado)
--
-- Aplica desde: 2026-06-28
-- ============================================================================

BEGIN;

-- 1. Re-puntuar predicciones v1 con resultado publicado
UPDATE public.predictions p
SET
  winner_correct  = NULL,            -- v1 no tiene componente winner separado
  method_correct  = NULL,            -- v1 no tiene componente method separado
  score_correct   = (p.pred_team1 = m.result_team1 AND p.pred_team2 = m.result_team2),
  pre_pen_correct = NULL,
  pen_correct     = NULL,
  penalty_correct = NULL,
  points_earned   = CASE
    WHEN p.pred_team1 = m.result_team1 AND p.pred_team2 = m.result_team2 THEN 100
    ELSE 0
  END,
  is_correct = (p.pred_team1 = m.result_team1 AND p.pred_team2 = m.result_team2),
  scored = TRUE,
  updated_at = NOW()
FROM public.matches m
WHERE m.id = p.match_id
  AND p.pred_score_team1 IS NULL
  AND p.pred_score_team2 IS NULL
  AND p.pred_team1 IS NOT NULL
  AND p.pred_team2 IS NOT NULL
  AND m.result_team1 IS NOT NULL
  AND m.result_team2 IS NOT NULL
  -- Excluir admins: si la predicción pertenece a un admin, la dejamos en 0
  AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.email = p.user_email AND u.role = 'admin'
  );

-- 2. Recalcular prediction_points y total_points de TODOS los usuarios
--    afectados desde cero (idempotente: SUM de puntos scored=true, is_correct=true
--    deduplicado por match_id, igual que recalculatePointsForEmails en JS).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT user_email
    FROM public.predictions
    WHERE scored = TRUE AND is_correct = TRUE
  ) LOOP
    WITH scored AS (
      SELECT
        p.user_email,
        p.match_id,
        p.points_earned,
        -- Deduplicar por (user, match): quedarnos con 1 row por match
        ROW_NUMBER() OVER (PARTITION BY p.user_email, p.match_id ORDER BY p.id) AS rn
      FROM public.predictions p
      WHERE p.user_email = r.user_email
        AND p.scored = TRUE
        AND p.is_correct = TRUE
        AND p.match_id IS NOT NULL
    ),
    sum_pts AS (
      SELECT COALESCE(SUM(points_earned), 0) AS total
      FROM scored WHERE rn = 1
    )
    UPDATE public.users u
    SET
      prediction_points = sum_pts.total,
      total_points = sum_pts.total + COALESCE(u.bonus_points, 0) + COALESCE(u.referral_points, 0)
    FROM sum_pts
    WHERE u.email = r.user_email;
  END LOOP;
END $$;

-- 3. Verificación: top usuarios con puntos actualizados
SELECT
  u.email,
  u.prediction_points,
  u.total_points,
  u.bonus_points,
  u.referral_points
FROM public.users u
WHERE u.role IS DISTINCT FROM 'admin'
  AND u.prediction_points > 0
ORDER BY u.prediction_points DESC
LIMIT 10;

COMMIT;

-- ============================================================================
-- ROLLBACK (manual):
--   No hay rollback simple porque pisamos los puntos que estaban antes.
--   Si necesitas recuperar, restaurar desde backup de BD.
-- ============================================================================