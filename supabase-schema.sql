-- ============================================================
-- ESQUEMA SUPABASE - MUNDIAL DE KINGS
-- Ejecuta este script en el SQL Editor de Supabase
-- Ve a: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  cedula TEXT,
  instagram TEXT,
  tiktok TEXT,
  phone TEXT,
  total_points INTEGER DEFAULT 0,
  prediction_points INTEGER DEFAULT 0,
  bonus_points INTEGER DEFAULT 0,
  profile_complete BOOLEAN DEFAULT false,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

-- 2. MATCHES
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  home_team TEXT,
  away_team TEXT,
  home_score INTEGER,
  away_score INTEGER,
  match_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  source TEXT DEFAULT 'manual',
  league TEXT,
  round TEXT
);

-- 3. PREDICTIONS
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  user_email TEXT REFERENCES users(email),
  match_id TEXT REFERENCES matches(id),
  home_score INTEGER,
  away_score INTEGER,
  is_correct BOOLEAN DEFAULT false,
  points_earned INTEGER DEFAULT 0
);

-- 4. PRIZES
CREATE TABLE IF NOT EXISTS prizes (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER DEFAULT 0,
  units_available INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  image_url TEXT
);

-- 5. REDEMPTIONS
CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  user_email TEXT REFERENCES users(email),
  prize_id TEXT REFERENCES prizes(id),
  prize_name TEXT,
  points_spent INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending'
);

-- 6. SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  user_email TEXT REFERENCES users(email),
  subject TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending'
);

-- 7. POINTS BONUSES
CREATE TABLE IF NOT EXISTS points_bonuses (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  user_email TEXT REFERENCES users(email),
  amount INTEGER DEFAULT 0,
  reason TEXT,
  given_by TEXT
);

-- 8. APP SETTINGS
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  key TEXT NOT NULL,
  value TEXT
);

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_email);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_email);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_tickets(user_email);
CREATE INDEX IF NOT EXISTS idx_points_bonuses_user ON points_bonuses(user_email);

-- DESACTIVAR RLS (para simplificar - la app maneja su propia auth)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE prizes DISABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE points_bonuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
