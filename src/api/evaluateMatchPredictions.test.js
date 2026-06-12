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
const { evaluateMatchPredictions } = await import('./evaluateMatchPredictions.js');

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
  it('pronóstico correcto otorga 100 puntos y marca scored=true', async () => {
    _predictionRows = [
      { id: 'p1', user_email: 'jugador@test.com', match_id: 'match-1', pred_team1: 2, pred_team2: 1, scored: false, is_correct: false, points_earned: 0 },
    ];
    _adminRows = [];
    _userMap = { 'jugador@test.com': { id: 'u1', prediction_points: 0, total_points: 0 } };

    const resultado = await evaluateMatchPredictions('match-1', 2, 1);

    expect(resultado.evaluated).toBe(1);
    expect(resultado.correct).toBe(1);

    // Debe haber upserteado la predicción con scored=true y points_earned=100
    const upserteado = _upsertedPredictions.find(p => p.id === 'p1');
    expect(upserteado).toBeDefined();
    expect(upserteado.scored).toBe(true);
    expect(upserteado.points_earned).toBe(100);
    expect(upserteado.is_correct).toBe(true);

    // Debe haber recalculado puntos del usuario a 100
    const updates = _updatedUsers['u1'];
    expect(updates).toBeDefined();
    expect(updates.prediction_points).toBe(100);
    expect(updates.total_points).toBe(100);
  });

  it('re-ejecutar sobre scored=true no duplica puntos (idempotencia)', async () => {
    // Predicción ya evaluada previamente con 100 puntos
    _predictionRows = [
      { id: 'p2', user_email: 'jugador@test.com', match_id: 'match-1', pred_team1: 2, pred_team2: 1, scored: true, is_correct: true, points_earned: 100 },
    ];
    _adminRows = [];
    // El usuario ya tiene los 100 puntos del primer ciclo
    _userMap = { 'jugador@test.com': { id: 'u2', prediction_points: 100, total_points: 100 } };

    const resultado = await evaluateMatchPredictions('match-1', 2, 1);

    expect(resultado.evaluated).toBe(1);
    expect(resultado.correct).toBe(1);

    // Debe recalcular a 100 (no duplicar a 200)
    const updates = _updatedUsers['u2'];
    expect(updates).toBeDefined();
    expect(updates.prediction_points).toBe(100);
    expect(updates.total_points).toBe(100);
  });

  it('los admins se excluyen del cálculo', async () => {
    _predictionRows = [
      { id: 'p3', user_email: 'admin@test.com', match_id: 'match-1', pred_team1: 1, pred_team2: 0, scored: false, is_correct: false, points_earned: 0 },
    ];
    _adminRows = [{ email: 'admin@test.com' }];
    _userMap = { 'admin@test.com': { id: 'u3', prediction_points: 0, total_points: 0 } };

    const resultado = await evaluateMatchPredictions('match-1', 1, 0);

    // El admin es excluido → evaluated=0
    expect(resultado.evaluated).toBe(0);
    expect(resultado.correct).toBe(0);
    // No se actualiza ningún usuario
    expect(Object.keys(_updatedUsers)).toHaveLength(0);
  });

  it('pronóstico incorrecto no suma puntos', async () => {
    _predictionRows = [
      { id: 'p4', user_email: 'jugador2@test.com', match_id: 'match-1', pred_team1: 0, pred_team2: 0, scored: false, is_correct: false, points_earned: 0 },
    ];
    _adminRows = [];
    _userMap = { 'jugador2@test.com': { id: 'u4', prediction_points: 0, total_points: 0 } };

    const resultado = await evaluateMatchPredictions('match-1', 3, 1);

    expect(resultado.evaluated).toBe(1);
    expect(resultado.correct).toBe(0);

    // Predicción marcada scored=true pero con 0 puntos
    const upserteado = _upsertedPredictions.find(p => p.id === 'p4');
    expect(upserteado.scored).toBe(true);
    expect(upserteado.points_earned).toBe(0);

    // Se recalcula el usuario pero con 0 puntos (no acertó)
    const updates = _updatedUsers['u4'];
    expect(updates).toBeDefined();
    expect(updates.prediction_points).toBe(0);
    expect(updates.total_points).toBe(0);
  });
});
