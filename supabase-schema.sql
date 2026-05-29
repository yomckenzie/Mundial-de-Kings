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


-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_email);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_email);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_tickets(user_email);
CREATE INDEX IF NOT EXISTS idx_points_bonuses_user ON points_bonuses(user_email);


-- ============================================================
-- POLÍTICAS DE SEGURIDAD (RLS)
-- Permitir todas las operaciones con la anon key
-- ============================================================

-- Helper: eliminar política existente si existe y crear una nueva permisiva
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['users', 'matches', 'predictions', 'prizes', 'redemptions', 'support_tickets', 'points_bonuses', 'app_settings'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I;', tbl);
    EXECUTE format(
      'CREATE POLICY allow_all ON %I FOR ALL USING (true) WITH CHECK (true);',
      tbl
    );
  END LOOP;
END $$;
