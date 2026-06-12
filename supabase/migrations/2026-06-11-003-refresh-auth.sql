-- ============================================================
-- REFRESCAR CACHÉ + VERIFICAR SERVICIO AUTH
-- ============================================================

-- 1. Forzar recarga del schema en PostgREST (ayuda indirectamente)
NOTIFY pgrst, 'reload schema';

-- 2. Verificar que auth schema functions existan y sean accesibles
SELECT 'schema_ok' as info FROM auth.users LIMIT 1;

-- 3. Contar usuarios en auth
SELECT count(*) as auth_user_count FROM auth.users;

-- 4. Verificar admin específicamente
SELECT id::text, email FROM auth.users WHERE email = 'admin@chessking.com';
