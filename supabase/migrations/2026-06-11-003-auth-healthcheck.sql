-- ============================================================
-- DIAGNÓSTICO DE SALUD: auth.users completo
-- ============================================================

-- 1. Cuántos usuarios hay en auth.users
SELECT 'total_auth_users' as metric, count(*)::text as value FROM auth.users;

-- 2. Cuántos usuarios sin identidad
SELECT 'users_without_identity' as metric, count(*)::text as value 
FROM auth.users u 
WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);

-- 3. Cuántos usuarios con email NULL
SELECT 'users_null_email' as metric, count(*)::text as value 
FROM auth.users WHERE email IS NULL;

-- 4. Listar todos los emails en auth.users (útil para detectar duplicados o datos raros)
SELECT 'auth_emails' as metric, string_agg(email, ', ') as value FROM auth.users;

-- 5. Verificar si hay inconsistencias en auth.users (filas con campos requeridos nulos)
SELECT 'users_missing_data' as metric, count(*)::text as value 
FROM auth.users 
WHERE encrypted_password IS NULL OR created_at IS NULL;

-- 6. Identidades huérfanas (sin usuario)
SELECT 'orphan_identities' as metric, count(*)::text as value 
FROM auth.identities i 
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = i.user_id);
