import { useState, useEffect, useRef } from 'react';
import { getLiveResultForMatch } from '@/lib/sportscore';
import { isRealTeam } from '@/lib/worldCupTeams';

// ─────────────────────────────────────────────────────────────────
// Sondea SportScore en bucle para los partidos que están (o podrían
// estar) en curso, y devuelve un mapa { matchId → liveResult } con el
// marcador y el minuto en vivo REAL (live_minute de SportScore).
// Refresca cada 30s mientras haya algún partido en vivo; si no hay
// ninguno, no consulta nada.
//
// SOLO LECTURA: este hook nunca escribe en la base de datos. Cuando
// SportScore reporta el partido como finalizado, el resultado se muestra
// como "Por confirmar" y es el ADMIN quien lo publica oficialmente
// (evaluando pronósticos y notificando a los usuarios). Las políticas RLS
// de Supabase solo permiten al admin modificar la tabla `matches`.
//
// Solo mira partidos con equipos REALES (los placeholders de
// eliminatoria no se pueden emparejar) y que estén "live" o "open" con
// la hora de inicio ya pasada (en juego aunque el admin no lo haya
// marcado todavía como En Vivo).
// ─────────────────────────────────────────────────────────────────

const POLL_MS = 30000;

function isInPlayWindow(match) {
  if (match.status === 'live') return true;
  if (match.status !== 'open' && match.status !== 'closed') return false;
  // open/closed + ya empezó (hasta ~3.5h después del inicio) = probablemente en juego
  if (!match.match_date) return false;
  const kickoff = new Date(`${match.match_date.slice(0, 10)}T${match.match_time || '00:00'}:00`);
  if (isNaN(kickoff.getTime())) return false;
  const now = Date.now();
  const elapsedH = (now - kickoff.getTime()) / 3.6e6;
  return elapsedH >= 0 && elapsedH <= 3.5;
}

export function useLiveResults(matches) {
  const [results, setResults] = useState({});
  const timerRef = useRef(null);

  // Lista estable de IDs relevantes para no recrear el efecto en cada render
  const relevant = (matches || []).filter(
    m => isInPlayWindow(m) && isRealTeam(m.team1) && isRealTeam(m.team2)
  );
  const key = relevant.map(m => m.id).sort().join(',');

  useEffect(() => {
    if (!relevant.length) {
      setResults({});
      return;
    }
    let cancelled = false;

    const poll = async () => {
      const entries = await Promise.all(
        relevant.map(async (m) => {
          try {
            const r = await getLiveResultForMatch(m);
            return [m.id, r];
          } catch {
            return [m.id, null];
          }
        })
      );
      if (cancelled) return;
      const next = {};
      for (const [id, r] of entries) if (r) next[id] = r;
      setResults(next);
    };

    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [key]);

  return results;
}
