// Mapa de nombres de equipos a sus banderas (emoji) y códigos ISO para imágenes SVG
// Las imágenes se sirven desde flagcdn.com en formato SVG (vector = calidad infinita)

/* eslint-disable react-refresh/only-export-components */
// Este archivo NO contiene componentes React, solo data (TEAM_FLAGS) y helpers
// puros (getTeamFlag, getFlagImageUrl). El nombre .jsx es histórico; el rule
// "only-export-components" no aplica a archivos sin JSX. La corrección
// definitiva sería renombrar a teamFlags.js, pero implica tocar todos los imports.

const TEAM_FLAGS = {
  // Grupo A
  'México': { flag: '🇲🇽', iso: 'mx' },
  'Sudáfrica': { flag: '🇿🇦', iso: 'za' },
  'República de Corea': { flag: '🇰🇷', iso: 'kr' },
  'República Checa': { flag: '🇨🇿', iso: 'cz' },

  // Grupo B
  'Canadá': { flag: '🇨🇦', iso: 'ca' },
  'Bosnia': { flag: '🇧🇦', iso: 'ba' },
  'Catar': { flag: '🇶🇦', iso: 'qa' },
  'Suiza': { flag: '🇨🇭', iso: 'ch' },

  // Grupo C
  'Brasil': { flag: '🇧🇷', iso: 'br' },
  'Marruecos': { flag: '🇲🇦', iso: 'ma' },
  'Haití': { flag: '🇭🇹', iso: 'ht' },
  'Escocia': { flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', iso: 'gb-sct' },

  // Grupo D
  'Estados Unidos': { flag: '🇺🇸', iso: 'us' },
  'Paraguay': { flag: '🇵🇾', iso: 'py' },
  'Australia': { flag: '🇦🇺', iso: 'au' },
  'Turquía': { flag: '🇹🇷', iso: 'tr' },

  // Grupo E
  'Alemania': { flag: '🇩🇪', iso: 'de' },
  'Curazao': { flag: '🇨🇼', iso: 'cw' },
  'Costa de Marfil': { flag: '🇨🇮', iso: 'ci' },
  'Ecuador': { flag: '🇪🇨', iso: 'ec' },

  // Grupo F
  'Países Bajos': { flag: '🇳🇱', iso: 'nl' },
  'Japón': { flag: '🇯🇵', iso: 'jp' },
  'Suecia': { flag: '🇸🇪', iso: 'se' },
  'Túnez': { flag: '🇹🇳', iso: 'tn' },

  // Grupo G
  'Bélgica': { flag: '🇧🇪', iso: 'be' },
  'Egipto': { flag: '🇪🇬', iso: 'eg' },
  'Irán': { flag: '🇮🇷', iso: 'ir' },
  'Nueva Zelanda': { flag: '🇳🇿', iso: 'nz' },

  // Grupo H
  'España': { flag: '🇪🇸', iso: 'es' },
  'Cabo Verde': { flag: '🇨🇻', iso: 'cv' },
  'Arabia Saudí': { flag: '🇸🇦', iso: 'sa' },
  'Uruguay': { flag: '🇺🇾', iso: 'uy' },

  // Grupo I
  'Francia': { flag: '🇫🇷', iso: 'fr' },
  'Senegal': { flag: '🇸🇳', iso: 'sn' },
  'Irak': { flag: '🇮🇶', iso: 'iq' },
  'Noruega': { flag: '🇳🇴', iso: 'no' },

  // Grupo J
  'Austria': { flag: '🇦🇹', iso: 'at' },
  'Jordania': { flag: '🇯🇴', iso: 'jo' },
  'Argentina': { flag: '🇦🇷', iso: 'ar' },
  'Argelia': { flag: '🇩🇿', iso: 'dz' },

  // Grupo K
  'Portugal': { flag: '🇵🇹', iso: 'pt' },
  'RD Congo': { flag: '🇨🇩', iso: 'cd' },
  'Uzbekistán': { flag: '🇺🇿', iso: 'uz' },
  'Colombia': { flag: '🇨🇴', iso: 'co' },

  // Grupo L
  'Inglaterra': { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', iso: 'gb-eng' },
  'Croacia': { flag: '🇭🇷', iso: 'hr' },
  'Ghana': { flag: '🇬🇭', iso: 'gh' },
  'Panamá': { flag: '🇵🇦', iso: 'pa' },

  // Nombres alternativos (usados por APIs externas)
  'Mexico': { flag: '🇲🇽', iso: 'mx' },
  'South Korea': { flag: '🇰🇷', iso: 'kr' },
  'Korea Republic': { flag: '🇰🇷', iso: 'kr' },
  'Czech Republic': { flag: '🇨🇿', iso: 'cz' },
  'Czechia': { flag: '🇨🇿', iso: 'cz' },
  'Bosnia and Herzegovina': { flag: '🇧🇦', iso: 'ba' },
  'USA': { flag: '🇺🇸', iso: 'us' },
  'Netherlands': { flag: '🇳🇱', iso: 'nl' },
  'Ivory Coast': { flag: '🇨🇮', iso: 'ci' },
  'Côte d\'Ivoire': { flag: '🇨🇮', iso: 'ci' },
  'Saudi Arabia': { flag: '🇸🇦', iso: 'sa' },
  'New Zealand': { flag: '🇳🇿', iso: 'nz' },
  'Cape Verde': { flag: '🇨🇻', iso: 'cv' },
  'DR Congo': { flag: '🇨🇩', iso: 'cd' },
  'DRC': { flag: '🇨🇩', iso: 'cd' },
};

export { TEAM_FLAGS };

/**
 * Obtiene la bandera emoji para un nombre de equipo.
 * @param {string} teamName - Nombre del equipo
 * @returns {string|null} Bandera emoji o null si no se encuentra
 */
export function getTeamFlag(teamName) {
  if (!teamName) return null;
  const entry = TEAM_FLAGS[teamName];
  return entry ? entry.flag : null;
}

/**
 * Obtiene la URL de la bandera en formato SVG de altísima resolución
 * desde flagcdn.com. Las imágenes SVG son vectoriales y se ven perfectas
 * a cualquier tamaño.
 * @param {string} teamName - Nombre del equipo
 * @returns {string|null} URL de la imagen SVG o null si no se encuentra
 */
export function getFlagImageUrl(teamName) {
  if (!teamName) return null;
  const entry = TEAM_FLAGS[teamName];
  if (!entry) return null;
  return `https://flagcdn.com/${entry.iso}.svg`;
}

