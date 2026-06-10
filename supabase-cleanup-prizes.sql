-- ============================================================
-- LIMPIEZA DE DUPLICADOS EN PRIZES
-- Ejecutar en el SQL Editor de Supabase
-- https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================
-- Causa: seedIfEmpty() crea premios demo con IDs aleatorios cada vez
--   que el localStorage está vacío. Múltiples dispositivos/tabs generan
--   duplicados de "Camiseta Oficial", "Gorra Snapback", "Pulsera Kings".
--
-- Solución:
--   1) Backup de premios existentes
--   2) Eliminar duplicados por nombre (conserva el más antiguo)
--   3) NOTA: No agregamos UNIQUE(name) porque el admin puede querer
--      crear premios con el mismo nombre intencionalmente.
-- ============================================================

-- PASO 1: BACKUP (ejecutar primero, SIEMPRE)
CREATE TABLE IF NOT EXISTS public.prizes_backup_20260610 AS
SELECT * FROM public.prizes;

-- PASO 2: Diagnóstico - contar duplicados
SELECT
  COUNT(*) AS total_filas,
  COUNT(DISTINCT name) AS nombres_unicos,
  COUNT(*) - COUNT(DISTINCT name) AS filas_duplicadas
FROM public.prizes;

-- PASO 3: Ver los duplicados
SELECT name, COUNT(*) AS copias, MIN(created_date) AS primera_aparicion
FROM public.prizes
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY copias DESC;

-- PASO 4: ELIMINAR duplicados (conserva el registro más antiguo por nombre)
-- Si hay empate en created_date, conserva el que tenga id alfabéticamente menor.
DELETE FROM public.prizes p
WHERE p.id NOT IN (
  SELECT MIN(p2.id)
  FROM public.prizes p2
  GROUP BY p2.name
)
AND EXISTS (
  SELECT 1 FROM public.prizes p3
  WHERE p3.name = p.name
  GROUP BY p3.name
  HAVING COUNT(*) > 1
);
-- NOTA: La subquery con EXISTS asegura que solo eliminamos de grupos
-- que realmente tienen duplicados (no toca premios únicos).

-- PASO 5: Verificar resultado
SELECT COUNT(*) AS total_filas_restantes,
       COUNT(DISTINCT name) AS nombres_unicos
FROM public.prizes;
