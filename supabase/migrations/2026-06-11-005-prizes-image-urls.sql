-- ═══════════════════════════════════════════════════════════════
-- 2026-06-11-005: agregar image_urls a la tabla prizes
-- ═══════════════════════════════════════════════════════════════
-- CÓMO EJECUTAR:
--   1. Ir a: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
--   2. Pegar TODO este script
--   3. Ejecutar (idempotente: puede correrse varias veces sin error)
-- ═══════════════════════════════════════════════════════════════

-- 1) Agregar columna image_urls (text[]) si no existe.
--    Usamos text[] (no jsonb) porque Supabase PostgREST lo serializa
--    como array nativo de strings, que es lo que el cliente espera.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prizes'
      AND column_name = 'image_urls'
  ) THEN
    ALTER TABLE public.prizes ADD COLUMN image_urls text[] DEFAULT NULL;
  END IF;
END $$;

-- 2) Backfill: para premios existentes que tienen image_url pero no
--    image_urls, migrar la imagen legacy al nuevo formato (array de 1).
UPDATE public.prizes
SET image_urls = ARRAY[image_url]::text[]
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

-- 3) Reporte final (RETORNA FILAS — visible en la pestaña "Results")
SELECT
  'total' AS metrica,
  COUNT(*)::text AS valor
FROM public.prizes
UNION ALL
SELECT
  'con_image_urls_nuevo' AS metrica,
  COUNT(*)::text AS valor
FROM public.prizes
WHERE image_urls IS NOT NULL AND array_length(image_urls, 1) > 0
UNION ALL
SELECT
  'con_image_url_legacy' AS metrica,
  COUNT(*)::text AS valor
FROM public.prizes
WHERE image_url IS NOT NULL AND image_url <> ''
UNION ALL
SELECT
  'columna_image_urls_existe' AS metrica,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'prizes' AND column_name = 'image_urls'
    ) THEN 'SI'
    ELSE 'NO'
  END;
