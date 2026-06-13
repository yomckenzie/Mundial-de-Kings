// Lógica pura para armar reportes de pronósticos (sin React).
// Cruza predictions con users (por correo) para mostrar @instagram y nombre.
// Excluye admins de métricas y tabla de posiciones (igual que la evaluación).

const POINTS_PER_CORRECT = 100;

const hasResult = (match) =>
  match && match.result_team1 != null && match.result_team2 != null;

// 'ganó' | 'perdió' | 'pendiente'
export function statusOf(pred, match) {
  if (!hasResult(match)) return 'pendiente';
  const correct = pred.scored
    ? !!pred.is_correct
    : Number(pred.pred_team1) === Number(match.result_team1) &&
      Number(pred.pred_team2) === Number(match.result_team2);
  return correct ? 'ganó' : 'perdió';
}

// Mapa email → { instagram, name, role }
export function usersByEmailMap(users) {
  const map = new Map();
  for (const u of (users || [])) {
    map.set(u.email, { instagram: u.instagram || '', name: u.full_name || '', role: u.role || 'user' });
  }
  return map;
}

const isAdmin = (email, usersByEmail) => usersByEmail.get(email)?.role === 'admin';

const pct = (hits, total) => (total > 0 ? `${((hits / total) * 100).toFixed(1)}%` : '0.0%');

// Reporte de un partido: filas + métricas. Las filas incluyen a todos (dedup por
// correo); las métricas excluyen admins.
export function buildMatchReport(match, predictions, usersByEmail) {
  const seen = new Set();
  const rows = [];
  for (const p of predictions) {
    if (p.match_id !== match.id) continue;
    if (seen.has(p.user_email)) continue;
    seen.add(p.user_email);
    const u = usersByEmail.get(p.user_email) || {};
    const status = statusOf(p, match);
    rows.push({
      instagram: u.instagram || '',
      name: u.name || '',
      email: p.user_email,
      pred: `${p.pred_team1}-${p.pred_team2}`,
      status,
      points: p.scored
        ? (p.points_earned ?? (p.is_correct ? POINTS_PER_CORRECT : 0))
        : (status === 'ganó' ? POINTS_PER_CORRECT : 0),
    });
  }
  rows.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const noAdmin = rows.filter(r => !isAdmin(r.email, usersByEmail));
  const participants = noAdmin.length;
  const hits = noAdmin.filter(r => r.status === 'ganó').length;
  return {
    match,
    resultText: hasResult(match) ? `${match.result_team1}-${match.result_team2}` : 'sin resultado',
    rows,
    stats: { participants, hits, effectiveness: pct(hits, participants) },
  };
}

// Tabla de posiciones acumulada (solo partidos finalizados), dedup por (correo,
// partido), excluye admins, ordena por puntos desc y luego nombre.
export function buildStandings(predictions, matches, usersByEmail) {
  const matchById = new Map(matches.map(m => [m.id, m]));
  const finishedIds = new Set(matches.filter(m => m.status === 'finished' && hasResult(m)).map(m => m.id));
  const seenPair = new Set();
  const byUser = new Map(); // email → { hits, total, points }
  for (const p of predictions) {
    if (!finishedIds.has(p.match_id)) continue;
    if (isAdmin(p.user_email, usersByEmail)) continue;
    const pairKey = `${p.user_email}|${p.match_id}`;
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);
    const won = statusOf(p, matchById.get(p.match_id)) === 'ganó';
    const cur = byUser.get(p.user_email) || { hits: 0, total: 0, points: 0 };
    cur.total += 1;
    if (won) { cur.hits += 1; cur.points += POINTS_PER_CORRECT; }
    byUser.set(p.user_email, cur);
  }
  const list = [...byUser.entries()].map(([email, v]) => {
    const u = usersByEmail.get(email) || {};
    return { instagram: u.instagram || '', name: u.name || '', email, hits: v.hits, total: v.total, points: v.points };
  });
  list.sort((a, b) => b.points - a.points || (a.name || a.email).localeCompare(b.name || b.email));
  return list.map((r, i) => ({ rank: i + 1, ...r }));
}

// Métricas globales (solo partidos finalizados, sin admins).
export function buildGlobalStats(predictions, finishedMatches, usersByEmail) {
  const finishedIds = new Set(finishedMatches.filter(m => m.status === 'finished' && hasResult(m)).map(m => m.id));
  const matchById = new Map(finishedMatches.map(m => [m.id, m]));
  const participants = new Set();
  const seenPair = new Set();
  let hits = 0;
  for (const p of predictions) {
    if (!finishedIds.has(p.match_id)) continue;
    if (usersByEmail && isAdmin(p.user_email, usersByEmail)) continue;
    const pairKey = `${p.user_email}|${p.match_id}`;
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);
    participants.add(p.user_email);
    if (statusOf(p, matchById.get(p.match_id)) === 'ganó') hits += 1;
  }
  return {
    totalMatches: finishedIds.size,
    participants: participants.size,
    hits,
    effectiveness: pct(hits, seenPair.size),
  };
}
