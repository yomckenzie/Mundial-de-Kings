-- ============================================================
-- LIMPIEZA DE PREMIOS DUPLICADOS
-- Copia y pega TODO esto en el SQL Editor de Supabase
-- https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- PASO 1: CREAR BACKUP
CREATE TABLE IF NOT EXISTS public.prizes_backup_20260610 AS
SELECT * FROM public.prizes;

-- PASO 2: CONTAR ANTES
SELECT 'ANTES' as momento, COUNT(*) as total FROM public.prizes;

-- PASO 3: ELIMINAR DUPLICADOS (conserva 1 copia por nombre, la más antigua)
DELETE FROM public.prizes p
WHERE p.id NOT IN (
  SELECT MIN(p2.id) FROM public.prizes p2 GROUP BY p2.name
);

-- PASO 4: CONTAR DESPUÉS
SELECT 'DESPUES' as momento, COUNT(*) as total FROM public.prizes;

-- PASO 5: VER PREMIOS CONSERVADOS
SELECT id, name, points_cost, units_available, status, created_date
FROM public.prizes
ORDER BY created_date;

-- ============================================================
-- Si algo sale mal, RESTAURAR con:
-- DELETE FROM public.prizes;
-- INSERT INTO public.prizes SELECT * FROM public.prizes_backup_20260610;
-- ============================================================
