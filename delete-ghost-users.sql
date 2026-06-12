-- ════════════════════════════════════════════════════════════════════════════
-- LIMPIEZA TOTAL DE 14 USUARIOS GHOST
-- "Sin rastro" = barrer auth + todas las FK. NO toca audit_logs (por ahora,
-- schema real pendiente de diagnóstico).
--
-- INSTRUCCIONES:
-- 1. Backup manual desde Supabase Dashboard → Database → Backups
-- 2. Pegá TODO este bloque en SQL Editor → RUN
-- 3. Revisá los conteos de la verificación (deben ser 0)
-- 4. Si OK: COMMIT;  |  Si algo falló: ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Tabla temporal con la lista (persiste durante la transacción) ───
CREATE TEMP TABLE ghost_emails ON COMMIT DROP AS
  SELECT unnest(ARRAY[
    'dspojgopsdj@gmail.com',
    'juanluispedro@gmail.com',
    'marawewia@empresa.com',
    'maria@empresa.com',
    'andrearobles@hotmail.com',
    'andrearobles14@hotmail.com',
    'yobanyrcfiardo@gmail.com',
    'yobanyrciardddo@gmail.com',
    'yobanyrciardo@gmail.com',
    'tatigarcia1@outlook.es',
    'test1@chessking.com',
    'testuser002@chessking.com',
    'acs12.luis@gmail.com',
    'enoc.1008@gmail.com'
  ]) AS email;

CREATE INDEX ON ghost_emails (email);

CREATE TEMP TABLE ghost_uids (id uuid) ON COMMIT DROP;
INSERT INTO ghost_uids (id)
  SELECT id FROM auth.users
    WHERE email IN (SELECT email FROM ghost_emails);
CREATE INDEX ON ghost_uids (id);

-- ─── Tablas hijas ───
DELETE FROM public.predictions          WHERE user_email IN (SELECT email FROM ghost_emails);
DELETE FROM public.redemptions          WHERE user_email IN (SELECT email FROM ghost_emails);
DELETE FROM public.points_bonuses       WHERE user_email IN (SELECT email FROM ghost_emails);
DELETE FROM public.support_tickets      WHERE user_email IN (SELECT email FROM ghost_emails);
DELETE FROM public.referrals            WHERE referrer_email IN (SELECT email FROM ghost_emails)
                                              OR referred_email IN (SELECT email FROM ghost_emails);
DELETE FROM public.referral_commissions WHERE to_email     IN (SELECT email FROM ghost_emails);

-- ─── public.users ───
DELETE FROM public.users WHERE email IN (SELECT email FROM ghost_emails);

-- ─── auth schema (hijas → padre) ───
DELETE FROM auth.identities      WHERE user_id IN (SELECT id FROM ghost_uids);
DELETE FROM auth.sessions        WHERE user_id IN (SELECT id FROM ghost_uids);
DELETE FROM auth.refresh_tokens  WHERE user_id IN (SELECT id FROM ghost_uids);
DELETE FROM auth.mfa_factors     WHERE user_id IN (SELECT id FROM ghost_uids);
DELETE FROM auth.one_time_tokens WHERE user_id IN (SELECT id FROM ghost_uids);
DELETE FROM auth.users           WHERE id       IN (SELECT id FROM ghost_uids);

-- ─── Verificación (todo debe ser 0) ───
SELECT 'public.users'           AS tabla, COUNT(*) AS quedan
  FROM public.users
  WHERE email IN (SELECT email FROM ghost_emails)
UNION ALL SELECT 'public.predictions', COUNT(*) FROM public.predictions
  WHERE user_email IN (SELECT email FROM ghost_emails)
UNION ALL SELECT 'public.redemptions', COUNT(*) FROM public.redemptions
  WHERE user_email IN (SELECT email FROM ghost_emails)
UNION ALL SELECT 'public.points_bonuses', COUNT(*) FROM public.points_bonuses
  WHERE user_email IN (SELECT email FROM ghost_emails)
UNION ALL SELECT 'public.support_tickets', COUNT(*) FROM public.support_tickets
  WHERE user_email IN (SELECT email FROM ghost_emails)
UNION ALL SELECT 'public.referrals (referrer)', COUNT(*) FROM public.referrals
  WHERE referrer_email IN (SELECT email FROM ghost_emails)
UNION ALL SELECT 'public.referrals (referred)', COUNT(*) FROM public.referrals
  WHERE referred_email IN (SELECT email FROM ghost_emails)
UNION ALL SELECT 'public.referral_commissions', COUNT(*) FROM public.referral_commissions
  WHERE to_email IN (SELECT email FROM ghost_emails)
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users
  WHERE email IN (SELECT email FROM ghost_emails)
UNION ALL SELECT 'auth.identities', COUNT(*) FROM auth.identities
  WHERE user_id IN (SELECT id FROM ghost_uids)
UNION ALL SELECT 'auth.sessions', COUNT(*) FROM auth.sessions
  WHERE user_id IN (SELECT id FROM ghost_uids)
UNION ALL SELECT 'auth.refresh_tokens', COUNT(*) FROM auth.refresh_tokens
  WHERE user_id IN (SELECT id FROM ghost_uids)
UNION ALL SELECT 'auth.mfa_factors', COUNT(*) FROM auth.mfa_factors
  WHERE user_id IN (SELECT id FROM ghost_uids)
UNION ALL SELECT 'auth.one_time_tokens', COUNT(*) FROM auth.one_time_tokens
  WHERE user_id IN (SELECT id FROM ghost_uids)
ORDER BY tabla;

-- ════════════════════════════════════════════════════════════════════════════
-- >>> Si todos los conteos son 0:  COMMIT;
-- >>> Si algo quedó:               ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════
