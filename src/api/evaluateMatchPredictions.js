import { api } from './client';

/**
 * Evalúa todos los pronósticos de un partido contra el resultado real.
 * Revierte puntos existentes antes de re-evaluar (idempotente y seguro
 * para llamar múltiples veces con el mismo resultado).
 *
 * @param {string} matchId - ID del partido
 * @param {number} resultTeam1 - Goles del equipo local
 * @param {number} resultTeam2 - Goles del equipo visitante
 * @returns {{ evaluated: number, correct: number }}
 */
export async function evaluateMatchPredictions(matchId, resultTeam1, resultTeam2) {
  const predictions = await api.entities.Prediction.filter({ match_id: matchId });
  if (predictions.length === 0) return { evaluated: 0, correct: 0 };

  // 1. Revertir puntos existentes de pronósticos ya puntuados
  const scoredPreds = predictions.filter(p => p.scored && (p.points_earned || 0) > 0);
  if (scoredPreds.length > 0) {
    const userLookups = await Promise.all(
      scoredPreds.map(async (pred) => {
        const users = await api.entities.User.filter({ email: pred.user_email });
        return users[0] ? { user: users[0], points: pred.points_earned || 0 } : null;
      })
    );
    // Deduplicar por usuario (evita resta duplicada si hay datos corruptos)
    const userReverts = new Map();
    for (const lookup of userLookups) {
      if (!lookup) continue;
      const existing = userReverts.get(lookup.user.id);
      if (existing) {
        existing.points += lookup.points;
      } else {
        userReverts.set(lookup.user.id, { user: lookup.user, points: lookup.points });
      }
    }
    await Promise.all(
      [...userReverts.values()].map(({ user, points }) =>
        api.entities.User.update(user.id, {
          total_points: Math.max(0, (user.total_points || 0) - points),
          prediction_points: Math.max(0, (user.prediction_points || 0) - points),
        })
      )
    );
  }

  // 2. Evaluar todos los pronósticos contra el resultado
  const correctEmails = [];
  await Promise.all(
    predictions.map(pred => {
      const isCorrect = pred.pred_team1 === resultTeam1 && pred.pred_team2 === resultTeam2;
      const pointsEarned = isCorrect ? 100 : 0;
      if (isCorrect) correctEmails.push(pred.user_email);
      return api.entities.Prediction.update(pred.id, {
        is_correct: isCorrect,
        points_earned: pointsEarned,
        scored: true,
      });
    })
  );

  // 3. Otorgar puntos a quienes acertaron (evitar duplicados por email)
  if (correctEmails.length > 0) {
    const uniqueEmails = [...new Set(correctEmails)];
    const allUsers = await Promise.all(
      uniqueEmails.map(email => api.entities.User.filter({ email }))
    );

    // Ejecutar en paralelo: actualizar puntos de usuarios + importar db para comisiones
    const [{ db }] = await Promise.all([
      import('@/lib/db'),
      Promise.all(
        allUsers.flat().map(u =>
          api.entities.User.update(u.id, {
            total_points: (u.total_points || 0) + 100,
            prediction_points: (u.prediction_points || 0) + 100,
          })
        )
      ),
    ]);

    // 3b. Otorgar comisión de referido (5 pts) al referente de cada usuario que acertó
    // db.awardReferralCommission() ya crea el registro en referralCommissions internamente
    await Promise.all(
      uniqueEmails.map(email => db.awardReferralCommission(email, matchId))
    );

    // 3c. CRÍTICO: empujar los puntos a Supabase INMEDIATAMENTE.
    // Sin esto, los cambios quedan atrapados en el localStorage del admin
    // y el usuario (en otro dispositivo) no ve el ranking actualizado
    // hasta el próximo poll de 60s (y a veces nunca si el admin no navega).
    try {
      await db._syncAllToSupabase();
    } catch {
      // Error silencioso de sincronización
    }
  }

  return { evaluated: predictions.length, correct: correctEmails.length };
}
