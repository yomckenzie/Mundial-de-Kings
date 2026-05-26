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

-- 3. ELIMINAR DUPLICADOS EN prizes (mantener 1 por name)
DELETE FROM prizes a USING (
  SELECT name, MAX(id) AS max_id
  FROM prizes
  GROUP BY name
  HAVING COUNT(*) > 1
) b
WHERE a.name = b.name AND a.id <> b.max_id;

-- 4. VERIFICAR QUE NO QUEDEN DUPLICADOS
SELECT 'app_settings' as tabla, key, COUNT(*) as duplicados FROM app_settings GROUP BY key HAVING COUNT(*) > 1
UNION ALL
SELECT 'users' as tabla, email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1
UNION ALL
SELECT 'prizes' as tabla, name, COUNT(*) FROM prizes GROUP BY name HAVING COUNT(*) > 1;
