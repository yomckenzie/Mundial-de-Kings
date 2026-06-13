// ─────────────────────────────────────────────────────────────────
// Traducción de nombres de selección: español (como están en nuestra
// tabla `matches`) → inglés (como los devuelve SportScore).
// El slug de SportScore NO se hardcodea: se obtiene en runtime desde
// el endpoint de standings de la competición (ver sportscore.js), así
// no se rompe si SportScore cambia un slug.
//
// Los partidos de eliminatoria usan placeholders ("Ganador 101",
// "1° Grupo A") que NO están aquí y por diseño no se auto-emparejan
// hasta que el admin escriba los equipos reales.
// ─────────────────────────────────────────────────────────────────

export const ES_TO_EN = {
  'Alemania': 'Germany',
  'Arabia Saudí': 'Saudi Arabia',
  'Argelia': 'Algeria',
  'Argentina': 'Argentina',
  'Australia': 'Australia',
  'Austria': 'Austria',
  'Bosnia': 'Bosnia & Herzegovina',
  'Brasil': 'Brazil',
  'Bélgica': 'Belgium',
  'Cabo Verde': 'Cabo Verde',
  'Canadá': 'Canada',
  'Catar': 'Qatar',
  'Colombia': 'Colombia',
  'Costa de Marfil': "Cote d'Ivoire",
  'Croacia': 'Croatia',
  'Curazao': 'Curacao',
  'Ecuador': 'Ecuador',
  'Egipto': 'Egypt',
  'Escocia': 'Scotland',
  'España': 'Spain',
  'Estados Unidos': 'USA',
  'Francia': 'France',
  'Ghana': 'Ghana',
  'Haití': 'Haiti',
  'Inglaterra': 'England',
  'Irak': 'Iraq',
  'Irán': 'IR Iran',
  'Japón': 'Japan',
  'Jordania': 'Jordan',
  'Marruecos': 'Morocco',
  'México': 'Mexico',
  'Noruega': 'Norway',
  'Nueva Zelanda': 'New Zealand',
  'Panamá': 'Panama',
  'Paraguay': 'Paraguay',
  'Países Bajos': 'Netherlands',
  'Portugal': 'Portugal',
  'RD Congo': 'Democratic Republic of the Congo',
  'República Checa': 'Czechia',
  'República de Corea': 'South Korea',
  'Senegal': 'Senegal',
  'Sudáfrica': 'South Africa',
  'Suecia': 'Sweden',
  'Suiza': 'Switzerland',
  'Turquía': 'Turkiye',
  'Túnez': 'Tunisia',
  'Uruguay': 'Uruguay',
  'Uzbekistán': 'Uzbekistan',
};

// Normaliza un nombre para comparar sin importar acentos/mayúsculas/espacios.
// "República de Corea" y "south korea" → comparables vía su forma EN.
export function normalizeTeam(name) {
  return (name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar acentos
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Devuelve el nombre en inglés normalizado para un equipo en español.
// Si no está en el mapa (placeholder de eliminatoria), intenta devolver
// el nombre normalizado directamente (por si ya está en inglés en la BD).
export function toEnglishKey(spanishName) {
  const trimmed = (spanishName || '').trim();
  const en = ES_TO_EN[trimmed];
  if (en) return normalizeTeam(en);
  // Si no está en el mapa, asumir que ya está en inglés
  // (útil si la BD tiene "USA" en lugar de "Estados Unidos")
  return normalizeTeam(trimmed);
}

// ¿Es un equipo real (mapeable) o un placeholder de eliminatoria?
export function isRealTeam(spanishName) {
  return !!ES_TO_EN[(spanishName || '').trim()];
}
