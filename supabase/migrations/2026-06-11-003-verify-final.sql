-- Verificar que los UUIDs coincidan
SELECT 'auth.users' as src, id::text as user_id FROM auth.users WHERE email = 'admin@chessking.com';
SELECT 'public.users' as src, id as user_id FROM public.users WHERE email = 'admin@chessking.com';

-- Si NO coinciden, ejecutar:
-- UPDATE public.users SET id = (SELECT id::text FROM auth.users WHERE email = 'admin@chessking.com') WHERE email = 'admin@chessking.com';
