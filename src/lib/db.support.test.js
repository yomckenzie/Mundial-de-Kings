/**
 * Tests de caracterización para soporte: _migrateTicket y supportTickets.
 *
 * Mockea supabase para que db.js no intente conectar a red.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mockear supabase antes de importar db
vi.mock('./supabase.js', () => ({
  supabase: null,
  isSupabaseAvailable: () => false,
  syncTableToSupabase: vi.fn(),
  syncTableFromSupabase: vi.fn(),
  stripLocalFields: (records) => records,
  TABLES: {
    users: 'users',
    matches: 'matches',
    predictions: 'predictions',
    prizes: 'prizes',
    redemptions: 'redemptions',
    support_tickets: 'support_tickets',
    points_bonuses: 'points_bonuses',
    app_settings: 'app_settings',
    audit_logs: 'audit_logs',
    referrals: 'referrals',
    referral_commissions: 'referral_commissions',
  },
  setupRealtimeSubscriptions: vi.fn(),
  cleanupRealtimeSubscriptions: vi.fn(),
}));

const { db } = await import('./db.js');

// Helper para resetear el estado interno de db entre tests
function resetDb(ticketsIniciales = []) {
  db._data = {
    users: [],
    matches: [],
    predictions: [],
    prizes: [],
    redemptions: [],
    supportTickets: ticketsIniciales,
    pointsBonuses: [],
    appSettings: [],
    auditLogs: [],
    referrals: [],
    referralCommissions: [],
    currentUserEmail: null,
    deletedIds: [],
  };
  localStorage.clear();
  localStorage.setItem('chessking_db', JSON.stringify(db._data));
}

beforeEach(() => {
  resetDb();
});

describe('db._migrateTicket', () => {
  it('convierte message y admin_reply al formato messages sin perder el texto', () => {
    const ticket = {
      id: 't1',
      subject: 'Consulta',
      user_email: 'user@test.com',
      message: 'Quiero saber mi saldo',
      admin_reply: 'Tu saldo es 100 puntos',
      created_date: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    };

    const migrado = db._migrateTicket(ticket);

    // El texto del usuario se conserva
    expect(migrado.messages).toHaveLength(2);
    expect(migrado.messages[0].sender).toBe('user');
    expect(migrado.messages[0].text).toBe('Quiero saber mi saldo');

    // El texto del admin se conserva
    expect(migrado.messages[1].sender).toBe('admin');
    expect(migrado.messages[1].text).toBe('Tu saldo es 100 puntos');
  });

  it('no re-migra un ticket que ya tiene messages', () => {
    const ticket = {
      id: 't2',
      messages: [{ sender: 'user', text: 'ya migrado', created_date: '2024-01-01' }],
    };

    const migrado = db._migrateTicket(ticket);

    // No debe duplicar
    expect(migrado.messages).toHaveLength(1);
    expect(migrado.messages[0].text).toBe('ya migrado');
  });

  it('ticket sin message ni admin_reply obtiene messages vacío', () => {
    const ticket = { id: 't3', subject: 'Vacío' };

    const migrado = db._migrateTicket(ticket);

    expect(migrado.messages).toEqual([]);
  });

  it('agrega user_read_at y admin_read_at si no existen', () => {
    const ticket = { id: 't4', messages: [], created_date: '2024-01-01' };

    const migrado = db._migrateTicket(ticket);

    expect(migrado.user_read_at).toBeTruthy();
    expect(migrado.admin_read_at).toBeTruthy();
  });
});

describe('db.supportTickets', () => {
  it('create crea un ticket con messages array y sin campos viejos', () => {
    resetDb();
    const ticket = db.supportTickets.create({
      subject: 'Problema con mi cuenta',
      user_email: 'jugador@test.com',
      user_name: 'Jugador Test',
      message: 'No puedo ver mis puntos',
    });

    // Debe tener messages con el mensaje inicial
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0].sender).toBe('user');
    expect(ticket.messages[0].text).toBe('No puedo ver mis puntos');

    // No debe tener campos viejos
    expect(ticket).not.toHaveProperty('message');
    expect(ticket).not.toHaveProperty('admin_reply');

    expect(ticket.status).toBe('pending');
    expect(ticket.user_email).toBe('jugador@test.com');
  });

  it('addMessage agrega el mensaje al array y actualiza el status', () => {
    resetDb([{
      id: 'ticket-1',
      messages: [{ sender: 'user', text: 'hola', created_date: '2024-01-01' }],
      status: 'pending',
      user_email: 'user@test.com',
      user_read_at: '2024-01-01',
      admin_read_at: '2024-01-01',
    }]);

    db.supportTickets.addMessage('ticket-1', 'admin', 'Te respondo');

    const tickets = db.supportTickets.list();
    const ticket = tickets.find(t => t.id === 'ticket-1');

    expect(ticket.messages).toHaveLength(2);
    expect(ticket.messages[1].sender).toBe('admin');
    expect(ticket.messages[1].text).toBe('Te respondo');
    // El status debe cambiar a 'answered' cuando responde el admin
    expect(ticket.status).toBe('answered');
  });

  it('update no permite sobrescribir messages directamente', () => {
    resetDb([{
      id: 'ticket-2',
      messages: [{ sender: 'user', text: 'original', created_date: '2024-01-01' }],
      status: 'pending',
      user_email: 'user@test.com',
      user_read_at: '2024-01-01',
      admin_read_at: '2024-01-01',
    }]);

    // Intentar sobreescribir messages con update debe ser ignorado
    db.supportTickets.update('ticket-2', {
      status: 'closed',
      messages: [],
    });

    const tickets = db.supportTickets.list();
    const ticket = tickets.find(t => t.id === 'ticket-2');

    // messages no debe haberse vaciado
    expect(ticket.messages).toHaveLength(1);
    // status sí debe haber cambiado
    expect(ticket.status).toBe('closed');
  });
});
