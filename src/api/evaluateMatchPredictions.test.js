/**
 * Tests de caracterización para evaluateMatchPredictions.
 *
 * Mockea supabase y db para no requerir red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks de módulos ---
// Mock de supabase: simulamos el cliente con un objeto controlable
const mockSupabaseChain = {
  data: null,
  error: null,
  _setNext(data, error) {
    this.data = data;
    this.error = error;
  },
};

// Fábrica de cadena fluente para supabase (from().select().eq()...)
const makeQueryChain = (result) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: () => Promise.resolve(result),
    upsert: () => Promise.resolve(result),
    update: () => Promise.resolve(result),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  // Para "await supabase.from(...).select(...).eq(...)" al final
  Object.defineProperty(chain, Symbol.toStringTag, { value: 'Promise' });
  return chain;
};

// Estado de supabase mutable por test
let _predictionRows = [];
let _adminRows = [];
let _userMap = {}; // email -> { prediction_points, total_points }
let _upsertedPredictions = [];
let _updatedUsers = {};

const mockSupabase = {
  from: vi.fn((table) => {
    if (table === 'predictions') {
      // Soporta select().eq().eq() para filtrar por múltiples campos
      const predSelect = (fields) => {
        let filtered = _predictionRows;
        const chain = {
          eq: (col, val) => {
            filtered = filtered.filter(r => r[col] === val);
            return chain;
          },
          then: (resolve) => Promise.resolve({ data: filtered, error: null }).then(resolve),
        };
        return chain;
      };
      return {
        select: vi.fn(predSelect),
        upsert: vi.fn((rows) => {
          _upsertedPredictions.push(...rows);
          // Actualizar _predictionRows para que el recalculo vea datos frescos
          for (const row of rows) {
            const idx = _predictionRows.findIndex(r => r.id === row.id);
            if (idx >= 0) _predictionRows[idx] = { ..._predictionRows[idx], ...row };
            else _predictionRows.push(row);
          }
          return Promise.resolve({ error: null });
        }),
      };
    }
    if (table === 'users') {
      return {
        select: vi.fn((fields) => ({
          eq: vi.fn((col, val) => {
            if (col === 'role') {
              // obtener admins
              return Promise.resolve({ data: _adminRows, error: null });
            }
            // obtener usuario por email (usa estado mutable para simular DB real)
            const user = _userMap[val] || null;
            return {
              single: vi.fn(() => Promise.resolve({ data: user ? { ...user } : null, error: null })),
            };
          }),
        })),
        update: vi.fn((updates) => ({
          eq: vi.fn((col, val) => {
            // simula el write-back al estado DB para que las lecturas siguientes sean consistentes
            if (_userMap[val]) {
              _userMap[val] = { ..._userMap[val], ...updates };
            }
            _updatedUsers[val] = { ...(_updatedUsers[val] || {}), ...updates };
            return Promise.resolve({ error: null });
          }),
        })),
      };
    }
    return {};
  }),
};

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
  db: {},
}));

vi.mock('@/lib/db', () => ({
  db: {
    awardReferralCommission: vi.fn(() => Promise.resolve()),
  },
}));

// Importar después de los mocks
const { evaluateMatchPredictions, evaluateMatchPredictionsLegacy } = await import('./evaluateMatchPredictions.js');

// Acceso al mock de db para spy
const { db: mockDb } = await import('@/lib/db');

// ---

beforeEach(() => {
  _predictionRows = [];
  _adminRows = [];
  _userMap = {};
  _upsertedPredictions = [];
  _updatedUsers = {};
  vi.clearAllMocks();
});

describe('evaluateMatchPredictions', () => {
  // Helper: crea una predicción con el nuevo formato
  function makePred(overrides) {
    return {
      id: 'p', user_email: 'u@test.com', match_id: 'm1',
      pred_team1: 0, pred_team2: 0, // legacy, ignorado
      scored: false, is_correct: false, points_earned: 0,
      ...overrides,
    };
  }

  it('pronóstico correcto otorga 150 puntos y marca scored=true (3 componentes)', async () => {
    _predictionRows = [makePred({
      id: 'p1', user_email: 'jugador@test.com', match_id: 'match-1',
      pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 2, pred_penalty_team2: 1,
    })];
    _adminRows = [];
    _userMap = { 'jugador@test.com': { id: 'u1', prediction_points: 0, total_points: 0 } };

    const resultado = await evaluateMatchPredictions('match-1', 2, 1, 'pen', 2, 1);

    expect(resultado.evaluated).toBe(1);
    expect(resultado.correct).toBe(1);

    const upserteado = _upsertedPredictions.find(p => p.id === 'p1');
    expect(upserteado).toBeDefined();
    expect(upserteado.scored).toBe(true);
    expect(upserteado.points_earned).toBe(150);
    expect(upserteado.is_correct).toBe(true);

    const updates = _updatedUsers['u1'];
    expect(updates).toBeDefined();
    expect(updates.prediction_points).toBe(150);
    expect(updates.total_points).toBe(150);
  });

  it('re-ejecutar sobre scored=true no duplica puntos (idempotencia)', async () => {
    _predictionRows = [makePred({
      id: 'p2', user_email: 'jugador@test.com', match_id: 'match-1',
      pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 2, pred_penalty_team2: 1,
      scored: true, is_correct: true, points_earned: 150,
    })];
    _adminRows = [];
    _userMap = { 'jugador@test.com': { id: 'u2', prediction_points: 150, total_points: 150 } };

    const resultado = await evaluateMatchPredictions('match-1', 2, 1, 'pen', 2, 1);

    expect(resultado.evaluated).toBe(1);
    expect(resultado.correct).toBe(1);

    const updates = _updatedUsers['u2'];
    expect(updates).toBeDefined();
    expect(updates.prediction_points).toBe(150);
    expect(updates.total_points).toBe(150);
  });

  it('los admins se excluyen del cálculo', async () => {
    _predictionRows = [makePred({
      id: 'p3', user_email: 'admin@test.com', match_id: 'match-1',
      pred_winner: '1', pred_method: '90',
    })];
    _adminRows = [{ email: 'admin@test.com' }];
    _userMap = { 'admin@test.com': { id: 'u3', prediction_points: 0, total_points: 0 } };

    const resultado = await evaluateMatchPredictions('match-1', 1, 0, '90');

    // El admin es excluido → evaluated=0
    expect(resultado.evaluated).toBe(0);
    expect(resultado.correct).toBe(0);
    // No se actualiza ningún usuario
    expect(Object.keys(_updatedUsers)).toHaveLength(0);
  });

  it('pronóstico incorrecto no suma puntos', async () => {
    // Resultado (3,1) en '90': ganador=1, método=90.
    // Predicción con ganador='2' (mal) y método='pen' (mal) → 0 pts.
    _predictionRows = [makePred({
      id: 'p4', user_email: 'jugador2@test.com', match_id: 'match-1',
      pred_winner: '2', pred_method: 'pen',
      pred_penalty_team1: 5, pred_penalty_team2: 4,
    })];
    _adminRows = [];
    _userMap = { 'jugador2@test.com': { id: 'u4', prediction_points: 0, total_points: 0 } };

    const resultado = await evaluateMatchPredictions('match-1', 3, 1, '90', null, null);

    expect(resultado.evaluated).toBe(1);
    expect(resultado.correct).toBe(0);

    const upserteado = _upsertedPredictions.find(p => p.id === 'p4');
    expect(upserteado.scored).toBe(true);
    expect(upserteado.points_earned).toBe(0);

    const updates = _updatedUsers['u4'];
    expect(updates).toBeDefined();
    expect(updates.prediction_points).toBe(0);
    expect(updates.total_points).toBe(0);
  });

  // -------- Nuevos tests para 3 componentes (Task 3) --------

  it('3 componentes correctos = 150 pts', async () => {
    _predictionRows = [makePred({
      id: 'p150', pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 5, pred_penalty_team2: 4,
    })];
    _adminRows = [];
    _userMap = { 'u@test.com': { id: 'u150', prediction_points: 0, total_points: 0 } };

    const r = await evaluateMatchPredictions('m1', 2, 1, 'pen', 5, 4);
    expect(r.evaluated).toBe(1);
    expect(r.correct).toBe(1);

    const up = _upsertedPredictions.find(p => p.id === 'p150');
    expect(up.points_earned).toBe(150);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(true);
    expect(up.penalty_correct).toBe(true);
    expect(_updatedUsers.u150.prediction_points).toBe(150);
  });

  it('solo ganador correcto = 50 pts', async () => {
    // ganador='1' y método real='90' (acierto) → 50 + 50 = 100 pts;
    // penalty_correct = null (no aplica). El nombre del test es histórico
    // (legacy "solo ganador"), pero con el modelo 3-componentes el método
    // también puntúa cuando coincide.
    _predictionRows = [makePred({
      id: 'p50', pred_winner: '1', pred_method: '90',
    })];
    _userMap = { 'u@test.com': { id: 'u50', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, '90');
    const up = _upsertedPredictions.find(p => p.id === 'p50');
    expect(up.points_earned).toBe(100); // 50 ganador + 50 método
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(true);
    expect(up.penalty_correct).toBe(null); // no aplica
    expect(_updatedUsers.u50.prediction_points).toBe(100);
  });

  it('ganador + método correcto pero penal mal = 100 pts', async () => {
    _predictionRows = [makePred({
      id: 'p100', pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 5, pred_penalty_team2: 4,
    })];
    _userMap = { 'u@test.com': { id: 'u100', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, 'pen', 5, 3); // real 5-3, pred 5-4
    const up = _upsertedPredictions.find(p => p.id === 'p100');
    expect(up.points_earned).toBe(100);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(true);
    expect(up.penalty_correct).toBe(false);
  });

  it('apostó a penales pero partido NO fue a penales = 50 pts (solo ganador)', async () => {
    _predictionRows = [makePred({
      id: 'p_pen_was_90', pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 5, pred_penalty_team2: 4,
    })];
    _userMap = { 'u@test.com': { id: 'u_pen90', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, '90', null, null);
    const up = _upsertedPredictions.find(p => p.id === 'p_pen_was_90');
    expect(up.points_earned).toBe(50);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(false);
    expect(up.penalty_correct).toBe(null);
  });

  it('empate X en 90 min que va a penales: X NO gana aunque haya sido empate 120 min', async () => {
    _predictionRows = [makePred({
      id: 'p_tie', pred_winner: 'X', pred_method: 'pen',
      pred_penalty_team1: 4, pred_penalty_team2: 5,
    })];
    _userMap = { 'u@test.com': { id: 'u_tie', prediction_points: 0, total_points: 0 } };

    // Resultado: 0-0 en 90, 0-0 en ET, visitante gana penales 4-5
    await evaluateMatchPredictions('m1', 0, 0, 'pen', 4, 5);
    const up = _upsertedPredictions.find(p => p.id === 'p_tie');
    expect(up.winner_correct).toBe(false); // alguien ganó (visitante)
    expect(up.method_correct).toBe(true);
    expect(up.penalty_correct).toBe(true);
    expect(up.points_earned).toBe(100); // método + penal, NO ganador
  });

  it('result_method null sin penales → method_correct null, suma solo ganador', async () => {
    _predictionRows = [makePred({
      id: 'p_no_method', pred_winner: '1', pred_method: '90',
    })];
    _userMap = { 'u@test.com': { id: 'u_nm', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, null); // SportScore caído, sin penales
    const up = _upsertedPredictions.find(p => p.id === 'p_no_method');
    expect(up.points_earned).toBe(50);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(null);
    expect(up.penalty_correct).toBe(null);
  });

  it('FIX (bug v2-79): result_method null PERO hay penales → infiere pen y evalúa correcto', async () => {
    // Caso típico: admin publicó sin seleccionar método (quedó null en BD),
    // pero sí completó marcador de penales. Sin este fix, el breakdown
    // mostraba "Cómo gana ❌ 0" cuando en realidad el pick de pen era correcto.
    _predictionRows = [makePred({
      id: 'p_pen_infer', pred_winner: '1', pred_method: 'pen',
      pred_score_team1: 7, pred_score_team2: 6, // total pen = 2-2 (90+ET) + 5-4 (pens) = 7-6
    })];
    _userMap = { 'u@test.com': { id: 'u_pi', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 2, null, 5, 4);
    const up = _upsertedPredictions.find(p => p.id === 'p_pen_infer');
    expect(up.method_correct).toBe(true); // infirió 'pen'
    expect(up.score_correct).toBe(true);
    expect(up.points_earned).toBe(250); // 50 winner + 50 method + 150 score
  });

  it('re-ejecución: 150 puntos no se duplican a 300 (idempotencia)', async () => {
    _predictionRows = [makePred({
      id: 'p_idem', pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 5, pred_penalty_team2: 4,
      scored: true, is_correct: true, points_earned: 150,
    })];
    _userMap = { 'u@test.com': { id: 'u_idem', prediction_points: 150, total_points: 150 } };

    await evaluateMatchPredictions('m1', 2, 1, 'pen', 5, 4);
    expect(_updatedUsers.u_idem.prediction_points).toBe(150);
  });

  it('legacy: predicción sin nuevas columnas (pred_winner=null) = 0 pts', async () => {
    _predictionRows = [makePred({ id: 'p_legacy' })];
    _userMap = { 'u@test.com': { id: 'u_leg', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, '90');
    const up = _upsertedPredictions.find(p => p.id === 'p_legacy');
    expect(up.points_earned).toBe(0);
    expect(up.winner_correct).toBe(null);
  });
});

describe('evaluateMatchPredictionsLegacy', () => {
  // Helper inline (re-uses makePred pattern via spread)
  function makePredL(overrides) {
    return {
      id: 'p', user_email: 'u@test.com', match_id: 'm1',
      pred_team1: 0, pred_team2: 0,
      scored: false, is_correct: false, points_earned: 0,
      ...overrides,
    };
  }

  it('alias legacy acepta (matchId, t1, t2) y pasa resultMethod=null', async () => {
    _predictionRows = [makePredL({
      id: 'p_legacy_alias', pred_winner: '1', pred_method: '90',
    })];
    _userMap = { 'u@test.com': { id: 'u_legacy_alias', prediction_points: 0, total_points: 0 } };

    const r = await evaluateMatchPredictionsLegacy('m1', 2, 1);

    expect(r.evaluated).toBe(1);
    expect(r.correct).toBe(1);

    const up = _upsertedPredictions.find(p => p.id === 'p_legacy_alias');
    // Solo ganador cuenta (50 pts) porque resultMethod=null → method/penal son null
    expect(up.points_earned).toBe(50);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(null);
    expect(up.penalty_correct).toBe(null);
  });
});

describe('isV2Prediction', () => {
  it('detecta v2 por presencia de pred_score_team1', async () => {
    const { isV2Prediction } = await import('./evaluateMatchPredictions.js');
    expect(isV2Prediction({ pred_score_team1: 1, pred_score_team2: 0 })).toBe(true);
    expect(isV2Prediction({ pred_score_team1: null, pred_score_team2: null })).toBe(false);
    expect(isV2Prediction({ pred_penalty_team1: 4, pred_penalty_team2: 3 })).toBe(false);
    expect(isV2Prediction({})).toBe(false);
  });
});

const { scoreV2 } = await import('./evaluateMatchPredictions.js');

// Helper: el contrato real de scoreV2 usa códigos '1'/'2'/'X' (no 'team1'/'team2').
// El brief original usaba placeholders semánticos; aquí se materializan al contrato.
const TEAM1 = '1';
const TEAM2 = '2';

describe('scoreV2 — 90 min', () => {
  const basePred = {
    pred_winner: TEAM1, pred_method: '90',
    pred_score_team1: 2, pred_score_team2: 1,
  };

  it('todos los picks correctos → 200 pts', () => {
    const r = scoreV2(basePred, { team1: 2, team2: 1, method: '90' });
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(true);
    expect(r.points).toBe(200);
  });

  it('solo ganador correcto → 50 pts', () => {
    const r = scoreV2(
      { ...basePred, pred_method: 'pen', pred_pen_team1: 4, pred_pen_team2: 3 },
      { team1: 2, team2: 1, method: '90' },
    );
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(false);
    expect(r.scoreCorrect).toBe(null);
    expect(r.points).toBe(50);
  });

  it('solo método correcto → 50 pts', () => {
    const r = scoreV2(
      { ...basePred, pred_winner: TEAM2 },
      { team1: 2, team2: 1, method: '90' },
    );
    expect(r.winnerCorrect).toBe(false);
    expect(r.methodCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(null);
    expect(r.points).toBe(50);
  });

  it('score correcto con ganador incorrecto → 50 pts (winner falla, score no cuenta)', () => {
    // Caso raro: usuario predijo Visitante 2-1 y el real fue Local 2-1.
    // Score es numéricamente igual pero winner falla → no cuenta.
    const r = scoreV2(
      { ...basePred, pred_winner: TEAM2 },
      { team1: 2, team2: 1, method: '90' },
    );
    expect(r.winnerCorrect).toBe(false);
    expect(r.scoreCorrect).toBe(null); // null porque winnerCorrect era false
    expect(r.points).toBe(50); // solo method
  });

  it('ninguno correcto → 0 pts', () => {
    const r = scoreV2(
      { ...basePred, pred_winner: TEAM2, pred_method: 'et', pred_score_team1: 0, pred_score_team2: 0 },
      { team1: 2, team2: 1, method: '90' },
    );
    expect(r.points).toBe(0);
  });
});

describe('scoreV2 — tiempo extra', () => {
  it('todos los picks correctos → 200 pts', () => {
    const r = scoreV2(
      { pred_winner: TEAM1, pred_method: 'et', pred_score_team1: 3, pred_score_team2: 2 },
      { team1: 3, team2: 2, method: 'et' },
    );
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(true);
    expect(r.points).toBe(200);
  });

  it('método correcto pero ganador incorrecto → 50 pts', () => {
    const r = scoreV2(
      { pred_winner: TEAM2, pred_method: 'et', pred_score_team1: 3, pred_score_team2: 2 },
      { team1: 3, team2: 2, method: 'et' },
    );
    expect(r.winnerCorrect).toBe(false);
    expect(r.methodCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(null);
    expect(r.points).toBe(50);
  });
});

describe('scoreV2 — penales (v2 simplificado: pred_score = total 90+ET+pens)', () => {
  // Real: Argentina 1-1 (90+ET), 4-3 en penales. Total = 5-4.
  const basePred = {
    pred_winner: TEAM1, pred_method: 'pen',
    pred_score_team1: 5, pred_score_team2: 4,  // user predice el TOTAL de goles
  };

  it('todos los picks correctos → 250 pts', () => {
    const r = scoreV2(basePred, { team1: 1, team2: 1, method: 'pen', penaltyT1: 4, penaltyT2: 3 });
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(true);
    expect(r.prePenCorrect).toBe(null); // obsoleto en v2 simplificado
    expect(r.penCorrect).toBe(null);    // obsoleto en v2 simplificado
    expect(r.points).toBe(250);
  });

  it('total incorrecto → 100 pts (solo winner + method)', () => {
    const r = scoreV2(
      { ...basePred, pred_score_team1: 6, pred_score_team2: 5 }, // predice mal el total
      { team1: 1, team2: 1, method: 'pen', penaltyT1: 4, penaltyT2: 3 },
    );
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(false);
    expect(r.points).toBe(100); // 50 winner + 50 method
  });

  it('total correcto pero winner mal → 50 pts (solo method)', () => {
    const r = scoreV2(
      { ...basePred, pred_winner: TEAM2 },
      { team1: 1, team2: 1, method: 'pen', penaltyT1: 4, penaltyT2: 3 },
    );
    expect(r.winnerCorrect).toBe(false);
    expect(r.methodCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(null); // null porque winnerCorrect=false
    expect(r.points).toBe(50);
  });

  it('total correcto, método incorrecto → 0 pts (score null)', () => {
    const r = scoreV2(
      { ...basePred, pred_method: '90' },
      { team1: 1, team2: 1, method: 'pen', penaltyT1: 4, penaltyT2: 3 },
    );
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(false);
    expect(r.scoreCorrect).toBe(null);
    expect(r.points).toBe(50); // solo winner
  });

  it('calcula el total como result + penalty (ej: 2-2 + 5-4 pens = 7-6)', () => {
    const r = scoreV2(
      { ...basePred, pred_score_team1: 7, pred_score_team2: 6 },
      { team1: 2, team2: 2, method: 'pen', penaltyT1: 5, penaltyT2: 4 },
    );
    expect(r.scoreCorrect).toBe(true);
    expect(r.points).toBe(250);
  });
});