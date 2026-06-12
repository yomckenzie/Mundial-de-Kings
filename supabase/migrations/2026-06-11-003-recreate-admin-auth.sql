-- ============================================================
-- CREAR/REPARAR ADMIN en auth.users (versión simplificada)
-- ============================================================
-- Ejecutar en: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

DO $$
DECLARE
  v_admin_id UUID;
  v_exists BOOLEAN;
BEGIN
  -- 1. Verificar si admin ya existe en auth.users
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@chessking.com') INTO v_exists;

  IF v_exists THEN
    -- Solo actualizar contraseña
    UPDATE auth.users SET
      encrypted_password = crypt('[REDACTED-TEMP]', gen_salt('bf')),
      email_confirmed_at = now(),
      updated_at = now(),
      banned_until = NULL,
      deleted_at = NULL
    WHERE email = 'admin@chessking.com';

    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@chessking.com';
    RAISE NOTICE '✅ Admin actualizado en auth.users. UUID: %', v_admin_id;
  ELSE
    -- Crear admin en auth.users
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud, confirmation_token,
      email_change, email_change_token_new, recovery_token,
      email_change_token_current, email_change_confirm_status,
      banned_until, deleted_at, is_sso_user, is_anonymous
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'admin@chessking.com',
      crypt('[REDACTED-TEMP]', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}',
      false, 'authenticated', 'authenticated', '',
      '', '', '', '', 0,
      NULL, NULL, false, false
    );
    RAISE NOTICE '✅ Admin CREADO en auth.users. UUID: %', v_admin_id;
  END IF;

  -- 2. Verificar/crear identidad
  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE provider = 'email' AND provider_id = 'admin@chessking.com') THEN
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@chessking.com'),
      'email', 'admin@chessking.com',
      now(), now(), now()
    );
    RAISE NOTICE '✅ Identidad creada';
  ELSE
    RAISE NOTICE '✅ Identidad ya existe';
  END IF;

  -- 3. Asegurar que public.users.id coincida
  UPDATE public.users SET id = v_admin_id::text WHERE email = 'admin@chessking.com';
  RAISE NOTICE '✅ public.users.id actualizado';
END $$;

-- Mostrar resultado (consultas separadas para evitar conflictos de tipos)
SELECT '✅ auth.users:' as info, id::text as id, email FROM auth.users WHERE email = 'admin@chessking.com';
SELECT '✅ identities:' as info, user_id::text as id, provider FROM auth.identities WHERE provider_id = 'admin@chessking.com';
SELECT '✅ public.users:' as info, id as id, email FROM public.users WHERE email = 'admin@chessking.com';
