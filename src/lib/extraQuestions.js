// Single source of truth de las preguntas "Puntos extra" para semifinal y final.
// Lo consumen:
//   - src/components/matches/ExtraPointsCard.jsx   (form usuario)
//   - src/pages/matches/PredictionBreakdown.jsx    (filas del desglose)
//   - src/pages/admin/MatchCardItem.jsx            (inputs respuesta correcta)
//   - src/api/useMatchHandlers.js                  (payload al publicar)
//   - src/api/evaluateMatchPredictions.js          (cómputo de puntos extra)
//
// Matchups reales del Mundial 2026 (verificado contra BD):
//   - FRA vs ESP  → Semifinal · 2026-07-14 (finalizada)
//   - ARG vs ING  → Semifinal · 2026-07-15 (finalizada)
//   - FRA vs ING  → Tercer Puesto · 2026-07-18 (pendiente)
//   - ESP vs ARG  → Final · 2026-07-19 (pendiente)
//
// Cada cruce tiene su set de preguntas adaptado a los jugadores que
// efectivamente juegan. Si en el futuro se agregan más semis/finales, añadir
// el matchup normalizado al map MATCHUP_TO_QUESTIONS.

export const POINTS_PER_EXTRA = 5;

// ─── Semifinal 1: Francia vs España (2026-07-14) ────────────────────
const SEMIFINAL_FRA_ESP_QUESTIONS = [
  { id: 'mbappe',   q: '¿Anotará Kylian Mbappé al menos un gol en tiempo regular?',     options: ['Sí', 'No'] },
  { id: 'yamal',    q: '¿Anotará Lamine Yamal en cualquier momento?',                    options: ['Sí', 'No'] },
  { id: 'ambos',    q: '¿Ambos equipos anotarán en los 90m?',                             options: ['Sí', 'No'] },
  { id: 'primert',  q: "¿Se anotará algún gol en el primer tiempo? (45' m)",              options: ['Sí', 'No'] },
  { id: 'amarillas', q: '¿Quién recibirá más tarjetas amarillas?',                       options: ['Francia', 'España', 'Empate'] },
  { id: 'corners',   q: '¿Qué equipo cobrará más saques de esquina?',                    options: ['Francia', 'España', 'Empate'] },
  { id: 'primergol', q: '¿Quién marcará el primer gol del partido?',                     options: ['Kylian Mbappé', 'Antoine Griezmann', 'Lamine Yamal', 'Nico Williams', 'Ninguno'], allowOther: true },
];

// ─── Semifinal 2: Argentina vs Inglaterra (2026-07-15) ───────────────
const SEMIFINAL_ARG_ING_QUESTIONS = [
  { id: 'messi',    q: '¿Anotará Lionel Messi al menos un gol en tiempo regular?',      options: ['Sí', 'No'] },
  { id: 'belling',  q: '¿Anotará Jude Bellingham en cualquier momento?',                 options: ['Sí', 'No'] },
  { id: 'ambos',    q: '¿Ambos equipos anotarán en los 90m?',                             options: ['Sí', 'No'] },
  { id: 'primert',  q: "¿Se anotará algún gol en el primer tiempo? (45' m)",              options: ['Sí', 'No'] },
  { id: 'amarillas', q: '¿Quién recibirá más tarjetas amarillas?',                       options: ['Argentina', 'Inglaterra', 'Empate'] },
  { id: 'corners',   q: '¿Qué equipo cobrará más saques de esquina?',                    options: ['Argentina', 'Inglaterra', 'Empate'] },
  { id: 'primergol', q: '¿Quién marcará el primer gol del partido?',                     options: ['Lionel Messi', 'Julián Álvarez', 'Jude Bellingham', 'Harry Kane', 'Ninguno'], allowOther: true },
];

// ─── Tercer Puesto: Francia vs Inglaterra (2026-07-18) ────────────────
const THIRD_PLACE_QUESTIONS = [
  { id: 'mbappe',   q: '¿Anotará Kylian Mbappé al menos un gol en tiempo regular?',      options: ['Sí', 'No'] },
  { id: 'belling',  q: '¿Anotará Jude Bellingham en cualquier momento?',                 options: ['Sí', 'No'] },
  { id: 'ambos',    q: '¿Ambos equipos anotarán en los 90m?',                             options: ['Sí', 'No'] },
  { id: 'primert',  q: "¿Se anotará algún gol en el primer tiempo? (45' m)",              options: ['Sí', 'No'] },
  { id: 'amarillas', q: '¿Quién recibirá más tarjetas amarillas?',                       options: ['Francia', 'Inglaterra', 'Empate'] },
  { id: 'corners',   q: '¿Qué equipo cobrará más saques de esquina?',                    options: ['Francia', 'Inglaterra', 'Empate'] },
  { id: 'primergol', q: '¿Quién marcará el primer gol del partido?',                     options: ['Kylian Mbappé', 'Antoine Griezmann', 'Jude Bellingham', 'Harry Kane', 'Ninguno'], allowOther: true },
];

// ─── Final: España vs Argentina (2026-07-19) ──────────────────────────
const FINAL_QUESTIONS = [
  { id: 'messi',    q: '¿Anotará Lionel Messi al menos un gol en tiempo regular?',       options: ['Sí', 'No'] },
  { id: 'yamal',    q: '¿Anotará Lamine Yamal en cualquier momento?',                    options: ['Sí', 'No'] },
  { id: 'ambos',    q: '¿Ambos equipos anotarán en los 90m?',                             options: ['Sí', 'No'] },
  { id: 'primert',  q: "¿Se anotará algún gol en el primer tiempo? (45' m)",              options: ['Sí', 'No'] },
  { id: 'amarillas', q: '¿Quién recibirá más tarjetas amarillas?',                       options: ['España', 'Argentina', 'Empate'] },
  { id: 'corners',   q: '¿Qué equipo cobrará más saques de esquina?',                    options: ['España', 'Argentina', 'Empate'] },
  { id: 'primergol', q: '¿Quién marcará el primer gol del partido?',                     options: ['Lionel Messi', 'Julián Álvarez', 'Lamine Yamal', 'Nico Williams', 'Ninguno'], allowOther: true },
];

// ─── Helpers ────────────────────────────────────────────────────────

// Normaliza un nombre de equipo para usar como key: lowercase, sin acentos, sin espacios al borde.
function normTeam(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remueve diacríticos
    .trim();
}

// Matchup normalizado: ordena alfabéticamente para que el orden de los equipos en BD no importe.
function normalizeMatchup(team1, team2) {
  return [normTeam(team1), normTeam(team2)].sort().join('|');
}

const MATCHUP_TO_QUESTIONS = {
  'espana|francia':          SEMIFINAL_FRA_ESP_QUESTIONS, // Semifinal 1
  'argentina|inglaterra':    SEMIFINAL_ARG_ING_QUESTIONS, // Semifinal 2
  'francia|inglaterra':      THIRD_PLACE_QUESTIONS,        // Tercer Puesto
  'argentina|espana':        FINAL_QUESTIONS,              // Final
};

// Sets que cuentan como "Semifinal" para el Badge "Solo {round}" del bloque.
const SEMIFINAL_SETS = new Set([
  SEMIFINAL_FRA_ESP_QUESTIONS,
  SEMIFINAL_ARG_ING_QUESTIONS,
]);

// Devuelve el array de preguntas para un partido si está mapeado, o null.
//   getQuestionsForMatch({ team1: 'Francia', team2: 'España' })
//   → SEMIFINAL_FRA_ESP_QUESTIONS (7 preguntas)
//   getQuestionsForMatch({ team1: 'Brasil', team2: 'Argentina' })
//   → null
export function getQuestionsForMatch(match) {
  if (!match || !match.team1 || !match.team2) return null;
  const key = normalizeMatchup(match.team1, match.team2);
  return MATCHUP_TO_QUESTIONS[key] || null;
}

// Devuelve true si el partido tiene preguntas extra configuradas.
export function hasExtraPoints(match) {
  return getQuestionsForMatch(match) != null;
}

// Devuelve la etiqueta corta para el Badge "Solo {round}" del bloque.
export function getExtraRoundLabel(match) {
  const q = getQuestionsForMatch(match);
  if (!q) return null;
  if (SEMIFINAL_SETS.has(q)) return 'Semifinal';
  if (q === THIRD_PLACE_QUESTIONS) return 'Tercer Puesto';
  if (q === FINAL_QUESTIONS) return 'Final';
  return null;
}