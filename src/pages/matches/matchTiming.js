// Helpers puros para decidir el estado "en vivo" de un partido según su horario.
// Interpretan la fecha del calendario de match_date + match_time como hora LOCAL
// (igual que getMatchDate en Matches.jsx). Sin dependencias de React.

const LIVE_WINDOW_H = 3.5; // un partido "en juego" hasta ~3.5h después del inicio

export function getKickoffMs(match) {
  if (!match?.match_date || !match?.match_time) return null;
  const datePart = String(match.match_date).split('T')[0];
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = String(match.match_time).split(':').map(Number);
  if ([y, mo, d, h, mi].some(Number.isNaN)) return null;
  return new Date(y, mo - 1, d, h, mi, 0).getTime();
}

export function hasStartedNow(match, nowMs = Date.now(), windowH = LIVE_WINDOW_H) {
  const k = getKickoffMs(match);
  if (k == null) return false;
  const elapsedH = (nowMs - k) / 3.6e6;
  return elapsedH >= 0 && elapsedH <= windowH;
}

// EN VIVO = 'live' en la BD, o (open/closed/pending) cuyo horario de inicio ya
// pasó y sigue dentro de la ventana de juego. Incluir 'pending' es la red de
// seguridad: evita que un partido recién empezado desaparezca entre ticks del cron.
export function isLiveMatch(match, nowMs = Date.now()) {
  if (!match) return false;
  if (match.status === 'live') return true;
  if (match.status === 'open' || match.status === 'closed' || match.status === 'pending') {
    return hasStartedNow(match, nowMs);
  }
  return false;
}
