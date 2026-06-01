-- ============================================================
-- Agregar UNIQUE constraint a app_settings.key
-- Permite usar UPSERT (onConflict: 'key') en lugar de DELETE+INSERT
-- ============================================================
-- Ejecuta en: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new

-- 1. Eliminar duplicados: mantener solo la fila más reciente por key
--    (usando ctid como proxy de "más antigua" en Postgres)
DELETE FROM app_settings a
  USING app_settings b
WHERE a.key = b.key
  AND a.ctid < b.ctid;

-- 2. Agregar constraint UNIQUE
ALTER TABLE app_settings ADD CONSTRAINT app_settings_key_unique UNIQUE (key);

-- 3. Verificar
SELECT key, value FROM app_settings ORDER BY key;
