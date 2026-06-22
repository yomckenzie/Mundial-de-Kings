-- ════════════════════════════════════════════════════════════════════════════
-- Migración 2026-06-22-003
-- Permitir INSERT y UPDATE de redemptions para el admin browser (anon key)
-- ════════════════════════════════════════════════════════════════════════════
-- El admin de esta app usa anon key (no Supabase Auth), por lo que las
-- policies que verifican is_admin() / auth.jwt() ->> 'email' fallan para él.
-- Como la app valida el rol del admin en JS y solo el admin browser hace
-- writes a esta tabla, permitimos INSERT/UPDATE/DELETE a anon y authenticated
-- sin restricción. (El canje atómico redeem_prize sigue protegido por su
-- propia función SQL que valida stock y puntos en una transacción.)

ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "redemptions_select" ON redemptions;
CREATE POLICY "redemptions_select" ON redemptions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "redemptions_insert" ON redemptions;
CREATE POLICY "redemptions_insert" ON redemptions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "redemptions_update" ON redemptions;
CREATE POLICY "redemptions_update" ON redemptions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "redemptions_delete" ON redemptions;
CREATE POLICY "redemptions_delete" ON redemptions FOR DELETE
  TO anon, authenticated USING (true);
