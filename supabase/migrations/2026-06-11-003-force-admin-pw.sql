-- ============================================================
-- FORCE: Poner contraseña al admin + sincronizar UUID
-- ============================================================
-- CAMBIA 'TuPassword123' por la contraseña que quieras
-- ============================================================

DO $$
DECLARE
  v_new_pw TEXT := 'TuPassword123'; -- ← CAMBIA ESTO por tu contraseña
  v_admin_id UUID;
BEGIN
  -- 1. Actualizar/crear admin en auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@chessking.com') THEN
    UPDATE auth.users SET 
      encrypted_password = crypt(v_new_pw, gen_salt('bf')),
      email_confirmed_at = now(),
      updated_at = now(),
      banned_until = NULL,
      deleted_at = NULL
    WHERE email = 'admin@chessking.com';
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@chessking.com';
    RAISE NOTICE '✅ Contraseña actualizada. UUID: %', v_admin_id;
  ELSE
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud, is_sso_user, is_anonymous
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'admin@chessking.com',
      crypt(v_new_pw, gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}',
      false, 'authenticated', 'authenticated', false, false
    );
    RAISE NOTICE '✅ Admin CREADO. UUID: %', v_admin_id;
  END IF;

  -- 2. Crear identidad si no existe
  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE provider_id = 'admin@chessking.com') THEN
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_admin_id, 
      jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@chessking.com'),
      'email', 'admin@chessking.com', now(), now(), now());
    RAISE NOTICE '✅ Identidad creada';
  END IF;

  -- 3. Sincronizar public.users.id
  UPDATE public.users SET id = v_admin_id::text WHERE email = 'admin@chessking.com';
  RAISE NOTICE '✅ public.users.id sincronizado';
END $$;

-- Mostrar resultado
SELECT 'auth.users:' as info, id::text as id FROM auth.users WHERE email = 'admin@chessking.com';
SELECT 'public.users:' as info, id as id FROM public.users WHERE email = 'admin@chessking.com';
