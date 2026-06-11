/**
 * Tests de caracterización para helpers puros de supabase.js.
 * Solo prueba funciones exportadas que no hacen llamadas de red.
 */
import { describe, it, expect } from 'vitest';
import { stripLocalFields } from './supabase.js';

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
