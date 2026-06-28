/**
 * Smoke test para el escenario del usuario:
 * RD Congo vs Uzbekistán (v1, pre-28 jun). Admin publica 3-1.
 * Verifica que las predicciones v1 con marcador exacto correcto obtienen 100 pts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseChain = { data: null, error: null };
const makeQueryChain = (result) => ({
  select: () => makeQueryChain(result),
  eq: () => makeQueryChain(result),
  single: () => Promise.resolve(result),
  upsert: () => Promise.resolve(result),
  update: () => Promise.resolve(result),
  then: (resolve) => Promise.resolve(result).then(resolve),
});

let _predictionRows = [];
let _adminRows = [];
let _userMap = {};
let _upsertedPredictions = [];
let _updatedUsers = {};

const mockSupabase = {
  from: vi.fn((table) => {
    if (table === 'predictions') {
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
          for (const row of rows) {
            const idx = _predictionRows.findIndex(r => r.id === row.id);
            if (idx >= 0) _predictionRows[idx] = { ..._predictionRows[idx], ...row };
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
              return Promise.resolve({ data: _adminRows, error: null });
            }
            const user = _userMap[val] || null;
            return { single: () => Promise.resolve({ data: user, error: user ? null : 'not_found' }) };
          }),
        })),
        update: vi.fn((data) => ({
          eq: vi.fn((col, val) => {
            if (col === 'id') {
              _updatedUsers[val] = { ...(_userMap[val] || {}), ...data };
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        })),
      };
    }
    return { select: () => makeQueryChain({ data: [], error: null }) };
  }),
};

vi.mock('@/lib/supabase', () => ({ supabase: mockSupabase, db: {} }));
vi.mock('@/lib/db', () => ({
  db: { awardReferralCommission: vi.fn(() => Promise.resolve()) },
}));

const { evaluateMatchPredictions } = await import('./evaluateMatchPredictions.js');
const { db: mockDb } = await import('@/lib/db');

beforeEach(() => {
  _predictionRows = [];
  _adminRows = [];
  _userMap = {};
  _upsertedPredictions = [];
  _updatedUsers = {};
  vi.clearAllMocks();
});

describe('Escenario real: RD Congo 3-1 Uzbekistán (v1)', () => {
  it('5 usuarios con marcadores variados → solo el de 3-1 exacto suma 100 pts', async () => {
    _predictionRows = [
      { id: 'p_acert', user_email: 'acertador@test.com', match_id: 'rdc-uzb',
        pred_team1: 3, pred_team2: 1, scored: false, is_correct: false, points_earned: 0 },
      { id: 'p_mal1', user_email: 'casi@test.com', match_id: 'rdc-uzb',
        pred_team1: 2, pred_team2: 1, scored: false, is_correct: false, points_earned: 0 },
      { id: 'p_mal2', user_email: 'casi2@test.com', match_id: 'rdc-uzb',
        pred_team1: 3, pred_team2: 0, scored: false, is_correct: false, points_earned: 0 },
      { id: 'p_inv', user_email: 'invertido@test.com', match_id: 'rdc-uzb',
        pred_team1: 1, pred_team2: 3, scored: false, is_correct: false, points_earned: 0 },
      { id: 'p_emp', user_email: 'empate@test.com', match_id: 'rdc-uzb',
        pred_team1: 0, pred_team2: 0, scored: false, is_correct: false, points_earned: 0 },
    ];
    _adminRows = [];
    _userMap = {
      'acertador@test.com':  { id: 'u1', bonus_points: 0, referral_points: 0 },
      'casi@test.com':       { id: 'u2', bonus_points: 0, referral_points: 0 },
      'casi2@test.com':      { id: 'u3', bonus_points: 0, referral_points: 0 },
      'invertido@test.com':  { id: 'u4', bonus_points: 0, referral_points: 0 },
      'empate@test.com':     { id: 'u5', bonus_points: 0, referral_points: 0 },
    };

    const result = await evaluateMatchPredictions('rdc-uzb', 3, 1, null, null, null);

    // Solo 1 acertó (3-1 exacto) → 1 correcto
    expect(result.evaluated).toBe(5);
    expect(result.correct).toBe(1);

    const acert = _upsertedPredictions.find(p => p.id === 'p_acert');
    expect(acert.points_earned).toBe(100);
    expect(acert.is_correct).toBe(true);
    expect(acert.scored).toBe(true);
    expect(acert.score_correct).toBe(true);
    expect(acert.winner_correct).toBe(null);  // v1 no usa winner component
    expect(acert.method_correct).toBe(null);  // v1 no usa method component

    const mal1 = _upsertedPredictions.find(p => p.id === 'p_mal1');
    expect(mal1.points_earned).toBe(0);
    expect(mal1.is_correct).toBe(false);
    expect(mal1.score_correct).toBe(false);

    // El usuario acertador debe tener 100 pts totales
    expect(_updatedUsers.u1.prediction_points).toBe(100);
    expect(_updatedUsers.u1.total_points).toBe(100);
    // El resto debe seguir en 0
    expect(_updatedUsers.u2.prediction_points).toBe(0);
    expect(_updatedUsers.u3.prediction_points).toBe(0);
  });

  it('con 0 predicciones → no actualiza nada', async () => {
    _predictionRows = [];
    const result = await evaluateMatchPredictions('rdc-uzb', 3, 1, null, null, null);
    expect(result.evaluated).toBe(0);
    expect(result.correct).toBe(0);
    expect(_upsertedPredictions).toHaveLength(0);
  });

  it('admins se excluyen', async () => {
    _predictionRows = [
      { id: 'p_admin', user_email: 'admin@test.com', match_id: 'rdc-uzb',
        pred_team1: 3, pred_team2: 1, scored: false, is_correct: false, points_earned: 0 },
    ];
    _adminRows = [{ email: 'admin@test.com' }];
    _userMap = { 'admin@test.com': { id: 'u_admin', bonus_points: 0, referral_points: 0 } };

    const result = await evaluateMatchPredictions('rdc-uzb', 3, 1, null, null, null);
    expect(result.evaluated).toBe(0); // admin excluido
    expect(_upsertedPredictions).toHaveLength(0); // no se actualiza
  });
});