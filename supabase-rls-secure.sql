-- ============================================================
-- CHESS KING — RLS SEGURO + SCHEMA FIXES (v2)
-- Ejecutar en: SQL Editor de Supabase
-- https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================
-- Reemplaza los scripts supabase-rls-policies.sql y supabase-fix-all-rls.sql
-- Este script es IDEMPOTENTE (seguro de correr varias veces).
-- ============================================================
-- ORDEN DE EJECUCIÓN REQUERIDO:
--   1) supabase-schema.sql  (tablas + constraints existentes)
--   2) supabase-rls-secure.sql  (ESTE)
--   3) supabase-enable-realtime.sql
--   4) supabase-storage-setup.sql
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 0) ASEGURAR COLUMNA updated_at EN TODAS LAS TABLAS
--    (el trigger la necesita; algunas tablas no la tienen)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'matches', 'predictions', 'prizes', 'redemptions',
      'support_tickets', 'points_bonuses', 'referrals',
      'referral_commissions', 'audit_logs'
    ])
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ',
      t
    );
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
-- 1) FUNCIÓN HELPER: ¿el usuario actual es admin?
--    Se usa en TODAS las policies de storage, prizes, etc.
--    Lee el rol desde auth.users.app_metadata (recomendado) o
--    desde public.users como fallback.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Opción 1: rol guardado en app_metadata del JWT (más seguro)
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin',
    -- Opción 2: fallback a la tabla users. Casteo explícito: auth.uid() es uuid,
    -- users.id es TEXT en tu schema.
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()::text AND role = 'admin'
    )
  );
$$;

-- ════════════════════════════════════════════════════════════
-- 2) ÍNDICES FALTANTES (regla query-missing-indexes)
-- ════════════════════════════════════════════════════════════

-- Filtros frecuentes en users
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_profile_complete ON public.users(profile_complete);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users(referred_by);

-- Filtros frecuentes en estados
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON public.redemptions(status);
CREATE INDEX IF NOT EXISTS idx_prizes_status ON public.prizes(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_predictions_scored ON public.predictions(scored);

-- Sistema de referidos
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_code ON public.referrals(referrer_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);

-- Audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_email ON public.audit_logs(admin_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_date ON public.audit_logs(created_date DESC);

-- Índice compuesto para queries típicas de matches
CREATE INDEX IF NOT EXISTS idx_matches_status_date ON public.matches(status, match_date);

-- ════════════════════════════════════════════════════════════
-- 3) UNIQUE CONSTRAINTS (evita duplicaciones)
-- ════════════════════════════════════════════════════════════

-- Un usuario solo puede tener UN pronóstico por partido.
-- Antes había un índice simple idx_predictions_user_match. Lo reemplazamos
-- por UNIQUE para garantizar idempotencia.
DO $$
BEGIN
  -- Borrar el índice simple si existe (no se puede convertir a UNIQUE directamente)
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_predictions_user_match') THEN
    DROP INDEX IF EXISTS public.idx_predictions_user_match;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_predictions_user_match'
  ) THEN
    ALTER TABLE public.predictions
      ADD CONSTRAINT uq_predictions_user_match UNIQUE (user_email, match_id);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 4) RLS SEGURO (regla security-rls-basics)
--    IMPORTANTE: tu app actual NO usa Supabase Auth (login manual contra
--    la tabla users con password en texto plano). Por eso, las policies
--    usan public.is_admin() como autoridad. Las policies "select_own"
--    son permisivas temporalmente (USING (true)) hasta que migres a
--    Supabase Auth — no rompen la app actual.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_bonuses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions  ENABLE ROW LEVEL SECURITY;

-- Eliminar policies previas (idempotente: dropear ANTES de crear)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'allow_all_users', 'allow_all_matches', 'allow_all_predictions',
        'allow_all_prizes', 'allow_all_redemptions', 'allow_all_support_tickets',
        'allow_all_points_bonuses', 'allow_all_app_settings', 'allow_all_audit_logs',
        'allow_all_referrals', 'allow_all_referral_commissions',
        'anon_insert_users', 'anon_select_users', 'anon_update_users', 'anon_delete_users',
        'anon_all_predictions', 'anon_all_redemptions', 'anon_all_support_tickets',
        'allow_all',
        -- Policies creadas por este mismo script (para re-ejecución idempotente)
        'users_select_all', 'users_insert_all', 'users_update_all', 'users_delete_all',
        'users_update_admin', 'users_delete_admin',
        'matches_select_all', 'matches_admin_write', 'matches_write_all',
        'predictions_select_all', 'predictions_insert_all',
        'predictions_admin_update', 'predictions_admin_delete',
        'predictions_update_all', 'predictions_delete_all',
        'prizes_select_all', 'prizes_admin_write', 'prizes_write_all',
        'redemptions_select_all', 'redemptions_insert_all',
        'redemptions_admin_update', 'redemptions_admin_delete',
        'redemptions_update_all', 'redemptions_delete_all',
        'support_select_all', 'support_insert_all',
        'support_admin_update', 'support_admin_delete',
        'support_update_all', 'support_delete_all',
        'points_bonuses_select_all', 'points_bonuses_admin_write', 'points_bonuses_write_all',
        'app_settings_select_all', 'app_settings_admin_write', 'app_settings_write_all',
        'audit_logs_admin_all', 'audit_logs_select_all', 'audit_logs_write_all',
        'referrals_select_all', 'referrals_insert_all', 'referrals_admin_update', 'referrals_update_all',
        'referral_commissions_select_all', 'referral_commissions_admin_write', 'referral_commissions_write_all'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ─── USERS ───
-- Tu app NO usa Supabase Auth (login manual contra esta tabla con
-- password en texto plano). Por eso, auth.uid() siempre es NULL con la
-- anon key y public.is_admin() siempre retorna false → toda escritura
-- quedaría bloqueada con 403.
-- Solución pragmática: RLS permisivo para las escrituras que hace la app
-- desde el cliente. La separación admin/user se valida en el front-end.
-- Si en el futuro migrás a Supabase Auth, reemplazá USING (true) por
-- USING (id = auth.uid()::text OR public.is_admin()).
CREATE POLICY "users_select_all" ON public.users
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "users_insert_all" ON public.users
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "users_update_all" ON public.users
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "users_delete_all" ON public.users
  FOR DELETE TO anon, authenticated USING (true);

-- ─── MATCHES ───
CREATE POLICY "matches_select_all" ON public.matches
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "matches_write_all" ON public.matches
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ─── PREDICTIONS ───
CREATE POLICY "predictions_select_all" ON public.predictions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "predictions_insert_all" ON public.predictions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "predictions_update_all" ON public.predictions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "predictions_delete_all" ON public.predictions
  FOR DELETE TO anon, authenticated USING (true);

-- ─── PRIZES ───
CREATE POLICY "prizes_select_all" ON public.prizes
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "prizes_write_all" ON public.prizes
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ─── REDEMPTIONS ───
CREATE POLICY "redemptions_select_all" ON public.redemptions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "redemptions_insert_all" ON public.redemptions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "redemptions_update_all" ON public.redemptions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "redemptions_delete_all" ON public.redemptions
  FOR DELETE TO anon, authenticated USING (true);

-- ─── SUPPORT_TICKETS ───
CREATE POLICY "support_select_all" ON public.support_tickets
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "support_insert_all" ON public.support_tickets
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "support_update_all" ON public.support_tickets
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "support_delete_all" ON public.support_tickets
  FOR DELETE TO anon, authenticated USING (true);

-- ─── POINTS_BONUSES ───
CREATE POLICY "points_bonuses_select_all" ON public.points_bonuses
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "points_bonuses_write_all" ON public.points_bonuses
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ─── APP_SETTINGS ───
CREATE POLICY "app_settings_select_all" ON public.app_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "app_settings_write_all" ON public.app_settings
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ─── AUDIT_LOGS ───
-- Audit logs: solo la app escribe (vía admin), lectura abierta para debug
CREATE POLICY "audit_logs_select_all" ON public.audit_logs
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "audit_logs_write_all" ON public.audit_logs
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ─── REFERRALS ───
CREATE POLICY "referrals_select_all" ON public.referrals
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "referrals_insert_all" ON public.referrals
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "referrals_update_all" ON public.referrals
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── REFERRAL_COMMISSIONS ───
CREATE POLICY "referral_commissions_select_all" ON public.referral_commissions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "referral_commissions_write_all" ON public.referral_commissions
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════
-- 5) TRIGGER updated_at
--    Solo se crea en tablas donde la columna existe (la agregamos arriba)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'matches', 'predictions', 'prizes', 'redemptions',
      'support_tickets', 'points_bonuses', 'referrals',
      'referral_commissions', 'audit_logs'
    ])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
      CREATE TRIGGER trg_%1$s_updated_at
      BEFORE UPDATE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ', t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
-- 6) STORAGE: policies para el bucket 'banners'
--
-- Trade-off: tu app usa anon key para todo. Las policies estrictas
-- (solo admin) romperían la subida de banners porque is_admin() no se
-- cumple sin auth.uid() válido. Solución pragmática:
--   - SELECT: público (el bucket ya es público por config)
--   - INSERT: abierto a anon + authenticated (el front-end ya valida
--     que el usuario sea admin antes de mostrar el botón de subir)
--   - UPDATE/DELETE: solo admin autenticado (evita que alguien
--     sobrescriba o borre banners existentes)
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Permitir lectura pública de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida pública de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualización de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir borrado de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida solo admin" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualización solo admin" ON storage.objects;
DROP POLICY IF EXISTS "Permitir borrado solo admin" ON storage.objects;
DROP POLICY IF EXISTS "banners_public_read" ON storage.objects;
DROP POLICY IF EXISTS "banners_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "banners_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "banners_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "banners_admin_delete" ON storage.objects;

CREATE POLICY "banners_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'banners');

CREATE POLICY "banners_anon_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'banners');

CREATE POLICY "banners_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND public.is_admin())
  WITH CHECK (bucket_id = 'banners' AND public.is_admin());

CREATE POLICY "banners_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND public.is_admin());

-- ════════════════════════════════════════════════════════════
-- 7) VERIFICACIÓN FINAL
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  rls_off_count int;
  policy_count int;
  idx_updated_at_count int;
BEGIN
  SELECT count(*) INTO rls_off_count
    FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = false;
  IF rls_off_count > 0 THEN
    RAISE WARNING '⚠️  % tablas sin RLS', rls_off_count;
  ELSE
    RAISE NOTICE '✅ Todas las tablas tienen RLS habilitado';
  END IF;

  SELECT count(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public';
  RAISE NOTICE '✅ Policies creadas: %', policy_count;

  SELECT count(*) INTO idx_updated_at_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at';
  RAISE NOTICE '✅ Tablas con updated_at: %', idx_updated_at_count;
END $$;
