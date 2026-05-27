-- =============================================
-- HABILITAR RLS Y CREAR POLÍTICAS PARA users
-- =============================================

-- Asegurar que RLS está habilitado
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Permitir INSERT anónimo (registro de usuarios)
DROP POLICY IF EXISTS "anon_insert_users" ON public.users;
CREATE POLICY "anon_insert_users" ON public.users
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Permitir SELECT anónimo (login, verificación)
DROP POLICY IF EXISTS "anon_select_users" ON public.users;
CREATE POLICY "anon_select_users" ON public.users
  FOR SELECT
  TO anon
  USING (true);

-- Permitir UPDATE anónimo (actualización de perfil)
DROP POLICY IF EXISTS "anon_update_users" ON public.users;
CREATE POLICY "anon_update_users" ON public.users
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Permitir DELETE anónimo (mantenimiento)
DROP POLICY IF EXISTS "anon_delete_users" ON public.users;
CREATE POLICY "anon_delete_users" ON public.users
  FOR DELETE
  TO anon
  USING (true);

-- =============================================
-- POLÍTICAS PARA OTRAS TABLAS
-- (por si alguna falla)
-- =============================================

-- predictions - anon necesita INSERT y SELECT
DROP POLICY IF EXISTS "anon_all_predictions" ON public.predictions;
CREATE POLICY "anon_all_predictions" ON public.predictions
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- redemptions - anon necesita INSERT y SELECT
DROP POLICY IF EXISTS "anon_all_redemptions" ON public.redemptions;
CREATE POLICY "anon_all_redemptions" ON public.redemptions
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- support_tickets - anon necesita INSERT y SELECT
DROP POLICY IF EXISTS "anon_all_support_tickets" ON public.support_tickets;
CREATE POLICY "anon_all_support_tickets" ON public.support_tickets
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- =============================================
-- VERIFICAR POLÍTICAS CREADAS
-- =============================================
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'users';
