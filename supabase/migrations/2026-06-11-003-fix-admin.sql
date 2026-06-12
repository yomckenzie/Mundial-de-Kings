-- ============================================================
-- FIX: Admin UUID + Verificación completa
-- ============================================================
-- Ejecutar en: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- 1) Forzar creación del admin en auth.users si no existe
DO $$
DECLARE
  v_id UUID;
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@chessking.com') INTO v_exists;
  
  IF NOT v_exists THEN
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      v_id, '00000000-0000-0000-0000-000000000000', 'admin@chessking.com',
      crypt('[REDACTED-TEMP]', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}',
      false, 'authenticated', 'authenticated'
    );
    -- Actualizar public.users.id
    UPDATE public.users SET id = v_id::text WHERE email = 'admin@chessking.com';
    RAISE NOTICE '✅ Admin creado con UUID: %', v_id;
  ELSE
    RAISE NOTICE '⚠️ Admin ya existe en auth.users. Verificando UUID...';
    -- Obtener el UUID de auth.users
    SELECT id INTO v_id FROM auth.users WHERE email = 'admin@chessking.com';
    -- Forzar actualización del public.users.id
    UPDATE public.users SET id = v_id::text WHERE email = 'admin@chessking.com';
    RAISE NOTICE '✅ Admin UUID actualizado a: %', v_id;
  END IF;
END $$;

-- 2) Verificación final: mostrar usuarios sin UUID (debería ser 0)
SELECT COUNT(*) AS usuarios_sin_uuid FROM public.users 
WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 3) Mostrar el admin con su nuevo UUID
SELECT id, email, role FROM public.users WHERE email = 'admin@chessking.com';

-- 4) Listar todas las RLS policies activas
SELECT schemaname, tablename, policyname, cmd FROM pg_policies 
WHERE schemaname = 'public' ORDER BY tablename, policyname;
