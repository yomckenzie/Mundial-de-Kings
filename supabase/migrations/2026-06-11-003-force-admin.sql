-- ============================================================
-- FORCE: Recrear admin en auth.users con la contraseña correcta
-- ============================================================
-- Ejecutar en: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

DO $$
DECLARE
  v_admin_id UUID;
  v_current_id TEXT;
BEGIN
  -- 1. Obtener el UUID actual del admin en public.users
  SELECT id INTO v_current_id FROM public.users WHERE email = 'admin@chessking.com';
  RAISE NOTICE 'Admin current public.users.id: %', v_current_id;

  -- 2. Si el ID actual es UUID válido, usarlo; si no, generar nuevo
  IF v_current_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_admin_id := v_current_id::uuid;
    RAISE NOTICE 'Admin public.users.id ya es UUID: %', v_admin_id;
  ELSE
    v_admin_id := gen_random_uuid();
    RAISE NOTICE 'Generando nuevo UUID para admin: %', v_admin_id;
  END IF;

  -- 3. Eliminar el admin de auth.users si existe (para forzar recreación)
  DELETE FROM auth.users WHERE email = 'admin@chessking.com';
  RAISE NOTICE 'Admin eliminado de auth.users (si existía)';

  -- 4. Crear el admin en auth.users con la contraseña correcta
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, role, aud
  ) VALUES (
    v_admin_id, '00000000-0000-0000-0000-000000000000', 'admin@chessking.com',
    crypt('[REDACTED-TEMP]', gen_salt('bf')), now(),
    now(), now(), '{"provider":"email","providers":["email"]}', '{}',
    false, 'authenticated', 'authenticated'
  );
  RAISE NOTICE '✅ Admin CREADO en auth.users con UUID: %', v_admin_id;

  -- 5. Actualizar public.users.id al UUID correcto
  UPDATE public.users SET id = v_admin_id::text WHERE email = 'admin@chessking.com';
  RAISE NOTICE '✅ Admin public.users.id actualizado a: %', v_admin_id;
END $$;

-- Verificar
SELECT id, email, role FROM public.users WHERE email = 'admin@chessking.com';
