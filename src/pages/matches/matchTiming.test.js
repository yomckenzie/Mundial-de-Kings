import { describe, it, expect } from 'vitest';
import { isLiveMatch, hasStartedNow, getKickoffMs } from './matchTiming';

const NOW = new Date(2026, 5, 13, 15, 0, 0).getTime(); // 13 jun 2026, 15:00 local

const at = (h, m) => ({
  match_date: '2026-06-13',
  match_time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
});

describe('isLiveMatch', () => {
  it('pending ya empezado (hace 1h) => EN VIVO (red de seguridad)', () => {
    expect(isLiveMatch({ ...at(14, 0), status: 'pending' }, NOW)).toBe(true);
  });
  it('pending a futuro => NO en vivo', () => {
    expect(isLiveMatch({ ...at(18, 0), status: 'pending' }, NOW)).toBe(false);
  });
  it('status live => EN VIVO siempre', () => {
    expect(isLiveMatch({ ...at(18, 0), status: 'live' }, NOW)).toBe(true);
  });
  it('open ya empezado => EN VIVO', () => {
    expect(isLiveMatch({ ...at(14, 0), status: 'open' }, NOW)).toBe(true);
  });
  it('finished nunca está en vivo', () => {
    expect(isLiveMatch({ ...at(14, 0), status: 'finished' }, NOW)).toBe(false);
  });
  it('empezado hace mas de 3.5h => fuera de ventana, NO en vivo', () => {
    expect(isLiveMatch({ ...at(10, 0), status: 'pending' }, NOW)).toBe(false);
  });
  it('sin fecha/hora => NO en vivo', () => {
    expect(isLiveMatch({ status: 'pending' }, NOW)).toBe(false);
  });
});

describe('hasStartedNow / getKickoffMs', () => {
  it('getKickoffMs retorna null sin datos', () => {
    expect(getKickoffMs({})).toBe(null);
  });
  it('hasStartedNow true si empezó dentro de la ventana', () => {
    expect(hasStartedNow({ ...at(14, 30), status: 'open' }, NOW)).toBe(true);
  });
});
