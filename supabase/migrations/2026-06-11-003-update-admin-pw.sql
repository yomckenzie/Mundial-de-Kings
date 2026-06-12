-- ============================================================
-- FIX: Actualizar contraseña del admin en auth.users
-- ============================================================
-- Ejecutar en: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- Mostrar el admin actual en auth.users
SELECT id, email, email_confirmed_at, created_at, role
FROM auth.users
WHERE email = 'admin@chessking.com';

-- Actualizar la contraseña (usando UPDATE en lugar de DELETE+INSERT)
UPDATE auth.users
SET 
  encrypted_password = crypt('[REDACTED-TEMP]', gen_salt('bf')),
  email_confirmed_at = now(),
  updated_at = now(),
  banned_until = NULL,
  deleted_at = NULL
WHERE email = 'admin@chessking.com';

-- Verificar
SELECT id, email, email_confirmed_at, updated_at, role
FROM auth.users
WHERE email = 'admin@chessking.com';
