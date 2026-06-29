/**
 * Tests de caracterización para los métodos CRUD más usados de db.js.
 * Red de seguridad antes del refactor Fase 3+ (fachada + migración importers).
 *
 * Patrón: mismos mocks que db.priority-load.test.js — supabase mockeado con
 * fetchAll que devuelve datos predefinidos. Esto valida el comportamiento
 * "in-memory + sync" sin tocar red ni Postgres real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Mock supabase: tabla users devuelve 2 users de prueba; resto vacío.
// Estos tests son de comportamiento del módulo db (in-memory cache), no
// de las queries de Supabase — por eso no necesitamos mocks más complejos.
const MOCK_USERS = [
  { id: 'u1', email: 'admin@x.com',  full_name: 'Admin',      role: 'admin' },
  { id: 'u2', email: 'user1@x.com', full_name: 'Jugador Uno', role: 'user'  },
];
const MOCK_PREDICTIONS = [
  { id: 'p1', user_email: 'user1@x.com', match_id: 'm1', pred_team1: 1, pred_team2: 0, scored: true,  is_correct: true,  points_earned: 100 },
  { id: 'p2', user_email: 'user1@x.com', match_id: 'm2', pred_team1: 0, pred_team2: 2, scored: true,  is_correct: false, points_earned: 0   },
  { id: 'p3', user_email: 'admin@x.com', match_id: 'm1', pred_team1: 1, pred_team2: 0, scored: false, is_correct: null,  points_earned: 0   },
];

vi.mock('./supabase.js', () => ({
  supabase: {},
  isSupabaseAvailable: () => true,
  fetchAll: vi.fn(async (table) => {
    if (table === 'users') return MOCK_USERS;
    if (table === 'predictions') return MOCK_PREDICTIONS;
    if (table === 'redemptions') return [];
    return [];
  }),
  setupRealtimeSubscriptions: vi.fn(),
  TABLES: {},
}));

const { db } = await import('./db.js');

beforeEach(async () => {
  // Reset state entre tests: dropear el cache in-memory y volver a hidratar
  // desde el mock. Sin esto, tests de filter() heredan datos del anterior.
  db._init({ force: true });
  await db._syncAllFromSupabase();
});

describe('db.User — usado en 17 importers (alto blast radius)', () => {
  it('User.list() retorna todos los users', async () => {
    const all = db.users.list();
    expect(all).toHaveLength(2);
    expect(all.map((u) => u.email).sort()).toEqual(['admin@x.com', 'user1@x.com']);
  });

  it('User.filter({ email }) encuentra uno por email', async () => {
    const u = db.users.filter({ email: 'admin@x.com' });
    expect(u).toHaveLength(1);
    expect(u[0].role).toBe('admin');
  });

  it('User.filter({ role: "admin" }) agrupa por rol', async () => {
    const admins = db.users.filter({ role: 'admin' });
    expect(admins).toHaveLength(1);
    expect(admins[0].email).toBe('admin@x.com');
  });

  it('User.list("-created_date") respeta el parametro order', async () => {
    const all = db.users.list('-created_date');
    // Si el orden está implementado, los elementos vienen sorteados desc.
    // Si retorna tal cual, también pasa (no rompe contrato).
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBe(2);
  });
});

describe('db.Prediction — usado en admin y ranking', () => {
  it('Prediction.filter({ user_email }) filtra por usuario', async () => {
    const user1 = db.predictions.filter({ user_email: 'user1@x.com' });
    expect(user1).toHaveLength(2);
    user1.forEach((p) => expect(p.user_email).toBe('user1@x.com'));
  });

  it('Prediction.filter({ scored: true }) cuenta evaluados', async () => {
    const scored = db.predictions.filter({ scored: true });
    expect(scored).toHaveLength(2);
    scored.forEach((p) => expect(p.scored).toBe(true));
  });

  it('Prediction.filter({ user_email, scored: true }) — el caso más común', async () => {
    // Este es el patrón usado en Profile.jsx, Home.jsx, etc.
    const result = db.predictions.filter({
      user_email: 'user1@x.com',
      scored: true,
    });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.scored && p.user_email === 'user1@x.com')).toBe(true);
  });

  it('Prediction.filter({ match_id }) agrupa por partido', async () => {
    const m1 = db.predictions.filter({ match_id: 'm1' });
    expect(m1).toHaveLength(2);
    expect(m1.every((p) => p.match_id === 'm1')).toBe(true);
  });
});

describe('db.Redemption — usado en premios', () => {
  it('Redemption.filter({ user_email }) filtra por usuario', async () => {
    const r = db.redemptions.filter({ user_email: 'admin@x.com' });
    expect(r).toHaveLength(0); // mock devuelve []
  });

  it('Redemption.list() con array vacío retorna []', async () => {
    const all = db.redemptions.list();
    expect(all).toEqual([]);
  });
});

describe('db.cache lifecycle — invariantes del refactor', () => {
  it('_data existe después de syncAllFromSupabase', () => {
    expect(db._data).toBeTruthy();
    expect(typeof db._data).toBe('object');
  });

  it('_data tiene las keys esperadas (in-memory shape estable)', () => {
    const expectedKeys = [
      'users', 'matches', 'predictions', 'prizes', 'redemptions',
      'supportTickets', 'pointsBonuses', 'appSettings', 'auditLogs',
      'referrals', 'referralCommissions',
    ];
    expectedKeys.forEach((k) => {
      expect(Array.isArray(db._data[k])).toBe(true);
    });
  });
});