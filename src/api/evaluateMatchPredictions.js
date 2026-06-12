import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

const POINTS_PER_CORRECT = 100;

/**
 * Evalúa todos los pronósticos de un partido contra el resultado real.
 *
 * IDEMPOTENTE: puede ejecutarse múltiples veces sin duplicar puntos.
 * Usa recalculo completo desde cero (no incrementos) para garantizar
 * que el resultado final sea siempre el mismo sin importar cuántas
 * veces se ejecute.
 *
 * Flujo:
 *  1. Marcar predicciones como scored (upsert idempotente)
 *  2. Recalcular puntos de usuarios afectados desde cero
 *  3. Otorgar comisión de referidos
 *
 * @param {string} matchId
 * @param {number} resultTeam1
 * @param {number} resultTeam2
 * @returns {{ evaluated: number, correct: number }}
 */
export async function evaluateMatchPredictions(matchId, resultTeam1, resultTeam2) {
  if (!supabase) {
    console.warn('[evaluateMatchPredictions] Supabase no disponible');
    return { evaluated: 0, correct: 0 };
  }

  // 1. Cargar pronósticos del partido directamente desde Supabase
  const { data: allPredictions, error: predErr } = await supabase
    .from('predictions')
    .select('id, user_email, pred_team1, pred_team2')
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

  // 3. Puntuar predicciones (upsert idempotente — sobreescribe sin duplicar)
  const correctEmails = new Set();
  const allEmails = new Set();
  const predictionUpdates = [];
  for (const pred of predictions) {
    allEmails.add(pred.user_email);
    const isCorrect =
      pred.pred_team1 === resultTeam1 && pred.pred_team2 === resultTeam2;
    const pointsEarned = isCorrect ? POINTS_PER_CORRECT : 0;
    if (isCorrect) correctEmails.add(pred.user_email);
    predictionUpdates.push({
      id: pred.id,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      scored: true,
    });
  }

  const BATCH = 100;
  const batches = [];
  for (let i = 0; i < predictionUpdates.length; i += BATCH) {
    const batch = predictionUpdates.slice(i, i + BATCH);
    batches.push(supabase.from('predictions').upsert(batch, { onConflict: 'id' }));
  }
  const results = await Promise.all(batches);
  for (const { error } of results) {
    if (error) {
      console.error('[evaluateMatchPredictions] Error actualizando predictions:', error);
    }
  }

  // 4. Recalcular puntos de usuarios afectados desde cero (idempotente)
  //    Para cada usuario con predicciones en este partido:
  //    - Contar sus predicciones scored=true + is_correct=true (TODAS, no solo este partido)
  //    - prediction_points = count × 100
  //    - total_points = prediction_points + bonus_points + referral_points
  await recalculatePointsForEmails(allEmails);

  // 5. Otorgar comisión de referido (5 pts) al referente de cada usuario acertador
  if (correctEmails.size > 0) {
    try {
      await Promise.all(
        [...correctEmails].map(email =>
          db.awardReferralCommission(email, matchId)
        )
      );
    } catch (e) {
      console.warn('[evaluateMatchPredictions] awardReferralCommission error:', e?.message);
    }
  }

  // 6. Disparar refresh de cache local
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('db-cloud-change', {
        detail: { tableName: 'predictions' },
      }));
      window.dispatchEvent(new CustomEvent('db-cloud-change', {
        detail: { tableName: 'users' },
      }));
    } catch {}
  }

  return { evaluated: predictions.length, correct: correctEmails.size };
}

/**
 * Recalcula puntos desde cero para un conjunto de emails.
 * Idempotente: ejecutar 1 o 100 veces produce el mismo resultado.
 * Lee el total de predicciones correctas scored de cada usuario
 * y SETea prediction_points y total_points.
 */
async function recalculatePointsForEmails(emails) {
  // Ejecutar recálculos en paralelo (Promise.all) en vez de await secuencial
  await Promise.all([...emails].map(async (email) => {
    try {
      // Obtener datos del usuario
      const { data: user } = await supabase
        .from('users')
        .select('id, bonus_points, referral_points')
        .eq('email', email)
        .single();
      if (!user) return;

      // Contar predicciones correctas scored de este usuario (TODAS las tablas)
      // INCLUIR match_id para deduplicar: si hay duplicados en BD con distinto id
      // pero mismo (user_email, match_id), solo contar 1 vez.
      const { data: correctPreds } = await supabase
        .from('predictions')
        .select('id, match_id')
        .eq('user_email', email)
        .eq('scored', true)
        .eq('is_correct', true);

      // Deduplicar por (user_email, match_id) — evita que duplicados inflen puntos
      const seenMatches = new Set();
      let correctCount = 0;
      for (const p of (correctPreds || [])) {
        const key = p.match_id || '__nomatch__';
        if (seenMatches.has(key)) continue;
        seenMatches.add(key);
        correctCount++;
      }
      const predictionPoints = correctCount * POINTS_PER_CORRECT;
      const bonusPoints = user.bonus_points || 0;
      const referralPoints = user.referral_points || 0;
      const totalPoints = predictionPoints + bonusPoints + referralPoints;

      await supabase
        .from('users')
        .update({
          prediction_points: predictionPoints,
          total_points: totalPoints,
        })
        .eq('id', user.id);
    } catch (e) {
      console.warn(`[recalculatePointsForEmails] Error recalculando ${email}:`, e?.message);
    }
  }));
}
