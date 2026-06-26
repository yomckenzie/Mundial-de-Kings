-- ============================================================================
-- Betting v2 — nuevas columnas en predictions para marcador exacto
-- ============================================================================
-- Agrega:
--   - pred_score_team1 / pred_score_team2: marcador predecido al cierre del
--     método. Para método=pen, esto es el score pre-penales (siempre empate
--     en input gracias a validación UI).
--   - pred_pen_team1 / pred_pen_team2: score de penales (solo si método=pen).
--   - pre_pen_correct / pen_correct: flags de scoring desglosado.
--   - score_correct: marca global del pick 3 (true si winner correcto + scores OK).
--
-- Las columnas legacy (pred_penalty_team1/2, pred_winner='1'/'X'/'2') se
-- mantienen intactas. La rama v1 sigue evaluándose con evaluateMatchPredictions.
--
-- Aplica desde: 2026-06-27 (partidos a partir del 28 jun)
-- ============================================================================

BEGIN;

-- Marcador exacto (nuevo, v2)
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_score_team1 INT NULL;
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_score_team2 INT NULL;

-- Marcador de penales (nuevo, v2)
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_pen_team1 INT NULL;
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_pen_team2 INT NULL;

-- Flags de scoring desglosado (nuevo, v2)
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pre_pen_correct BOOLEAN NULL;
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pen_correct BOOLEAN NULL;

-- Score pick global (nuevo, v2) — true si winner correcto + scores OK
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS score_correct BOOLEAN NULL;

-- Comentarios
COMMENT ON COLUMN public.predictions.pred_score_team1 IS
  'Marcador exacto predecido para team1 al cierre del método (90min, 120min, o 120min pre-pen).';
COMMENT ON COLUMN public.predictions.pred_score_team2 IS
  'Marcador exacto predecido para team2 al cierre del método.';
COMMENT ON COLUMN public.predictions.pred_pen_team1 IS
  'Score de penales predecido para team1 (solo si pred_method=pen).';
COMMENT ON COLUMN public.predictions.pred_pen_team2 IS
  'Score de penales predecido para team2 (solo si pred_method=pen).';

COMMIT;

-- ============================================================================
-- ROLLBACK (ejecutar manualmente si hace falta):
-- ALTER TABLE public.predictions
--   DROP COLUMN IF EXISTS pred_score_team1,
--   DROP COLUMN IF EXISTS pred_score_team2,
--   DROP COLUMN IF EXISTS pred_pen_team1,
--   DROP COLUMN IF EXISTS pred_pen_team2,
--   DROP COLUMN IF EXISTS pre_pen_correct,
--   DROP COLUMN IF EXISTS pen_correct,
--   DROP COLUMN IF EXISTS score_correct;
-- ============================================================================
