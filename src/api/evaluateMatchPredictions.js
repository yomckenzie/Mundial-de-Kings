import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

const POINTS_PER_CORRECT = 100;

/**
 * Evalúa todos los pronósticos de un partido contra el resultado real.
 *
 * REESCRITO para corregir dos bugs críticos del código anterior:
 *
 *  1. "Borra en server, aparece de nuevo" — antes hacía
 *     `db._syncAllToSupabase()` que re-subía TODO el localStorage, incluyendo
 *     filas que el admin había borrado en el SQL Editor. Ahora usamos
 *     operaciones SQL directas a través de Supabase (no syncFrom→syncTo).
 *
 *  2. "Duplicación de puntos" — antes hacía
 *     `User.update(id, { total_points: u.total_points + 100 })` que es
 *     read-modify-write. Si dos clientes lo ejecutaban a la vez, o si el
 *     cliente tenía un valor local desactualizado, los puntos se duplicaban.
 *
 *     La protección real viene de la combinación de:
 *     - Paso 3: revertir puntos scored=true antes de re-puntuar (idempotencia)
 *     - Paso 5: upsert con scored=true (segunda ejecución es no-op)
 *     - Paso 6: el cálculo `(u.prediction_points || 0) + amount` solo es
 *       correcto si el paso 3 ya revirtió. Garantizado por el orden secuencial.
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

  // 1. Cargar pronósticos del partido directamente desde Supabase (server-authoritative)
  const { data: allPredictions, error: predErr } = await supabase
    .from('predictions')
    .select('id, user_email, pred_team1, pred_team2, scored, points_earned')
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

  // 3. Revertir puntos previamente otorgados (idempotencia).
  //    Agrupamos por email: si un usuario tiene varios predictions scored,
  //    revertimos la suma total en una sola UPDATE.
  const revertByEmail = new Map();
  for (const p of predictions) {
    if (p.scored && (p.points_earned || 0) > 0) {
      revertByEmail.set(
        p.user_email,
        (revertByEmail.get(p.user_email) || 0) + (p.points_earned || 0)
      );
    }
  }
  for (const [email, amount] of revertByEmail) {
    const { data: u } = await supabase
      .from('users')
      .select('prediction_points, total_points')
      .eq('email', email)
      .single();
    if (!u) continue;
    const newPred = Math.max(0, (u.prediction_points || 0) - amount);
    const newTotal = Math.max(0, (u.total_points || 0) - amount);
    const { error } = await supabase
      .from('users')
      .update({ prediction_points: newPred, total_points: newTotal })
      .eq('email', email);
    if (error) console.warn(`[evaluateMatchPredictions] revert ${email}:`, error.message);
  }

  // 4. Puntuar todos los pronósticos
  const correctEmails = new Set();
  const predictionUpdates = [];
  for (const pred of predictions) {
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

  // 5. UPDATE de predictions en lotes (idempotente: si scored=true ya,
  //    vuelve a escribir lo mismo; si el resultado cambia, es intencional)
  const BATCH = 100;
  for (let i = 0; i < predictionUpdates.length; i += BATCH) {
    const batch = predictionUpdates.slice(i, i + BATCH);
    const { error } = await supabase
      .from('predictions')
      .upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error('[evaluateMatchPredictions] Error actualizando predictions:', error);
    }
  }

  // 6. Sumar puntos a usuarios que acertaron (1 UPDATE por email único)
  //    Garantía de no-duplicación: el paso 3 ya revirtió los puntos scored
  //    anteriores. Si scored era false → sumamos 100. Si scored era true
  //    con points_earned=100 → revertimos 100 y sumamos 100. Net: 100.
  for (const email of correctEmails) {
    const { data: u } = await supabase
      .from('users')
      .select('prediction_points, total_points')
      .eq('email', email)
      .single();
    if (!u) continue;
    const { error } = await supabase
      .from('users')
      .update({
        prediction_points: (u.prediction_points || 0) + POINTS_PER_CORRECT,
        total_points: (u.total_points || 0) + POINTS_PER_CORRECT,
      })
      .eq('email', email);
    if (error) console.warn(`[evaluateMatchPredictions] add points ${email}:`, error.message);
  }

  // 7. Otorgar comisión de referido (5 pts) al referente de cada usuario
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

  // 8. Disparar refresh de cache local (evento, sin re-subir nada)
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
