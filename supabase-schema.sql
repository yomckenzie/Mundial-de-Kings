-- ============================================================
-- ESQUEMA SUPABASE - CHESS KING (CORREGIDO)
-- Ejecuta este script en el SQL Editor de Supabase
-- Ve a: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================
-- Este script es seguro de ejecutar múltiples veces.
-- ============================================================

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cedula TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tiktok TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS prediction_points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT false;

-- 2. MATCHES
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE matches ADD COLUMN IF NOT EXISTS team1 TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team2 TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS result_team1 INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS result_team2 INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_date TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_time TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS group_stage TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS fixture_id INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS elapsed TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_score INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_score INTEGER;

-- 3. PREDICTIONS
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE predictions ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS match_id TEXT;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS pred_team1 INTEGER;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS pred_team2 INTEGER;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS scored BOOLEAN DEFAULT false;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS is_correct BOOLEAN DEFAULT false;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0;

-- 4. PRIZES
CREATE TABLE IF NOT EXISTS prizes (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prizes ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS points_cost INTEGER DEFAULT 0;
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS units_available INTEGER DEFAULT 0;
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 5. REDEMPTIONS
CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS prize_id TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS prize_name TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS points_spent INTEGER DEFAULT 0;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- 6. SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS admin_reply TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- 7. POINTS BONUSES
CREATE TABLE IF NOT EXISTS points_bonuses (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE points_bonuses ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE points_bonuses ADD COLUMN IF NOT EXISTS amount INTEGER DEFAULT 0;
ALTER TABLE points_bonuses ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE points_bonuses ADD COLUMN IF NOT EXISTS given_by TEXT;

-- 8. APP SETTINGS
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS key TEXT NOT NULL DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS value TEXT;


-- 9. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS admin_email TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS admin_name TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS deleted_user_email TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS deleted_user_name TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS deleted_user_instagram TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details TEXT;


-- 10. APP SETTINGS (duplicado heredado, se mantiene para compatibilidad)
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS key TEXT NOT NULL DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS value TEXT;


-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================
-- Se agregan con bloques DO $$ para ser idempotentes

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_predictions_user') THEN
    ALTER TABLE predictions ADD CONSTRAINT fk_predictions_user
      FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_predictions_match') THEN
    ALTER TABLE predictions ADD CONSTRAINT fk_predictions_match
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_redemptions_user') THEN
    ALTER TABLE redemptions ADD CONSTRAINT fk_redemptions_user
      FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_redemptions_prize') THEN
    ALTER TABLE redemptions ADD CONSTRAINT fk_redemptions_prize
      FOREIGN KEY (prize_id) REFERENCES prizes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_support_user') THEN
    ALTER TABLE support_tickets ADD CONSTRAINT fk_support_user
      FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_points_bonuses_user') THEN
    ALTER TABLE points_bonuses ADD CONSTRAINT fk_points_bonuses_user
      FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE;
  END IF;
END $$;


-- ============================================================
-- CHECK CONSTRAINTS (validación de estados)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_matches_status') THEN
    ALTER TABLE matches ADD CONSTRAINT ck_matches_status
      CHECK (status IN ('pending', 'open', 'closed', 'live', 'finished'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_prizes_status') THEN
    ALTER TABLE prizes ADD CONSTRAINT ck_prizes_status
      CHECK (status IN ('active', 'inactive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_redemptions_status') THEN
    ALTER TABLE redemptions ADD CONSTRAINT ck_redemptions_status
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_support_status') THEN
    ALTER TABLE support_tickets ADD CONSTRAINT ck_support_status
      CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_role') THEN
    ALTER TABLE users ADD CONSTRAINT ck_users_role
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;


-- ============================================================
-- ÍNDICES
-- ============================================================
-- Índices simples existentes (se mantienen por claridad)
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_email);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_email);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_tickets(user_email);
CREATE INDEX IF NOT EXISTS idx_points_bonuses_user ON points_bonuses(user_email);

-- Índice compuesto: búsquedas de pronóstico por usuario + partido
CREATE INDEX IF NOT EXISTS idx_predictions_user_match
  ON predictions(user_email, match_id);

-- Índice en prize_id de redemptions (FK faltante)
CREATE INDEX IF NOT EXISTS idx_redemptions_prize ON redemptions(prize_id);

-- Índice en app_settings.key para búsquedas por clave
CREATE INDEX IF NOT EXISTS idx_settings_key ON app_settings(key);

-- Índice en matches.status para filtrar partidos por estado
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- Índice en matches.match_date para ordenar por fecha
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);


-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_app_settings_key') THEN
    ALTER TABLE app_settings ADD CONSTRAINT uq_app_settings_key UNIQUE (key);
  END IF;
END $$;


-- ============================================================
-- MIGRACIÓN: SISTEMA DE REFERIDOS
-- Ejecutar después del esquema base
-- ============================================================

-- 1. Nuevas columnas en users
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_points INTEGER DEFAULT 0;

-- Índice único para referral_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- 2. Tabla de referidos (relaciones)
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_code TEXT NOT NULL,
  referrer_email TEXT NOT NULL,
  referred_email TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  created_date TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de comisiones pagadas
CREATE TABLE IF NOT EXISTS referral_commissions (
  id TEXT PRIMARY KEY,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  match_id TEXT,
  level INTEGER NOT NULL,
  points_earned INTEGER DEFAULT 0,
  type TEXT DEFAULT 'commission',
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE referral_commissions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'commission';

-- Índices
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_email);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_email);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_to ON referral_commissions(to_email);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_from ON referral_commissions(from_email);


-- ============================================================
-- NOTA: La app usa la anon key de Supabase y la seguridad se
-- maneja a nivel de aplicación (flag role='admin' en la tabla users).
-- RLS queda DESHABILITADO. Para aplicarlo, ejecutá después:
--   supabase-fix-all-rls.sql
--
-- MEJORAS APLICADAS (basadas en supabase-postgres-best-practices):
--   + FOREIGN KEY constraints entre tablas relacionadas
--   + CHECK constraints para validar campos de estado
--   + Índice compuesto predictions(user_email, match_id)
--   + Índice faltante en redemptions(prize_id)
--   + Índice en app_settings(key)
--   + Índice en matches(status) y matches(match_date)
--   + UNIQUE constraint en app_settings(key)
--   + SISTEMA DE REFERIDOS: tabla referrals + referral_commissions
-- ============================================================
