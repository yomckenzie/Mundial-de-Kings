// ─────────────────────────────────────────────────────────────────
// Cliente de la API pública de SportScore (gratis, sin key, JSON, CORS-open).
// Empareja un partido de NUESTRA tabla `matches` (equipos en español) con su
// marcador/estado en vivo de la Copa del Mundo FIFA en SportScore.
//
// Términos de SportScore: requiere un backlink visible "Powered by SportScore".
// https://sportscore.com/developers/terms/
//
// Funciona en navegador y en Node (usa fetch global).
// ─────────────────────────────────────────────────────────────────

import { toEnglishKey, normalizeTeam } from './worldCupTeams.js';

const BASE = 'https://sportscore.com';
const SPORT = 'football';
const COMPETITION_SLUG = 'fifa-world-cup';

// Cache del mapa {nombreInglesNormalizado → teamSlug}, construido desde standings.
let _slugMapCache = null;
let _slugMapAt = 0;
const SLUG_TTL_MS = 6 * 60 * 60 * 1000; // 6h: los equipos no cambian durante el torneo

async function _getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`SportScore ${path} → HTTP ${res.status}`);
  return res.json();
}

// Construye {englishKey → slug} a partir de la tabla de posiciones de la Copa.
export async function getTeamSlugMap() {
  const now = Date.now();
  if (_slugMapCache && (now - _slugMapAt) < SLUG_TTL_MS) return _slugMapCache;
  const data = await _getJson(`/api/widget/standings/?sport=${SPORT}&slug=${COMPETITION_SLUG}`);
  const map = {};
  for (const table of (data.tables || [])) {
    for (const row of (table.rows || [])) {
      if (row.team && row.team_slug) map[normalizeTeam(row.team)] = row.team_slug;
    }
  }
  _slugMapCache = map;
  _slugMapAt = now;
  return map;
}

// Normaliza el status crudo de SportScore a uno de los nuestros + texto de minuto.
function normalizeStatus(raw, statusText) {
  const s = (raw || '').toLowerCase();
  if (s === 'finished' || s === 'ft' || s === 'aet' || s === 'pen') return { state: 'finished', label: statusText || 'Finalizado' };
  if (s === 'upcoming' || s === 'notstarted' || s === 'not_started' || s === 'scheduled') return { state: 'upcoming', label: statusText || 'Por jugar' };
  // Cualquier otra cosa (inprogress, live, 1h, 2h, ht, inplay, "67'") = en vivo
  return { state: 'live', label: statusText || 'En vivo' };
}

/**
 * Busca el resultado/estado en vivo de un partido nuestro.
 * @param {{team1:string, team2:string}} match  equipos en español
 * @returns {Promise<null | {
 *   state: 'live'|'finished'|'upcoming',
 *   label: string,                  // "67'", "HT", "Finalizado"...
 *   team1Score: number, team2Score: number,  // orientados a NUESTRO team1/team2
 *   raw: object
 * }>}  null si no se puede emparejar (placeholder, equipo no encontrado, sin fixture)
 */
export async function getLiveResultForMatch(match) {
  const k1 = toEnglishKey(match.team1);
  const k2 = toEnglishKey(match.team2);
  if (!k1 || !k2) return null; // placeholder de eliminatoria → no mapeable

  const slugMap = await getTeamSlugMap();
  const slug1 = slugMap[k1];
  const slug2 = slugMap[k2];
  const querySlug = slug1 || slug2;
  if (!querySlug) return null; // equipo aún no aparece en standings

  const data = await _getJson(`/api/widget/team/?sport=${SPORT}&slug=${querySlug}&limit=12`);
  const fixtures = data.matches || [];

  // Buscar el fixture donde el rival coincide con el otro equipo nuestro.
  for (const fx of fixtures) {
    const home = normalizeTeam(fx.home);
    const away = normalizeTeam(fx.away);
    const isMatch = (home === k1 && away === k2) || (home === k2 && away === k1);
    if (!isMatch) continue;

    const st = normalizeStatus(fx.status, fx.status_text);
    // Orientar el marcador a NUESTRO team1/team2 (SportScore puede tenerlo al revés)
    const homeIsTeam1 = home === k1;
    const team1Score = homeIsTeam1 ? fx.home_score : fx.away_score;
    const team2Score = homeIsTeam1 ? fx.away_score : fx.home_score;
    return {
      state: st.state,
      label: st.label,
      team1Score: team1Score ?? null,
      team2Score: team2Score ?? null,
      raw: fx,
    };
  }
  return null; // no se encontró el enfrentamiento en los fixtures del equipo
}
