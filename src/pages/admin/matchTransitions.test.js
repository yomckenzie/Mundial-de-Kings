import { describe, it, expect } from 'vitest';
import { isValidTransition, VALID_TRANSITIONS } from './matchTransitions';

describe('isValidTransition', () => {
  it('mismo estado siempre es válido', () => {
    expect(isValidTransition('closed', 'closed')).toBe(true);
    expect(isValidTransition('live', 'live')).toBe(true);
  });

  // El botón "Reabrir" se muestra para partidos closed/live/finished y todos
  // llaman handleStatusChange(match, 'open'). Las tres transiciones a 'open'
  // DEBEN ser válidas o el botón falla con "Transición no permitida".
  it('closed → open es válido (Reabrir un partido cerrado)', () => {
    expect(isValidTransition('closed', 'open')).toBe(true);
  });

  it('live → open es válido (Reabrir un partido marcado en vivo por error)', () => {
    expect(isValidTransition('live', 'open')).toBe(true);
  });

  it('finished → open sigue siendo válido', () => {
    expect(isValidTransition('finished', 'open')).toBe(true);
  });

  it('mantiene las transiciones legítimas previas', () => {
    expect(isValidTransition('pending', 'open')).toBe(true);
    expect(isValidTransition('open', 'live')).toBe(true);
    expect(isValidTransition('live', 'finished')).toBe(true);
    expect(isValidTransition('closed', 'live')).toBe(true);
  });

  it('sigue rechazando saltos ilegales', () => {
    expect(isValidTransition('pending', 'finished')).toBe(false);
    expect(isValidTransition('pending', 'live')).toBe(false);
    expect(isValidTransition('open', 'finished')).toBe(false);
  });

  it('estado desconocido no permite ninguna transición', () => {
    expect(isValidTransition('inexistente', 'open')).toBe(false);
  });

  it('VALID_TRANSITIONS expone Sets por estado', () => {
    expect(VALID_TRANSITIONS.closed).toBeInstanceOf(Set);
    expect(VALID_TRANSITIONS.closed.has('open')).toBe(true);
  });
});
