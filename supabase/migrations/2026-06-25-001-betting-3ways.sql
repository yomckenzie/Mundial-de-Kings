-- ═══════════════════════════════════════════════════════════════
-- Migración: Nuevo modelo de apuestas 3 componentes
-- Fecha: 2026-06-25
-- Spec: docs/superpowers/specs/2026-06-25-betting-3ways-design.md
--
-- Agrega columnas para:
--   - Ganador (1/X/2) + Método (90/et/pen) + Marcador penales
--   - 3 columnas de scoring por componente (winner_correct, etc.)
--   - result_method y penalty_score_* en matches
--
-- Aplica desde 28 jun 2026 (16avos en adelante).
-- ROLLBACK: ver bloque al final del archivo.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── Tabla predictions ───
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_winner        text    CHECK (pred_winner IN ('1','X','2')),
  ADD COLUMN IF NOT EXISTS pred_method        text    CHECK (pred_method IN ('90','et','pen')),
  ADD COLUMN IF NOT EXISTS pred_penalty_team1 integer CHECK (pred_penalty_team1 IS NULL OR pred_penalty_team1 >= 0),
  ADD COLUMN IF NOT EXISTS pred_penalty_team2 integer CHECK (pred_penalty_team2 IS NULL OR pred_penalty_team2 >= 0),
  ADD COLUMN IF NOT EXISTS winner_correct     boolean,
  ADD COLUMN IF NOT EXISTS method_correct     boolean,
  ADD COLUMN IF NOT EXISTS penalty_correct    boolean;

-- Los penales vienen en par o ninguno
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'predictions_penalty_pair'
  ) THEN
    ALTER TABLE public.predictions
      ADD CONSTRAINT predictions_penalty_pair
      CHECK (
        (pred_penalty_team1 IS NULL AND pred_penalty_team2 IS NULL)
        OR (pred_penalty_team1 IS NOT NULL AND pred_penalty_team2 IS NOT NULL)
      );
  END IF;
END $$;

-- ─── Tabla matches ───
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS result_method        text    CHECK (result_method IN ('90','et','pen')),
  ADD COLUMN IF NOT EXISTS penalty_score_team1  integer CHECK (penalty_score_team1 IS NULL OR penalty_score_team1 >= 0),
  ADD COLUMN IF NOT EXISTS penalty_score_team2  integer CHECK (penalty_score_team2 IS NULL OR penalty_score_team2 >= 0);

-- Si el método del partido es 'pen', los penales deben estar presentes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_penalty_pair'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_penalty_pair
      CHECK (
        result_method IS NULL
        OR result_method <> 'pen'
        OR (penalty_score_team1 IS NOT NULL AND penalty_score_team2 IS NOT NULL)
      );
  END IF;
END $$;

-- Índices para acelerar queries de evaluación y ranking
CREATE INDEX IF NOT EXISTS predictions_match_id_scored_idx
  ON public.predictions (match_id, scored);

CREATE INDEX IF NOT EXISTS predictions_user_email_scored_idx
  ON public.predictions (user_email, scored);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (ejecutar manualmente si hay que revertir):
-- ═══════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE public.predictions
--   DROP CONSTRAINT IF EXISTS predictions_penalty_pair,
--   DROP COLUMN IF EXISTS penalty_correct,
--   DROP COLUMN IF EXISTS method_correct,
--   DROP COLUMN IF EXISTS winner_correct,
--   DROP COLUMN IF EXISTS pred_penalty_team2,
--   DROP COLUMN IF EXISTS pred_penalty_team1,
--   DROP COLUMN IF EXISTS pred_method,
--   DROP COLUMN IF EXISTS pred_winner;
-- ALTER TABLE public.matches
--   DROP CONSTRAINT IF EXISTS matches_penalty_pair,
--   DROP COLUMN IF EXISTS penalty_score_team2,
--   DROP COLUMN IF EXISTS penalty_score_team1,
--   DROP COLUMN IF EXISTS result_method;
-- DROP INDEX IF EXISTS predictions_match_id_scored_idx;
-- DROP INDEX IF EXISTS predictions_user_email_scored_idx;
-- COMMIT;