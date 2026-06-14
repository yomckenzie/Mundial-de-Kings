/**
 * Tests de caracterización para helpers puros de supabase.js.
 * Solo prueba funciones exportadas que no hacen llamadas de red.
 */
import { describe, it, expect } from 'vitest';
import { stripLocalFields, resolveSyncedRecord } from './supabase.js';

describe('resolveSyncedRecord', () => {
  // El bug del 14 jun: un cliente con caché vieja (scored=null) revertía la
  // evaluación de la nube. Ahora la nube manda en los campos de evaluación.
  it('predictions: conserva el pick local pero toma la evaluación de la nube', () => {
    const local = { id: 'p1', user_email: 'a@x.com', pred_team1: 2, pred_team2: 1, scored: null, is_correct: null, points_earned: null };
    const remote = { id: 'p1', user_email: 'a@x.com', pred_team1: 2, pred_team2: 1, scored: true, is_correct: true, points_earned: 100 };
    const r = resolveSyncedRecord('predictions', local, remote);
    expect(r.scored).toBe(true);
    expect(r.is_correct).toBe(true);
    expect(r.points_earned).toBe(100);
    expect(r.pred_team1).toBe(2); // el pick del usuario se conserva
    expect(r.pred_team2).toBe(1);
  });

  it('predictions: un cliente viejo NO puede revertir scored=true a null', () => {
    const local = { id: 'p1', scored: null, is_correct: null, pred_team1: 0, pred_team2: 0 };
    const remote = { id: 'p1', scored: true, is_correct: false, pred_team1: 0, pred_team2: 0 };
    const r = resolveSyncedRecord('predictions', local, remote);
    expect(r.scored).toBe(true);
    expect(r.is_correct).toBe(false);
  });

  it('redemptions (otra tabla de usuario): gana el local', () => {
    const local = { id: 'r1', status: 'pending', note: 'local' };
    const remote = { id: 'r1', status: 'approved', note: 'remoto' };
    const r = resolveSyncedRecord('redemptions', local, remote);
    expect(r.note).toBe('local');
    expect(r.status).toBe('pending');
  });

  it('matches (admin): sin edición reciente, gana la nube', () => {
    const local = { id: 'm1', status: 'open', updated_at: '2020-01-01T00:00:00Z' };
    const remote = { id: 'm1', status: 'live' };
    const r = resolveSyncedRecord('matches', local, remote, Date.now());
    expect(r.status).toBe('live');
  });

  it('matches (admin): con edición local hace <30s, se preserva el local', () => {
    const now = 1_000_000_000_000;
    const local = { id: 'm1', status: 'live', updated_at: new Date(now - 5000).toISOString() };
    const remote = { id: 'm1', status: 'open' };
    const r = resolveSyncedRecord('matches', local, remote, now);
    expect(r.status).toBe('live'); // cambio admin reciente no se pisa
  });
});

describe('stripLocalFields', () => {
  it('elimina campos locales de control', () => {
    const registros = [
      {
        id: '1',
        email: 'user@test.com',
        password: 'secret',
        created_date: '2024-01-01',
        updated_at: '2024-01-02',
        live_started_at: '2024-01-01T10:00:00Z',
        messages: [{ sender: 'user', text: 'hola' }],
        user_read_at: '2024-01-02',
        admin_read_at: '2024-01-02',
        name: 'Usuario',
        total_points: 200,
      },
    ];

    const resultado = stripLocalFields(registros);

    // Campos locales eliminados
    expect(resultado[0]).not.toHaveProperty('password');
    expect(resultado[0]).not.toHaveProperty('created_date');
    expect(resultado[0]).not.toHaveProperty('updated_at');
    expect(resultado[0]).not.toHaveProperty('live_started_at');
    expect(resultado[0]).not.toHaveProperty('messages');
    expect(resultado[0]).not.toHaveProperty('user_read_at');
    expect(resultado[0]).not.toHaveProperty('admin_read_at');
  });

  it('conserva campos de dominio del registro', () => {
    const registros = [
      {
        id: 'abc',
        email: 'jugador@test.com',
        name: 'Jugador',
        total_points: 500,
        prediction_points: 300,
        role: 'user',
        sizes: ['M', 'L'],
        selected_size: 'M',
        // campo local que debe eliminarse
        password: 'x',
      },
    ];

    const resultado = stripLocalFields(registros);

    expect(resultado[0].id).toBe('abc');
    expect(resultado[0].email).toBe('jugador@test.com');
    expect(resultado[0].name).toBe('Jugador');
    expect(resultado[0].total_points).toBe(500);
    expect(resultado[0].prediction_points).toBe(300);
    expect(resultado[0].role).toBe('user');
    // sizes y selected_size se conservan (existen en Supabase)
    expect(resultado[0].sizes).toEqual(['M', 'L']);
    expect(resultado[0].selected_size).toBe('M');
  });

  it('procesa arrays de múltiples registros sin modificar el original', () => {
    const original = [
      { id: '1', name: 'A', password: 'p1', created_date: '2024-01-01' },
      { id: '2', name: 'B', password: 'p2', created_date: '2024-01-02' },
    ];

    const resultado = stripLocalFields(original);

    expect(resultado).toHaveLength(2);
    expect(resultado[0].name).toBe('A');
    expect(resultado[1].name).toBe('B');
    // El original no debe ser mutado
    expect(original[0]).toHaveProperty('password', 'p1');
    expect(original[0]).toHaveProperty('created_date', '2024-01-01');
  });
});
