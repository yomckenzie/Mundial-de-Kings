/**
 * Tests de caracterización para soporte: _migrateTicket y supportTickets.
 *
 * Mockea supabase para que db.js no intente conectar a red.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mockear supabase antes de importar db
vi.mock('./supabase.js', () => ({
  supabase: null,
  isSupabaseAvailable: () => true,
  syncTableToSupabase: vi.fn(),
  syncTableFromSupabase: vi.fn(),
  fetchAll: vi.fn().mockResolvedValue(null),
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
  // Sincronizar la closure _data de db.js con db._data.
  // verify/reject usan _data directamente sin llamar _init(), por lo que
  // si no sincronizamos aquí esos métodos ven los datos viejos.
  db._init({ skipSync: true });
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
  it('create crea un ticket con messages array y sin campos viejos', async () => {
    resetDb();
    const ticket = await db.supportTickets.create({
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

  it('create NO hace batch upsert — solo sube la fila creada (FIX jul 2026)', async () => {
    // Reproduce el bug #35 (segunda parte): el admin no podía CREAR tickets
    // porque db._persist('supportTickets') subía TODA la tabla y la RLS
    // support_insert_own rechazaba el batch. El fix sube SOLO la fila nueva.
    const persistSpy = vi.spyOn(db, '_persist');

    resetDb([
      { id: 'prev1', user_email: 'otro1@test.com', subject: 'otro1', messages: [], status: 'pending', user_read_at: '2024-01-01', admin_read_at: '2024-01-01', created_date: '2024-01-01' },
      { id: 'prev2', user_email: 'otro2@test.com', subject: 'otro2', messages: [], status: 'pending', user_read_at: '2024-01-01', admin_read_at: '2024-01-01', created_date: '2024-01-01' },
    ]);

    await db.supportTickets.create({
      subject: 'Nuevo',
      user_email: 'admin@chessking.com',
      user_name: 'Admin',
      message: 'Test create single-row',
    });

    // _persist NUNCA debe llamarse (sería el anti-pattern)
    expect(persistSpy).not.toHaveBeenCalled();

    // El ticket nuevo SÍ debe estar en local
    const tickets = db.supportTickets.list();
    expect(tickets.length).toBe(3);
    const nuevo = tickets.find(t => t.subject === 'Nuevo');
    expect(nuevo.user_email).toBe('admin@chessking.com');
    expect(nuevo.messages).toHaveLength(1);
    expect(nuevo.messages[0].text).toBe('Test create single-row');

    persistSpy.mockRestore();
  });

  it('addMessage agrega el mensaje al array y actualiza el status', async () => {
    resetDb([{
      id: 'ticket-1',
      messages: [{ sender: 'user', text: 'hola', created_date: '2024-01-01' }],
      status: 'pending',
      user_email: 'user@test.com',
      user_read_at: '2024-01-01',
      admin_read_at: '2024-01-01',
    }]);

    await db.supportTickets.addMessage('ticket-1', 'admin', 'Te respondo');

    const tickets = db.supportTickets.list();
    const ticket = tickets.find(t => t.id === 'ticket-1');

    expect(ticket.messages).toHaveLength(2);
    expect(ticket.messages[1].sender).toBe('admin');
    expect(ticket.messages[1].text).toBe('Te respondo');
    // El status debe cambiar a 'answered' cuando responde el admin
    expect(ticket.status).toBe('answered');
  });

  it('update no permite sobrescribir messages directamente', async () => {
    resetDb([{
      id: 'ticket-2',
      messages: [{ sender: 'user', text: 'original', created_date: '2024-01-01' }],
      status: 'pending',
      user_email: 'user@test.com',
      user_read_at: '2024-01-01',
      admin_read_at: '2024-01-01',
    }]);

    // Intentar sobreescribir messages con update debe ser ignorado
    await db.supportTickets.update('ticket-2', {
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

  it('update NO hace batch upsert — solo sube la fila afectada (FIX jul 2026)', async () => {
    // Reproduce el bug #35: admin cierra un ticket de otro usuario. Antes el
    // _persist('supportTickets') subía TODOS los tickets y la RLS
    // support_insert_own rechazaba el batch porque auth.email() (admin) != user_email.
    // El fix sube SOLO la fila afectada con _upsertToCloud, evitando el rechazo.
    // Verificamos: db._persist NUNCA se llama desde update (es el anti-pattern).
    const persistSpy = vi.spyOn(db, '_persist');

    resetDb([
      { id: 'a', user_email: 'alice@test.com', subject: 's1', messages: [], status: 'pending', user_read_at: '2024-01-01', admin_read_at: '2024-01-01', created_date: '2024-01-01' },
      { id: 'b', user_email: 'bob@test.com',   subject: 's2', messages: [], status: 'pending', user_read_at: '2024-01-01', admin_read_at: '2024-01-01', created_date: '2024-01-01' },
      { id: 'c', user_email: 'carol@test.com', subject: 's3', messages: [], status: 'pending', user_read_at: '2024-01-01', admin_read_at: '2024-01-01', created_date: '2024-01-01' },
    ]);

    await db.supportTickets.update('b', { status: 'closed' });

    // El _persist batch NUNCA debe llamarse (sería el anti-pattern)
    expect(persistSpy).not.toHaveBeenCalled();

    // Estado local correcto
    const ticket = db.supportTickets.list().find(t => t.id === 'b');
    expect(ticket.status).toBe('closed');

    persistSpy.mockRestore();
  });

  it('verify NO llama a _syncAllToSupabase — solo upserts el ticket y el audit log (FIX jul 2026)', async () => {
    // Antes verify() llamaba db._syncAllToSupabase() que sube TODAS las tablas.
    // Eso reintentaba subir todos los tickets de todos los usuarios → RLS fail.
    const syncAllSpy = vi.spyOn(db, '_syncAllToSupabase');
    const persistSpy = vi.spyOn(db, '_persist');

    resetDb([{
      id: 'v1',
      user_email: 'u@test.com',
      subject: 'Real',
      messages: [],
      status: 'pending',
      user_read_at: '2024-01-01',
      admin_read_at: '2024-01-01',
      created_date: '2024-01-01',
    }]);

    await db.supportTickets.verify('v1', 'admin@chessking.com');

    // _syncAllToSupabase NUNCA debe llamarse (sería el anti-pattern)
    expect(syncAllSpy).not.toHaveBeenCalled();
    // _persist tampoco
    expect(persistSpy).not.toHaveBeenCalled();

    // Estado local: verified=true, verified_by=admin, audit log creado
    const ticket = db.supportTickets.list().find(t => t.id === 'v1');
    expect(ticket.verified).toBe(true);
    expect(ticket.verified_by).toBe('admin@chessking.com');
    expect(db._data.auditLogs.length).toBe(1);
    expect(db._data.auditLogs[0].action).toBe('ticket_verified');

    syncAllSpy.mockRestore();
    persistSpy.mockRestore();
  });

  it('reject NO llama a _syncAllToSupabase — solo upserts el ticket cerrado y el audit log (FIX jul 2026)', async () => {
    const syncAllSpy = vi.spyOn(db, '_syncAllToSupabase');
    const persistSpy = vi.spyOn(db, '_persist');

    resetDb([{
      id: 'rj1',
      user_email: 'u@test.com',
      subject: 'spam',
      messages: [],
      status: 'pending',
      user_read_at: '2024-01-01',
      admin_read_at: '2024-01-01',
      created_date: '2024-01-01',
    }]);

    await db.supportTickets.reject('rj1', 'admin@chessking.com');

    expect(syncAllSpy).not.toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalled();

    // Estado local: rejected=true, status=closed, audit log creado
    const ticket = db.supportTickets.list().find(t => t.id === 'rj1');
    expect(ticket.rejected).toBe(true);
    expect(ticket.rejected_by).toBe('admin@chessking.com');
    expect(ticket.status).toBe('closed');
    expect(db._data.auditLogs.length).toBe(1);
    expect(db._data.auditLogs[0].action).toBe('ticket_rejected');

    syncAllSpy.mockRestore();
    persistSpy.mockRestore();
  });

  it('addMessage NO hace batch upsert — solo sube el ticket afectado (FIX jul 2026)', async () => {
    const persistSpy = vi.spyOn(db, '_persist');

    resetDb([{
      id: 'm1',
      user_email: 'u@test.com',
      subject: 's',
      messages: [{ sender: 'user', text: 'hola', created_date: '2024-01-01' }],
      status: 'pending',
      user_read_at: '2024-01-01',
      admin_read_at: '2024-01-01',
      created_date: '2024-01-01',
    }]);

    await db.supportTickets.addMessage('m1', 'admin', 'respuesta');

    expect(persistSpy).not.toHaveBeenCalled();
    const ticket = db.supportTickets.list().find(t => t.id === 'm1');
    expect(ticket.messages).toHaveLength(2);
    expect(ticket.status).toBe('answered');

    persistSpy.mockRestore();
  });

  it('db-cloud-change de support_tickets re-sincroniza y notifica (FIX jul 2026)', async () => {
    // Reproduce el bug #36: admin responde un ticket en su navegador, el
    // realtime del cliente del user recibe el evento `db-cloud-change` pero
    // NADIE lo escuchaba → cache local stale → user no ve el mensaje.
    // El fix: al recibir db-cloud-change con tableName='support_tickets',
    // hacer sync FROM Supabase y notificar a React.
    const supabaseModule = await import('./supabase.js');
    const remoteData = [{
      id: 'rt1',
      user_email: 'otro@test.com',
      subject: 'Real-time',
      messages: [
        { sender: 'user', text: 'hola', created_date: '2024-01-01' },
        { sender: 'admin', text: 'respuesta del admin', created_date: '2024-01-02' },
      ],
      status: 'answered',
      user_read_at: '2024-01-01',
      admin_read_at: '2024-01-02',
      created_date: '2024-01-01',
    }];
    // syncTableFromSupabaseFn en db.js llama a fetchAll (mock vi.fn())
    supabaseModule.fetchAll.mockResolvedValue(remoteData);

    // Capturar el notify (el handler emite 'db-synced' cuando termina OK)
    const syncedListener = vi.fn();
    const syncedHandler = () => syncedListener();
    window.addEventListener('db-synced', syncedHandler);

    resetDb([]); // cache local vacía
    // _handleCloudChange usa `db` de cierre — necesitamos asegurar que
    // db._data está sincronizado con el resetDb.
    db._init({ skipSync: true });

    // Disparar el evento que dispara el realtime cuando admin responde
    window.dispatchEvent(new CustomEvent('db-cloud-change', {
      detail: { tableName: 'support_tickets', eventType: 'UPDATE' },
    }));
    // Esperar a que la promesa se resuelva
    await new Promise(r => setTimeout(r, 500));

    // El ticket remoto debe estar en cache local
    const tickets = db.supportTickets.list();
    expect(tickets.length).toBe(1);
    expect(tickets[0].id).toBe('rt1');
    expect(tickets[0].messages).toHaveLength(2);
    expect(tickets[0].messages[1].sender).toBe('admin');
    expect(tickets[0].messages[1].text).toBe('respuesta del admin');
    // notifyReactComponents() se llamó → el listener capturó el evento
    expect(syncedListener).toHaveBeenCalled();

    window.removeEventListener('db-synced', syncedHandler);
  });
});
