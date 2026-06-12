-- ════════════════════════════════════════════════════════════════════════════
-- Chess King — Borrado COMPLETO de un usuario (sin dejar rastro)
--
-- USO:
--   1. Cambia el correo en la línea  v_email := '...'  (UNA sola línea)
--   2. Pega todo en Supabase Dashboard → SQL Editor → RUN
--
-- QUÉ BORRA (todo lo asociado al correo):
--   • predictions            — sus pronósticos
--   • redemptions            — sus canjes
--   • points_bonuses         — sus bonos de puntos
--   • support_tickets        — sus tickets de soporte
--   • referrals              — como referente Y como referido
--   • referral_commissions   — comisiones que recibió Y que generó
--   • users                  — su registro en la app
--   • auth.users             — su cuenta de login (Supabase Auth)
--                               (sesiones, identidades y refresh tokens se
--                                borran solos en cascada)
--
-- El SQL Editor corre como superusuario: ignora RLS, así que borra de verdad
-- (los scripts con anon key fallaban en silencio por las políticas).
-- ESTA ACCIÓN NO SE PUEDE DESHACER.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_email TEXT := 'correo@ejemplo.com';   -- ◄◄◄ CAMBIA SOLO ESTA LÍNEA
  v_count INT;
  v_total INT := 0;
BEGIN
  RAISE NOTICE '═══ Borrando todo rastro de: % ═══', v_email;

  DELETE FROM predictions WHERE user_email = v_email;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  RAISE NOTICE 'predictions: % fila(s)', v_count;

  DELETE FROM redemptions WHERE user_email = v_email;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  RAISE NOTICE 'redemptions: % fila(s)', v_count;

  DELETE FROM points_bonuses WHERE user_email = v_email;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  RAISE NOTICE 'points_bonuses: % fila(s)', v_count;

  DELETE FROM support_tickets WHERE user_email = v_email;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  RAISE NOTICE 'support_tickets: % fila(s)', v_count;

  DELETE FROM referrals WHERE referrer_email = v_email OR referred_email = v_email;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  RAISE NOTICE 'referrals: % fila(s)', v_count;

  DELETE FROM referral_commissions WHERE to_email = v_email OR from_email = v_email;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  RAISE NOTICE 'referral_commissions: % fila(s)', v_count;

  DELETE FROM users WHERE email = v_email;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  RAISE NOTICE 'users: % fila(s)', v_count;

  -- Cuenta de login (Supabase Auth). Las sesiones activas, identidades y
  -- refresh tokens caen en cascada — la persona queda fuera al instante.
  DELETE FROM auth.users WHERE email = v_email;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  RAISE NOTICE 'auth.users (login): % fila(s)', v_count;

  IF v_total = 0 THEN
    RAISE NOTICE '⚠️  No se encontró nada para % — ¿correo bien escrito?', v_email;
  ELSE
    RAISE NOTICE '✅ Listo: % fila(s) eliminadas en total. Sin rastro.', v_total;
  END IF;
END $$;
