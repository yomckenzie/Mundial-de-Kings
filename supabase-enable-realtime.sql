-- ============================================================
-- HABILITAR REALTIME EN SUPABASE
-- ============================================================
-- Ejecuta este script en el SQL Editor de Supabase:
-- https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
--
-- Esto permite que los cambios hechos DIRECTAMENTE en el panel
-- de Supabase se propaguen INSTANTÁNEAMENTE a todos los usuarios.
-- ============================================================

-- 1. Habilitar Realtime en la base de datos (si no lo está ya)
-- Esto es necesario solo si es la primera vez
-- Ve a: Project Settings > Database > Realtime > Enable Realtime

-- 2. Para cada tabla, publicar los cambios via REPLICA IDENTITY FULL
-- Esto permite que los eventos contengan TODOS los campos (nuevos y viejos)
ALTER TABLE users REPLICA IDENTITY FULL;
ALTER TABLE matches REPLICA IDENTITY FULL;
ALTER TABLE predictions REPLICA IDENTITY FULL;
ALTER TABLE prizes REPLICA IDENTITY FULL;
ALTER TABLE redemptions REPLICA IDENTITY FULL;
ALTER TABLE support_tickets REPLICA IDENTITY FULL;
ALTER TABLE points_bonuses REPLICA IDENTITY FULL;
ALTER TABLE app_settings REPLICA IDENTITY FULL;
ALTER TABLE audit_logs REPLICA IDENTITY FULL;
ALTER TABLE referrals REPLICA IDENTITY FULL;
ALTER TABLE referral_commissions REPLICA IDENTITY FULL;

-- 3. Suscribir las tablas a la publicación 'supabase_realtime'
-- (esto es lo que realmente habilita la replicación)
BEGIN;
  -- Eliminar publicaciones existentes para evitar duplicados
  DROP PUBLICATION IF EXISTS chessking_realtime;

  -- Crear publicación que incluya TODAS las tablas
  CREATE PUBLICATION chessking_realtime FOR ALL TABLES;
COMMIT;

-- ============================================================
-- NOTA ADICIONAL:
-- Alternativamente, puedes habilitar Realtime desde el Dashboard:
--   1. Ve a Database > Replication
--   2. En la sección "Publication tables", haz clic en "Add table"
--   3. Selecciona TODAS las tablistas (users, matches, predictions, etc.)
--   4. Asegúrate de que los eventos INSERT, UPDATE, DELETE estén marcados
-- ============================================================
