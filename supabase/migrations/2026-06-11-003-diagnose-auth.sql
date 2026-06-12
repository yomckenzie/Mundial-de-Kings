-- ============================================================
-- DIAGNÓSTICO: Admin en auth.users
-- ============================================================
-- Ejecutar en: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- 1. El admin en auth.users
SELECT 'auth.users:' as info, id, email, email_confirmed_at, 
       created_at, role, encrypted_password IS NOT NULL as has_password
FROM auth.users WHERE email = 'admin@chessking.com';

-- 2. identities asociadas
SELECT 'auth.identities:' as info, id, user_id, provider, identity_data
FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'admin@chessking.com');

-- 3. Verificar si hay columnas NOT NULL sin valor en auth.users
SELECT 'auth.users columns:' as info,
       column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'auth' AND table_name = 'users'
ORDER BY ordinal_position;
