-- ════════════════════════════════════════════════════════════════════════════
-- Chess King — Migración 2026-06-11-001
-- Enterprise baseline: RLS, anti-duplicados, audit, versionado
--
-- INSTRUCCIONES:
-- 1. Hacé BACKUP manual desde Supabase Dashboard → Database → Backups
-- 2. Pegá TODO este bloque en SQL Editor
-- 3. Click RUN
-- 4. Si algo falla, restaura el backup (Point-in-time recovery)
--
-- Esta migración es IDEMPOTENTE: la podés correr varias veces sin romper.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabla de migraciones (versionado de schema) ───
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version, description)
VALUES ('2026-06-11-001', 'Enterprise baseline: RLS, audit, versionado, anti-duplicados')
ON CONFLICT (version) DO NOTHING;


-- ─── 2. Índice único en prizes (anti-duplicados por nombre) ───
-- Limpiar duplicados existentes primero (mantener el más antiguo por nombre)
DO $$
DECLARE
  deleted_count INT;
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(name))
      ORDER BY created_date ASC NULLS LAST, id ASC
    ) AS rn
    FROM prizes
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM prizes WHERE id IN (SELECT id FROM to_delete);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Premios duplicados eliminados: %', deleted_count;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prizes_unique_name
  ON prizes (LOWER(TRIM(name)));


-- ─── 3. Tabla de audit log ───
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email TEXT,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  before JSONB,
  after JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_table, target_id);


-- ─── 4. Activar RLS en TODAS las tablas ───
-- ⚠️ IMPORTANTE: antes de activar RLS, asegurar que las políticas
-- permiten lo que la app necesita. La app actual usa anon key con
-- acceso total. Vamos a restringir gradualmente.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_commissions ENABLE ROW LEVEL SECURITY;


-- ─── 5. Helper: ¿es admin? ───
-- Verifica si el JWT actual pertenece a un admin.
-- Usado en policies. Si la app no está autenticada (anon),
-- retorna false. Service role bypasea RLS (no se ejecuta).

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE email = COALESCE(
      auth.jwt() ->> 'email',
      current_setting('request.jwt.claims', true)::jsonb ->> 'email'
    )
    AND role = 'admin'
  );
$$;


-- ─── 6. Policies permisivas para desarrollo (compatibles con app actual) ───
-- MIENTRAS la app use anon key con acceso total, dejamos SELECT libre
-- para usuarios autenticados y anon, pero RESTRINGIMOS escrituras:
-- - INSERT/UPDATE/DELETE solo si is_admin() retorna true
-- - service_role bypasea todo (no se ejecuta policy)

-- USERS
DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "users_insert_admin" ON users;
CREATE POLICY "users_insert_admin" ON users FOR INSERT
  TO anon, authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "users_update_admin" ON users;
CREATE POLICY "users_update_admin" ON users FOR UPDATE
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "users_delete_admin" ON users;
CREATE POLICY "users_delete_admin" ON users FOR DELETE
  TO anon, authenticated USING (is_admin());

-- MATCHES
DROP POLICY IF EXISTS "matches_select" ON matches;
CREATE POLICY "matches_select" ON matches FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "matches_write_admin" ON matches;
CREATE POLICY "matches_write_admin" ON matches FOR ALL
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());

-- PREDICTIONS
DROP POLICY IF EXISTS "predictions_select" ON predictions;
CREATE POLICY "predictions_select" ON predictions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "predictions_insert_own" ON predictions;
CREATE POLICY "predictions_insert_own" ON predictions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
-- ⚠️ La app actual permite que cualquier user cree predicciones.
-- En producción real, validar que user_email = auth.jwt() ->> 'email'

DROP POLICY IF EXISTS "predictions_update_admin" ON predictions;
CREATE POLICY "predictions_update_admin" ON predictions FOR UPDATE
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "predictions_delete_admin" ON predictions;
CREATE POLICY "predictions_delete_admin" ON predictions FOR DELETE
  TO anon, authenticated USING (is_admin());

-- PRIZES
DROP POLICY IF EXISTS "prizes_select" ON prizes;
CREATE POLICY "prizes_select" ON prizes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "prizes_write_admin" ON prizes;
CREATE POLICY "prizes_write_admin" ON prizes FOR ALL
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());

-- REDEMPTIONS
DROP POLICY IF EXISTS "redemptions_select" ON redemptions;
CREATE POLICY "redemptions_select" ON redemptions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "redemptions_insert_own" ON redemptions;
CREATE POLICY "redemptions_insert_own" ON redemptions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "redemptions_update_admin" ON redemptions;
CREATE POLICY "redemptions_update_admin" ON redemptions FOR UPDATE
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "redemptions_delete_admin" ON redemptions;
CREATE POLICY "redemptions_delete_admin" ON redemptions FOR DELETE
  TO anon, authenticated USING (is_admin());

-- SUPPORT_TICKETS
DROP POLICY IF EXISTS "support_tickets_select" ON support_tickets;
CREATE POLICY "support_tickets_select" ON support_tickets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "support_tickets_insert_own" ON support_tickets;
CREATE POLICY "support_tickets_insert_own" ON support_tickets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "support_tickets_update_admin" ON support_tickets;
CREATE POLICY "support_tickets_update_admin" ON support_tickets FOR UPDATE
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "support_tickets_delete_admin" ON support_tickets;
CREATE POLICY "support_tickets_delete_admin" ON support_tickets FOR DELETE
  TO anon, authenticated USING (is_admin());

-- POINTS_BONUSES
DROP POLICY IF EXISTS "points_bonuses_select" ON points_bonuses;
CREATE POLICY "points_bonuses_select" ON points_bonuses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "points_bonuses_write_admin" ON points_bonuses;
CREATE POLICY "points_bonuses_write_admin" ON points_bonuses FOR ALL
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());

-- APP_SETTINGS
DROP POLICY IF EXISTS "app_settings_select" ON app_settings;
CREATE POLICY "app_settings_select" ON app_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "app_settings_write_admin" ON app_settings;
CREATE POLICY "app_settings_write_admin" ON app_settings FOR ALL
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());

-- AUDIT_LOGS: solo admin puede leer
DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT
  TO anon, authenticated USING (is_admin());

DROP POLICY IF EXISTS "audit_logs_insert_all" ON audit_logs;
CREATE POLICY "audit_logs_insert_all" ON audit_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- REFERRALS
DROP POLICY IF EXISTS "referrals_select" ON referrals;
CREATE POLICY "referrals_select" ON referrals FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "referrals_write_admin" ON referrals;
CREATE POLICY "referrals_write_admin" ON referrals FOR ALL
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());

-- REFERRAL_COMMISSIONS
DROP POLICY IF EXISTS "referral_commissions_select" ON referral_commissions;
CREATE POLICY "referral_commissions_select" ON referral_commissions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "referral_commissions_write_admin" ON referral_commissions;
CREATE POLICY "referral_commissions_write_admin" ON referral_commissions FOR ALL
  TO anon, authenticated USING (is_admin()) WITH CHECK (is_admin());


-- ─── 7. Trigger automático de audit log ───
-- Genera audit row en cada INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  actor TEXT;
  tid TEXT;
BEGIN
  -- Determinar el actor (email del JWT o anon)
  actor := COALESCE(
    auth.jwt() ->> 'email',
    current_setting('request.jwt.claims', true)::jsonb ->> 'email',
    'system'
  );

  -- Determinar el ID del registro afectado
  IF TG_OP = 'DELETE' THEN
    tid := OLD.id;
  ELSE
    tid := NEW.id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (actor_email, action, target_table, target_id, after)
    VALUES (actor, 'INSERT', TG_TABLE_NAME, tid, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (actor_email, action, target_table, target_id, before, after)
    VALUES (actor, 'UPDATE', TG_TABLE_NAME, tid, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (actor_email, action, target_table, target_id, before)
    VALUES (actor, 'DELETE', TG_TABLE_NAME, tid, to_jsonb(OLD));
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Aplicar a tablas críticas (NO a audit_logs — sería recursivo)
DROP TRIGGER IF EXISTS audit_matches ON matches;
CREATE TRIGGER audit_matches AFTER INSERT OR UPDATE OR DELETE ON matches
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS audit_predictions ON predictions;
CREATE TRIGGER audit_predictions AFTER INSERT OR UPDATE OR DELETE ON predictions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS audit_prizes ON prizes;
CREATE TRIGGER audit_prizes AFTER INSERT OR UPDATE OR DELETE ON prizes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS audit_redemptions ON redemptions;
CREATE TRIGGER audit_redemptions AFTER INSERT OR UPDATE OR DELETE ON redemptions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS audit_points_bonuses ON points_bonuses;
CREATE TRIGGER audit_points_bonuses AFTER INSERT OR UPDATE OR DELETE ON points_bonuses
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();


-- ─── 8. Verificación final ───
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE 'Migración 2026-06-11-001 aplicada con éxito';
  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE 'Tablas con RLS activado: 11';
  RAISE NOTICE 'Policies creadas: ~30';
  RAISE NOTICE 'Triggers de audit: 5';
  RAISE NOTICE 'Índice único en prizes: sí';
  RAISE NOTICE 'Schema migrations: registrada';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  PRÓXIMOS PASOS:';
  RAISE NOTICE '1. Verificar que la app sigue funcionando (login, ver partidos)';
  RAISE NOTICE '2. Probar crear un partido desde admin (debe funcionar)';
  RAISE NOTICE '3. Probar crear una predicción desde user (debe funcionar)';
  RAISE NOTICE '4. Probar hacer un POST directo a users SIN ser admin (debe fallar)';
  RAISE NOTICE '5. Limpiar localStorage del admin browser (Ctrl+Shift+R)';
END $$;
