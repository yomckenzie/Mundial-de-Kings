-- ============================================================
-- LIMPIEZA COMPLETA DE DUPLICADOS - CHESS KING
-- Ejecuta en: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- 1. ELIMINAR DUPLICADOS EN app_settings (mantener solo 1 por key)
DELETE FROM app_settings a USING (
  SELECT key, MAX(id) AS max_id
  FROM app_settings
  GROUP BY key
  HAVING COUNT(*) > 1
) b
WHERE a.key = b.key AND a.id <> b.max_id;

-- 2. ELIMINAR DUPLICADOS EN users (mantener 1 por email)
DELETE FROM users a USING (
  SELECT email, MAX(id) AS max_id
  FROM users
  GROUP BY email
  HAVING COUNT(*) > 1
) b
WHERE a.email = b.email AND a.id <> b.max_id;

-- 3. PONER EN 0 LOS PUNTOS DEL ADMIN (para que no aparezca en ranking aunque se cuele)
UPDATE users SET total_points = 0, prediction_points = 0, bonus_points = 0
WHERE role = 'admin' OR email = 'admin@chessking.com';

-- 4. VERIFICAR QUE NO QUEDEN DUPLICADOS
SELECT 'app_settings' as tabla, key, COUNT(*) as duplicados FROM app_settings GROUP BY key HAVING COUNT(*) > 1
UNION ALL
SELECT 'users' as tabla, email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;
