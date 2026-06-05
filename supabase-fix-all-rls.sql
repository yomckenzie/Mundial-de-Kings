-- ============================================================
-- FIX COMPLETO DE RLS - CHESS KING
-- Ejecuta este script en el SQL Editor de Supabase:
-- https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================
-- Este script es seguro de ejecutar múltiples veces.
-- ============================================================

-- ─── DESHABILITAR RLS en todas las tablas ───
-- Para esta app, el anon key necesita acceso completo.
-- La seguridad se maneja a nivel de app (admin check, etc.)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_bonuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions DISABLE ROW LEVEL SECURITY;

-- ─── ELIMINAR POLÍTICAS EXISTENTES ───
-- Políticas de users
DROP POLICY IF EXISTS allow_all ON public.users;
DROP POLICY IF EXISTS "anon_insert_users" ON public.users;
DROP POLICY IF EXISTS "anon_select_users" ON public.users;
DROP POLICY IF EXISTS "anon_update_users" ON public.users;
DROP POLICY IF EXISTS "anon_delete_users" ON public.users;

-- Políticas de otras tablas
DROP POLICY IF EXISTS allow_all ON public.matches;
DROP POLICY IF EXISTS allow_all ON public.predictions;
DROP POLICY IF EXISTS allow_all ON public.prizes;
DROP POLICY IF EXISTS allow_all ON public.redemptions;
DROP POLICY IF EXISTS allow_all ON public.support_tickets;
DROP POLICY IF EXISTS allow_all ON public.points_bonuses;
DROP POLICY IF EXISTS allow_all ON public.app_settings;
DROP POLICY IF EXISTS "anon_all_predictions" ON public.predictions;
DROP POLICY IF EXISTS "anon_all_redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "anon_all_support_tickets" ON public.support_tickets;

-- Políticas de tablas nuevas
DROP POLICY IF EXISTS allow_all ON public.audit_logs;
DROP POLICY IF EXISTS allow_all ON public.referrals;
DROP POLICY IF EXISTS allow_all ON public.referral_commissions;

-- ─── VERIFICAR RESULTADO ───
SELECT 
  tablename, 
  rowsecurity AS rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Debe mostrar rowsecurity = false para todas las tablas
