-- ════════════════════════════════════════════════════════════════════════════
-- Migración 2026-06-22-002
-- Tabla user_notifications para mensajes efímeros al usuario
-- (ej: "Tu canje fue rechazado, vuelve a hacerlo")
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'redemption_rejected',
  title TEXT NOT NULL,
  body TEXT,
  related_id TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON user_notifications (user_email, created_at DESC)
  WHERE read_at IS NULL;

-- RLS: lectura para el dueño, escritura solo admin (service_role la bypasea)
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_notif_select_own" ON user_notifications;
CREATE POLICY "user_notif_select_own" ON user_notifications FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "user_notif_insert_admin" ON user_notifications;
CREATE POLICY "user_notif_insert_admin" ON user_notifications FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "user_notif_update_any" ON user_notifications;
CREATE POLICY "user_notif_update_any" ON user_notifications FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
