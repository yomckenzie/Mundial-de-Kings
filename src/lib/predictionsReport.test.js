import { describe, it, expect } from 'vitest';
import {
  statusOf, usersByEmailMap, buildMatchReport, buildStandings, buildGlobalStats,
} from './predictionsReport';

const users = [
  { email: 'ana@x.com', full_name: 'Ana López', instagram: 'ana', role: 'user' },
  { email: 'luis@x.com', full_name: 'Luis Mora', instagram: 'luismora', role: 'user' },
  { email: 'admin@x.com', full_name: 'Admin', instagram: 'admin', role: 'admin' },
];
const m1 = { id: 'm1', team1: 'USA', team2: 'Paraguay', result_team1: 4, result_team2: 1, status: 'finished' };
const m2 = { id: 'm2', team1: 'Brasil', team2: 'Haití', status: 'open' }; // sin resultado
const preds = [
  { user_email: 'ana@x.com', match_id: 'm1', pred_team1: 4, pred_team2: 1, scored: true, is_correct: true, points_earned: 100 },
  { user_email: 'luis@x.com', match_id: 'm1', pred_team1: 2, pred_team2: 0, scored: true, is_correct: false, points_earned: 0 },
  { user_email: 'admin@x.com', match_id: 'm1', pred_team1: 4, pred_team2: 1, scored: true, is_correct: true, points_earned: 100 },
  { user_email: 'ana@x.com', match_id: 'm2', pred_team1: 1, pred_team2: 0 }, // pendiente
];

describe('statusOf', () => {
  it('gana con marcador exacto en partido finalizado', () => {
    expect(statusOf(preds[0], m1)).toBe('ganó');
  });
  it('pierde si no acierta en partido finalizado', () => {
    expect(statusOf(preds[1], m1)).toBe('perdió');
  });
  it('pendiente si el partido no tiene resultado', () => {
    expect(statusOf(preds[3], m2)).toBe('pendiente');
  });
});

describe('buildMatchReport', () => {
  it('arma filas y métricas excluyendo admin', () => {
    const map = usersByEmailMap(users);
    const r = buildMatchReport(m1, preds, map);
    expect(r.resultText).toBe('4-1');
    // admin excluido de métricas → 2 participantes
    expect(r.stats.participants).toBe(2);
    expect(r.stats.hits).toBe(1);
    expect(r.stats.effectiveness).toBe('50.0%');
    const ana = r.rows.find(x => x.email === 'ana@x.com');
    expect(ana.instagram).toBe('ana');
    expect(ana.name).toBe('Ana López');
    expect(ana.status).toBe('ganó');
    expect(ana.points).toBe(100);
  });
});

describe('buildStandings', () => {
  it('acumula por usuario, excluye admin, ordena por puntos', () => {
    const map = usersByEmailMap(users);
    const s = buildStandings(preds, [m1, m2], map);
    expect(s.find(x => x.email === 'admin@x.com')).toBeUndefined();
    const ana = s.find(x => x.email === 'ana@x.com');
    // ana: 1 acierto en m1 (m2 pendiente no cuenta)
    expect(ana.hits).toBe(1);
    expect(ana.total).toBe(1);
    expect(ana.points).toBe(100);
    expect(s[0].rank).toBe(1);
  });
});

describe('buildGlobalStats', () => {
  it('cuenta partidos finalizados y participantes únicos sin admin', () => {
    const g = buildGlobalStats(preds, [m1], usersByEmailMap(users));
    expect(g.totalMatches).toBe(1);
    expect(g.participants).toBe(2);
    expect(g.hits).toBe(1);
    expect(g.effectiveness).toBe('50.0%');
  });
});
