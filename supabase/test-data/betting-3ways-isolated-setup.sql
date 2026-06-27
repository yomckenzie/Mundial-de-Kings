-- ============================================================================
-- E2E test setup AISLADO — partidos de prueba que NO se ven en /matches
-- ============================================================================
-- OBJETIVO: 3 partidos de prueba con fechas en 2020 (muy pasadas) para que:
--   · NO aparezcan como "próximos partidos" en /matches
--   · NO se incluyan en la semana actual del ranking
--   · SÍ aparezcan en /admin/matches (para que vos publiques resultados)
--   · SÍ aparezcan en /profile del test_user (para que veas sus puntos)
--
-- QUÉ HACE ESTE SCRIPT:
--   1. Borra partidos de prueba existentes + predicciones (limpieza previa)
--   2. Crea test_user@chessking.com con 900 pts base (idempotente)
--   3. Crea 3 partidos con match_date='2020-01-01' (lejos de producción)
--   4. Pre-carga predicciones v2 del test_user
--
-- ⚠️ SIN ARREGLOS DE CÓDIGO: /profile y /ranking siguen mostrando TODOS los
-- partidos. La única forma SQL de "ocultar" es BORRAR al terminar.
-- Cuando termines la prueba, corré la sección LIMPIEZA de abajo.
--
-- IDÉMPOTENTE: correr de nuevo no rompe nada — limpia y recrea.
-- ============================================================================

BEGIN;

-- 1. Limpieza previa (idempotente)
DELETE FROM public.predictions
WHERE match_id IN (SELECT id FROM public.matches WHERE is_test = TRUE);
DELETE FROM public.matches WHERE is_test = TRUE;

-- 2. Usuario de prueba (idempotente, resetea puntos a 900 base)
INSERT INTO public.users (id, email, full_name, role, total_points, prediction_points, bonus_points, created_date)
VALUES (
  '00000000-0000-0000-0000-000000000099',
  'test_user@chessking.com',
  'Test User (Local Only)',
  'user',
  900, 900, 0,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  total_points = 900, prediction_points = 900, bonus_points = 0, role = 'user';

-- 3. Partidos de prueba con match_date='2020-01-01' (lejos del activation_date)
--    → No aparecen en próximos, no en semana actual, no inflan ranking activo
--    → Sí aparecen en /admin/matches (con etiqueta "Test · Grupo X")
--    → Sí aparecen en /profile del test_user (porque pre-cargamos sus preds)
INSERT INTO public.matches (
  id, team1, team2, match_date, match_time, status, group_stage,
  is_test, created_date, updated_at
)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Brasil',  'Argentina', '2020-01-01', '18:00', 'finished', 'Test · Grupo A', TRUE, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', 'Francia', 'Alemania',  '2020-01-01', '20:00', 'finished', 'Test · Grupo B', TRUE, NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', 'México',  'España',    '2020-01-01', '16:00', 'finished', 'Test · Grupo C', TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  team1 = EXCLUDED.team1, team2 = EXCLUDED.team2,
  match_date = EXCLUDED.match_date, match_time = EXCLUDED.match_time,
  status = EXCLUDED.status, is_test = EXCLUDED.is_test,
  group_stage = EXCLUDED.group_stage;

-- 4. Pre-cargar marcador resultado (publicado por admin) — el partido ya está
--    en status='finished' pero SIN marcador todavía. Marcador abajo en preds.
--    Después en /admin/matches, vos publicás t1/t2/method/pen para cada uno.
--
-- 5. Predicciones v2 del test_user
-- Brasil: Local + 90 min + marcador (1-0)
INSERT INTO public.predictions (
  id, user_email, match_id, pred_winner, pred_method,
  pred_score_team1, pred_score_team2, pred_pen_team1, pred_pen_team2,
  scored, is_correct, points_earned, created_date
) VALUES (
  'aaaa1111-aaaa-1111-aaaa-111111111111', 'test_user@chessking.com',
  '11111111-1111-1111-1111-111111111111',
  '1', '90', 1, 0, NULL, NULL,
  FALSE, FALSE, 0, NOW()
)
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner, pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1, pred_score_team2 = EXCLUDED.pred_score_team2,
  pred_pen_team1 = EXCLUDED.pred_pen_team1, pred_pen_team2 = EXCLUDED.pred_pen_team2,
  scored = FALSE, is_correct = FALSE, points_earned = 0;

-- Francia: Visitante + ET + marcador (1-2)
INSERT INTO public.predictions (
  id, user_email, match_id, pred_winner, pred_method,
  pred_score_team1, pred_score_team2, pred_pen_team1, pred_pen_team2,
  scored, is_correct, points_earned, created_date
) VALUES (
  'bbbb2222-bbbb-2222-bbbb-222222222222', 'test_user@chessking.com',
  '22222222-2222-2222-2222-222222222222',
  '2', 'et', 1, 2, NULL, NULL,
  FALSE, FALSE, 0, NOW()
)
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner, pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1, pred_score_team2 = EXCLUDED.pred_score_team2,
  pred_pen_team1 = EXCLUDED.pred_pen_team1, pred_pen_team2 = EXCLUDED.pred_pen_team2,
  scored = FALSE, is_correct = FALSE, points_earned = 0;

-- México: Local + Pen + pre-pen (1-1) + pen (4-3)
INSERT INTO public.predictions (
  id, user_email, match_id, pred_winner, pred_method,
  pred_score_team1, pred_score_team2, pred_pen_team1, pred_pen_team2,
  scored, is_correct, points_earned, created_date
) VALUES (
  'cccc3333-cccc-3333-cccc-333333333333', 'test_user@chessking.com',
  '33333333-3333-3333-3333-333333333333',
  '1', 'pen', 1, 1, 4, 3,
  FALSE, FALSE, 0, NOW()
)
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner, pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1, pred_score_team2 = EXCLUDED.pred_score_team2,
  pred_pen_team1 = EXCLUDED.pred_pen_team1, pred_pen_team2 = EXCLUDED.pred_pen_team2,
  scored = FALSE, is_correct = FALSE, points_earned = 0;

-- 6. Verificación: ver partidos + predicciones creados
SELECT
  m.id, m.team1, m.team2, m.match_date, m.status, m.is_test,
  p.pred_winner, p.pred_method,
  p.pred_score_team1, p.pred_score_team2
FROM public.matches m
LEFT JOIN public.predictions p ON p.match_id = m.id AND p.user_email = 'test_user@chessking.com'
WHERE m.is_test = TRUE
ORDER BY m.match_date;

COMMIT;

-- ============================================================================
-- FLUJO DESPUÉS DE EJECUTAR ESTE SCRIPT:
--
--   1. Login como admin@chessking.com → /admin/matches
--      → Vas a ver los 3 partidos al final (Test · Grupo A/B/C)
--      → Para cada uno, publicá:
--         · Brasil vs Arg:   t1=1, t2=0, method=90
--         · Francia vs Ale:  t1=1, t2=2, method=et
--         · México vs Esp:   t1=1, t2=1, method=pen, pen_t1=4, pen_t2=3
--      → Al publicar, evaluateMatchPredictions corre automático (rama v2)
--
--   2. Login como test_user@chessking.com → /profile
--      → Puntos esperados: 900 + 200 + 200 + 250 = 1550
--      → Los partidos de prueba SÍ se ven acá (porque /profile no filtra
--        is_test — sin cambios de código, esto es inevitable)
--
--   3. Cuando termines la prueba, CORRER LIMPIEZA (abajo) ← OBLIGATORIO
-- ============================================================================


-- ============================================================================
-- LIMPIEZA — correr cuando termines la prueba para borrar TODO lo de test
-- ============================================================================
-- BEGIN;
-- DELETE FROM public.predictions WHERE user_email = 'test_user@chessking.com';
-- DELETE FROM public.predictions WHERE match_id IN (SELECT id FROM public.matches WHERE is_test = TRUE);
-- DELETE FROM public.matches WHERE is_test = TRUE;
-- DELETE FROM public.users WHERE email = 'test_user@chessking.com';
-- COMMIT;
-- ============================================================================