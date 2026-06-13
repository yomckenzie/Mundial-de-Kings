// Ranking por semana, calculado en el cliente desde el caché local
// (users + predictions + matches). Sin dependencias de React.
//
// Semana = lunes a domingo (calendario). Los puntos semanales de un usuario =
// aciertos (is_correct + scored) cuyos partidos se jugaron en esa semana × 100,
// deduplicando por (user_email, match_id).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const POINTS_PER_CORRECT = 100;
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Fecha-calendario de un partido como ms al inicio del día en hora local.
function matchDateMs(match) {
  if (!match?.match_date) return null;
  const datePart = String(match.match_date).split('T')[0];
  const [y, mo, d] = datePart.split('-').map(Number);
  if ([y, mo, d].some(Number.isNaN)) return null;
  return new Date(y, mo - 1, d, 0, 0, 0).getTime();
}

// Lunes (00:00 local) de la semana que contiene a `ms`. getDay(): 0=dom..6=sáb.
function mondayOf(ms) {
  const d = new Date(ms);
  const offset = (d.getDay() + 6) % 7; // días desde el lunes
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset, 0, 0, 0).getTime();
}

function formatRange(startMs, endInclusiveMs) {
  const s = new Date(startMs);
  const e = new Date(endInclusiveMs);
  const sm = MES[s.getMonth()];
  const em = MES[e.getMonth()];
  return sm === em
    ? `${s.getDate()}–${e.getDate()} ${sm}`
    : `${s.getDate()} ${sm} – ${e.getDate()} ${em}`;
}

// Devuelve las semanas del torneo que YA empezaron (start <= now). Si ninguna
// empezó todavía, devuelve la Semana 1 para que siempre haya algo que mostrar.
export function getTournamentWeeks(matches, nowMs = Date.now()) {
  const dates = (matches || []).map(matchDateMs).filter((d) => d != null);
  if (!dates.length) return [];
  const min = Math.min(...dates);
  const max = Math.max(...dates);

  const weeks = [];
  let n = 1;
  // Anclar al lunes de la semana del primer partido; avanzar de lunes a lunes.
  for (let start = mondayOf(min); start <= max; start += WEEK_MS) {
    weeks.push({
      n,
      start,
      end: start + WEEK_MS, // exclusivo
      label: `Semana ${n}`,
      dateLabel: formatRange(start, start + WEEK_MS - 1),
    });
    n++;
  }
  const started = weeks.filter((w) => w.start <= nowMs);
  return started.length ? started : [weeks[0]];
}

// Standings de una semana: usuarios (no admin, perfil completo) con >0 aciertos
// esa semana, ordenados desc, con rank y gapToPrev. Se mapea weeklyPoints a
// prediction_points para reusar la tabla/podio existentes.
export function computeWeeklyRanking(users, predictions, matches, week) {
  if (!week) return [];

  const dateById = {};
  for (const m of (matches || [])) {
    const ms = matchDateMs(m);
    if (ms != null) dateById[m.id] = ms;
  }

  const seen = new Set();
  const countByEmail = {};
  for (const p of (predictions || [])) {
    if (!p.is_correct || !p.scored) continue;
    const md = dateById[p.match_id];
    if (md == null) continue;
    if (md < week.start || md >= week.end) continue;
    const key = `${p.user_email}|${p.match_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    countByEmail[p.user_email] = (countByEmail[p.user_email] || 0) + 1;
  }

  const ranked = (users || [])
    .filter((u) => u.profile_complete && u.role !== 'admin')
    .map((u) => ({ ...u, weeklyPoints: (countByEmail[u.email] || 0) * POINTS_PER_CORRECT }))
    .filter((u) => u.weeklyPoints > 0)
    .sort((a, b) => b.weeklyPoints - a.weeklyPoints);

  return ranked.map((u, i) => ({
    ...u,
    prediction_points: u.weeklyPoints, // reusa el render de la tabla general
    rank: i + 1,
    gapToPrev: i > 0 ? Math.max(0, ranked[i - 1].weeklyPoints - u.weeklyPoints) : 0,
  }));
}
