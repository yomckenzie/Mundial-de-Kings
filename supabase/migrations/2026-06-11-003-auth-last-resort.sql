-- ============================================================
-- ÚLTIMA VERIFICACIÓN: auth.users
-- ============================================================
-- Solo consultas simples, una por una

-- 1. La tabla auth.users existe y es accesible?
SELECT 'table_check' as info, count(*)::text as val FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users';

-- 2. Cuántas columnas tiene?
SELECT 'columns' as info, count(*)::text as val FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users';

-- 3. Hay registros?
SELECT 'row_count' as info, count(*)::text as val FROM auth.users;

-- 4. El admin existe?
SELECT 'admin_exists' as info, count(*)::text as val FROM auth.users WHERE email = 'admin@chessking.com';

-- 5. Los UUID de public.users coinciden con auth.users?
SELECT 'uuid_mismatch' as info, count(*)::text as val 
FROM public.users pu
WHERE pu.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id::text = pu.id);
