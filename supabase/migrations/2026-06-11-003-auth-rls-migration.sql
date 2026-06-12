-- ============================================================
-- CHESS KING — MIGRACIÓN A SUPABASE AUTH + RLS SEGURO
-- ============================================================
-- Fecha: 2026-06-11
--
-- QUÉ HACE:
-- 1. Crea cuentas en auth.users para 7 usuarios con IDs viejos
-- 2. Actualiza public.users.id con los nuevos UUIDs de Auth
-- 3. Actualiza la función is_admin() para usar auth.uid()::text
-- 4. Reemplaza RLS permisivo por políticas con auth.uid()
--
-- CÓMO EJECUTAR:
-- 1. Ir a: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- 2. PEGAR TODO este script
-- 3. REEMPLAZAR las contraseñas temporales si se desea
-- 4. Ejecutar
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1) HABILITAR pgcrypto (para crypt() y gen_random_uuid())
-- ═══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ═══════════════════════════════════════════════════════════════
-- 2) CREAR AUTH.USERS PARA LOS 7 USUARIOS CON IDS VIEJOS
-- ═══════════════════════════════════════════════════════════════
-- Cada usuario recibe:
--   - Un nuevo UUID (auth.uid)
--   - Una contraseña temporal (bcrypt hasheada)
--   - email_confirmed_at = ahora (ya verificados)
--
-- ⚠️ DESPUÉS DE EJECUTAR, CAMBIAR LAS CONTRASEÑAS TEMPORALES:
--    Los usuarios deben usar "Olvidé mi contraseña" en el login
--    o el admin puede cambiarlas desde Auth > Users en el Dashboard.
-- ============================================================

DO $$
DECLARE
  v_id UUID;
  v_email TEXT;
  v_temp_pw TEXT;
  v_now TIMESTAMPTZ := now();
  v_exists BOOLEAN;
BEGIN
  -- Admin
  v_email := 'admin@chessking.com';
  v_temp_pw := '[REDACTED-TEMP]'; -- ← CAMBIAR DESPUÉS POR UNA CONTRASEÑA SEGURA

  -- Verificar si ya existe en auth.users
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) INTO v_exists;

  IF NOT v_exists THEN
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      v_id, '00000000-0000-0000-0000-000000000000', v_email,
      crypt(v_temp_pw, gen_salt('bf')), v_now,
      v_now, v_now, '{"provider":"email","providers":["email"]}', '{}',
      false, 'authenticated', 'authenticated'
    );
    -- Actualizar public.users.id con el nuevo UUID
    UPDATE public.users SET id = v_id::text WHERE email = v_email AND id NOT LIKE '%-%';
    RAISE NOTICE '✅ Admin % creado con UUID: %', v_email, v_id;
  ELSE
    RAISE NOTICE '⚠️ Admin % ya existe en auth.users, omitido', v_email;
  END IF;

  -- Usuarios no-admin
  FOR v_email IN VALUES
    ('yobanyricardo19@gmail.com'),
    ('yobanyrciardo@gmail.com'),
    ('enoc.1008@gmail.com'),
    ('tatigarcia1@outlook.es'),
    ('yobanyrciardddo@gmail.com'),
    ('acs12.luis@gmail.com')
  LOOP
    -- Verificar si ya existe en auth.users
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) INTO v_exists;

    IF NOT v_exists THEN
      v_temp_pw := 'Temp_' || encode(gen_random_bytes(6), 'hex');
      v_id := gen_random_uuid();
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
        is_super_admin, role, aud
      ) VALUES (
        v_id, '00000000-0000-0000-0000-000000000000', v_email,
        crypt(v_temp_pw, gen_salt('bf')), v_now,
        v_now, v_now, '{"provider":"email","providers":["email"]}', '{}',
        false, 'authenticated', 'authenticated'
      );
      UPDATE public.users SET id = v_id::text WHERE email = v_email AND id NOT LIKE '%-%';
      RAISE NOTICE '✅ Usuario % creado con UUID: % (temp pw: %)', v_email, v_id, v_temp_pw;
    ELSE
      RAISE NOTICE '⚠️ Usuario % ya existe en auth.users, omitido', v_email;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 3) VERIFICAR QUE TODOS LOS USERS TENGAN UUID
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count INT;
  v_rec RECORD;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.users WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF v_count > 0 THEN
    RAISE WARNING '⚠️  % usuarios aún tienen IDs sin UUID. Revisar:', v_count;
    FOR v_rec IN SELECT id, email FROM public.users WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    LOOP
      RAISE WARNING '   - % (%)', v_rec.id, v_rec.email;
    END LOOP;
  ELSE
    RAISE NOTICE '✅ TODOS los usuarios tienen UUID';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 4) ACTUALIZAR FUNCIÓN is_admin() — usa auth.uid()::text
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Opción 1: rol en app_metadata del JWT
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin',
    -- Opción 2: fallback a la tabla users por auth.uid()::text
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()::text AND role = 'admin'
    )
  );
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5) HABILITAR RLS EN TODAS LAS TABLAS
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.matches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.predictions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prizes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.redemptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_tickets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.points_bonuses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referrals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referral_commissions  ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- 6) ELIMINAR POLÍTICAS EXISTENTES
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'users', 'matches', 'predictions', 'prizes', 'redemptions',
      'support_tickets', 'points_bonuses', 'app_settings',
      'audit_logs', 'referrals', 'referral_commissions'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 7) POLÍTICAS RLS CON auth.uid()
--
-- ESTRATEGIA:
--   - SELECT: público (cualquiera puede leer — necesario para ranking, etc.)
--   - INSERT: 
--       • users: cualquiera (registro de nuevos usuarios)
--       • predictions/redemptions/support: el propio usuario (auth.jwt()->>'email')
--       • matches/prizes: solo admin
--   - UPDATE:
--       • users: el propio usuario o admin
--       • predictions/redemptions: el propio usuario o admin (scoring)
--       • matches/prizes: solo admin
--   - DELETE: solo admin
--   - Referrals/Commissions: según corresponda
--
-- NOTA: evaluateMatchPredictions.js corre desde el navegador del admin
-- con el admin logueado en Supabase Auth. auth.uid() devuelve el UUID
-- del admin, y is_admin() verifica que tenga role='admin'.
-- ═══════════════════════════════════════════════════════════════

-- ─── USERS ───
-- SELECT: público (ranking, perfiles)
CREATE POLICY "users_select_public" ON public.users
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT: cualquiera puede registrar (signUp crea el perfil)
CREATE POLICY "users_insert_public" ON public.users
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- UPDATE: propio usuario O admin
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text OR public.is_admin())
  WITH CHECK (id = auth.uid()::text OR public.is_admin());

-- DELETE: solo admin
CREATE POLICY "users_delete_admin" ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ─── MATCHES ───
-- SELECT: público
CREATE POLICY "matches_select_public" ON public.matches
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT/UPDATE/DELETE: solo admin (el usuario nunca escribe partidos)
CREATE POLICY "matches_admin_all" ON public.matches
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── PREDICTIONS ───
-- SELECT: público (ver predicciones de otros, ranking)
CREATE POLICY "predictions_select_public" ON public.predictions
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT: propio email o admin (admin via evaluateMatchPredictions.js)
CREATE POLICY "predictions_insert_own_or_admin" ON public.predictions
  FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() ->> 'email' = user_email OR public.is_admin());

-- UPDATE: propio email O admin (admin hace scoring)
CREATE POLICY "predictions_update_own_or_admin" ON public.predictions
  FOR UPDATE TO authenticated
  USING (auth.jwt() ->> 'email' = user_email OR public.is_admin())
  WITH CHECK (auth.jwt() ->> 'email' = user_email OR public.is_admin());

-- DELETE: solo admin (limpieza)
CREATE POLICY "predictions_delete_admin" ON public.predictions
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ─── PRIZES ───
-- SELECT: público (catálogo de premios)
CREATE POLICY "prizes_select_public" ON public.prizes
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT/UPDATE/DELETE: solo admin
CREATE POLICY "prizes_admin_all" ON public.prizes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── REDEMPTIONS ───
-- SELECT: público (para que admin vea todos, usuario vea los suyos en perfil)
CREATE POLICY "redemptions_select_public" ON public.redemptions
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT: propio email
CREATE POLICY "redemptions_insert_own" ON public.redemptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() ->> 'email' = user_email);

-- UPDATE: admin (aprobar/rechazar) o propio email (cancelar)
CREATE POLICY "redemptions_update_own_or_admin" ON public.redemptions
  FOR UPDATE TO authenticated
  USING (auth.jwt() ->> 'email' = user_email OR public.is_admin())
  WITH CHECK (auth.jwt() ->> 'email' = user_email OR public.is_admin());

-- DELETE: solo admin
CREATE POLICY "redemptions_delete_admin" ON public.redemptions
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ─── SUPPORT_TICKETS ───
-- SELECT: propio email o admin
CREATE POLICY "support_select_own_or_admin" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = user_email OR public.is_admin());

-- INSERT: propio email
CREATE POLICY "support_insert_own" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() ->> 'email' = user_email);

-- UPDATE: admin (responder, cambiar estado)
CREATE POLICY "support_update_admin" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── POINTS_BONUSES ───
-- SELECT: propio email o admin
CREATE POLICY "points_bonuses_select_own_or_admin" ON public.points_bonuses
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = user_email OR public.is_admin());

-- INSERT: propio email (bono de bienvenida al registrarse) o admin (otorgar puntos extra)
CREATE POLICY "points_bonuses_insert_own_or_admin" ON public.points_bonuses
  FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() ->> 'email' = user_email OR public.is_admin());

-- ─── APP_SETTINGS ───
-- SELECT: público (info sections, config)
CREATE POLICY "app_settings_select_public" ON public.app_settings
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT/UPDATE/DELETE: solo admin
CREATE POLICY "app_settings_admin_all" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── AUDIT_LOGS ───
-- SELECT: solo admin (contiene información sensible de auditoría)
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- INSERT: cualquier authenticated (la app escribe logs)
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── REFERRALS ───
-- SELECT: público (verificar códigos de referido)
CREATE POLICY "referrals_select_public" ON public.referrals
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT: authenticated (registrar referido al crear cuenta)
CREATE POLICY "referrals_insert_auth" ON public.referrals
  FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE: solo admin
CREATE POLICY "referrals_update_admin" ON public.referrals
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── REFERRAL_COMMISSIONS ───
-- SELECT: público (ver historial de comisiones)
CREATE POLICY "referral_commissions_select_public" ON public.referral_commissions
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT: solo admin (el scoring escribe comisiones desde el navegador del admin)
CREATE POLICY "referral_commissions_insert_admin" ON public.referral_commissions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- 8) STORAGE: policies para bucket 'banners'
-- ═══════════════════════════════════════════════════════════════
-- SELECT: público (las imágenes se ven en la web)
-- INSERT: authenticated (admin sube banners)
-- UPDATE/DELETE: solo admin
-- ═══════════════════════════════════════════════════════════════

-- Limpiar policies viejas de storage
DROP POLICY IF EXISTS "banners_public_read" ON storage.objects;
DROP POLICY IF EXISTS "banners_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "banners_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "banners_admin_delete" ON storage.objects;
DROP POLICY IF EXISTS "Permitir lectura pública de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida pública de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualización de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir borrado de banners" ON storage.objects;

CREATE POLICY "banners_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'banners');

CREATE POLICY "banners_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners');

CREATE POLICY "banners_update_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND public.is_admin())
  WITH CHECK (bucket_id = 'banners' AND public.is_admin());

CREATE POLICY "banners_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- 9) VERIFICACIÓN FINAL
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_policy_count INT;
  v_rls_off INT;
BEGIN
  -- Contar policies
  SELECT COUNT(*) INTO v_policy_count FROM pg_policies WHERE schemaname = 'public';
  RAISE NOTICE '✅ Policies en public: %', v_policy_count;

  -- Tablas sin RLS
  SELECT COUNT(*) INTO v_rls_off
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'users', 'matches', 'predictions', 'prizes', 'redemptions',
        'support_tickets', 'points_bonuses', 'app_settings',
        'audit_logs', 'referrals', 'referral_commissions'
      )
      AND rowsecurity = false;
  IF v_rls_off > 0 THEN
    RAISE WARNING '⚠️  % tablas sin RLS habilitado', v_rls_off;
  ELSE
    RAISE NOTICE '✅ Todas las tablas tienen RLS habilitado';
  END IF;

  -- Verificar función is_admin()
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin' AND pronamespace = 'public'::regnamespace) THEN
    RAISE NOTICE '✅ Función public.is_admin() existe';
  ELSE
    RAISE WARNING '⚠️ Función public.is_admin() NO existe';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 10) LISTAR POLICIES CREADAS
-- ═══════════════════════════════════════════════════════════════
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
