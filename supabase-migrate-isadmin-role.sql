-- ============================================================
-- MIGRACIÓN: is_admin() basado en role de public.users
-- ============================================================
-- Problema: is_admin() hardcodeaba auth.jwt() ->> 'email' = 'admin@chessking.com'
--           Esto impedía crear premios desde el panel admin incluso con
--           Supabase Auth activo, porque la función NO consultaba el role.
--
-- Solución: is_admin() ahora consulta public.users para verificar que
--           el usuario autenticado tenga role = 'admin'.
--
-- Ventajas:
--   ✅ Los 82 usuarios en Supabase Auth NO se ven afectados
--   ✅ Si promueves a otro usuario a admin (cambiando su role), obtiene permisos
--   ✅ No depende del email hardcodeado
--   ✅ Es consistente con la lógica de roles de la app
--
-- ⚠️ IMPORTANTE: Antes de ejecutar, verifica que el admin tenga role='admin'
--    en public.users. Si el admin fue creado SOLO via seedIfEmpty() y NUNCA
--    se subió a Supabase (por el mismo bug de RLS), primero debes insertarlo:
--
--    INSERT INTO public.users (id, email, role, full_name, created_date)
--    VALUES (
--      'admin-001',
--      'admin@chessking.com',
--      'admin',
--      'Admin ChessKing',
--      NOW()
--    )
--    ON CONFLICT (email) DO UPDATE SET role = 'admin';
--
-- Ejecuta este script en el SQL Editor de Supabase:
-- https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- 1. Actualizar la función is_admin() para que consulte public.users
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE email = auth.jwt() ->> 'email'
      AND role = 'admin'
  );
END;
$$;
