import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

const POINTS_WINNER = 50;
const POINTS_METHOD = 50;
const POINTS_SCORE_FT_AET = 100;  // método 90 min o tiempo extra
const POINTS_PRE_PEN = 50;        // marcador pre-penales (solo si método=pen)
const POINTS_PEN = 100;           // marcador de penales (solo si método=pen)
const POINTS_PENALTY_LEGACY = 50; // v1: penal score

// Deriva el ganador del resultado final.
// Si hay penales y el resultado agregado (90+ET) es empate,
// el ganador lo define el score de penales (penaltyScoreT1 vs penaltyScoreT2).
function deriveWinner(team1, team2, resultMethod = null, penaltyT1 = null, penaltyT2 = null) {
  if (team1 == null || team2 == null) return null;
  if (team1 > team2) return '1';
  if (team1 < team2) return '2';
  // Empate en 90+ET. Si fue a penales, gana quien hizo más goles desde los 11m.
  if (resultMethod === 'pen' && penaltyT1 != null && penaltyT2 != null) {
    if (penaltyT1 > penaltyT2) return '1';
    if (penaltyT1 < penaltyT2) return '2';
  }
  return 'X';
}

/**
 * Detecta si una predicción usa el modelo v2 (con marcador exacto).
 * v2: tiene `pred_score_team1` o `pred_score_team2` populated.
 * v1 legacy: solo `pred_penalty_team1`/`pred_penalty_team2` populated.
 */
export function isV2Prediction(pred) {
  return pred.pred_score_team1 != null || pred.pred_score_team2 != null;
}

/**
 * Score puro v2 — recibe pred y resultado, devuelve flags + puntos.
 * Esta función es pura (sin I/O) para que sea fácil testearla directamente.
 *
 * @param {object} pred - { pred_winner, pred_method, pred_score_team1/2, pred_pen_team1/2 }
 * @param {object} result - { team1, team2, method, penaltyT1, penaltyT2 }
 *   method: '90' | 'et' | 'pen'
 *   penaltyT1/T2: solo si method='pen'
 * @returns {{ winnerCorrect, methodCorrect, scoreCorrect, prePenCorrect, penCorrect, points }}
 */
export function scoreV2(pred, result) {
  const { team1, team2, method, penaltyT1, penaltyT2 } = result;

  // Ganador real (post-pens si los hubo). Reutiliza deriveWinner existente.
  const actualWinner = deriveWinner(team1, team2, method, penaltyT1, penaltyT2);
  const winnerCorrect = actualWinner != null && pred.pred_winner === actualWinner;

  // Método correcto
  const methodCorrect = pred.pred_method === method;

  // Score pick — REQUIERE winner correcto
  let scoreCorrect = null;
  let prePenCorrect = null;
  let penCorrect = null;

  // Score pick — REQUIERE winner correcto Y method correcto.
  // Si el método predicho no coincide con el real, los score fields del pred
  // no son comparables (distinta interpretación: 90min vs pre-pen).
  if (winnerCorrect && methodCorrect && (method === '90' || method === 'et')) {
    scoreCorrect = pred.pred_score_team1 === team1 && pred.pred_score_team2 === team2;
  } else if (winnerCorrect && methodCorrect && method === 'pen') {
    prePenCorrect = pred.pred_score_team1 === team1 && pred.pred_score_team2 === team2;
    penCorrect = pred.pred_pen_team1 === penaltyT1 && pred.pred_pen_team2 === penaltyT2;
    scoreCorrect = prePenCorrect && penCorrect;
  }

  // Puntos
  let points = 0;
  if (winnerCorrect) points += POINTS_WINNER;
  if (methodCorrect) points += POINTS_METHOD;

  if (method === '90' || method === 'et') {
    if (scoreCorrect) points += POINTS_SCORE_FT_AET;
  } else if (method === 'pen') {
    if (prePenCorrect) points += POINTS_PRE_PEN;
    if (penCorrect) points += POINTS_PEN;
  }

  return { winnerCorrect, methodCorrect, scoreCorrect, prePenCorrect, penCorrect, points };
}

/**
 * Evalúa todos los pronósticos de un partido contra el resultado real.
 *
 * 3 componentes independientes:
 *   - Ganador correcto (1/X/2): +50 pts
 *   - Método correcto ('90'/'et'/'pen'): +50 pts
 *   - Penal exacto (solo si pred_method='pen' y result_method='pen'): +50 pts
 *
 * IDEMPOTENTE: recalcula desde cero. Apto para llamar N veces.
 *
 * @param {string} matchId
 * @param {number} resultTeam1
 * @param {number} resultTeam2
 * @param {'90'|'et'|'pen'|null} resultMethod
 * @param {number|null} penaltyScoreT1  — penales del team1 si resultMethod='pen'
 * @param {number|null} penaltyScoreT2
 * @returns {{ evaluated: number, correct: number }}
 */
export async function evaluateMatchPredictions(
  matchId,
  resultTeam1,
  resultTeam2,
  resultMethod = null,
  penaltyScoreT1 = null,
  penaltyScoreT2 = null,
) {
  if (!supabase) {
    console.warn('[evaluateMatchPredictions] Supabase no disponible');
    return { evaluated: 0, correct: 0 };
  }

  // 1. Cargar pronósticos del partido
  const { data: allPredictions, error: predErr } = await supabase
    .from('predictions')
    .select('id, user_email, pred_winner, pred_method, pred_penalty_team1, pred_penalty_team2, pred_score_team1, pred_score_team2, pred_pen_team1, pred_pen_team2')
    .eq('match_id', matchId);

  if (predErr) {
    console.error('[evaluateMatchPredictions] Error cargando predictions:', predErr);
    return { evaluated: 0, correct: 0 };
  }
  if (!allPredictions || allPredictions.length === 0) {
    return { evaluated: 0, correct: 0 };
  }

  // 2. Excluir admins
  const { data: adminRows } = await supabase
    .from('users')
    .select('email')
    .eq('role', 'admin');
  const adminEmails = new Set((adminRows || []).map(u => u.email));
  const predictions = allPredictions.filter(p => !adminEmails.has(p.user_email));
  if (predictions.length === 0) return { evaluated: 0, correct: 0 };

  // 3. Puntuar — branch v1 vs v2
  const winner = deriveWinner(resultTeam1, resultTeam2, resultMethod, penaltyScoreT1, penaltyScoreT2);
  const correctEmails = new Set();
  const allEmails = new Set();
  const predictionUpdates = [];

  for (const pred of predictions) {
    allEmails.add(pred.user_email);

    let winnerCorrect, methodCorrect, scoreCorrect, prePenCorrect, penCorrect, penaltyCorrect, pointsEarned;

    if (isV2Prediction(pred)) {
      // v2: usa scoreV2 puro
      const r = scoreV2(pred, {
        team1: resultTeam1, team2: resultTeam2,
        method: resultMethod, penaltyT1: penaltyScoreT1, penaltyT2: penaltyScoreT2,
      });
      winnerCorrect = r.winnerCorrect;
      methodCorrect = r.methodCorrect;
      scoreCorrect = r.scoreCorrect;
      prePenCorrect = r.prePenCorrect;
      penCorrect = r.penCorrect;
      penaltyCorrect = null; // v2 no usa penalty_correct
      pointsEarned = r.points;
    } else {
      // v1 legacy: reglas del modelo anterior (50 winner + 50 method + 50 penalty)
      // Componente 1: ganador (null si pred_winner es null)
      winnerCorrect = null;
      if (pred.pred_winner != null) {
        winnerCorrect = winner != null && pred.pred_winner === winner;
      }

      // Componente 2: método (null si alguno es null)
      methodCorrect = null;
      if (resultMethod != null && pred.pred_method != null) {
        methodCorrect = pred.pred_method === resultMethod;
      }

      // Componente 3: penal (solo si ambos lados apostaron a pen)
      penaltyCorrect = null;
      if (resultMethod === 'pen' && pred.pred_method === 'pen') {
        penaltyCorrect =
          pred.pred_penalty_team1 != null &&
          pred.pred_penalty_team2 != null &&
          pred.pred_penalty_team1 === penaltyScoreT1 &&
          pred.pred_penalty_team2 === penaltyScoreT2;
      }

      pointsEarned =
        (winnerCorrect === true ? POINTS_WINNER : 0) +
        (methodCorrect === true ? POINTS_METHOD : 0) +
        (penaltyCorrect === true ? POINTS_PENALTY_LEGACY : 0);

      // Para v1, scoreCorrect = winner && method && penalty (legacy simplification)
      scoreCorrect = null;
      prePenCorrect = null;
      penCorrect = null;
    }

    if (pointsEarned > 0) correctEmails.add(pred.user_email);

    predictionUpdates.push({
      id: pred.id,
      is_correct: pointsEarned > 0,
      points_earned: pointsEarned,
      winner_correct: winnerCorrect,
      method_correct: methodCorrect,
      score_correct: scoreCorrect,
      pre_pen_correct: prePenCorrect,
      pen_correct: penCorrect,
      penalty_correct: penaltyCorrect, // null para v2, bool para v1
      scored: true,
    });
  }

  // 4. Upsert en lotes
  const BATCH = 100;
  const batches = [];
  for (let i = 0; i < predictionUpdates.length; i += BATCH) {
    const batch = predictionUpdates.slice(i, i + BATCH);
    batches.push(supabase.from('predictions').upsert(batch, { onConflict: 'id' }));
  }
  const results = await Promise.all(batches);
  for (const { error } of results) {
    if (error) console.error('[evaluateMatchPredictions] Error actualizando predictions:', error);
  }

  // 5. Recalcular puntos de usuarios afectados
  await recalculatePointsForEmails(allEmails);

  // 6. Comisión de referidos
  if (correctEmails.size > 0) {
    try {
      await Promise.all(
        [...correctEmails].map(email => db.awardReferralCommission(email, matchId))
      );
    } catch (e) {
      console.warn('[evaluateMatchPredictions] awardReferralCommission error:', e?.message);
    }
  }

  // 7. Refrescar cache local
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('db-cloud-change', { detail: { tableName: 'predictions' } }));
      window.dispatchEvent(new CustomEvent('db-cloud-change', { detail: { tableName: 'users' } }));
    } catch {}
  }

  return { evaluated: predictions.length, correct: correctEmails.size };
}

/**
 * Alias de compatibilidad hacia atrás.
 * Para callers legacy que aún pasan solo (matchId, t1, t2)
 * sin resultMethod / penalty scores (p.ej. useMatchHandlers durante
 * la transición al nuevo modelo).
 */
export async function evaluateMatchPredictionsLegacy(matchId, resultTeam1, resultTeam2) {
  return evaluateMatchPredictions(matchId, resultTeam1, resultTeam2, null, null, null);
}

/**
 * Recalcula prediction_points y total_points desde cero.
 * prediction_points = SUM(points_earned WHERE is_correct=true AND scored=true)
 *   deduplicado por (user_email, match_id).
 */
async function recalculatePointsForEmails(emails) {
  await Promise.all([...emails].map(async (email) => {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('id, bonus_points, referral_points')
        .eq('email', email)
        .single();
      if (!user) return;

      const { data: scoredPreds } = await supabase
        .from('predictions')
        .select('id, match_id, points_earned, is_correct, scored')
        .eq('user_email', email)
        .eq('scored', true)
        .eq('is_correct', true);

      const seenMatches = new Set();
      let totalPoints = 0;
      for (const p of (scoredPreds || [])) {
        const key = p.match_id || '__nomatch__';
        if (seenMatches.has(key)) continue;
        seenMatches.add(key);
        totalPoints += p.points_earned || 0;
      }

      const bonusPoints = user.bonus_points || 0;
      const referralPoints = user.referral_points || 0;
      const newTotal = totalPoints + bonusPoints + referralPoints;

      await supabase
        .from('users')
        .update({
          prediction_points: totalPoints,
          total_points: newTotal,
        })
        .eq('id', user.id);
    } catch (e) {
      console.warn(`[recalculatePointsForEmails] Error recalculando ${email}:`, e?.message);
    }
  }));
}