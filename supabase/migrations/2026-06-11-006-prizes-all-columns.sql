-- ═══════════════════════════════════════════════════════════════
-- 2026-06-11-006: agregar TODAS las columnas faltantes a prizes
-- ═══════════════════════════════════════════════════════════════
-- CÓMO EJECUTAR:
--   1. Ir a: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
--   2. Pegar TODO este script
--   3. Ejecutar (idempotente: puede correrse varias veces sin error)
-- ═══════════════════════════════════════════════════════════════

-- 1) Agregar columnas faltantes. Cada una se crea solo si no existe.
--    Esto evita errores si el script se corre múltiples veces.
DO $$
BEGIN
  -- image_urls (text[]): array de URLs. Agregado en migración 005,
  -- pero lo verificamos aquí también por si la 005 no se ejecutó.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prizes' AND column_name = 'image_urls'
  ) THEN
    ALTER TABLE public.prizes ADD COLUMN image_urls text[] DEFAULT NULL;
  END IF;

  -- sizes (jsonb): mapa de tallas con stock actual.
  -- Se usa para mostrar al usuario (calculado dinámicamente desde original_sizes).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prizes' AND column_name = 'sizes'
  ) THEN
    ALTER TABLE public.prizes ADD COLUMN sizes jsonb DEFAULT NULL;
  END IF;

  -- original_sizes (jsonb): mapa de tallas con stock ORIGINAL (no se reduce con canjes).
  -- Sirve para calcular el stock disponible restando canjes activos.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prizes' AND column_name = 'original_sizes'
  ) THEN
    ALTER TABLE public.prizes ADD COLUMN original_sizes jsonb DEFAULT NULL;
  END IF;

  -- original_stock (integer): stock original (sin descontar canjes).
  -- Stock disponible = original_stock - canjes activos.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prizes' AND column_name = 'original_stock'
  ) THEN
    ALTER TABLE public.prizes ADD COLUMN original_stock integer DEFAULT NULL;
  END IF;
END $$;

-- 2) Backfill: para premios existentes con image_url pero sin image_urls
UPDATE public.prizes
SET image_urls = ARRAY[image_url]::text[]
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

-- 3) Backfill: para premios con sizes pero sin original_sizes, copiar
UPDATE public.prizes
SET original_sizes = sizes
WHERE sizes IS NOT NULL
  AND (original_sizes IS NULL);

-- 4) Backfill: para premios con units_available pero sin original_stock
UPDATE public.prizes
SET original_stock = units_available
WHERE units_available IS NOT NULL
  AND original_stock IS NULL;

-- 5) Reporte final: muestra TODAS las columnas de la tabla prizes
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'prizes'
ORDER BY ordinal_position;
