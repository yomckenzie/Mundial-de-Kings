-- ============================================================
-- LIMPIAR DATOS DUPLICADOS Y DEFAULT DE SUPABASE - CHESS KING
-- Ejecuta este script en el SQL Editor de Supabase
-- Ve a: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- 1. Eliminar TODOS los registros de home_banners (imágenes por defecto de Unsplash)
DELETE FROM app_settings WHERE key = 'home_banners';

-- 2. Eliminar TODOS los registros duplicados de app_settings,
--    manteniendo SOLO el más reciente para cada key (DEBE ir antes de agregar UNIQUE)
DELETE FROM app_settings a USING (
  SELECT key, MAX(id) AS max_id
  FROM app_settings
  GROUP BY key
  HAVING COUNT(*) > 1
) b
WHERE a.key = b.key AND a.id <> b.max_id;

-- 3. Agregar restricción UNIQUE en key para evitar duplicados futuros
ALTER TABLE app_settings ADD CONSTRAINT app_settings_key_unique UNIQUE (key);

-- 4. Verificar que no queden duplicados
SELECT key, COUNT(*) as count FROM app_settings GROUP BY key HAVING COUNT(*) > 1;

-- 5. Mostrar todos los registros actuales de app_settings
SELECT * FROM app_settings ORDER BY key;