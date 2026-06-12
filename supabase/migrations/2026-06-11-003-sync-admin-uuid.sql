-- ============================================================
-- SINCRONIZAR: public.users.id con el UUID del Dashboard
-- ============================================================
-- Ejecutar DESPUÉS de crear admin@chessking.com en Auth > Users
-- ============================================================

-- Mostrar el UUID que asignó el Dashboard
SELECT 'Dashboard UUID:' as info, id::text as uuid FROM auth.users WHERE email = 'admin@chessking.com';

-- Sincronizar public.users.id
UPDATE public.users 
SET id = (SELECT id::text FROM auth.users WHERE email = 'admin@chessking.com')
WHERE email = 'admin@chessking.com';

-- Verificar
SELECT 'public.users ahora:' as info, id FROM public.users WHERE email = 'admin@chessking.com';
SELECT 'auth.users:' as info, id::text FROM auth.users WHERE email = 'admin@chessking.com';
