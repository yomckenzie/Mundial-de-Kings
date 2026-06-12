-- ═══════════════════════════════════════════════════════════════
-- Verificación rápida: ¿existe la columna image_urls en prizes?
-- ═══════════════════════════════════════════════════════════════
-- Este script RETORNA FILAS (visible en la pestaña "Results")
-- para confirmar el estado de la tabla.
-- ═══════════════════════════════════════════════════════════════

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'prizes'
  AND column_name IN ('image_url', 'image_urls', 'original_sizes', 'original_stock')
ORDER BY column_name;
