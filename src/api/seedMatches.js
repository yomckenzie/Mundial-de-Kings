// Seed de 104 partidos del Mundial 2026
// Horario: Panamá (UTC-5) — mismo que Perú
// Los partidos de fase eliminatoria usan nombres descriptivos como "2° Grupo A" que se actualizarán
// cuando se conecte la API. fixture_id = 1..104 para hacer match con la API.

const SEED_MATCHES = [
  // ═══════════════════════════════════════════════════════════════════
  // FASE DE GRUPOS (fixture_id 1-72)
  // ═══════════════════════════════════════════════════════════════════

  // ── Grupo A: México, Sudáfrica, Rep. Corea, Rep. Checa ──
  { fixture_id: 1,  team1: 'México',            team2: 'Sudáfrica',           match_date: '2026-06-11', match_time: '14:00', group_stage: 'Grupo A', status: 'pending' },
  { fixture_id: 2,  team1: 'República de Corea', team2: 'República Checa',   match_date: '2026-06-11', match_time: '21:00', group_stage: 'Grupo A', status: 'pending' },
  { fixture_id: 3,  team1: 'República Checa',   team2: 'Sudáfrica',           match_date: '2026-06-18', match_time: '11:00', group_stage: 'Grupo A', status: 'pending' },
  { fixture_id: 4,  team1: 'México',            team2: 'República de Corea',  match_date: '2026-06-18', match_time: '20:00', group_stage: 'Grupo A', status: 'pending' },
  { fixture_id: 5,  team1: 'República Checa',   team2: 'México',              match_date: '2026-06-24', match_time: '20:00', group_stage: 'Grupo A', status: 'pending' },
  { fixture_id: 6,  team1: 'Sudáfrica',         team2: 'República de Corea',  match_date: '2026-06-24', match_time: '20:00', group_stage: 'Grupo A', status: 'pending' },

  // ── Grupo B: Canadá, Bosnia, Catar, Suiza ──
  { fixture_id: 7,  team1: 'Canadá',            team2: 'Bosnia',              match_date: '2026-06-12', match_time: '14:00', group_stage: 'Grupo B', status: 'pending' },
  { fixture_id: 8,  team1: 'Catar',             team2: 'Suiza',               match_date: '2026-06-13', match_time: '14:00', group_stage: 'Grupo B', status: 'pending' },
  { fixture_id: 9,  team1: 'Suiza',             team2: 'Bosnia',              match_date: '2026-06-18', match_time: '14:00', group_stage: 'Grupo B', status: 'pending' },
  { fixture_id: 10, team1: 'Canadá',            team2: 'Catar',               match_date: '2026-06-18', match_time: '17:00', group_stage: 'Grupo B', status: 'pending' },
  { fixture_id: 11, team1: 'Suiza',             team2: 'Canadá',              match_date: '2026-06-24', match_time: '14:00', group_stage: 'Grupo B', status: 'pending' },
  { fixture_id: 12, team1: 'Bosnia',            team2: 'Catar',               match_date: '2026-06-24', match_time: '14:00', group_stage: 'Grupo B', status: 'pending' },

  // ── Grupo C: Brasil, Marruecos, Haití, Escocia ──
  { fixture_id: 13, team1: 'Brasil',            team2: 'Marruecos',           match_date: '2026-06-13', match_time: '17:00', group_stage: 'Grupo C', status: 'pending' },
  { fixture_id: 14, team1: 'Haití',             team2: 'Escocia',             match_date: '2026-06-13', match_time: '20:00', group_stage: 'Grupo C', status: 'pending' },
  { fixture_id: 15, team1: 'Escocia',           team2: 'Marruecos',           match_date: '2026-06-19', match_time: '17:00', group_stage: 'Grupo C', status: 'pending' },
  { fixture_id: 16, team1: 'Brasil',            team2: 'Haití',               match_date: '2026-06-19', match_time: '20:00', group_stage: 'Grupo C', status: 'pending' },
  { fixture_id: 17, team1: 'Brasil',            team2: 'Escocia',             match_date: '2026-06-24', match_time: '17:00', group_stage: 'Grupo C', status: 'pending' },
  { fixture_id: 18, team1: 'Marruecos',         team2: 'Haití',               match_date: '2026-06-24', match_time: '17:00', group_stage: 'Grupo C', status: 'pending' },

  // ── Grupo D: Estados Unidos, Paraguay, Australia, Turquía ──
  { fixture_id: 19, team1: 'Estados Unidos',    team2: 'Paraguay',            match_date: '2026-06-12', match_time: '20:00', group_stage: 'Grupo D', status: 'pending' },
  { fixture_id: 20, team1: 'Australia',         team2: 'Turquía',             match_date: '2026-06-12', match_time: '23:00', group_stage: 'Grupo D', status: 'pending' },
  { fixture_id: 21, team1: 'Turquía',           team2: 'Paraguay',            match_date: '2026-06-18', match_time: '23:00', group_stage: 'Grupo D', status: 'pending' },
  { fixture_id: 22, team1: 'Estados Unidos',    team2: 'Australia',           match_date: '2026-06-19', match_time: '14:00', group_stage: 'Grupo D', status: 'pending' },
  { fixture_id: 23, team1: 'Turquía',           team2: 'Estados Unidos',      match_date: '2026-06-25', match_time: '21:00', group_stage: 'Grupo D', status: 'pending' },
  { fixture_id: 24, team1: 'Paraguay',          team2: 'Australia',           match_date: '2026-06-25', match_time: '21:00', group_stage: 'Grupo D', status: 'pending' },

  // ── Grupo E: Alemania, Curazao, Costa de Marfil, Ecuador ──
  { fixture_id: 25, team1: 'Alemania',          team2: 'Curazao',             match_date: '2026-06-14', match_time: '12:00', group_stage: 'Grupo E', status: 'pending' },
  { fixture_id: 26, team1: 'Costa de Marfil',   team2: 'Ecuador',             match_date: '2026-06-14', match_time: '18:00', group_stage: 'Grupo E', status: 'pending' },
  { fixture_id: 27, team1: 'Alemania',          team2: 'Costa de Marfil',     match_date: '2026-06-20', match_time: '15:00', group_stage: 'Grupo E', status: 'pending' },
  { fixture_id: 28, team1: 'Ecuador',           team2: 'Curazao',             match_date: '2026-06-20', match_time: '19:00', group_stage: 'Grupo E', status: 'pending' },
  { fixture_id: 29, team1: 'Curazao',           team2: 'Costa de Marfil',     match_date: '2026-06-25', match_time: '15:00', group_stage: 'Grupo E', status: 'pending' },
  { fixture_id: 30, team1: 'Ecuador',           team2: 'Alemania',            match_date: '2026-06-25', match_time: '15:00', group_stage: 'Grupo E', status: 'pending' },

  // ── Grupo F: Países Bajos, Japón, Suecia, Túnez ──
  { fixture_id: 31, team1: 'Países Bajos',      team2: 'Japón',               match_date: '2026-06-14', match_time: '15:00', group_stage: 'Grupo F', status: 'pending' },
  { fixture_id: 32, team1: 'Suecia',            team2: 'Túnez',               match_date: '2026-06-14', match_time: '21:00', group_stage: 'Grupo F', status: 'pending' },
  { fixture_id: 33, team1: 'Túnez',             team2: 'Japón',               match_date: '2026-06-19', match_time: '23:00', group_stage: 'Grupo F', status: 'pending' },
  { fixture_id: 34, team1: 'Países Bajos',      team2: 'Suecia',              match_date: '2026-06-20', match_time: '12:00', group_stage: 'Grupo F', status: 'pending' },
  { fixture_id: 35, team1: 'Japón',             team2: 'Suecia',              match_date: '2026-06-25', match_time: '18:00', group_stage: 'Grupo F', status: 'pending' },
  { fixture_id: 36, team1: 'Túnez',             team2: 'Países Bajos',        match_date: '2026-06-25', match_time: '18:00', group_stage: 'Grupo F', status: 'pending' },

  // ── Grupo G: Bélgica, Egipto, Irán, Nueva Zelanda ──
  { fixture_id: 37, team1: 'Bélgica',           team2: 'Egipto',              match_date: '2026-06-15', match_time: '14:00', group_stage: 'Grupo G', status: 'pending' },
  { fixture_id: 38, team1: 'Irán',              team2: 'Nueva Zelanda',       match_date: '2026-06-15', match_time: '20:00', group_stage: 'Grupo G', status: 'pending' },
  { fixture_id: 39, team1: 'Bélgica',           team2: 'Irán',                match_date: '2026-06-21', match_time: '14:00', group_stage: 'Grupo G', status: 'pending' },
  { fixture_id: 40, team1: 'Nueva Zelanda',     team2: 'Egipto',              match_date: '2026-06-21', match_time: '20:00', group_stage: 'Grupo G', status: 'pending' },
  { fixture_id: 41, team1: 'Egipto',            team2: 'Irán',                match_date: '2026-06-26', match_time: '22:00', group_stage: 'Grupo G', status: 'pending' },
  { fixture_id: 42, team1: 'Nueva Zelanda',     team2: 'Bélgica',             match_date: '2026-06-26', match_time: '22:00', group_stage: 'Grupo G', status: 'pending' },

  // ── Grupo H: España, Cabo Verde, Arabia Saudí, Uruguay ──
  { fixture_id: 43, team1: 'España',            team2: 'Cabo Verde',          match_date: '2026-06-15', match_time: '11:00', group_stage: 'Grupo H', status: 'pending' },
  { fixture_id: 44, team1: 'Arabia Saudí',      team2: 'Uruguay',             match_date: '2026-06-15', match_time: '17:00', group_stage: 'Grupo H', status: 'pending' },
  { fixture_id: 45, team1: 'España',            team2: 'Arabia Saudí',        match_date: '2026-06-21', match_time: '11:00', group_stage: 'Grupo H', status: 'pending' },
  { fixture_id: 46, team1: 'Uruguay',           team2: 'Cabo Verde',          match_date: '2026-06-21', match_time: '17:00', group_stage: 'Grupo H', status: 'pending' },
  { fixture_id: 47, team1: 'Cabo Verde',        team2: 'Arabia Saudí',        match_date: '2026-06-26', match_time: '19:00', group_stage: 'Grupo H', status: 'pending' },
  { fixture_id: 48, team1: 'Uruguay',           team2: 'España',              match_date: '2026-06-26', match_time: '19:00', group_stage: 'Grupo H', status: 'pending' },

  // ── Grupo I: Francia, Senegal, Irak, Noruega ──
  { fixture_id: 49, team1: 'Francia',           team2: 'Senegal',             match_date: '2026-06-16', match_time: '14:00', group_stage: 'Grupo I', status: 'pending' },
  { fixture_id: 50, team1: 'Irak',              team2: 'Noruega',             match_date: '2026-06-16', match_time: '17:00', group_stage: 'Grupo I', status: 'pending' },
  { fixture_id: 51, team1: 'Francia',           team2: 'Irak',                match_date: '2026-06-22', match_time: '16:00', group_stage: 'Grupo I', status: 'pending' },
  { fixture_id: 52, team1: 'Noruega',           team2: 'Senegal',             match_date: '2026-06-22', match_time: '19:00', group_stage: 'Grupo I', status: 'pending' },
  { fixture_id: 53, team1: 'Noruega',           team2: 'Francia',             match_date: '2026-06-26', match_time: '14:00', group_stage: 'Grupo I', status: 'pending' },
  { fixture_id: 54, team1: 'Senegal',           team2: 'Irak',                match_date: '2026-06-26', match_time: '14:00', group_stage: 'Grupo I', status: 'pending' },

  // ── Grupo J: Austria, Jordania, Argentina, Argelia ──
  { fixture_id: 55, team1: 'Austria',           team2: 'Jordania',            match_date: '2026-06-15', match_time: '23:00', group_stage: 'Grupo J', status: 'pending' },
  { fixture_id: 56, team1: 'Argentina',         team2: 'Argelia',             match_date: '2026-06-16', match_time: '20:00', group_stage: 'Grupo J', status: 'pending' },
  { fixture_id: 57, team1: 'Argentina',         team2: 'Austria',             match_date: '2026-06-22', match_time: '12:00', group_stage: 'Grupo J', status: 'pending' },
  { fixture_id: 58, team1: 'Jordania',          team2: 'Argelia',             match_date: '2026-06-22', match_time: '22:00', group_stage: 'Grupo J', status: 'pending' },
  { fixture_id: 59, team1: 'Argelia',           team2: 'Austria',             match_date: '2026-06-27', match_time: '21:00', group_stage: 'Grupo J', status: 'pending' },
  { fixture_id: 60, team1: 'Jordania',          team2: 'Argentina',           match_date: '2026-06-27', match_time: '21:00', group_stage: 'Grupo J', status: 'pending' },

  // ── Grupo K: Portugal, RD Congo, Uzbekistán, Colombia ──
  { fixture_id: 61, team1: 'Portugal',          team2: 'RD Congo',            match_date: '2026-06-17', match_time: '12:00', group_stage: 'Grupo K', status: 'pending' },
  { fixture_id: 62, team1: 'Uzbekistán',        team2: 'Colombia',            match_date: '2026-06-17', match_time: '21:00', group_stage: 'Grupo K', status: 'pending' },
  { fixture_id: 63, team1: 'Portugal',          team2: 'Uzbekistán',          match_date: '2026-06-23', match_time: '12:00', group_stage: 'Grupo K', status: 'pending' },
  { fixture_id: 64, team1: 'Colombia',          team2: 'RD Congo',            match_date: '2026-06-23', match_time: '21:00', group_stage: 'Grupo K', status: 'pending' },
  { fixture_id: 65, team1: 'Colombia',          team2: 'Portugal',            match_date: '2026-06-27', match_time: '18:30', group_stage: 'Grupo K', status: 'pending' },
  { fixture_id: 66, team1: 'RD Congo',          team2: 'Uzbekistán',          match_date: '2026-06-27', match_time: '18:30', group_stage: 'Grupo K', status: 'pending' },

  // ── Grupo L: Inglaterra, Croacia, Ghana, Panamá ──
  { fixture_id: 67, team1: 'Inglaterra',        team2: 'Croacia',             match_date: '2026-06-17', match_time: '15:00', group_stage: 'Grupo L', status: 'pending' },
  { fixture_id: 68, team1: 'Ghana',             team2: 'Panamá',              match_date: '2026-06-17', match_time: '18:00', group_stage: 'Grupo L', status: 'pending' },
  { fixture_id: 69, team1: 'Inglaterra',        team2: 'Ghana',               match_date: '2026-06-23', match_time: '15:00', group_stage: 'Grupo L', status: 'pending' },
  { fixture_id: 70, team1: 'Panamá',            team2: 'Croacia',             match_date: '2026-06-23', match_time: '18:00', group_stage: 'Grupo L', status: 'pending' },
  { fixture_id: 71, team1: 'Panamá',            team2: 'Inglaterra',          match_date: '2026-06-27', match_time: '16:00', group_stage: 'Grupo L', status: 'pending' },
  { fixture_id: 72, team1: 'Croacia',           team2: 'Ghana',               match_date: '2026-06-27', match_time: '16:00', group_stage: 'Grupo L', status: 'pending' },

  // ═══════════════════════════════════════════════════════════════════
  // DIECISÉISAVOS DE FINAL (fixture_id 73-88)
  // Los equipos se actualizarán cuando la API esté conectada
  // ═══════════════════════════════════════════════════════════════════
  { fixture_id: 73, team1: '2° Grupo A',               team2: '2° Grupo B',             match_date: '2026-06-28', match_time: '14:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 74, team1: '1° Grupo E',               team2: '3° Grupo A/B/C/D/F',     match_date: '2026-06-29', match_time: '12:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 75, team1: '1° Grupo F',               team2: '2° Grupo C',             match_date: '2026-06-29', match_time: '15:30', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 76, team1: '1° Grupo C',               team2: '2° Grupo F',             match_date: '2026-06-29', match_time: '20:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 77, team1: '1° Grupo I',               team2: '3° Grupo C/D/F/G/H',     match_date: '2026-06-30', match_time: '12:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 78, team1: '2° Grupo E',               team2: '2° Grupo I',             match_date: '2026-06-30', match_time: '16:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 79, team1: '1° Grupo A',               team2: '3° Grupo C/E/F/H/I',     match_date: '2026-06-30', match_time: '20:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 80, team1: '1° Grupo L',               team2: '3° Grupo E/H/I/J/K',     match_date: '2026-07-01', match_time: '11:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 81, team1: '1° Grupo D',               team2: '3° Grupo B/E/F/I/J',     match_date: '2026-07-01', match_time: '15:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 82, team1: '1° Grupo G',               team2: '3° Grupo A/E/H/I/J',     match_date: '2026-07-01', match_time: '19:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 83, team1: '2° Grupo K',               team2: '2° Grupo L',             match_date: '2026-07-02', match_time: '14:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 84, team1: '1° Grupo H',               team2: '2° Grupo J',             match_date: '2026-07-02', match_time: '18:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 85, team1: '1° Grupo B',               team2: '3° Grupo E/F/G/I/J',     match_date: '2026-07-02', match_time: '20:30', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 86, team1: '1° Grupo J',               team2: '2° Grupo H',             match_date: '2026-07-02', match_time: '22:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 87, team1: '1° Grupo K',               team2: '3° Grupo D/E/I/J/L',     match_date: '2026-07-03', match_time: '13:00', group_stage: 'Dieciseisavos', status: 'pending' },
  { fixture_id: 88, team1: '2° Grupo D',               team2: '2° Grupo G',             match_date: '2026-07-03', match_time: '17:00', group_stage: 'Dieciseisavos', status: 'pending' },

  // ═══════════════════════════════════════════════════════════════════
  // OCTAVOS DE FINAL (fixture_id 89-96)
  // ═══════════════════════════════════════════════════════════════════
  { fixture_id: 89, team1: 'Ganador 74',      team2: 'Ganador 77',      match_date: '2026-07-04', match_time: '12:00', group_stage: 'Octavos', status: 'pending' },
  { fixture_id: 90, team1: 'Ganador 73',      team2: 'Ganador 75',      match_date: '2026-07-04', match_time: '16:00', group_stage: 'Octavos', status: 'pending' },
  { fixture_id: 91, team1: 'Ganador 76',      team2: 'Ganador 78',      match_date: '2026-07-05', match_time: '15:00', group_stage: 'Octavos', status: 'pending' },
  { fixture_id: 92, team1: 'Ganador 79',      team2: 'Ganador 80',      match_date: '2026-07-05', match_time: '19:00', group_stage: 'Octavos', status: 'pending' },
  { fixture_id: 93, team1: 'Ganador 83',      team2: 'Ganador 84',      match_date: '2026-07-06', match_time: '14:00', group_stage: 'Octavos', status: 'pending' },
  { fixture_id: 94, team1: 'Ganador 81',      team2: 'Ganador 82',      match_date: '2026-07-06', match_time: '19:00', group_stage: 'Octavos', status: 'pending' },
  { fixture_id: 95, team1: 'Ganador 86',      team2: 'Ganador 88',      match_date: '2026-07-07', match_time: '11:00', group_stage: 'Octavos', status: 'pending' },
  { fixture_id: 96, team1: 'Ganador 85',      team2: 'Ganador 87',      match_date: '2026-07-07', match_time: '15:00', group_stage: 'Octavos', status: 'pending' },

  // ═══════════════════════════════════════════════════════════════════
  // CUARTOS DE FINAL (fixture_id 97-100)
  // ═══════════════════════════════════════════════════════════════════
  { fixture_id: 97,  team1: 'Ganador 89',  team2: 'Ganador 90',  match_date: '2026-07-09', match_time: '15:00', group_stage: 'Cuartos', status: 'pending' },
  { fixture_id: 98,  team1: 'Ganador 93',  team2: 'Ganador 94',  match_date: '2026-07-10', match_time: '14:00', group_stage: 'Cuartos', status: 'pending' },
  { fixture_id: 99,  team1: 'Ganador 91',  team2: 'Ganador 92',  match_date: '2026-07-11', match_time: '16:00', group_stage: 'Cuartos', status: 'pending' },
  { fixture_id: 100, team1: 'Ganador 95',  team2: 'Ganador 96',  match_date: '2026-07-11', match_time: '20:00', group_stage: 'Cuartos', status: 'pending' },

  // ═══════════════════════════════════════════════════════════════════
  // SEMIFINALES (fixture_id 101-102)
  // ═══════════════════════════════════════════════════════════════════
  { fixture_id: 101, team1: 'Ganador 97',  team2: 'Ganador 98',  match_date: '2026-07-14', match_time: '14:00', group_stage: 'Semifinal', status: 'pending' },
  { fixture_id: 102, team1: 'Ganador 99',  team2: 'Ganador 100', match_date: '2026-07-15', match_time: '14:00', group_stage: 'Semifinal', status: 'pending' },

  // ═══════════════════════════════════════════════════════════════════
  // TERCER PUESTO (fixture_id 103)
  // ═══════════════════════════════════════════════════════════════════
  { fixture_id: 103, team1: 'Perdedor 101', team2: 'Perdedor 102', match_date: '2026-07-18', match_time: '16:00', group_stage: 'Tercer Puesto', status: 'pending' },

  // ═══════════════════════════════════════════════════════════════════
  // FINAL (fixture_id 104)
  // ═══════════════════════════════════════════════════════════════════
  { fixture_id: 104, team1: 'Ganador 101',  team2: 'Ganador 102',  match_date: '2026-07-19', match_time: '14:00', group_stage: 'Final', status: 'pending' },
];

export async function seedAllMatches(api) {
  // Limpia partidos existentes y luego inserta los 104
  await api.entities.Match.clearAll();
  const created = await api.entities.Match.bulkCreate(SEED_MATCHES);
  return created;
}

export default SEED_MATCHES;
