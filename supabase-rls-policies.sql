-- ============================================================
-- POLÍTICAS RLS - CHESS KING (PRODUCCIÓN SEGURA)
-- Ejecuta este script en el SQL Editor de Supabase:
-- https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================
-- Este script HABILITA RLS y crea políticas "allow-all" para
-- que la anon key pueda leer/escribir. Es el estado original
-- antes de los scripts SQL que eliminaron las políticas.
-- ============================================================
-- Es seguro de ejecutar múltiples veces.
-- ============================================================

-- 1. HABILITAR RLS en todas las tablas (seguridad activa)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

-- 2. CREAR POLÍTICAS "allow-all" para cada tabla
-- Estas políticas permiten a la anon key (cliente frontend)
-- leer, insertar, actualizar y eliminar registros.

-- Users
DROP POLICY IF EXISTS "allow_all_users" ON public.users;
CREATE POLICY "allow_all_users" ON public.users
  FOR ALL USING (true) WITH CHECK (true);

-- Matches
DROP POLICY IF EXISTS "allow_all_matches" ON public.matches;
CREATE POLICY "allow_all_matches" ON public.matches
  FOR ALL USING (true) WITH CHECK (true);

-- Predictions
DROP POLICY IF EXISTS "allow_all_predictions" ON public.predictions;
CREATE POLICY "allow_all_predictions" ON public.predictions
  FOR ALL USING (true) WITH CHECK (true);

-- Prizes
DROP POLICY IF EXISTS "allow_all_prizes" ON public.prizes;
CREATE POLICY "allow_all_prizes" ON public.prizes
  FOR ALL USING (true) WITH CHECK (true);

-- Redemptions
DROP POLICY IF EXISTS "allow_all_redemptions" ON public.redemptions;
CREATE POLICY "allow_all_redemptions" ON public.redemptions
  FOR ALL USING (true) WITH CHECK (true);

-- Support tickets
DROP POLICY IF EXISTS "allow_all_support_tickets" ON public.support_tickets;
CREATE POLICY "allow_all_support_tickets" ON public.support_tickets
  FOR ALL USING (true) WITH CHECK (true);

-- Points bonuses
DROP POLICY IF EXISTS "allow_all_points_bonuses" ON public.points_bonuses;
CREATE POLICY "allow_all_points_bonuses" ON public.points_bonuses
  FOR ALL USING (true) WITH CHECK (true);

-- App settings
DROP POLICY IF EXISTS "allow_all_app_settings" ON public.app_settings;
CREATE POLICY "allow_all_app_settings" ON public.app_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Audit logs
DROP POLICY IF EXISTS "allow_all_audit_logs" ON public.audit_logs;
CREATE POLICY "allow_all_audit_logs" ON public.audit_logs
  FOR ALL USING (true) WITH CHECK (true);

-- Referrals
DROP POLICY IF EXISTS "allow_all_referrals" ON public.referrals;
CREATE POLICY "allow_all_referrals" ON public.referrals
  FOR ALL USING (true) WITH CHECK (true);

-- Referral commissions
DROP POLICY IF EXISTS "allow_all_referral_commissions" ON public.referral_commissions;
CREATE POLICY "allow_all_referral_commissions" ON public.referral_commissions
  FOR ALL USING (true) WITH CHECK (true);

-- 3. VERIFICAR: debe mostrar rowsecurity = true (RLS activo)
--    y las políticas deben existir.
SELECT
  tablename,
  rowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies WHERE tablename = t.tablename) AS policies_count
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;

-- 4. LISTAR las políticas creadas
SELECT schemaname, tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
