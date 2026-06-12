-- ============================================================
-- 004: FIX LOGIN ADMIN (Database error querying schema)
-- ============================================================
-- Ejecutar en: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
--
-- Diagnóstico previo (vía REST API):
--   * admin@chessking.com (sin "s") existe en public.users con
--     role='admin', UUID=46404e4f-cbdc-4f99-90a7-d94500eb2fb3
--   * El login da 500 "Database error querying schema" → fila en
--     auth.users corrupta por los múltiples DELETE+INSERT manuales
--   * admin@chesskings.com (con "s") fue creado ACCIDENTALMENTE
--     durante el diagnóstico (signUp probe) y debe eliminarse.
--
-- Este script:
--   1. Borra el duplicado accidental (auth.identities + auth.users)
--   2. Recrea limpio el admin en auth.users con el UUID existente
--      (preserva la FK desde public.users)
--   3. Recrea su auth.identities
--   4. Hashea la nueva password con crypt/bcrypt
--   5. NOTIFY pgrst para forzar reload de schema cache
-- ============================================================

-- ⚠️ AJUSTAR AQUÍ SI QUERÉS OTRA PASSWORD
-- ============================================================
DO $$
DECLARE
  v_admin_email    TEXT := 'admin@chessking.com';   -- SIN "s" (es el correcto)
  v_admin_password TEXT := '[REDACTED-ROTAR]';               -- password nueva
  v_admin_uuid     UUID := '46404e4f-cbdc-4f99-90a7-d94500eb2fb3'; -- UUID preservado
  v_orphan_email   TEXT := 'admin@chesskings.com';  -- CON "s" (basura a borrar)
  v_orphan_uuid    UUID := '16bd31ac-39cf-4b08-b1ae-c8af76682ebe';
  v_existed        BOOLEAN;
BEGIN

  -- ═══════════════════════════════════════════════════════════
  -- PASO 1: Eliminar el duplicado accidental (admin@chesskings.com con "s")
  -- ═══════════════════════════════════════════════════════════
  RAISE NOTICE '─── PASO 1: Limpiando duplicado accidental ───';

  -- Borrar identidades del duplicado primero (FK)
  DELETE FROM auth.identities
   WHERE user_id = v_orphan_uuid;
  GET DIAGNOSTICS v_existed = ROW_COUNT;
  RAISE NOTICE '   Identities del duplicado borradas: %', v_existed;

  -- Borrar el usuario duplicado
  DELETE FROM auth.users
   WHERE id = v_orphan_uuid;
  GET DIAGNOSTICS v_existed = ROW_COUNT;
  RAISE NOTICE '   Usuario duplicado borrado: %', v_existed;

  -- ═══════════════════════════════════════════════════════════
  -- PASO 2: Eliminar fila corrupta del admin real
  -- ═══════════════════════════════════════════════════════════
  RAISE NOTICE '─── PASO 2: Limpiando auth.users del admin real ───';

  DELETE FROM auth.identities
   WHERE user_id = v_admin_uuid
      OR provider_id = v_admin_email;
  GET DIAGNOSTICS v_existed = ROW_COUNT;
  RAISE NOTICE '   Identities borradas: %', v_existed;

  DELETE FROM auth.users
   WHERE id = v_admin_uuid
      OR email = v_admin_email;
  GET DIAGNOSTICS v_existed = ROW_COUNT;
  RAISE NOTICE '   Filas auth.users borradas: %', v_existed;

  -- ═══════════════════════════════════════════════════════════
  -- PASO 3: Crear auth.users limpio (con el UUID que ya está en public.users)
  -- ═══════════════════════════════════════════════════════════
  RAISE NOTICE '─── PASO 3: Creando auth.users limpio ───';

  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    is_sso_user,
    is_anonymous,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    deleted_at
  ) VALUES (
    v_admin_uuid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_admin_email,
    crypt(v_admin_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('email', v_admin_email, 'email_verified', true),
    false,
    false,
    false,
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    0,
    NULL,
    NULL
  );
  RAISE NOTICE '   ✅ auth.users creado: % (%)', v_admin_email, v_admin_uuid;

  -- ═══════════════════════════════════════════════════════════
  -- PASO 4: Crear identity (sin esto, GoTrue no puede autenticar)
  -- ═══════════════════════════════════════════════════════════
  RAISE NOTICE '─── PASO 4: Creando identity ───';

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_admin_uuid,
    jsonb_build_object(
      'sub',            v_admin_uuid::text,
      'email',          v_admin_email,
      'email_verified', true
    ),
    'email',
    v_admin_email,           -- provider_id = email para provider 'email'
    now(),
    now(),
    now()
  );
  RAISE NOTICE '   ✅ identity creada';

  -- ═══════════════════════════════════════════════════════════
  -- PASO 5: Forzar recarga de schema cache
  -- ═══════════════════════════════════════════════════════════
  RAISE NOTICE '─── PASO 5: NOTIFY pgrst reload schema ───';
  -- (ejecutado fuera del DO block para que el NOTIFY se dispare)

END $$;

-- Forzar reload del schema cache de PostgREST/GoTrue
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════
-- (No usamos \echo porque el SQL Editor de Supabase no lo soporta.
--  En su lugar, separadores visuales via SELECT '---'.)

SELECT '═══════════════════════════════════════' AS "═ ESTADO FINAL ═";
SELECT '--- auth.users (admin@chessking.com) ---' AS " ";

SELECT
  id::text                AS uuid,
  email,
  (encrypted_password IS NOT NULL) AS tiene_password,
  (email_confirmed_at IS NOT NULL) AS email_confirmado,
  role,
  aud,
  (deleted_at IS NULL)    AS no_borrado,
  (banned_until IS NULL)  AS no_baneado,
  created_at::date        AS creado
FROM auth.users
WHERE email IN ('admin@chessking.com', 'admin@chesskings.com')
ORDER BY email;

SELECT '--- auth.identities (UUID del admin) ---' AS " ";

SELECT
  user_id::text  AS uuid,
  provider,
  provider_id,
  email
FROM auth.identities
WHERE user_id IN (
  '46404e4f-cbdc-4f99-90a7-d94500eb2fb3',
  '16bd31ac-39cf-4b08-b1ae-c8af76682ebe'
)
ORDER BY user_id;

SELECT '--- public.users (debe tener 1 admin) ---' AS " ";

SELECT
  id,
  email,
  role,
  full_name
FROM public.users
WHERE role = 'admin'
ORDER BY email;

SELECT '═══════════════════════════════════════' AS "═ INSTRUCCIONES POST-FIX ═";
SELECT '1. Esperar ~10s para que GoTrue recargue' AS " ";
SELECT '2. Login con: admin@chessking.com (SIN s) / [REDACTED-ROTAR]' AS " ";
SELECT '3. Si sigue 500: Dashboard → Settings → API → "Reload schema"' AS " ";
