import { useMemo } from 'react';
import { isLiveMatch } from './matchTiming';
import { isWithinVisibilityWindow, getMatchDate } from '@/lib/matchCardHelpers';

/**
 * Hook que clasifica los partidos en 4 grupos para mostrarlos en la UI:
 *   - liveMatches:         en vivo (BD status='live' o por horario)
 *   - upcomingMatches:     pendientes/abiertos visibles cuyo inicio aún no llegó
 *   - finishedMatches:     finalizados (BD status='finished' o por confirmar de SportScore)
 *   - closedMatches:       cerrados sin resultado publicado
 *
 * Los "por confirmar" son partidos que SportScore reporta como finalizados
 * pero el admin aún no publicó el resultado en la BD. Se muestran como
 * finalizados visualmente con etiqueta "Por confirmar" (sin veredicto).
 */
export function useCategorizedMatches(matches, liveResults) {
  return useMemo(() => {
    // Partidos que SportScore reporta como finalizados pero que el admin AÚN no
    // ha publicado en la BD.
    const pendingConfirmIds = new Set();
    for (const m of matches) {
      if (liveResults[m.id]?.state === 'finished' && m.status !== 'finished') {
        pendingConfirmIds.add(m.id);
      }
    }

    // EN VIVO = 'live' en la BD, o (open/closed/pending) cuyo horario de inicio ya
    // pasó. Excluye lo finalizado/por-confirmar.
    const liveMatches = matches.filter(m =>
      !pendingConfirmIds.has(m.id) && isLiveMatch(m)
    );
    const liveIds = new Set(liveMatches.map(m => m.id));

    // PRÓXIMOS = pendientes/abiertos visibles cuyo horario de inicio AÚN no llegó.
    const upcomingMatches = matches
      .filter((m) => {
        if (m.status !== 'pending' && m.status !== 'open') return false;
        if (!isWithinVisibilityWindow(m)) return false;
        if (liveIds.has(m.id)) return false;
        const kickoff = getMatchDate(m.match_date, m.match_time);
        return kickoff ? Date.now() < kickoff.getTime() : true;
      })
      // DESC: los partidos más recientes arriba. Dentro del mismo grupo de
      // estado, 'open' sigue flotando al tope (es el único estado apostable).
      .sort((a, b) => {
        if (a.status === 'open' && b.status !== 'open') return -1;
        if (a.status !== 'open' && b.status === 'open') return 1;
        if (a.match_date !== b.match_date) return (b.match_date || '').localeCompare(a.match_date || '');
        return (b.match_time || '').localeCompare(a.match_time || '');
      });

    const dbFinishedMatches = matches.filter(m => m.status === 'finished');
    const pendingConfirmMatches = matches.filter(m => pendingConfirmIds.has(m.id));
    const finishedMatches = [...pendingConfirmMatches, ...dbFinishedMatches];
    const closedMatches = matches.filter(
      m => m.status === 'closed' && !liveIds.has(m.id) && !pendingConfirmIds.has(m.id)
    );

    return {
      liveMatches,
      liveIds,
      upcomingMatches,
      finishedMatches,
      pendingConfirmMatches,
      closedMatches,
      pendingConfirmIds,
    };
  }, [matches, liveResults]);
}