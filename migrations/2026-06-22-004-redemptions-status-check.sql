-- ════════════════════════════════════════════════════════════════════════════
-- Migración 2026-06-22-004
-- Ampliar CHECK constraint de redemptions.status para incluir 'delivered'
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Ver el constraint actual
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'redemptions'::regclass
--   AND contype = 'c'
--   AND conname LIKE '%status%';

-- 2. Eliminar el constraint viejo y crear uno nuevo que incluya 'delivered'
ALTER TABLE redemptions
  DROP CONSTRAINT IF EXISTS ck_redemptions_status;

ALTER TABLE redemptions
  ADD CONSTRAINT ck_redemptions_status
  CHECK (status IN ('pending', 'approved', 'delivered', 'rejected'));

-- 3. Verificar
-- SELECT pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'redemptions'::regclass
--   AND contype = 'c'
--   AND conname = 'ck_redemptions_status';
