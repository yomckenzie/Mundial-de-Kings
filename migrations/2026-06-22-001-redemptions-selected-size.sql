-- ════════════════════════════════════════════════════════════════════════════
-- Migración 2026-06-22-001
-- Agregar columna selected_size a redemptions (para guardar la talla canjeada)
-- ════════════════════════════════════════════════════════════════════════════
-- Ejecutar en Supabase SQL Editor. Idempotente y aditivo: NO afecta canjes
-- existentes (quedan con selected_size = NULL) ni la lógica de stock/puntos.

ALTER TABLE redemptions
  ADD COLUMN IF NOT EXISTS selected_size TEXT;
