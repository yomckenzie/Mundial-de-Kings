-- ============================================================
-- CONFIGURACIÓN DE SUPABASE AUTH Y POLÍTICAS RLS (SEGURO)
-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase:
-- https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- 1. Eliminar columna de password de la tabla pública de usuarios (ya no es necesaria)
ALTER TABLE public.users DROP COLUMN IF EXISTS password;

-- 2. Habilitar RLS
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

-- 3. Crear una función auxiliar para identificar al Admin de forma segura e instantánea
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (auth.jwt() ->> 'email' = 'admin@chessking.com'); 
  -- Nota: Para máxima seguridad post-lanzamiento, cámbialo a: RETURN (auth.uid()::text = 'UUID_DE_TU_ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Políticas de seguridad (RLS)

-- USERS
DROP POLICY IF EXISTS "allow_select_users" ON public.users;
CREATE POLICY "allow_select_users" ON public.users FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow_insert_users" ON public.users;
CREATE POLICY "allow_insert_users" ON public.users FOR INSERT WITH CHECK (auth.uid()::text = id OR public.is_admin());

DROP POLICY IF EXISTS "allow_update_users" ON public.users;
CREATE POLICY "allow_update_users" ON public.users FOR UPDATE USING (auth.uid()::text = id OR public.is_admin());

DROP POLICY IF EXISTS "allow_delete_users" ON public.users;
CREATE POLICY "allow_delete_users" ON public.users FOR DELETE USING (public.is_admin());

-- MATCHES
DROP POLICY IF EXISTS "allow_select_matches" ON public.matches;
CREATE POLICY "allow_select_matches" ON public.matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow_write_matches" ON public.matches;
CREATE POLICY "allow_write_matches" ON public.matches FOR ALL USING (public.is_admin());

-- PREDICTIONS
DROP POLICY IF EXISTS "allow_user_predictions" ON public.predictions;
CREATE POLICY "allow_user_predictions" ON public.predictions FOR ALL 
  USING (auth.jwt() ->> 'email' = user_email OR public.is_admin())
  WITH CHECK (auth.jwt() ->> 'email' = user_email OR public.is_admin());

-- PRIZES
DROP POLICY IF EXISTS "allow_select_prizes" ON public.prizes;
CREATE POLICY "allow_select_prizes" ON public.prizes FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow_write_prizes" ON public.prizes;
CREATE POLICY "allow_write_prizes" ON public.prizes FOR ALL USING (public.is_admin());

-- REDEMPTIONS
DROP POLICY IF EXISTS "allow_user_redemptions" ON public.redemptions;
CREATE POLICY "allow_user_redemptions" ON public.redemptions FOR ALL
  USING (auth.jwt() ->> 'email' = user_email OR public.is_admin());

-- SUPPORT TICKETS
DROP POLICY IF EXISTS "allow_user_support" ON public.support_tickets;
CREATE POLICY "allow_user_support" ON public.support_tickets FOR ALL
  USING (auth.jwt() ->> 'email' = user_email OR public.is_admin());

-- POINTS BONUSES
DROP POLICY IF EXISTS "allow_user_bonuses" ON public.points_bonuses;
CREATE POLICY "allow_user_bonuses" ON public.points_bonuses FOR SELECT USING (auth.jwt() ->> 'email' = user_email OR public.is_admin());

DROP POLICY IF EXISTS "allow_admin_bonuses" ON public.points_bonuses;
CREATE POLICY "allow_admin_bonuses" ON public.points_bonuses FOR ALL USING (public.is_admin());

-- APP SETTINGS
DROP POLICY IF EXISTS "allow_select_settings" ON public.app_settings;
CREATE POLICY "allow_select_settings" ON public.app_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow_write_settings" ON public.app_settings;
CREATE POLICY "allow_write_settings" ON public.app_settings FOR ALL USING (public.is_admin());

-- AUDIT LOGS
DROP POLICY IF EXISTS "allow_admin_audit" ON public.audit_logs;
CREATE POLICY "allow_admin_audit" ON public.audit_logs FOR ALL USING (public.is_admin());

-- REFERRALS
DROP POLICY IF EXISTS "allow_user_referrals" ON public.referrals;
CREATE POLICY "allow_user_referrals" ON public.referrals FOR ALL 
  USING (auth.jwt() ->> 'email' = referrer_email OR auth.jwt() ->> 'email' = referred_email OR public.is_admin());

-- REFERRAL COMMISSIONS
DROP POLICY IF EXISTS "allow_user_commissions" ON public.referral_commissions;
CREATE POLICY "allow_user_commissions" ON public.referral_commissions FOR ALL
  USING (auth.jwt() ->> 'email' = to_email OR auth.jwt() ->> 'email' = from_email OR public.is_admin());
