/**
 * Caracteriza la carga PRIORITARIA de partidos: `whenMatchesReady()` debe
 * resolver en cuanto la tabla `matches` está en memoria, SIN esperar a las
 * tablas pesadas (predicciones/usuarios). Así la sección EN VIVO arranca de
 * inmediato — sobre todo en móvil.
 */
import { describe, it, expect, vi } from 'vitest';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// matches responde al instante; las demás tablas tardan (simula red lenta).
vi.mock('./supabase.js', () => ({
  supabase: {},
  isSupabaseAvailable: () => true,
  fetchAll: vi.fn(async (table) => {
    if (table === 'matches') return [{ id: 'm1', team1: 'A', team2: 'B', status: 'live' }];
    await wait(80);
    return [];
  }),
  setupRealtimeSubscriptions: vi.fn(),
  TABLES: {},
}));

const { db } = await import('./db.js');

describe('carga prioritaria de partidos', () => {
  it('whenMatchesReady() resuelve antes que whenReady()', async () => {
    const order = [];
    const mReady = db.whenMatchesReady().then(() => order.push('matches'));
    const allReady = db.whenReady().then(() => order.push('all'));
    await Promise.all([mReady, allReady]);
    expect(order).toEqual(['matches', 'all']);
  });

  it('los partidos quedan en memoria tras whenMatchesReady()', async () => {
    await db.whenMatchesReady();
    expect(db.matches.list().some((m) => m.id === 'm1')).toBe(true);
  });
});
