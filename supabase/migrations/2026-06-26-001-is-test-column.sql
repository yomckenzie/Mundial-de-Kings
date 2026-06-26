-- ============================================================================
-- Add is_test column to matches for local-only testing
-- ============================================================================
-- Permite crear partidos de prueba en localhost que NO se muestran al público
-- en producción. El admin los ve siempre; el público los ve solo si la URL
-- trae ?include_test=1 (override intencional para testing manual).
--
-- Aplica desde: 2026-06-26 (durante testing del modelo 3 componentes)
-- ============================================================================

BEGIN;

-- Idempotente: si la columna ya existe, no falla
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- Index para que el filtro público (is_test = false) sea eficiente
CREATE INDEX IF NOT EXISTS matches_is_test_idx ON public.matches (is_test) WHERE is_test = FALSE;

-- Comentario para futuras lecturas
COMMENT ON COLUMN public.matches.is_test IS
  'TRUE = partido de prueba (visible solo en localhost o via ?include_test=1). FALSE = partido normal visible al público.';

COMMIT;

-- ============================================================================
-- ROLLBACK (ejecutar manualmente si hace falta):
-- DROP INDEX IF EXISTS public.matches_is_test_idx;
-- ALTER TABLE public.matches DROP COLUMN IF EXISTS is_test;
-- ============================================================================