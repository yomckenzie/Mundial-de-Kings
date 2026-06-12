-- ════════════════════════════════════════════════════════════════════════════
-- Chess King — Migración 2026-06-11-003
-- RLS con Supabase Auth (todos los usuarios ya están en auth.users)
--
-- INSTRUCCIONES:
-- 1. BACKUP manual desde Supabase Dashboard → Database → Backups
-- 2. Pegá TODO este bloque en SQL Editor
-- 3. Click RUN
--
-- Esta migración es IDEMPOTENTE: la podés correr varias veces sin romper.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Helper: ¿el usuario actual es admin? ───
-- Verifica el rol en la tabla public.users usando auth.uid()

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text
      AND role = 'admin'
  );
$$;

-- ─── 2. Helper: ¿el usuario es el dueño del registro? ───
-- Compara el id del registro con auth.uid()

CREATE OR REPLACE FUNCTION public.is_owner(record_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT record_id = auth.uid()::text;
$$;

-- ─── 3. Eliminar TODAS las policies existentes ───

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
  RAISE NOTICE 'Todas las policies eliminadas';
END $$;

-- ─── 4. Crear policies basadas en auth.uid() ───

-- ════════════════════════════════════════
-- USERS
-- ════════════════════════════════════════

-- SELECT: cualquier usuario autenticado puede ver todos los usuarios (para ranking, etc.)
CREATE POLICY "users_select_authenticated"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- SELECT: anon puede ver información básica (para registro, referral)
CREATE POLICY "users_select_anon"
  ON public.users FOR SELECT
  TO anon
  USING (true);

-- INSERT: solo service_role puede crear usuarios (via API)
CREATE POLICY "users_insert_service"
  ON public.users FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: usuario puede actualizar su propio perfil, admin puede actualizar cualquiera
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid()::text OR public.is_admin())
  WITH CHECK (id = auth.uid()::text OR public.is_admin());

-- DELETE: solo admin puede eliminar usuarios
CREATE POLICY "users_delete_admin"
  ON public.users FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════
-- MATCHES
-- ════════════════════════════════════════

-- SELECT: cualquier usuario autenticado puede ver partidos
CREATE POLICY "matches_select"
  ON public.matches FOR SELECT
  TO authenticated, anon
  USING (true);

-- INSERT/UPDATE/DELETE: solo admin
CREATE POLICY "matches_admin_write"
  ON public.matches FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ════════════════════════════════════════
-- PREDICTIONS
-- ════════════════════════════════════════

-- SELECT: usuario autenticado puede ver predicciones (para ranking, perfil)
CREATE POLICY "predictions_select"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: usuario solo puede crear predicción con su propio email
CREATE POLICY "predictions_insert_own"
  ON public.predictions FOR INSERT
  TO authenticated
  WITH CHECK (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- UPDATE: admin puede actualizar cualquiera (para scoring)
CREATE POLICY "predictions_admin_update"
  ON public.predictions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE: admin puede eliminar
CREATE POLICY "predictions_admin_delete"
  ON public.predictions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════
-- PRIZES
-- ════════════════════════════════════════

-- SELECT: cualquier usuario puede ver premios
CREATE POLICY "prizes_select"
  ON public.prizes FOR SELECT
  TO authenticated, anon
  USING (true);

-- INSERT/UPDATE/DELETE: solo admin
CREATE POLICY "prizes_admin_write"
  ON public.prizes FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ════════════════════════════════════════
-- REDEMPTIONS
-- ════════════════════════════════════════

-- SELECT: usuario puede ver sus propios canjes, admin puede ver todos
CREATE POLICY "redemptions_select"
  ON public.redemptions FOR SELECT
  TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR public.is_admin());

-- INSERT: usuario solo puede crear canje con su propio email
CREATE POLICY "redemptions_insert_own"
  ON public.redemptions FOR INSERT
  TO authenticated
  WITH CHECK (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- UPDATE: admin puede actualizar estado de canjes
CREATE POLICY "redemptions_admin_update"
  ON public.redemptions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE: admin puede eliminar
CREATE POLICY "redemptions_admin_delete"
  ON public.redemptions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════
-- SUPPORT TICKETS
-- ════════════════════════════════════════

-- SELECT: usuario puede ver sus propios tickets, admin puede ver todos
CREATE POLICY "support_select"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR public.is_admin());

-- INSERT: usuario puede crear ticket con su propio email
CREATE POLICY "support_insert_own"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- UPDATE: admin puede actualizar tickets (para responder)
CREATE POLICY "support_admin_update"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE: admin puede eliminar
CREATE POLICY "support_admin_delete"
  ON public.support_tickets FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════
-- POINTS BONUSES
-- ════════════════════════════════════════

-- SELECT: admin puede ver todos, usuario puede ver los suyos
CREATE POLICY "points_bonuses_select"
  ON public.points_bonuses FOR SELECT
  TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR public.is_admin());

-- INSERT: solo admin puede dar bonos
CREATE POLICY "points_bonuses_insert_admin"
  ON public.points_bonuses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- UPDATE/DELETE: solo admin
CREATE POLICY "points_bonuses_admin_write"
  ON public.points_bonuses FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "points_bonuses_admin_delete"
  ON public.points_bonuses FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════
-- APP SETTINGS
-- ════════════════════════════════════════

-- SELECT: cualquier usuario puede ver configuración (para Info page)
CREATE POLICY "app_settings_select"
  ON public.app_settings FOR SELECT
  TO authenticated, anon
  USING (true);

-- INSERT/UPDATE/DELETE: solo admin
CREATE POLICY "app_settings_admin_write"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ════════════════════════════════════════
-- AUDIT LOGS
-- ════════════════════════════════════════

-- SELECT: solo admin puede ver logs de auditoría
CREATE POLICY "audit_logs_select_admin"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- INSERT: service_role puede insertar (via triggers)
CREATE POLICY "audit_logs_insert_service"
  ON public.audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ════════════════════════════════════════
-- REFERRALS
-- ════════════════════════════════════════

-- SELECT: usuario puede ver sus referidos, admin puede ver todos
CREATE POLICY "referrals_select"
  ON public.referrals FOR SELECT
  TO authenticated
  USING (referrer_email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR public.is_admin());

-- INSERT: service_role puede insertar (via API)
CREATE POLICY "referrals_insert_service"
  ON public.referrals FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: admin puede actualizar
CREATE POLICY "referrals_admin_update"
  ON public.referrals FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ════════════════════════════════════════
-- REFERRAL COMMISSIONS
-- ════════════════════════════════════════

-- SELECT: usuario puede ver sus comisiones, admin puede ver todas
CREATE POLICY "referral_commissions_select"
  ON public.referral_commissions FOR SELECT
  TO authenticated
  USING (to_email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR public.is_admin());

-- INSERT: service_role puede insertar (via API)
CREATE POLICY "referral_commissions_insert_service"
  ON public.referral_commissions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE/DELETE: solo admin
CREATE POLICY "referral_commissions_admin_write"
  ON public.referral_commissions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "referral_commissions_admin_delete"
  ON public.referral_commissions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════
-- STORAGE (banners bucket)
-- ════════════════════════════════════════

-- Eliminar policies anteriores de storage
DROP POLICY IF EXISTS "banners_public_read" ON storage.objects;
DROP POLICY IF EXISTS "banners_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "banners_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "banners_admin_delete" ON storage.objects;

-- SELECT: público (bucket es público)
CREATE POLICY "banners_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'banners');

-- INSERT: solo admin autenticado
CREATE POLICY "banners_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'banners' AND public.is_admin());

-- UPDATE: solo admin autenticado
CREATE POLICY "banners_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'banners' AND public.is_admin())
  WITH CHECK (bucket_id = 'banners' AND public.is_admin());

-- DELETE: solo admin autenticado
CREATE POLICY "banners_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'banners' AND public.is_admin());

-- ════════════════════════════════════════
-- 5. Verificación final
-- ════════════════════════════════════════

DO $$
DECLARE
  rls_off_count int;
  policy_count int;
BEGIN
  SELECT count(*) INTO rls_off_count
    FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = false;
  IF rls_off_count > 0 THEN
    RAISE WARNING '⚠️  % tablas sin RLS', rls_off_count;
  ELSE
    RAISE NOTICE '✅ Todas las tablas tienen RLS habilitado';
  END IF;

  SELECT count(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public';
  RAISE NOTICE '✅ Policies creadas: %', policy_count;
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE 'Migración 2026-06-11-003 aplicada con éxito';
  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE 'Resumen de permisos:';
  RAISE NOTICE '  • users: SELECT público, UPDATE propio/admin, DELETE admin';
  RAISE NOTICE '  • matches: SELECT público, ALL admin';
  RAISE NOTICE '  • predictions: SELECT público, INSERT propio, UPDATE/DELETE admin';
  RAISE NOTICE '  • prizes: SELECT público, ALL admin';
  RAISE NOTICE '  • redemptions: SELECT propio/admin, INSERT propio, UPDATE/DELETE admin';
  RAISE NOTICE '  • support_tickets: SELECT propio/admin, INSERT propio, UPDATE/DELETE admin';
  RAISE NOTICE '  • points_bonuses: SELECT propio/admin, INSERT/UPDATE/DELETE admin';
  RAISE NOTICE '  • app_settings: SELECT público, ALL admin';
  RAISE NOTICE '  • audit_logs: SELECT admin, INSERT service_role';
  RAISE NOTICE '  • referrals: SELECT propio/admin, INSERT service_role, UPDATE admin';
  RAISE NOTICE '  • referral_commissions: SELECT propio/admin, INSERT service_role, UPDATE/DELETE admin';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  PRÓXIMOS PASOS:';
  RAISE NOTICE '1. Verificar que la app sigue funcionando (login, ver partidos)';
  RAISE NOTICE '2. Probar crear un pronóstico desde user (debe funcionar)';
  RAISE NOTICE '3. Probar hacer un POST directo a users SIN ser admin (debe fallar)';
  RAISE NOTICE '4. Verificar que el admin puede gestionar todo';
END $$;
