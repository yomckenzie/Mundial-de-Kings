import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

const POINTS_WINNER = 50;
const POINTS_METHOD = 50;
const POINTS_PENALTY = 50;

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
    .select('id, user_email, pred_winner, pred_method, pred_penalty_team1, pred_penalty_team2')
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

  // 3. Puntuar — 3 componentes independientes
  const winner = deriveWinner(resultTeam1, resultTeam2, resultMethod, penaltyScoreT1, penaltyScoreT2);
  const correctEmails = new Set();
  const allEmails = new Set();
  const predictionUpdates = [];

  for (const pred of predictions) {
    allEmails.add(pred.user_email);

    // Componente 1: ganador (null si pred_winner es null — predicción legacy)
    let winnerCorrect = null;
    if (pred.pred_winner != null) {
      winnerCorrect = winner != null && pred.pred_winner === winner;
    }

    // Componente 2: método (null si resultMethod es null o pred_method es null)
    let methodCorrect = null;
    if (resultMethod != null && pred.pred_method != null) {
      methodCorrect = pred.pred_method === resultMethod;
    }

    // Componente 3: penal (solo si ambos lados apostaron a pen)
    let penaltyCorrect = null;
    if (resultMethod === 'pen' && pred.pred_method === 'pen') {
      penaltyCorrect =
        pred.pred_penalty_team1 != null &&
        pred.pred_penalty_team2 != null &&
        pred.pred_penalty_team1 === penaltyScoreT1 &&
        pred.pred_penalty_team2 === penaltyScoreT2;
    }

    const pointsEarned =
      (winnerCorrect === true ? POINTS_WINNER : 0) +
      (methodCorrect === true ? POINTS_METHOD : 0) +
      (penaltyCorrect === true ? POINTS_PENALTY : 0);

    if (pointsEarned > 0) correctEmails.add(pred.user_email);

    predictionUpdates.push({
      id: pred.id,
      is_correct: pointsEarned > 0,
      points_earned: pointsEarned,
      winner_correct: winnerCorrect,
      method_correct: methodCorrect,
      penalty_correct: penaltyCorrect,
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