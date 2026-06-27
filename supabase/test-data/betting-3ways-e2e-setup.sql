-- ============================================================================
-- E2E test setup — Betting v2 model (50+50+100 ft/aet, 50+50+50+100 pen)
-- ============================================================================
-- OBJETIVO: Crear 3 partidos de prueba (is_test=true) y pre-cargar
-- pronósticos v2 (con marcador exacto) de un usuario de prueba para validar
-- el scoring v2 en localhost. Estos partidos NO se muestran al público en
-- producción.
--
-- QUÉ HACE ESTE SCRIPT:
--   1. Asegura la columna is_test en matches (idempotente)
--   2. Crea 3 partidos de prueba (Brasil vs Argentina, Francia vs Alemania,
--      México vs España) con horarios FUTUROS para que aparezcan en PRÓXIMOS
--      PARTIDOS en /matches?include_test=1
--   4. Crea un usuario de prueba 'test_user@chessking.com' con 900 puntos
--      iniciales (mismo nivel que los usuarios reales para que el ranking
--      muestre cambios relativos).
--   5. Inserta pronósticos v2 del usuario de prueba para cada partido
--      (pred_winner='1'/'2', pred_score_team1/2, pred_pen_team1/2).
--
-- CÓMO EJECUTAR:
--   - Pegar y correr en Supabase SQL Editor.
--   - Solo afecta partidos marcados is_test=true (no toca partidos reales).
--   - Idempotente: corre de nuevo sin miedo.
--
-- IMPORTANTE: pred_winner usa '1' (Local) o '2' (Visitante) — NO 'team1'/'team2'.
-- El backend deriveWinner() devuelve '1'/'2'/'X' y scoreV2 compara
-- pred.pred_winner === actualWinner, así que 'team1'/'team2' no matchearía.
--
-- RESULTADOS ESPERADOS POR PARTIDO (después de que el admin publique):
--   - Brasil vs Argentina (resultado: gana Local 1-0 / método 90min):
--       Test user apostó Local+90min+(1-0) → 50+50+100 = 200 pts ✅
--   - Francia vs Alemania (resultado: gana Visitante 1-2 / método ET):
--       Test user apostó Visitante+ET+(1-2) → 50+50+100 = 200 pts ✅
--   - México vs España (resultado: empate 1-1 pre-pen / Local gana 4-3 pen):
--       Test user apostó Local+Penales+(1-1)+(4-3) → 50+50+50+100 = 250 pts ✅
--
--   TOTAL: 200 + 200 + 250 = 650 pts sumados al ranking del test user.
-- ============================================================================

BEGIN;

-- 1. Columna is_test (idempotente)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Crear usuario de prueba si no existe (con 900 pts base)
INSERT INTO public.users (id, email, full_name, role, total_points, prediction_points, bonus_points, created_date)
VALUES (
  '00000000-0000-0000-0000-000000000099',
  'test_user@chessking.com',
  'Test User (Local Only)',
  'user',
  900,
  900,
  0,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  total_points = 900,
  prediction_points = 900,
  bonus_points = 0,
  role = 'user';

-- 3. Limpiar partidos de prueba anteriores + sus predicciones (idempotente)
DELETE FROM public.predictions
WHERE match_id IN (
  SELECT id FROM public.matches WHERE is_test = TRUE
);
DELETE FROM public.matches WHERE is_test = TRUE;

-- 4. Insertar 3 partidos de prueba con horarios FUTUROS (mañana, pasado mañana, etc.)
--    Para que aparezcan en PRÓXIMOS PARTIDOS en /matches?include_test=1
INSERT INTO public.matches (id, team1, team2, match_date, match_time, status, group_stage, is_test, created_date, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Brasil',     'Argentina',  CURRENT_DATE + 1, '18:00', 'open',   'Test · Grupo A', TRUE, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', 'Francia',    'Alemania',   CURRENT_DATE + 2, '20:00', 'open',   'Test · Grupo B', TRUE, NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', 'México',     'España',     CURRENT_DATE + 3, '16:00', 'open',   'Test · Grupo C', TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  team1 = EXCLUDED.team1,
  team2 = EXCLUDED.team2,
  match_date = EXCLUDED.match_date,
  match_time = EXCLUDED.match_time,
  status = EXCLUDED.status,
  is_test = EXCLUDED.is_test;

-- 5. Predicciones v2 del test_user (3 picks con marcador exacto)
-- Brasil vs Argentina: Local + 90 min + marcador (1-0)
INSERT INTO public.predictions (
  id, user_email, match_id,
  pred_winner, pred_method,
  pred_score_team1, pred_score_team2,
  pred_pen_team1, pred_pen_team2,
  scored, is_correct, points_earned, created_date
)
VALUES (
  'aaaa1111-aaaa-1111-aaaa-111111111111',
  'test_user@chessking.com',
  '11111111-1111-1111-1111-111111111111',
  '1',          -- Local (Brasil) — usa '1', NO 'team1'
  '90',         -- 90 min
  1,            -- marcador exacto team1
  0,            -- marcador exacto team2
  NULL,         -- sin penales (método=90)
  NULL,
  FALSE, FALSE, 0,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner,
  pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1,
  pred_score_team2 = EXCLUDED.pred_score_team2,
  pred_pen_team1 = EXCLUDED.pred_pen_team1,
  pred_pen_team2 = EXCLUDED.pred_pen_team2,
  scored = FALSE, is_correct = FALSE, points_earned = 0;

-- Francia vs Alemania: Visitante + ET + marcador (1-2)
INSERT INTO public.predictions (
  id, user_email, match_id,
  pred_winner, pred_method,
  pred_score_team1, pred_score_team2,
  pred_pen_team1, pred_pen_team2,
  scored, is_correct, points_earned, created_date
)
VALUES (
  'bbbb2222-bbbb-2222-bbbb-222222222222',
  'test_user@chessking.com',
  '22222222-2222-2222-2222-222222222222',
  '2',          -- Visitante (Alemania) — usa '2', NO 'team2'
  'et',         -- Tiempo extra
  1,            -- marcador exacto team1 (Francia)
  2,            -- marcador exacto team2 (Alemania)
  NULL,         -- sin penales (método=et)
  NULL,
  FALSE, FALSE, 0,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner,
  pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1,
  pred_score_team2 = EXCLUDED.pred_score_team2,
  pred_pen_team1 = EXCLUDED.pred_pen_team1,
  pred_pen_team2 = EXCLUDED.pred_pen_team2,
  scored = FALSE, is_correct = FALSE, points_earned = 0;

-- México vs España: Local + Penales + marcador pre-pen (1-1) + pen (4-3)
-- IMPORTANTE: pred_score_team1/2 va el score PRE-PENALES (siempre empate en pen).
INSERT INTO public.predictions (
  id, user_email, match_id,
  pred_winner, pred_method,
  pred_score_team1, pred_score_team2,
  pred_pen_team1, pred_pen_team2,
  scored, is_correct, points_earned, created_date
)
VALUES (
  'cccc3333-cccc-3333-cccc-333333333333',
  'test_user@chessking.com',
  '33333333-3333-3333-3333-333333333333',
  '1',          -- Local (México) — usa '1', NO 'team1'
  'pen',        -- Penales
  1,            -- marcador pre-pen team1 (siempre empate en pen)
  1,            -- marcador pre-pen team2 (siempre empate en pen)
  4,            -- México gana 4-3 en penales
  3,
  FALSE, FALSE, 0,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner,
  pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1,
  pred_score_team2 = EXCLUDED.pred_score_team2,
  pred_pen_team1 = EXCLUDED.pred_pen_team1,
  pred_pen_team2 = EXCLUDED.pred_pen_team2,
  scored = FALSE, is_correct = FALSE, points_earned = 0;

-- 6. Verificación inmediata: listar partidos de prueba creados con picks v2
SELECT
  m.id, m.team1, m.team2, m.match_date, m.match_time, m.status, m.is_test,
  p.pred_winner, p.pred_method,
  p.pred_score_team1, p.pred_score_team2,
  p.pred_pen_team1, p.pred_pen_team2
FROM public.matches m
LEFT JOIN public.predictions p ON p.match_id = m.id AND p.user_email = 'test_user@chessking.com'
WHERE m.is_test = TRUE
ORDER BY m.match_date, m.match_time;

COMMIT;

-- ============================================================================
-- DESPUÉS DE EJECUTAR ESTE SCRIPT, HACÉ LO SIGUIENTE:
--
--   1. Refrescá localhost: http://localhost:5173/matches?include_test=1
--      → Tenés que ver 3 partidos con el banner ámbar "Modo prueba activo"
--      → Las predicciones YA están pre-cargadas para test_user@chessking.com
--
--   2. Iniciá sesión como admin@chessking.com (vos)
--      → Andá a /admin/matches
--      → Los 3 partidos están al final con etiqueta "Test · Grupo X"
--      → Para cada uno, en el formulario:
--         · Match 1 (Brasil vs Arg): t1=1, t2=0, method=90 → Publicar
--         · Match 2 (Francia vs Ale): t1=1, t2=2, method=et → Publicar
--         · Match 3 (México vs Esp): t1=1, t2=1, method=pen, pen_t1=4, pen_t2=3 → Publicar
--      → Al publicar, evaluateMatchPredictions corre automático (rama v2)
--
--   3. Iniciá sesión como test_user@chessking.com
--      → /matches?include_test=1 → ves 3 partidos en "FINALIZADOS"
--      → /profile → puntos: 900 base + 650 ganados = 1550
--      → /ranking → el test_user tiene que subir de posición
--
--   4. Verificación SQL final (corre esto en SQL Editor):
--      SELECT email, total_points, prediction_points, bonus_points
--      FROM public.users
--      WHERE email = 'test_user@chessking.com';
--      → Esperado: total_points = 1550, prediction_points = 1550
--
--      SELECT id, user_email, match_id,
--             pred_winner, pred_method,
--             pred_score_team1, pred_score_team2,
--             pred_pen_team1, pred_pen_team2,
--             is_correct, points_earned,
--             winner_correct, method_correct,
--             score_correct, pre_pen_correct, pen_correct
--      FROM public.predictions
--      WHERE user_email = 'test_user@chessking.com';
--      → Esperado:
--        · Brasil:     points_earned=200, winner_correct=t, method_correct=t,
--                      score_correct=t, pre_pen_correct=null, pen_correct=null
--        · Francia:    points_earned=200, winner_correct=t, method_correct=t,
--                      score_correct=t, pre_pen_correct=null, pen_correct=null
--        · México:     points_earned=250, winner_correct=t, method_correct=t,
--                      score_correct=t, pre_pen_correct=t, pen_correct=t
--
-- 5. LIMPIEZA (cuando termines la prueba):
--      DELETE FROM public.predictions WHERE user_email = 'test_user@chessking.com';
--      DELETE FROM public.matches WHERE is_test = TRUE;
--      DELETE FROM public.users WHERE email = 'test_user@chessking.com';
-- ============================================================================