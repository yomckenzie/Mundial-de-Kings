-- ════════════════════════════════════════════════════════════════════════════
-- Migración 2026-06-11-002
-- Anti-duplicados en prizes (única constraint por nombre case-insensitive)
-- ════════════════════════════════════════════════════════════════════════════
-- Ejecutar en Supabase SQL Editor. Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS idx_prizes_unique_name
  ON prizes (LOWER(TRIM(name)));
