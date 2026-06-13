import { describe, it, expect } from 'vitest';
import { getTournamentWeeks, computeWeeklyRanking } from './weeklyRanking';

const matches = [
  { id: 'm1', match_date: '2026-06-09T00:00:00+00:00', match_time: '17:00' }, // Sem 1
  { id: 'm2', match_date: '2026-06-13T00:00:00+00:00', match_time: '20:00' }, // Sem 1
  { id: 'm3', match_date: '2026-06-17T00:00:00+00:00', match_time: '15:00' }, // Sem 2
];
const users = [
  { email: 'a@x.com', instagram: 'a', profile_complete: true, role: 'user' },
  { email: 'b@x.com', instagram: 'b', profile_complete: true, role: 'user' },
  { email: 'adm@x.com', instagram: 'adm', profile_complete: true, role: 'admin' },
  { email: 'inc@x.com', instagram: 'inc', profile_complete: false, role: 'user' },
];
const preds = [
  { user_email: 'a@x.com', match_id: 'm1', is_correct: true, scored: true },
  { user_email: 'a@x.com', match_id: 'm2', is_correct: true, scored: true },
  { user_email: 'a@x.com', match_id: 'm1', is_correct: true, scored: true }, // duplicado
  { user_email: 'b@x.com', match_id: 'm1', is_correct: true, scored: true },
  { user_email: 'b@x.com', match_id: 'm3', is_correct: true, scored: true }, // Sem 2
  { user_email: 'a@x.com', match_id: 'm3', is_correct: false, scored: true },
  { user_email: 'adm@x.com', match_id: 'm1', is_correct: true, scored: true },
];
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime(); // dentro de Sem 2

describe('getTournamentWeeks', () => {
  it('arma semanas de 7 dias desde el primer partido, solo las ya empezadas', () => {
    const weeks = getTournamentWeeks(matches, NOW);
    expect(weeks.length).toBe(2);
    expect(weeks[0].n).toBe(1);
    expect(weeks[1].n).toBe(2);
  });
  it('sin partidos retorna []', () => {
    expect(getTournamentWeeks([], NOW)).toEqual([]);
  });
});

describe('computeWeeklyRanking', () => {
  it('Sem 1: a=200 (sin contar duplicado), b=100; excluye admin/incompletos', () => {
    const weeks = getTournamentWeeks(matches, NOW);
    const r = computeWeeklyRanking(users, preds, matches, weeks[0]);
    expect(r.map((u) => [u.email, u.weeklyPoints])).toEqual([['a@x.com', 200], ['b@x.com', 100]]);
    expect(r[0].rank).toBe(1);
    expect(r[1].rank).toBe(2);
    expect(r[1].gapToPrev).toBe(100);
    expect(r[0].prediction_points).toBe(200); // mapeado para reusar la tabla
  });
  it('Sem 2: solo b=100', () => {
    const weeks = getTournamentWeeks(matches, NOW);
    const r = computeWeeklyRanking(users, preds, matches, weeks[1]);
    expect(r.map((u) => u.email)).toEqual(['b@x.com']);
    expect(r[0].weeklyPoints).toBe(100);
  });
});
