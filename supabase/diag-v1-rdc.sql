-- ============================================================================
-- Diagnóstico: estado actual de RD Congo vs Uzbekistán en la BD
-- ============================================================================
-- Pegar y ejecutar en SQL Editor de Supabase. Mostrar el resultado al admin.

-- 1. Datos del partido
SELECT
  m.id,
  m.match_date,
  m.team1 || ' vs ' || m.team2 AS partido,
  m.status,
  m.result_team1 AS r_t1,
  m.result_team2 AS r_t2,
  m.result_method AS método,
  m.penalty_score_team1 AS pen_t1,
  m.penalty_score_team2 AS pen_t2
FROM public.matches m
WHERE m.team1 ILIKE '%congo%' OR m.team2 ILIKE '%uzbek%'
ORDER BY m.match_date DESC;

-- 2. Predicciones de usuarios para ese partido (top 20)
SELECT
  p.user_email,
  p.pred_team1 || '-' || p.pred_team2 AS "pred v1",
  p.pred_score_team1 || '-' || p.pred_score_team2 AS "pred v2 score",
  p.pred_winner,
  p.pred_method,
  p.pred_penalty_team1 || '-' || p.pred_penalty_team2 AS "pred pen",
  p.scored,
  p.is_correct,
  p.points_earned,
  p.winner_correct,
  p.method_correct,
  p.score_correct
FROM public.predictions p
JOIN public.matches m ON m.id = p.match_id
WHERE m.team1 ILIKE '%congo%' OR m.team2 ILIKE '%uzbek%'
ORDER BY p.points_earned DESC
LIMIT 20;

-- 3. Resumen: cuántos usuarios predijeron el marcador exacto
SELECT
  COUNT(*) FILTER (WHERE pred_team1 = result_team1 AND pred_team2 = result_team2) AS "predijeron exacto",
  COUNT(*) FILTER (WHERE scored = TRUE AND points_earned > 0) AS "scored con puntos",
  COUNT(*) AS "total predicciones"
FROM public.predictions p
JOIN public.matches m ON m.id = p.match_id
WHERE (m.team1 ILIKE '%congo%' OR m.team2 ILIKE '%uzbek%')
  AND p.pred_score_team1 IS NULL  -- solo v1
  AND p.pred_score_team2 IS NULL;
