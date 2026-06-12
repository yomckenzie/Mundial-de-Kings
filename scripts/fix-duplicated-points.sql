-- ============================================================
-- FIX: Corregir puntos duplicados por scoring múltiple
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- 1. Calcular prediction_points correcto para cada usuario:
--    Solo cuentan predicciones scored=true con is_correct=true
--    Puntos = cantidad_de_aciertos × 100
WITH correct_counts AS (
  SELECT
    p.user_email,
    COUNT(*) AS correct_count
  FROM predictions p
  WHERE p.scored = true
    AND p.is_correct = true
  GROUP BY p.user_email
),
user_points AS (
  SELECT
    u.id,
    u.email,
    COALESCE(cc.correct_count, 0) * 100 AS correct_prediction_points,
    COALESCE(u.bonus_points, 0) AS bonus_points,
    COALESCE(u.referral_points, 0) AS referral_points
  FROM users u
  LEFT JOIN correct_counts cc ON cc.user_email = u.email
  WHERE u.role != 'admin'
)
UPDATE users u
SET
  prediction_points = up.correct_prediction_points,
  total_points = up.correct_prediction_points + up.bonus_points + up.referral_points,
  updated_at = now()
FROM user_points up
WHERE u.id = up.id
  AND (
    u.prediction_points != up.correct_prediction_points
    OR u.total_points != (up.correct_prediction_points + up.bonus_points + up.referral_points)
  );

-- 2. Verificar resultado
SELECT
  email,
  full_name,
  prediction_points,
  bonus_points,
  referral_points,
  total_points,
  (SELECT COUNT(*) FROM predictions p WHERE p.user_email = u.email AND p.scored = true AND p.is_correct = true) AS aciertos
FROM users u
WHERE role != 'admin'
ORDER BY total_points DESC;
