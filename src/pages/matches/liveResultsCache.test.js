import { describe, it, expect, beforeEach } from 'vitest';
import { loadLiveCache, saveLiveCache } from './liveResultsCache';

beforeEach(() => localStorage.clear());

describe('liveResultsCache', () => {
  it('sin nada guardado retorna {}', () => {
    expect(loadLiveCache()).toEqual({});
  });

  it('guarda y recupera el mismo mapa', () => {
    const map = { m1: { team1Score: 2, team2Score: 1, label: "67'" } };
    saveLiveCache(map, 1000);
    expect(loadLiveCache(1000)).toEqual(map);
  });

  it('descarta el cache si es más viejo que el TTL (6h)', () => {
    const map = { m1: { team1Score: 0, team2Score: 0 } };
    saveLiveCache(map, 0);
    const sixHoursPlus = 6 * 60 * 60 * 1000 + 1;
    expect(loadLiveCache(sixHoursPlus)).toEqual({});
  });

  it('mantiene el cache dentro del TTL', () => {
    const map = { m1: { team1Score: 1, team2Score: 0 } };
    saveLiveCache(map, 0);
    expect(loadLiveCache(60 * 60 * 1000)).toEqual(map); // 1h después
  });

  it('JSON corrupto no rompe, retorna {}', () => {
    localStorage.setItem('chessking_live_results', '{no es json');
    expect(loadLiveCache()).toEqual({});
  });
});
