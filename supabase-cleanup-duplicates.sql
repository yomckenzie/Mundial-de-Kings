-- ============================================================
-- LIMPIEZA DE DUPLICADOS - CHESS KING
-- Ejecutar SOLO después de verificar con el query de diagnóstico
-- ============================================================
-- IMPORTANTE: Este script BORRA datos. Hacé backup primero.

-- PASO 1: BACKUP (ejecutar primero, SIEMPRE)
CREATE TABLE IF NOT EXISTS public.prizes_backup_20260610 AS
SELECT * FROM public.prizes;

-- PASO 2: Ver cuántos premios únicos hay vs total
SELECT
  COUNT(*) AS total_filas,
  COUNT(DISTINCT name) AS nombres_unicos,
  COUNT(DISTINCT id) AS ids_unicos
FROM public.prizes;

-- PASO 3: Diagnóstico - top duplicados
SELECT name, COUNT(*) AS copias, MIN(id) AS id_mas_viejo
FROM public.prizes
GROUP BY name
ORDER BY copias DESC
LIMIT 20;

-- PASO 4: ELIMINAR duplicados (conserva el más viejo por nombre)
-- Descomentar SOLO después de confirmar el paso 2/3:
/*
DELETE FROM public.prizes
WHERE id NOT IN (
  SELECT MIN(id::text)::uuid
  FROM public.prizes
  GROUP BY name
);
*/
