-- ============================================================================
-- E2E Coverage: 8 escenarios v2 para yobanyricardo@gmail.com
-- ============================================================================
-- OBJETIVO: Bypassear el admin UI y validar todo el flujo v2 desde SQL.
-- Cada partido ya viene con resultado publicado (status='finished',
-- result_team1/2, result_method, penalty_score_*). Cada predicción ya
-- viene evaluada (winner_correct, method_correct, score_correct, points_earned).
--
-- QUÉ CUBRE (8 escenarios):
--   1. All correct (90 min)        → 200 pts
--   2. All correct (pen)            → 200 pts
--   3. Winner+method (score wrong 90) → 100 pts
--   4. Method+score (winner wrong 90) → 150 pts  ← REGLA NUEVA: picks independientes
--   5. Only winner (method wrong)   → 50 pts
--   6. All wrong (90)               → 0 pts
--   7. Winner+method+score wrong (pen mismatch) → 50 pts (score null)
--   8. All correct con X (pen)      → 200 pts
--
-- NOTA SOBRE EL TRIGGER v1 (bug #84):
--   El trigger BEFORE UPDATE usa lógica v1 y podría pisar nuestros valores
--   si el admin hace UPDATE sobre estas filas. Para esta prueba NO hay UPDATE
--   del admin (resultados pre-cargados), así que el trigger no se dispara.
--   Si más adelante aplicás la migración v2 del trigger, este SQL sigue válido.
-- ============================================================================

BEGIN;

-- 1. Limpieza previa (idempotente)
DELETE FROM public.predictions
WHERE match_id IN (SELECT id FROM public.matches WHERE is_test = TRUE);
DELETE FROM public.matches WHERE is_test = TRUE;

-- 2. Asegurar yobanyricardo existe (NO crear fila nueva si ya existe —
--    respetamos su UUID real. Solo actualizamos puntos al final con un
--    UPDATE separado después del INSERT de predicciones).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE email = 'yobanyricardo@gmail.com'
  ) THEN
    INSERT INTO public.users (email, full_name, role, total_points, prediction_points, bonus_points)
    VALUES ('yobanyricardo@gmail.com', 'Yobany Ricardo', 'user', 0, 0, 0);
  END IF;
END $$;

-- 3. Crear los 8 partidos de prueba con resultados pre-cargados
--    Fechas futuras (CURRENT_DATE + N) para que aparezcan en "próximos" del
--    SQL Editor — pero el status='finished' los pone en "finalizados" en UI.
INSERT INTO public.matches (
  id, team1, team2, match_date, match_time, status, group_stage,
  result_team1, result_team2, result_method, penalty_score_team1, penalty_score_team2,
  is_test, created_date, updated_at
)
VALUES
  -- 1. Dragones 1-0 Galácticos / 90 (todo correcto)
  ('e2e-0001-0001-0001-0001-000000000001', 'Dragones',   'Galácticos', CURRENT_DATE + 10, '18:00', 'finished', 'Test · E2E #1',
    1, 0, '90',  NULL, NULL, TRUE, NOW(), NOW()),

  -- 2. Titanes 1-1 (4-3 pen) Fénix / pen (todo correcto, total = 5-4)
  ('e2e-0002-0002-0002-0002-000000000002', 'Titanes',    'Fénix',      CURRENT_DATE + 11, '20:00', 'finished', 'Test · E2E #2',
    1, 1, 'pen', 4, 3, TRUE, NOW(), NOW()),

  -- 3. Centinelas 3-0 Valkirias / 90 (winner+method, score mal)
  ('e2e-0003-0003-0003-0003-000000000003', 'Centinelas', 'Valkirias',  CURRENT_DATE + 12, '18:00', 'finished', 'Test · E2E #3',
    3, 0, '90',  NULL, NULL, TRUE, NOW(), NOW()),

  -- 4. Dragones 2-1 Titanes / 90 (picks independientes: winner mal, method+score bien)
  ('e2e-0004-0004-0004-0004-000000000004', 'Dragones',   'Titanes',    CURRENT_DATE + 13, '20:00', 'finished', 'Test · E2E #4',
    2, 1, '90',  NULL, NULL, TRUE, NOW(), NOW()),

  -- 5. Galácticos 2-3 Espectros / 90 (solo winner: predijiste pen pero fue 90)
  ('e2e-0005-0005-0005-0005-000000000005', 'Galácticos', 'Espectros',  CURRENT_DATE + 14, '18:00', 'finished', 'Test · E2E #5',
    2, 3, '90',  NULL, NULL, TRUE, NOW(), NOW()),

  -- 6. Fénix 1-0 Centinelas / 90 (todo mal)
  ('e2e-0006-0006-0006-0006-000000000006', 'Fénix',      'Centinelas', CURRENT_DATE + 15, '20:00', 'finished', 'Test · E2E #6',
    1, 0, '90',  NULL, NULL, TRUE, NOW(), NOW()),

  -- 7. Dragones 2-0 Titanes / 90 (winner bien, método mal → score null)
  ('e2e-0007-0007-0007-0007-000000000007', 'Dragones',   'Titanes',    CURRENT_DATE + 16, '18:00', 'finished', 'Test · E2E #7',
    2, 0, '90',  NULL, NULL, TRUE, NOW(), NOW()),

  -- 8. Fénix 2-2 (3-4 pen) Titanes / pen (todo correcto, total = 5-6)
  ('e2e-0008-0008-0008-0008-000000000008', 'Fénix',      'Titanes',    CURRENT_DATE + 17, '20:00', 'finished', 'Test · E2E #8',
    2, 2, 'pen', 3, 4, TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  result_team1 = EXCLUDED.result_team1,
  result_team2 = EXCLUDED.result_team2,
  result_method = EXCLUDED.result_method,
  penalty_score_team1 = EXCLUDED.penalty_score_team1,
  penalty_score_team2 = EXCLUDED.penalty_score_team2,
  status = EXCLUDED.status,
  is_test = EXCLUDED.is_test,
  group_stage = EXCLUDED.group_stage;

-- 4. Predicciones pre-evaluadas para yobanyricardo
--    Regla v2: 50 winner + 50 method + 100 score = 200 max
--    Score null si pred_method != result_method (no son comparables)
INSERT INTO public.predictions (
  id, user_email, match_id,
  pred_winner, pred_method,
  pred_score_team1, pred_score_team2, pred_pen_team1, pred_pen_team2,
  winner_correct, method_correct, score_correct, pre_pen_correct, pen_correct,
  penalty_correct, points_earned, scored, is_correct, created_date
)
VALUES
  -- 1. Dragones 1-0 Galácticos / 90 → pred 1, 90, 1-0 → ALL CORRECT → 200 pts
  ('e2e-pred-0001-0001-0001-0001-000001',
   'yobanyricardo@gmail.com', 'e2e-0001-0001-0001-0001-000000000001',
   '1', '90', 1, 0, NULL, NULL,
   TRUE, TRUE, TRUE, NULL, NULL, NULL,
   200, TRUE, TRUE, NOW()),

  -- 2. Titanes 1-1 (4-3 pen) Fénix → pred 1, pen, 5-4 (total) → ALL CORRECT → 200 pts
  ('e2e-pred-0002-0002-0002-0002-000002',
   'yobanyricardo@gmail.com', 'e2e-0002-0002-0002-0002-000000000002',
   '1', 'pen', 5, 4, NULL, NULL,
   TRUE, TRUE, TRUE, NULL, NULL, NULL,
   200, TRUE, TRUE, NOW()),

  -- 3. Centinelas 3-0 Valkirias → pred 1, 90, 0-0 → winner+method, score mal → 100 pts
  ('e2e-pred-0003-0003-0003-0003-000003',
   'yobanyricardo@gmail.com', 'e2e-0003-0003-0003-0003-000000000003',
   '1', '90', 0, 0, NULL, NULL,
   TRUE, TRUE, FALSE, NULL, NULL, NULL,
   100, TRUE, TRUE, NOW()),

  -- 4. Dragones 2-1 Titanes → pred 2 (mal), 90, 2-1 (bien) → method+score = 150 pts
  ('e2e-pred-0004-0004-0004-0004-000004',
   'yobanyricardo@gmail.com', 'e2e-0004-0004-0004-0004-000000000004',
   '2', '90', 2, 1, NULL, NULL,
   FALSE, TRUE, TRUE, NULL, NULL, NULL,
   150, TRUE, TRUE, NOW()),

  -- 5. Galácticos 2-3 Espectros → pred 2, pen (mal método) → solo winner = 50 pts
  ('e2e-pred-0005-0005-0005-0005-000005',
   'yobanyricardo@gmail.com', 'e2e-0005-0005-0005-0005-000000000005',
   '2', 'pen', 3, 2, NULL, NULL,
   TRUE, FALSE, NULL, NULL, NULL, NULL,
   50, TRUE, TRUE, NOW()),

  -- 6. Fénix 1-0 Centinelas → pred 2, 90, 9-9 (todo mal) → 0 pts
  ('e2e-pred-0006-0006-0006-0006-000006',
   'yobanyricardo@gmail.com', 'e2e-0006-0006-0006-0006-000000000006',
   '2', '90', 9, 9, NULL, NULL,
   FALSE, FALSE, FALSE, NULL, NULL, NULL,
   0, TRUE, FALSE, NOW()),

  -- 7. Dragones 2-0 Titanes → pred 1 (bien), pen (mal método) → score null, solo winner = 50 pts
  ('e2e-pred-0007-0007-0007-0007-000007',
   'yobanyricardo@gmail.com', 'e2e-0007-0007-0007-0007-000000000007',
   '1', 'pen', 2, 0, NULL, NULL,
   TRUE, FALSE, NULL, NULL, NULL, NULL,
   50, TRUE, TRUE, NOW()),

  -- 8. Fénix 2-2 (3-4 pen) Titanes → pred X, pen, 5-6 (total) → ALL CORRECT (X gana por pen) → 200 pts
  ('e2e-pred-0008-0008-0008-0008-000008',
   'yobanyricardo@gmail.com', 'e2e-0008-0008-0008-0008-000000000008',
   'X', 'pen', 5, 6, NULL, NULL,
   TRUE, TRUE, TRUE, NULL, NULL, NULL,
   200, TRUE, TRUE, NOW())
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner,
  pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1,
  pred_score_team2 = EXCLUDED.pred_score_team2,
  winner_correct = EXCLUDED.winner_correct,
  method_correct = EXCLUDED.method_correct,
  score_correct = EXCLUDED.score_correct,
  points_earned = EXCLUDED.points_earned,
  scored = EXCLUDED.scored,
  is_correct = EXCLUDED.is_correct;

-- 5. Verificación: tabla con todo lo que tenés que ver
SELECT
  m.id AS match_id,
  m.team1 || ' ' || COALESCE(m.result_team1::text, '?') || '-' || COALESCE(m.result_team2::text, '?') || ' ' || m.team2 AS resultado,
  m.result_method AS método,
  COALESCE(m.penalty_score_team1::text || '-' || m.penalty_score_team2::text, '-') AS pen,
  p.pred_winner AS "pred winner",
  p.pred_method AS "pred método",
  COALESCE(p.pred_score_team1::text || '-' || p.pred_score_team2::text, '-') AS "pred score",
  CASE WHEN p.winner_correct THEN '✅' ELSE '❌' END AS w,
  CASE WHEN p.method_correct THEN '✅' ELSE '❌' END AS m,
  CASE WHEN p.score_correct IS NULL THEN '⏸ null'
       WHEN p.score_correct THEN '✅' ELSE '❌' END AS s,
  p.points_earned AS pts
FROM public.matches m
LEFT JOIN public.predictions p
  ON p.match_id = m.id AND p.user_email = 'yobanyricardo@gmail.com'
WHERE m.is_test = TRUE
ORDER BY m.match_date;

COMMIT;

-- 5. Sumar los 750 pts a yobanyricardo (sin esto, /profile muestra 0).
--    En flujo normal, evaluateMatchPredictions hace este UPDATE. Acá lo
--    hacemos manual porque estamos bypassing el JS.
DO $$
DECLARE
  total_pts INT;
BEGIN
  SELECT COALESCE(SUM(points_earned), 0) INTO total_pts
  FROM public.predictions
  WHERE user_email = 'yobanyricardo@gmail.com'
    AND is_correct = TRUE
    AND scored = TRUE;

  UPDATE public.users
  SET total_points = total_pts,
      prediction_points = total_pts
  WHERE email = 'yobanyricardo@gmail.com';
END $$;

-- ============================================================================
-- DESPUÉS DE CORRER:
--
--   1. Refrescá http://localhost:5173/matches?include_test=1
--      → 8 partidos finalizados con nombres fantasía (Dragones, Galácticos, etc.)
--      → Click en cada uno y verificá que el desglose coincida con la tabla:
--
--      | # | Esperado en UI                          | pts |
--      |---|-----------------------------------------|-----|
--      | 1 | Ganador ✅ Cómo gana ✅ Marcador ✅     | 200 |
--      | 2 | Ganador ✅ Cómo gana ✅ Marcador ✅     | 200 |
--      | 3 | Ganador ✅ Cómo gana ✅ Marcador ❌     | 100 |
--      | 4 | Ganador ❌ Cómo gana ✅ Marcador ✅     | 150 |
--      | 5 | Ganador ✅ Cómo gana ❌ Marcador ⏸     | 50  |
--      | 6 | Ganador ❌ Cómo gana ❌ Marcador ❌     | 0   |
--      | 7 | Ganador ✅ Cómo gana ❌ Marcador ⏸     | 50  |
--      | 8 | Ganador ✅ Cómo gana ✅ Marcador ✅     | 200 |
--
--   2. Como yobanyricardo: /profile → total puntos sumados = 750
--      (200+200+100+150+50+0+50+200 = 750)
--
--   3. Como admin@chessking.com: /admin/matches → ves los 8 partidos
--      finalizados (status='finished') con resultados pre-cargados
--
--   4. LIMPIEZA cuando termines:
--      DELETE FROM public.predictions WHERE user_email = 'yobanyricardo@gmail.com';
--      DELETE FROM public.matches WHERE is_test = TRUE;
--      UPDATE public.users SET total_points = 0, prediction_points = 0
--        WHERE email = 'yobanyricardo@gmail.com';
-- ============================================================================