-- ============================================================
-- DIAGNÓSTICO COMPLETO: Admin en auth schema
-- ============================================================
-- Ejecutar en: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- 1. Verificar admin en auth.users
SELECT 'auth_users' as tbl, count(*) as cnt FROM auth.users WHERE email = 'admin@chessking.com';

-- 2. Verificar identidad
SELECT 'identities' as tbl, count(*) as cnt FROM auth.identities WHERE provider_id = 'admin@chessking.com';

-- 3. Verificar datos huérfanos (users sin identities, identities sin users)
SELECT 'orphan_users' as tbl, count(*) as cnt FROM auth.users u 
WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);

SELECT 'orphan_identities' as tbl, count(*) as cnt FROM auth.identities i 
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = i.user_id);

-- 4. Total de usuarios en auth
SELECT 'total_auth_users' as tbl, count(*) as cnt FROM auth.users;

-- 5. Admin en public
SELECT 'public_admin' as tbl, count(*) as cnt FROM public.users WHERE email = 'admin@chessking.com';
