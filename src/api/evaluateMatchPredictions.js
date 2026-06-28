import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

const POINTS_WINNER = 50;
const POINTS_METHOD = 50;
const POINTS_SCORE = 100;         // marcador único (90/ET = score exacto, Pen = score total 90+ET+pens)
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

  // Método correcto. null si el admin no publicó método (no es evaluable).
  // Si el usuario tampoco eligió método, queda null también (no penaliza).
  let methodCorrect = null;
  if (method != null && pred.pred_method != null) {
    methodCorrect = pred.pred_method === method;
  }

  // Score pick — REQUIERE winner correcto
  let scoreCorrect = null;
  let prePenCorrect = null;
  let penCorrect = null;

  // Marcador: requiere que la CATEGORÍA del método coincida (90/ET comparten
  // "score exacto"; pen es "score total 90+ET+pens" — categorías distintas,
  // no comparables):
  //   - actual 90/ET + pred 90/ET → comparar pred_score vs score exacto
  //   - actual pen  + pred pen    → comparar pred_score vs total (90+ET+pens)
  //   - Cualquier cruce (90/ET vs pen o viceversa) → scoreCorrect queda null
  //     (interpretaciones distintas, no se puede comparar).
  if ((method === '90' || method === 'et') && (pred.pred_method === '90' || pred.pred_method === 'et')) {
    scoreCorrect = pred.pred_score_team1 === team1 && pred.pred_score_team2 === team2;
  } else if (method === 'pen' && pred.pred_method === 'pen') {
    const totalT1 = team1 + (penaltyT1 ?? 0);
    const totalT2 = team2 + (penaltyT2 ?? 0);
    scoreCorrect = pred.pred_score_team1 === totalT1 && pred.pred_score_team2 === totalT2;
    prePenCorrect = null;
    penCorrect = null;
  }

  // Puntos — FIX (bug v2-gate-28jun): el ganador es GATE, no componente
  // independiente. Si el usuario NO acertó el ganador, NO suma método ni
  // marcador (aunque coincidan por casualidad). Esto evita que alguien gane
  // puntos de marcador prediciendo un resultado que no pasó.
  //
  // Si acierta el ganador: método (+50) y marcador (+100) suman independiente
  // entre sí — el método fallar NO bloquea al marcador, y viceversa.
  //   - winner ✓ + method ✓ + score ✓ → 200 pts (máximo)
  //   - winner ✓ + method ✗ + score ✓ → 150 pts (ejemplo del usuario)
  //   - winner ✓ + method ✓ + score ✗ → 100 pts
  //   - winner ✗ + cualquier method/score → 0 pts
  let points = 0;
  if (winnerCorrect) {
    points += POINTS_WINNER;          // 50
    if (methodCorrect) points += POINTS_METHOD;  // 50
    if (scoreCorrect) points += POINTS_SCORE;    // 100
  }

  return { winnerCorrect, methodCorrect, scoreCorrect, prePenCorrect, penCorrect, points };
}

/**
 * Evalúa todos los pronósticos de un partido contra el resultado real.
 *
 * 3 componentes independientes (cada uno suma sus propios puntos):
 *   - Ganador correcto (1/X/2): +50 pts
 *   - Método correcto ('90'/'et'/'pen'): +50 pts
 *   - Marcador exacto: +100 pts (un solo componente)
 *       · Si método=90/ET: pred_score_team1/2 = score exacto comparado contra team1/team2
 *       · Si método=pen:  pred_score_team1/2 = total (90+ET+pens) comparado contra team1+penT1
 *
 * Pre-pen fue eliminado del modelo. Cada pick se evalúa por separado:
 * si perdiste el ganador pero acertaste método y marcador, sumás 150 pts.
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

  // FIX (bug v2-79): si el admin publicó el resultado sin seleccionar método
  // (result_method quedó null en la BD), pero hay marcador de penales, inferir
  // que fue a penales. Sin esto, el breakdown muestra "Cómo gana ❌ 0" porque
  // pred_method='90' !== method=null.
  if (resultMethod == null && penaltyScoreT1 != null && penaltyScoreT2 != null) {
    resultMethod = 'pen';
  }

  // 1. Cargar pronósticos del partido
  const { data: allPredictions, error: predErr } = await supabase
    .from('predictions')
    .select('id, user_email, pred_team1, pred_team2, pred_winner, pred_method, pred_penalty_team1, pred_penalty_team2, pred_score_team1, pred_score_team2, pred_pen_team1, pred_pen_team2')
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
      // v1 legacy (pre-28 jun 2026): el form del usuario solo guardaba
      // `pred_team1` y `pred_team2` con el marcador final pronosticado.
      // NO usaba pred_winner ni pred_method ni pred_penalty_* (esos son del v2).
      //
      // Reglas del modelo v1 (100 pts por marcador exacto):
      //   - Si el usuario acertó el marcador exacto (pred_team1/2 == team1/2)
      //     → 100 pts.
      //   - Si no, 0 pts. (No hay winner/method/pick por separado.)
      //
      // FIX (bug v1-rdc): antes este branch revisaba pred_winner + pred_method
      // + pred_penalty_*, todos null para v1, así que SIEMPRE daba 0 pts
      // aunque el usuario hubiera acertado el marcador.
      const v1ExactScoreCorrect =
        pred.pred_team1 != null && pred.pred_team2 != null &&
        pred.pred_team1 === resultTeam1 && pred.pred_team2 === resultTeam2;

      winnerCorrect = null;
      methodCorrect = null;
      scoreCorrect = v1ExactScoreCorrect;
      prePenCorrect = null;
      penCorrect = null;
      penaltyCorrect = null;
      pointsEarned = v1ExactScoreCorrect ? 100 : 0;
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