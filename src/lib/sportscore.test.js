import { describe, it, expect } from 'vitest';

// Re-export de normalizeState vía alias para tests.
import { _normalizeStateForTest as normalizeState } from './sportscore.js';

describe('normalizeState — método + estado', () => {
  it.each([
    ['ft', 'finished', '90'],
    ['FT', 'finished', '90'],
    ['aet', 'finished', 'et'],
    ['AET', 'finished', 'et'],
    ['pen', 'finished', 'pen'],
    ['PEN', 'finished', 'pen'],
    ['finished', 'finished', null], // genérico sin info de método
  ])('status %s → state=%s method=%s', (raw, expectedState, expectedMethod) => {
    const r = normalizeState(raw);
    expect(r.state).toBe(expectedState);
    expect(r.method).toBe(expectedMethod);
  });

  it('upcoming mantiene method=null', () => {
    const r = normalizeState('notstarted');
    expect(r.state).toBe('upcoming');
    expect(r.method).toBe(null);
  });

  it('live mantiene method=null', () => {
    const r = normalizeState('1h');
    expect(r.state).toBe('live');
    expect(r.method).toBe(null);
  });
});