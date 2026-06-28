-- ============================================================================
-- Migración: trigger v2 para predictions (root fix bug #84)
-- ============================================================================
-- CONTEXTO:
--   El trigger BEFORE UPDATE/INSERT ON public.predictions tenía lógica v1
--   (solo winner_correct + penalty_correct). Después del modelo v2 (3 picks),
--   cualquier UPDATE sobre predicciones recalculaba points_earned con la
--   fórmula vieja, pisando score_correct y points_earned correctos del JS.
--
-- FIX:
--   1. Reemplazar la función del trigger con lógica v2 (50 winner + 50 method
--      + 100 score, score comparando categorías 90/ET vs Pen).
--   2. Recrear el trigger apuntando a la nueva función.
--   3. Forzar re-evaluación de TODAS las predicciones existentes (UPDATE que
--      dispara el trigger y recalcula winner/method/score/points).
--
-- Aplica desde: 2026-06-27 (post-correcciones v2)
-- ============================================================================

BEGIN;

-- 1. Nueva función v2 — replica la lógica de evaluateMatchPredictions.js scoreV2
CREATE OR REPLACE FUNCTION public.recalc_v2_points() RETURNS trigger AS $$
DECLARE
  v_result_method      TEXT;
  v_result_team1       INT;
  v_result_team2       INT;
  v_pen_t1             INT;
  v_pen_t2             INT;
  v_actual_winner      TEXT;
  v_winner_correct     BOOLEAN;
  v_method_correct     BOOLEAN;
  v_score_correct      BOOLEAN;
  v_total_t1           INT;
  v_total_t2           INT;
  v_points             INT;
BEGIN
  -- Cargar resultado del partido (puede no existir si la pred es huérfana)
  SELECT m.result_method, m.result_team1, m.result_team2,
         m.penalty_score_team1, m.penalty_score_team2
    INTO v_result_method, v_result_team1, v_result_team2, v_pen_t1, v_pen_t2
  FROM public.matches m
  WHERE m.id = NEW.match_id;

  -- Partido sin resultado publicado → no evaluable. Mantener score_correct
  -- como viene (si el JS ya lo había evaluado antes) y NO sobrescribir.
  IF v_result_method IS NULL OR v_result_team1 IS NULL OR v_result_team2 IS NULL THEN
    -- Solo nos importa no romper predicciones sin resultado. Dejamos los
    -- valores que NEW trae (incluyendo points_earned calculado por el JS).
    RETURN NEW;
  END IF;

  -- Predicción LEGACY v1 (sin pred_score_team1/2): NO aplicar reglas v2.
  -- v1 incluye componente penalty_correct (+50 pts) que v2 no tiene. Si
  -- sobrescribimos, perderíamos esos 50 pts. Mismo guard que el JS
  -- hace con isV2Prediction() en evaluateMatchPredictions.
  IF NEW.pred_score_team1 IS NULL AND NEW.pred_score_team2 IS NULL THEN
    -- Predicción legacy v1: dejar tal cual (el JS o el flujo legacy la evaluó).
    RETURN NEW;
  END IF;

  -- Derivar ganador real (post-pens si los hubo)
  IF v_result_team1 > v_result_team2 THEN
    v_actual_winner := '1';
  ELSIF v_result_team1 < v_result_team2 THEN
    v_actual_winner := '2';
  ELSIF v_result_method = 'pen' AND v_pen_t1 IS NOT NULL AND v_pen_t2 IS NOT NULL THEN
    IF v_pen_t1 > v_pen_t2 THEN
      v_actual_winner := '1';
    ELSIF v_pen_t1 < v_pen_t2 THEN
      v_actual_winner := '2';
    ELSE
      v_actual_winner := 'X';
    END IF;
  ELSE
    v_actual_winner := 'X';
  END IF;

  -- Winner correct
  v_winner_correct := NEW.pred_winner IS NOT NULL AND NEW.pred_winner = v_actual_winner;

  -- Method correct
  v_method_correct := NEW.pred_method IS NOT NULL AND NEW.pred_method = v_result_method;

  -- Score correct — MISMA regla que evaluateMatchPredictions.js scoreV2:
  -- 90/ET comparten "score exacto"; pen es "score total". Categorías distintas
  -- → score queda null (no comparable).
  v_score_correct := NULL;
  IF (v_result_method = '90' OR v_result_method = 'et')
     AND (NEW.pred_method = '90' OR NEW.pred_method = 'et') THEN
    v_score_correct := NEW.pred_score_team1 = v_result_team1
                   AND NEW.pred_score_team2 = v_result_team2;
  ELSIF v_result_method = 'pen' AND NEW.pred_method = 'pen' THEN
    v_total_t1 := v_result_team1 + COALESCE(v_pen_t1, 0);
    v_total_t2 := v_result_team2 + COALESCE(v_pen_t2, 0);
    v_score_correct := NEW.pred_score_team1 = v_total_t1
                   AND NEW.pred_score_team2 = v_total_t2;
  END IF;

  -- Aplicar v2 al NEW
  NEW.winner_correct  := v_winner_correct;
  NEW.method_correct  := v_method_correct;
  NEW.score_correct   := v_score_correct;
  NEW.pre_pen_correct := NULL;
  NEW.pen_correct     := NULL;

  -- Puntos: ganador es GATE (bug v2-gate-28jun). Si winner mal → 0 pts
  -- total (método y marcador no suman aunque coincidan por casualidad).
  -- Si winner correcto → método (+50) y marcador (+100) suman independiente.
  v_points := 0;
  IF v_winner_correct THEN
    v_points := v_points + 50;
    IF v_method_correct THEN v_points := v_points + 50; END IF;
    IF v_score_correct  THEN v_points := v_points + 100; END IF;
  END IF;

  NEW.points_earned := v_points;
  NEW.is_correct    := v_points > 0;
  NEW.scored        := TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Recrear trigger apuntando a la nueva función
DROP TRIGGER IF EXISTS predictions_recalc_v2 ON public.predictions;
CREATE TRIGGER predictions_recalc_v2
  BEFORE INSERT OR UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.recalc_v2_points();

-- 3. Forzar re-evaluación de TODAS las predicciones existentes.
--    Un UPDATE vacío dispara el trigger para cada fila, que recalcula
--    winner/method/score/points con la lógica v2.
UPDATE public.predictions
SET updated_at = NOW()
WHERE TRUE;

-- 4. Verificación: top 10 predicciones re-evaluadas
SELECT
  p.user_email,
  m.team1 || ' ' || COALESCE(m.result_team1::text, '?') || '-' || COALESCE(m.result_team2::text, '?') || ' ' || m.team2 AS resultado,
  m.result_method AS método,
  p.pred_winner AS "pred W",
  p.pred_method AS "pred M",
  p.pred_score_team1 || '-' || p.pred_score_team2 AS "pred score",
  CASE WHEN p.winner_correct THEN '✅' ELSE '❌' END AS w,
  CASE WHEN p.method_correct THEN '✅' ELSE '❌' END AS m,
  CASE WHEN p.score_correct IS NULL THEN '⏸ null'
       WHEN p.score_correct THEN '✅' ELSE '❌' END AS s,
  p.points_earned AS pts
FROM public.predictions p
JOIN public.matches m ON m.id = p.match_id
WHERE m.result_team1 IS NOT NULL  -- solo partidos con resultado publicado
ORDER BY p.points_earned DESC
LIMIT 20;

COMMIT;

-- ============================================================================
-- ROLLBACK (ejecutar manualmente si hace falta):
-- DROP TRIGGER IF EXISTS predictions_recalc_v2 ON public.predictions;
-- DROP FUNCTION IF EXISTS public.recalc_v2_points();
-- ============================================================================