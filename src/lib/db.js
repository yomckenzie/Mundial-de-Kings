import {
  supabase,
  isSupabaseAvailable,
  syncTableToSupabase,
  syncTableFromSupabase,
  stripLocalFields,
  TABLES
} from './supabase.js';

const STORAGE_KEY = 'chessking_db';

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const getNow = () => new Date().toISOString();

let _syncInProgress = {};
let _pollInterval = null;
let _syncToSupabaseInProgress = false;
let _syncFromSupabaseInProgress = false;
let _resyncQueued = false;
let _blockFromSync = false; // Bloquea sync FROM Supabase durante operaciones destructivas
const _pendingDeletes = []; // { tableName, id }[]
const CLEAN_AT_KEY = 'chessking_last_clean_at';
let _lastCleanAt = (() => { try { return localStorage.getItem(CLEAN_AT_KEY) || null; } catch { return null; } })();

function sortBy(arr, order) {
  if (!order) return [...arr];
  const field = order.startsWith('-') ? order.slice(1) : order;
  const dir = order.startsWith('-') ? -1 : 1;
  return arr.toSorted((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
}

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return getDefaults();
};

const save = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

// --- Mapeo de nombres de tablas db.js -> Supabase ---
const TABLE_MAP = {
  users: TABLES.users,
  matches: TABLES.matches,
  predictions: TABLES.predictions,
  prizes: TABLES.prizes,
  redemptions: TABLES.redemptions,
  supportTickets: TABLES.support_tickets,
  pointsBonuses: TABLES.points_bonuses,
  appSettings: TABLES.app_settings,
  auditLogs: TABLES.audit_logs,
  referrals: TABLES.referrals,
  referralCommissions: TABLES.referral_commissions,
};

// --- Sincronización con Supabase ---

const tableNameToSupabase = (jsKey) => TABLE_MAP[jsKey] || jsKey;

const syncTableToSupabaseFn = async (jsKey, records) => {
  const tableName = tableNameToSupabase(jsKey);
  if (!tableName || !records || !isSupabaseAvailable()) return;
  const key = `sync_${jsKey}`;
  if (_syncInProgress[key]) return;
  _syncInProgress[key] = true;
  try {
    if (jsKey === 'appSettings') {
      if (!supabase) return;
      const cleaned = stripLocalFields(records);
      if (cleaned.length === 0) return;
      // UPSERT con onConflict 'key': requiere UNIQUE constraint en app_settings.key
      // Más seguro que DELETE+INSERT (no borra datos si el INSERT falla)
      const { error } = await supabase.from(tableName).upsert(cleaned, { onConflict: 'key' });
      if (error) throw error;
    } else {
      await syncTableToSupabase(tableName, records);
    }
  } catch (err) {
    // Silently fail
  } finally {
    _syncInProgress[key] = false;
  }
};

const syncTableFromSupabaseFn = async (jsKey, localRecords) => {
  const tableName = tableNameToSupabase(jsKey);
  if (!tableName || !isSupabaseAvailable()) return localRecords;
  try {
    const result = await syncTableFromSupabase(tableName, localRecords, { lastCleanAt: _lastCleanAt });
    if (result) return result;
  } catch {}
  return localRecords;
};

// Dispara un evento para que los componentes React se actualicen
const notifyReactComponents = () => {
  window.dispatchEvent(new CustomEvent('db-synced'));
};

const getDefaults = () => ({
  users: [],
  matches: [],
  predictions: [],
  prizes: [],
  redemptions: [],
  supportTickets: [],
  pointsBonuses: [],
  appSettings: [],
  auditLogs: [],
  referrals: [],
  referralCommissions: [],
  currentUserEmail: null,
});

export const db = {
  _data: null,

  // Dispara un evento para que los componentes React se actualicen
  _notifyReactComponents() {
    window.dispatchEvent(new CustomEvent('db-synced'));
  },

  _init(opts) {
    if (!this._data) {
      const loaded = load();
      // Migración: garantizar que todas las keys nuevas existan (ej. referrals,
      // referralCommissions se agregaron después — usuarios con localStorage viejo
      // no las tienen, y d.referrals.push() tira TypeError).
      this._data = { ...getDefaults(), ...loaded };
      // Limpiar live_started_at para partidos que NO están en vivo (evita timers stale)
      this._cleanStaleLiveTimers();
      this.seedIfEmpty();
      // Cargar datos desde Supabase en segundo plano (skipSync para operaciones destructivas)
      if (!opts?.skipSync) {
        this._syncAllFromSupabase().then(() => {
          // Subir datos locales que aun no esten en la nube (ej: cambios del admin antes del deploy)
          this._syncAllToSupabase();
        });
      }

      // Polling automático cada 60s para detectar cambios de otros admins/dispositivos
      if (!_pollInterval) {
        _pollInterval = setInterval(() => {
          this._syncAllFromSupabase();
        }, 60000);
      }
    }
    return this._data;
  },

  _persist() {
    save(this._data);
    // Limpiar locks para que los cambios se suban a Supabase
    _syncInProgress = {};
    return this._syncAllToSupabase();
  },

  // Sincronizar TODAS las tablas desde Supabase
  async _syncAllFromSupabase() {
    if (!isSupabaseAvailable()) return;
    // Evitar race condition: si estamos subiendo datos, no bajar al mismo tiempo
    if (_syncToSupabaseInProgress) {

      return;
    }
    // Bloqueado durante operaciones destructivas (cleanUserData)
    if (_blockFromSync) return;
    return this._syncAllFromSupabaseInternal();
  },

  // Forzar sincronización desde Supabase (ignora el lock de subida)
  async _syncAllFromSupabaseForce() {
    if (!isSupabaseAvailable()) return;
    return this._syncAllFromSupabaseInternal();
  },

  // Implementación interna de sincronización desde Supabase
  async _syncAllFromSupabaseInternal() {
    if (_syncFromSupabaseInProgress || _blockFromSync) return;

    _syncFromSupabaseInProgress = true;
    try {
      // 0. Verificar si hay un timestamp de limpieza en Supabase
      //    más reciente que el local — evita que clientes re-suban datos borrados
      if (supabase) {
        try {
          const { data: settings } = await supabase.from('app_settings').select('key, value');
          if (settings) {
            const cleanSetting = settings.find(s => s.key === 'last_clean');
            if (cleanSetting?.value) {
              const remoteCleanAt = cleanSetting.value;
              if (!_lastCleanAt || new Date(remoteCleanAt).getTime() > new Date(_lastCleanAt).getTime()) {
                _lastCleanAt = remoteCleanAt;
                try { localStorage.setItem(CLEAN_AT_KEY, _lastCleanAt); } catch {}

              }
            }
          }
        } catch {}
      }

      const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings', 'auditLogs', 'referrals', 'referralCommissions'];
      let changed = false;

      const syncResults = await Promise.all(
        tablesToSync.map(async (jsKey) => {
          const localRecords = this._data[jsKey] || [];
          const remoteRecords = await syncTableFromSupabaseFn(jsKey, localRecords);
          return { jsKey, localRecords, remoteRecords };
        })
      );

      for (const { jsKey, localRecords, remoteRecords } of syncResults) {
        if (remoteRecords && remoteRecords !== localRecords) {
          // Si se agregaron registros localmente mientras se sincronizaba (ej: una predicción),
          // mezclarlos para no perderlos
          const currentLocal = this._data[jsKey] || [];
          if (currentLocal.length > localRecords.length) {
            const remoteIds = new Set(remoteRecords.map(r => r.id));
            for (const rec of currentLocal) {
              if (!remoteIds.has(rec.id)) {
                remoteRecords.push(rec);
              }
            }
          }
          this._data[jsKey] = remoteRecords;
          changed = true;
        }
      }

      if (changed) {
        save(this._data);

        this._notifyReactComponents();
      }
    } catch {
      // Error silencioso al sincronizar desde Supabase
    } finally {
      _syncFromSupabaseInProgress = false;
    }
  },

  // Procesar eliminaciones pendientes en Supabase
  async _processPendingDeletes() {
    if (_pendingDeletes.length > 0 && supabase) {
      const deletes = _pendingDeletes.splice(0);
      await Promise.all(
        deletes.map(({ tableName, id }) =>
          supabase.from(tableName).delete().eq('id', id).then(() => null).catch(() => null)
        )
      );
    }
  },

  // Sincronizar un solo lote de tablas a Supabase
  async _syncBatchToSupabase() {
    _syncToSupabaseInProgress = true;
    try {
      const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings', 'auditLogs', 'referrals', 'referralCommissions'];
      const tablesWithData = tablesToSync.reduce((acc, jsKey) => {
        const records = this._data[jsKey] || [];
        if (records.length > 0) acc.push({ jsKey, records });
        return acc;
      }, []);
      await Promise.all(
        tablesWithData.map(({ jsKey, records }) => syncTableToSupabaseFn(jsKey, records))
      );
    } finally {
      _syncToSupabaseInProgress = false;
    }
  },

  // Sincronizar TODAS las tablas a Supabase (con await para asegurar que llegue)
  async _syncAllToSupabase() {
    if (!isSupabaseAvailable()) return;
    if (_syncToSupabaseInProgress) {
      _resyncQueued = true;
      return;
    }

    await this._processPendingDeletes();

    // Bucle recursivo: procesa todas las re-sincronizaciones encoladas
    const runSync = async () => {
      await this._syncBatchToSupabase();
      if (_resyncQueued) {
        _resyncQueued = false;
        await runSync();
      }
    };
    await runSync();
  },

  // Forzar sincronización manual desde Supabase
  async forceSync() {
    await this._syncAllFromSupabaseForce();
  },

  // Sincronizar desde Supabase (forzar inmediato)
  async forceSyncFromCloud() {
    if (!isSupabaseAvailable()) {
      return { success: false, error: 'Supabase no está configurado' };
    }
    this._init();
    await this._syncAllFromSupabaseForce();
    return { success: true };
  },

  // Sincronizar TODOS los datos locales a Supabase (push to cloud)
  async syncToCloud() {
    if (!isSupabaseAvailable()) {
      return { success: false, error: 'Supabase no está configurado. Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env' };
    }
    this._init();
    const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings', 'auditLogs', 'referrals', 'referralCommissions'];
    const syncResults = await Promise.allSettled(
      tablesToSync.map(async (jsKey) => {
        const records = this._data[jsKey] || [];
        const tableName = tableNameToSupabase(jsKey);
        if (records.length > 0) {
          await syncTableToSupabase(tableName, records);
        }
        return { table: tableName, count: records.length, status: records.length > 0 ? 'ok' : 'empty' };
      })
    );
    const results = syncResults.map(r =>
      r.status === 'fulfilled' ? r.value : { table: 'unknown', count: 0, status: 'error', error: r.reason?.message }
    );
    return { success: true, results };
  },

  /**
   * Limpiar live_started_at de partidos cuyo status NO es 'live'.
   * Esto evita que timers stale persistan en localStorage al recargar
   * después de que un partido estuvo en vivo en una sesión anterior.
   */
  _cleanStaleLiveTimers() {
    if (!this._data?.matches) return;
    let changed = false;
    for (const m of this._data.matches) {
      if (m.status !== 'live' && m.live_started_at != null) {
        m.live_started_at = null;
        changed = true;
      }
    }
    if (changed) {
      save(this._data);
    }
  },

  reset() {
    this._data = getDefaults();
    this._persist();
  },

  /**
   * Eliminar todos los datos de usuarios NO admin:
   * - Usuarios (excepto admin)
   * - Pronósticos
   * - Canjes
   * - Puntos extra (pointsBonuses)
   * - Tickets de soporte
   * - Referidos (referrals)
   * - Comisiones de referidos (referralCommissions)
   * También resetea referral_points y referred_by en admin users.
   */
  async cleanUserData() {
    // Bloquear sync FROM Supabase para evitar race condition:
    // _init() lanza _syncAllFromSupabase() en background que restauraría
    // los usuarios borrados desde Supabase después de la limpieza local.
    _blockFromSync = true;
    const d = this._init({ skipSync: true });
    const now = getNow();

    // 1. Identificar usuarios NO admin y sus emails
    const nonAdminEmails = new Set();
    const nonAdminIds = [];
    for (const u of d.users || []) {
      if (u.role !== 'admin') {
        nonAdminEmails.add(u.email);
        nonAdminIds.push(u.id);
      }
    }

    const adminUsers = (d.users || []).filter(u => u.role === 'admin');

    // 2. Eliminar TODAS las predicciones (incluye admin)
    const predsToDelete = [...(d.predictions || [])];
    d.predictions = [];

    // 3. Eliminar TODOS los canjes
    const redemptionsToDelete = [...(d.redemptions || [])];
    d.redemptions = [];

    // 4. Eliminar todos los puntos extra (pointsBonuses)
    const bonusesToDelete = (d.pointsBonuses || []);
    d.pointsBonuses = [];

    // 5. Eliminar TODOS los tickets de soporte
    const ticketsToDelete = [...(d.supportTickets || [])];
    d.supportTickets = [];

    // 6. Eliminar todos los referidos (registros referrer→referred)
    const referralsToDelete = [...(d.referrals || [])];
    d.referrals = [];

    // 7. Eliminar todas las comisiones de referidos
    const commissionsToDelete = [...(d.referralCommissions || [])];
    d.referralCommissions = [];

    // 8. Resetear contadores de referidos en usuarios admin
    for (const u of d.users) {
      u.referral_points = 0;
      u.referred_by = null;
      u.updated_at = now;
    }

    // 9. Eliminar usuarios NO admin
    d.users = adminUsers;

    // 7. Guardar en localStorage
    save(d);
    _syncInProgress = {};

    // ── Eliminar DIRECTAMENTE de Supabase ──
    // Estrategia: 1) SELECT ids, 2) DELETE por batches con .in('id', ids)
    // Esto es más fiable que filtros neq/gt que pueden fallar por nulls o RLS.
    if (isSupabaseAvailable() && supabase) {
      const BATCH = 100;

      // Helper: fetch all IDs then batch-delete (all batches in parallel)
      const deleteAllFromTable = async (table) => {
        try {
          const { data: rows, error: fetchErr } = await supabase
            .from(table).select('id').limit(5000);
          if (fetchErr || !rows || rows.length === 0) return;
          const idBatches = [];
          for (let i = 0; i < rows.length; i += BATCH) {
            idBatches.push(rows.slice(i, i + BATCH).map(r => r.id));
          }
          await Promise.all(idBatches.map(async (ids) => {
            const { error } = await supabase.from(table).delete().in('id', ids);
            if (error) {/* Error silencioso eliminando batch */}
          }));
        } catch {}
      };

      // 1. Eliminar usuarios NO admin: fetch IDs, filter out admin, batch-delete
      try {
        const { data: allUsers, error: fetchErr } = await supabase
          .from('users').select('id, role').limit(5000);
        if (!fetchErr && allUsers && allUsers.length > 0) {
          const nonAdminIds = [];
          for (const u of allUsers) if (u.role !== 'admin') nonAdminIds.push(u.id);
          const batches = [];
          for (let i = 0; i < nonAdminIds.length; i += BATCH) {
            batches.push(nonAdminIds.slice(i, i + BATCH));
          }
          await Promise.all(batches.map(batch => supabase.from('users').delete().in('id', batch)));
        }
      } catch {}

      // 2-5. Eliminar TODO de tablas secundarias en paralelo
      await Promise.all([
        deleteAllFromTable('predictions'),
        deleteAllFromTable('redemptions'),
        deleteAllFromTable('points_bonuses'),
        deleteAllFromTable('support_tickets'),
        deleteAllFromTable('referrals'),
        deleteAllFromTable('referral_commissions'),
      ]);



      // Limpiar _pendingDeletes
      _pendingDeletes.length = 0;

      // Guardar timestamp de limpieza en Supabase (app_settings)
      // para que TODOS los clientes sepan que no deben re-subir datos viejos
      try {
        const cleanTimestamp = getNow();
        _lastCleanAt = cleanTimestamp;
        try { localStorage.setItem(CLEAN_AT_KEY, _lastCleanAt); } catch {}
        // Upsert del setting last_clean
        const { data: existingSettings } = await supabase
          .from('app_settings').select('id').eq('key', 'last_clean');
        if (existingSettings && existingSettings.length > 0) {
          await supabase.from('app_settings').update({ value: cleanTimestamp }).eq('id', existingSettings[0].id);
        } else {
          await supabase.from('app_settings').insert({ id: makeId(), key: 'last_clean', value: cleanTimestamp });
        }
        // Agregar last_clean al array local de appSettings para que
        // _syncAllToSupabase() lo sincronice correctamente (no lo borre)
        const existingLocal = d.appSettings.findIndex(s => s.key === 'last_clean');
        const cleanRecord = { id: makeId(), key: 'last_clean', value: cleanTimestamp, created_date: now };
        if (existingLocal >= 0) {
          d.appSettings[existingLocal] = { ...d.appSettings[existingLocal], value: cleanTimestamp };
        } else {
          d.appSettings.push(cleanRecord);
        }
        save(d);

      } catch (err) {
        /* Error silencioso guardando last_clean */
      }

      // Subir admin user + tablas que NO se limpiaron (matches, prizes, appSettings)
      await this._syncAllToSupabase();

      // ── Pase de verificación: re-eliminar cualquier residuo en Supabase ──
      // (Por si el primer batch falló parcialmente o quedaron filas huerfanas)
      try {
        const tableNames = ['predictions', 'redemptions', 'points_bonuses', 'support_tickets', 'referrals', 'referral_commissions'];
        await Promise.all(
          tableNames.map(async (table) => {
            try {
              const { data: remaining } = await supabase.from(table).select('id').limit(5000);
              if (remaining && remaining.length > 0) {
                const ids = remaining.map(r => r.id);
                const batches = [];
                for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
                await Promise.all(batches.map((batch) => supabase.from(table).delete().in('id', batch)));
              }
            } catch {}
          })
        );
        // Re-eliminar usuarios no-admin que pudieran haber quedado
        try {
          const { data: stillUsers } = await supabase.from('users').select('id, role').limit(5000);
          if (stillUsers && stillUsers.length > 0) {
            const stillNonAdmin = stillUsers.filter(u => u.role !== 'admin').map(u => u.id);
            if (stillNonAdmin.length > 0) {
              const batches = [];
              for (let i = 0; i < stillNonAdmin.length; i += BATCH) batches.push(stillNonAdmin.slice(i, i + BATCH));
              await Promise.all(batches.map((batch) => supabase.from('users').delete().in('id', batch)));
            }
          }
        } catch {}
      } catch {}

      // Forzar un sync final desde Supabase para que el estado en memoria
      // refleje exactamente lo que hay en la nube (sin datos residuales).
      try {
        await this._syncAllFromSupabaseForce();
      } catch {}
    }

    _blockFromSync = false;
    notifyReactComponents();

    return {
      deletedUsers: nonAdminIds.length,
      deletedPredictions: predsToDelete.length,
      deletedRedemptions: redemptionsToDelete.length,
      deletedBonuses: bonusesToDelete.length,
      deletedReferrals: referralsToDelete.length,
      deletedCommissions: commissionsToDelete.length,
    };
  },

  // --- Users ---
  users: {
    list(order) {
      const d = db._init().users;
      return sortBy(d, order);
    },
    filter(fields, order) {
      let d = db._init().users.filter(u =>
        Object.entries(fields).every(([k, v]) => u[k] === v)
      );
      if (order) {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        d.sort((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
      }
      return d;
    },
    async create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.users.push(record);
      await db._persist();
      return record;
    },
    update(id, data) {
      const d = db._init();
      const idx = d.users.findIndex(u => u.id === id);
      if (idx === -1) throw new Error('User not found');
      d.users[idx] = { ...d.users[idx], ...data, updated_at: getNow() };
      db._persist();
      return d.users[idx];
    },
    findById(id) {
      return db._init().users.find(u => u.id === id);
    },
    findByEmail(email) {
      return db._init().users.find(u => u.email === email);
    },
    async remove(id) {
      const d = db._init();
      const idx = d.users.findIndex(u => u.id === id);
      if (idx === -1) throw new Error('User not found');
      const user = d.users[idx];
      const email = user.email;

      // 1. Eliminar predicciones del usuario
      const predsToDelete = (d.predictions || []).filter(p => p.user_email === email);
      const predIds = new Set(predsToDelete.map(p => p.id));
      d.predictions = (d.predictions || []).filter(p => !predIds.has(p.id));

      // 2. Eliminar canjes del usuario
      const redemptionsToDelete = (d.redemptions || []).filter(r => r.user_email === email);
      const redIds = new Set(redemptionsToDelete.map(r => r.id));
      d.redemptions = (d.redemptions || []).filter(r => !redIds.has(r.id));

      // 3. Eliminar puntos extra del usuario
      const bonusesToDelete = (d.pointsBonuses || []).filter(b => b.user_email === email);
      const bonusIds = new Set(bonusesToDelete.map(b => b.id));
      d.pointsBonuses = (d.pointsBonuses || []).filter(b => !bonusIds.has(b.id));

      // 4. Eliminar tickets de soporte del usuario
      const ticketsToDelete = (d.supportTickets || []).filter(t => t.user_email === email);
      const ticketIds = new Set(ticketsToDelete.map(t => t.id));
      d.supportTickets = (d.supportTickets || []).filter(t => !ticketIds.has(t.id));

      // 5. Eliminar el usuario del array
      d.users.splice(idx, 1);

      // 6. Registrar en el log de auditoría
      const me = db.getCurrentUser();
      db.auditLogs.create({
        action: 'user_deleted',
        admin_email: me?.email || 'desconocido',
        admin_name: me?.full_name || 'Desconocido',
        deleted_user_email: email,
        deleted_user_name: user.full_name || '',
        deleted_user_instagram: user.instagram || '',
        details: JSON.stringify({
          deletedPredictions: predsToDelete.length,
          deletedRedemptions: redemptionsToDelete.length,
          deletedBonuses: bonusesToDelete.length,
          deletedTickets: ticketsToDelete.length,
        }),
      });

      // 7. Marcar todas las eliminaciones pendientes para Supabase
      _pendingDeletes.push({ tableName: 'users', id });
      for (const p of predsToDelete) _pendingDeletes.push({ tableName: 'predictions', id: p.id });
      for (const r of redemptionsToDelete) _pendingDeletes.push({ tableName: 'redemptions', id: r.id });
      for (const b of bonusesToDelete) _pendingDeletes.push({ tableName: 'points_bonuses', id: b.id });
      for (const t of ticketsToDelete) _pendingDeletes.push({ tableName: 'support_tickets', id: t.id });

      // 8. Persistir y sincronizar
      save(d);
      await db._syncAllToSupabase();
      notifyReactComponents();

      return {
        user,
        deletedPredictions: predsToDelete.length,
        deletedRedemptions: redemptionsToDelete.length,
        deletedBonuses: bonusesToDelete.length,
        deletedTickets: ticketsToDelete.length,
      };
    },
  },

  // --- Matches ---
  matches: {
    list(order) {
      const d = db._init().matches;
      return sortBy(d, order);
    },
    filter(fields, order) {
      let d = db._init().matches.filter(m =>
        Object.entries(fields).every(([k, v]) => m[k] === v)
      );
      if (order) {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        d.sort((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
      }
      return d;
    },
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.matches.push(record);
      db._persist();
      return record;
    },
    update(id, data) {
      const d = db._init();
      const idx = d.matches.findIndex(m => m.id === id);
      if (idx === -1) throw new Error('Match not found');
      d.matches[idx] = { ...d.matches[idx], ...data, updated_at: getNow() };
      db._persist();
      return d.matches[idx];
    },
    async clearAll() {
      const d = db._init();
      // Eliminar directamente de Supabase si está disponible (await para evitar race condition con polling)
      if (isSupabaseAvailable() && supabase && d.matches.length > 0) {
        const matchIds = d.matches.map(m => m.id);
        // Eliminar en lotes para evitar URLs too long
        const batchSize = 50;
        const promises = [];
        for (let i = 0; i < matchIds.length; i += batchSize) {
          const batch = matchIds.slice(i, i + batchSize);
          promises.push(supabase.from('matches').delete().in('id', batch));
        }
        await Promise.all(promises);
      }
      d.matches = [];
      db._persist();
    },

    /**
     * Reiniciar TODOS los partidos a estado Pendiente, limpiando resultados,
     * tiempos en vivo, y reiniciando todas las predicciones asociadas.
     * Los partidos NO se eliminan — solo se resetean.
     *
     * Usa UPDATE directo a Supabase con solo las columnas que existen
     * en la BD (evitando campos locales como live_started_at que no
     * están en el esquema y causan fallos silenciosos con upsert).
     */
    async resetAll() {
      const d = db._init();
      if (d.matches.length === 0) return;

      const now = new Date().toISOString();

      // 1. Resetear todos los partidos a Pendiente, limpiar resultados y timer
      for (const m of d.matches) {
        m.status = 'pending';
        m.result_team1 = null;
        m.result_team2 = null;
        m.elapsed = null;
        m.live_started_at = null;
        m.updated_at = now;
      }

      // 2. Eliminar TODAS las predicciones de estos partidos (para que usuarios hagan nuevas)
      const matchIds = new Set(d.matches.map(m => m.id));
      const predsToDelete = (d.predictions || []).filter(p => matchIds.has(p.match_id));
      const deletedPredIds = new Set(predsToDelete.map(p => p.id));
      for (const p of predsToDelete) {
        _pendingDeletes.push({ tableName: 'predictions', id: p.id });
      }
      d.predictions = (d.predictions || []).filter(p => !deletedPredIds.has(p.id));

      // 3. Recalcular puntos de usuarios — todas las predicciones se reiniciaron,
      // así que los puntos de predicción vuelven a 0
      for (const u of d.users || []) {
        if (u.role === 'admin') continue;
        u.prediction_points = 0;
        u.total_points = (u.bonus_points || 0) + (u.referral_points || 0);
        u.updated_at = now;
      }

      // 4. Guardar en localStorage inmediatamente
      save(d);

      // 5. Actualizar Supabase con UPDATE directo de solo las columnas que existen
      //    (evitando campos locales como live_started_at, updated_at, etc.)
      if (isSupabaseAvailable() && supabase) {
        const BATCH = 50;

        // ── Matches: UPDATE solo status, resultados y elapsed ──
        const allMatchIds = d.matches.map(m => m.id);
        const matchBatches = [];
        for (let i = 0; i < allMatchIds.length; i += BATCH) {
          matchBatches.push(allMatchIds.slice(i, i + BATCH));
        }
        await Promise.all(matchBatches.map(async (idBatch) => {
          try {
            const { error } = await supabase
              .from('matches')
              .update({ status: 'pending', result_team1: null, result_team2: null, elapsed: null })
              .in('id', idBatch);
            if (error) {/* Error silencioso matches update */}
          } catch {
            /* Error silencioso matches update */
          }
        }));

        // ── Predictions: DELETE todas las predicciones de partidos afectados ──
        if (predsToDelete.length > 0) {
          const predIds = predsToDelete.map(p => p.id);
          const predBatches = [];
          for (let i = 0; i < predIds.length; i += BATCH) {
            predBatches.push(predIds.slice(i, i + BATCH));
          }
          await Promise.all(predBatches.map(async (idBatch) => {
            try {
              const { error } = await supabase
                .from('predictions')
                .delete()
                .in('id', idBatch);
              if (error) {/* Error silencioso predictions delete */}
            } catch {
              /* Error silencioso predictions delete */
            }
          }));
        }

        // ── Users: UPDATE prediction_points, total_points ──
        const usersToSync = d.users.filter(u => u.role !== 'admin');
        if (usersToSync.length > 0) {
          // Usar upserts pequeños con solo id + puntos (campos que existen en Supabase)
          const userBatches = [];
          for (let i = 0; i < usersToSync.length; i += BATCH) {
            userBatches.push(usersToSync.slice(i, i + BATCH).map(u => ({
              id: u.id,
              prediction_points: 0,
              total_points: u.bonus_points || 0,
            })));
          }
          await Promise.all(userBatches.map(async (batch) => {
            try {
              const { error } = await supabase
                .from('users')
                .upsert(batch, { onConflict: 'id' });
              if (error) {/* Error silencioso users upsert */}
            } catch {
              /* Error silencioso users upsert */
            }
          }));
        }
      }

      // 6. Notificar a componentes React
      notifyReactComponents();
    },
    bulkCreate(matchesArray) {
      const d = db._init();
      const now = getNow();

      // Eliminar partidos existentes con mismo fixture_id para evitar duplicados
      const newFixtureIds = new Set(matchesArray.flatMap(m => m.fixture_id ? [m.fixture_id] : []));
      if (newFixtureIds.size > 0) {
        d.matches = d.matches.filter(m => !newFixtureIds.has(m.fixture_id));
      }

      const records = matchesArray.map(m => ({
        id: makeId(),
        created_date: now,
        ...m
      }));
      d.matches.push(...records);
      db._persist();
      return records;
    },

    /**
     * Deduplicar partidos: agrupa por fixture_id, mantiene solo una copia,
     * re-apunta predicciones a la copia conservada y elimina los duplicados.
     * Retorna { deleted, repointed } con el conteo.
     */
    async deduplicate() {
      const d = db._init();
      const predictions = d.predictions || [];
      const matches = d.matches;

      // 1. Agrupar por fixture_id (los que no tienen fixture_id se tratan individualmente)
      const groups = {};
      const noFixture = [];
      for (const m of matches) {
        const key = m.fixture_id != null ? String(m.fixture_id) : null;
        if (key == null) {
          noFixture.push(m);
          continue;
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
      }

      const toDelete = []; // IDs a eliminar
      const repointMap = {}; // matchIdViejo → matchIdNuevo

      for (const key of Object.keys(groups)) {
        const group = groups[key];
        if (group.length <= 1) continue; // no hay duplicado

        // Elegir cuál conservar: el que tenga predicciones; si varios, el más reciente
        let keep = group[0];
        for (const m of group) {
          const hasPreds = predictions.some(p => p.match_id === m.id);
          const currentHasPreds = predictions.some(p => p.match_id === keep.id);
          if (hasPreds && !currentHasPreds) {
            keep = m;
          } else if (hasPreds === currentHasPreds) {
            // Ambos tienen o no tienen predicciones → preferir el que tenga más datos
            const keepScore = Object.keys(keep).length;
            const mScore = Object.keys(m).length;
            if (mScore > keepScore) keep = m;
          }
        }

        // Marcar duplicados para eliminar y crear re-asignaciones
        for (const m of group) {
          if (m.id !== keep.id) {
            toDelete.push(m.id);
            repointMap[m.id] = keep.id;
          }
        }
      }

      if (toDelete.length === 0) {
        return { deleted: 0, repointed: 0 };
      }

      // 2. Re-apuntar predicciones que referencien a un match eliminado
      let repointed = 0;
      for (const pred of predictions) {
        const newMatchId = repointMap[pred.match_id];
        if (newMatchId) {
          pred.match_id = newMatchId;
          pred.updated_at = getNow();
          repointed++;
        }
      }

      // 3. Eliminar duplicados del array local
      const deleteSet = new Set(toDelete);
      d.matches = d.matches.filter(m => !deleteSet.has(m.id));

      // 4. Marcar eliminaciones pendientes para que se borren de Supabase
      for (const id of toDelete) {
        _pendingDeletes.push({ tableName: 'matches', id });
      }

      // 5. Persistir y sincronizar
      save(d);
      await db._syncAllToSupabase();
      notifyReactComponents();

      return { deleted: toDelete.length, repointed };
    },
  },

  // --- Predictions ---
  predictions: {
    list(order) {
      const d = db._init().predictions;
      return sortBy(d, order);
    },
    filter(fields, order) {
      let d = db._init().predictions.filter(p =>
        Object.entries(fields).every(([k, v]) => p[k] === v)
      );
      if (order) {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        d.sort((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
      }
      return d;
    },
    create(data) {
      const d = db._init();
      // Evitar duplicados: un solo pronóstico por usuario por partido
      const existing = d.predictions.find(p => p.user_email === data.user_email && p.match_id === data.match_id);
      if (existing) {
        // Actualizar el existente en lugar de crear duplicado
        Object.assign(existing, data, { updated_at: getNow() });
        db._persist();
        return existing;
      }
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.predictions.push(record);
      db._persist();
      return record;
    },
    update(id, data) {
      const d = db._init();
      const idx = d.predictions.findIndex(p => p.id === id);
      if (idx === -1) throw new Error('Prediction not found');
      d.predictions[idx] = { ...d.predictions[idx], ...data, updated_at: getNow() };
      db._persist();
      return d.predictions[idx];
    },
  },

  // --- Prizes ---
  prizes: {
    list(order) {
      const d = db._init().prizes;
      return sortBy(d, order);
    },
    filter(fields, order) {
      let d = db._init().prizes.filter(p =>
        Object.entries(fields).every(([k, v]) => p[k] === v)
      );
      if (order) {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        d.sort((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
      }
      return d;
    },
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.prizes.push(record);
      db._persist();
      return record;
    },
    update(id, data) {
      const d = db._init();
      const idx = d.prizes.findIndex(p => p.id === id);
      if (idx === -1) throw new Error('Prize not found');
      d.prizes[idx] = { ...d.prizes[idx], ...data, updated_at: getNow() };
      db._persist();
      return d.prizes[idx];
    },
    remove(id) {
      const d = db._init();
      const idx = d.prizes.findIndex(p => p.id === id);
      if (idx === -1) throw new Error('Prize not found');
      d.prizes.splice(idx, 1);
      _pendingDeletes.push({ tableName: 'prizes', id });
      db._persist();
      return true;
    },
  },

  // --- Redemptions ---
  redemptions: {
    list(order) {
      const d = db._init().redemptions;
      return sortBy(d, order);
    },
    filter(fields, order) {
      let d = db._init().redemptions.filter(r =>
        Object.entries(fields).every(([k, v]) => r[k] === v)
      );
      if (order) {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        d.sort((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
      }
      return d;
    },
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.redemptions.push(record);
      db._persist();
      return record;
    },
    update(id, data) {
      const d = db._init();
      const idx = d.redemptions.findIndex(r => r.id === id);
      if (idx === -1) throw new Error('Redemption not found');
      d.redemptions[idx] = { ...d.redemptions[idx], ...data, updated_at: getNow() };
      db._persist();
      return d.redemptions[idx];
    },
  },

  // --- SupportTickets ---
  /**
   * Migra un ticket del formato antiguo (message + admin_reply) al nuevo formato (messages array).
   */
  _migrateTicket(t) {
    if (!t.messages && (t.message || t.admin_reply)) {
      const msgs = [];
      if (t.message) {
        msgs.push({ sender: 'user', text: t.message, created_date: t.created_date || getNow() });
      }
      if (t.admin_reply) {
        msgs.push({ sender: 'admin', text: t.admin_reply, created_date: t.updated_at || getNow() });
      }
      t.messages = msgs;
      t.message = undefined;
      t.admin_reply = undefined;
    }
    if (!t.messages) t.messages = [];
    if (!t.user_read_at) t.user_read_at = t.created_date || getNow();
    if (!t.admin_read_at) t.admin_read_at = t.created_date || getNow();
    return t;
  },

  supportTickets: {
    list(order) {
      const d = db._init().supportTickets;
      return sortBy(d, order).map(t => db._migrateTicket(t));
    },
    filter(fields, order) {
      let d = db._init().supportTickets.filter(t =>
        Object.entries(fields).every(([k, v]) => t[k] === v)
      );
      if (order) {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        d.sort((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
      }
      return d.map(t => db._migrateTicket(t));
    },
    create(data) {
      const d = db._init();
      const now = getNow();
      const initialMsg = data.message || '';
      const record = {
        id: makeId(),
        created_date: now,
        subject: data.subject || '',
        user_email: data.user_email || '',
        user_name: data.user_name || '',
        status: data.status || 'pending',
        verified: false,
        verified_at: null,
        verified_by: null,
        rejected: false,
        rejected_at: null,
        rejected_by: null,
        messages: initialMsg
          ? [{ sender: 'user', text: initialMsg, created_date: now }]
          : [],
        user_read_at: now,
        admin_read_at: data.admin_read_at || null,
        ...data,
      };
      // Limpiar campos viejos si los pasaron
      delete record.message;
      delete record.admin_reply;
      d.supportTickets.push(record);
      db._persist();
      return record;
    },
    update(id, data) {
      const d = db._init();
      const idx = d.supportTickets.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Ticket not found');
      // No permitir sobrescribir messages con update directo
      if (data.messages) delete data.messages;
      d.supportTickets[idx] = { ...d.supportTickets[idx], ...data, updated_at: getNow() };
      db._persist();
      return db._migrateTicket(d.supportTickets[idx]);
    },

    /**
     * Agrega un mensaje al chat del ticket.
     */
    addMessage(id, sender, text) {
      const d = db._init();
      const idx = d.supportTickets.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Ticket not found');
      if (!d.supportTickets[idx].messages) {
        db._migrateTicket(d.supportTickets[idx]);
      }
      const msg = { sender, text, created_date: getNow() };
      d.supportTickets[idx].messages.push(msg);
      d.supportTickets[idx].updated_at = getNow();
      // Si el usuario responde, el ticket vuelve a "pending"; si el admin responde, "answered"
      if (sender === 'user' && d.supportTickets[idx].status !== 'closed') {
        d.supportTickets[idx].status = 'pending';
      } else if (sender === 'admin') {
        d.supportTickets[idx].status = 'answered';
      }
      db._persist();
      return d.supportTickets[idx];
    },

    /**
     * Marca un ticket como leído por el usuario o admin.
     */
    markRead(id, role) {
      const d = db._init();
      const idx = d.supportTickets.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Ticket not found');
      const now = getNow();
      if (role === 'user') {
        d.supportTickets[idx].user_read_at = now;
      } else if (role === 'admin') {
        d.supportTickets[idx].admin_read_at = now;
      }
      db._persist();
    },

    /**
     * Cuenta tickets no leídos para un usuario (tickets con mensajes del admin
     * después del último read del usuario).
     */
    unreadCount(email) {
      const d = db._init().supportTickets.filter(t => t.user_email === email && t.status !== 'closed');
      let count = 0;
      for (const t of d) {
        db._migrateTicket(t);
        const lastRead = new Date(t.user_read_at || 0).getTime();
        const hasUnread = (t.messages || []).some(m =>
          m.sender === 'admin' && new Date(m.created_date).getTime() > lastRead
        );
        if (hasUnread) count++;
      }
      return count;
    },

    /**
     * Marca un ticket como verificado (conversación real confirmada por el admin).
     * Retorna el ticket actualizado.
     */
    verify(id, adminEmail) {
      const d = db._init();
      const idx = d.supportTickets.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Ticket not found');
      d.supportTickets[idx].verified = true;
      d.supportTickets[idx].verified_at = getNow();
      d.supportTickets[idx].verified_by = adminEmail || 'admin';
      d.supportTickets[idx].updated_at = getNow();
      // Registrar en auditoría
      d.auditLogs.push({
        id: makeId(),
        created_date: getNow(),
        action: 'ticket_verified',
        admin_email: adminEmail || 'admin',
        details: JSON.stringify({ ticket_id: id, subject: d.supportTickets[idx].subject }),
      });
      save(d);
      _syncInProgress = {};
      db._syncAllToSupabase();
      notifyReactComponents();
      return d.supportTickets[idx];
    },

    /**
     * Marca un ticket como rechazado (conversación NO real / spam / falsa).
     * Retorna el ticket actualizado.
     */
    reject(id, adminEmail) {
      const d = db._init();
      const idx = d.supportTickets.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Ticket not found');
      d.supportTickets[idx].rejected = true;
      d.supportTickets[idx].rejected_at = getNow();
      d.supportTickets[idx].rejected_by = adminEmail || 'admin';
      d.supportTickets[idx].updated_at = getNow();
      // Cerrar el ticket automáticamente al rechazar
      d.supportTickets[idx].status = 'closed';
      // Registrar en auditoría
      d.auditLogs.push({
        id: makeId(),
        created_date: getNow(),
        action: 'ticket_rejected',
        admin_email: adminEmail || 'admin',
        details: JSON.stringify({ ticket_id: id, subject: d.supportTickets[idx].subject }),
      });
      save(d);
      _syncInProgress = {};
      db._syncAllToSupabase();
      notifyReactComponents();
      return d.supportTickets[idx];
    },

    /**
     * Cuenta tickets no leídos para el admin (tickets con mensajes del usuario
     * después del último read del admin, excluyendo cerrados).
     */
    adminUnreadCount() {
      const d = db._init().supportTickets.filter(t => t.status !== 'closed');
      let count = 0;
      for (const t of d) {
        db._migrateTicket(t);
        const lastRead = new Date(t.admin_read_at || 0).getTime();
        const hasUnread = (t.messages || []).some(m =>
          m.sender === 'user' && new Date(m.created_date).getTime() > lastRead
        );
        if (hasUnread) count++;
      }
      return count;
    },
  },

  // --- PointsBonuses ---
  pointsBonuses: {
    list(order) {
      const d = db._init().pointsBonuses;
      return sortBy(d, order);
    },
    filter(fields, order) {
      let d = db._init().pointsBonuses.filter(b =>
        Object.entries(fields).every(([k, v]) => b[k] === v)
      );
      if (order) {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        d.sort((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
      }
      return d;
    },
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.pointsBonuses.push(record);
      db._persist();
      return record;
    },
  },

  // --- AppSettings ---
  appSettings: {
    list() {
      return [...db._init().appSettings];
    },
    findByKey(key) {
      return db._init().appSettings.find(s => s.key === key);
    },
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.appSettings.push(record);
      db._persist();
      return record;
    },
    update(id, data) {
      const d = db._init();
      const idx = d.appSettings.findIndex(s => s.id === id);
      if (idx === -1) throw new Error('Setting not found');
      d.appSettings[idx] = { ...d.appSettings[idx], ...data, updated_at: getNow() };
      db._persist();
      return d.appSettings[idx];
    },
  },

  // --- Audit Logs ---
  auditLogs: {
    list(order) {
      const d = db._init().auditLogs;
      return sortBy(d, order || '-created_date');
    },
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.auditLogs.push(record);
      db._persist();
      return record;
    },
  },

  // --- Referral helpers ---

  /**
   * Genera un código de referido único basado en el nombre/email del usuario.
   */
  generateReferralCode(name, email) {
    const prefix = (name || email || 'user').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${suffix}`;
  },

  /**
   * Acredita el bono de referido (10 pts) a quien refirió a un nuevo usuario.
   * Retorna el usuario actualizado o null si no hay referente.
   */
  async awardReferralBonus(referralCode, referredEmail) {
    if (!referralCode) return null;
    const d = db._init();
    const referrer = d.users.find(u => u.referral_code === referralCode);
    if (!referrer) return null;
    const bonusAmount = referrer.referral_bonus_amount || 10;
    const newRefPoints = (referrer.referral_points || 0) + bonusAmount;
    const newTotal = (referrer.total_points || 0) + bonusAmount;
    referrer.referral_points = newRefPoints;
    referrer.total_points = newTotal;
    referrer.updated_at = getNow();
    // Registrar la comisión para que aparezca en el historial
    d.referralCommissions.push({
      id: makeId(),
      from_email: referredEmail || 'desconocido',
      to_email: referrer.email,
      match_id: null,
      level: 1,
      points_earned: bonusAmount,
      type: 'registration',
      created_date: getNow(),
    });
    save(d);
    _syncInProgress = {};
    await db._syncAllToSupabase();
    notifyReactComponents();
    return referrer;
  },

  /**
   * Acredita la comisión por acierto de referido (5 pts) al referente.
   * Retorna el usuario actualizado o null si no hay referente.
   */
  async awardReferralCommission(referredEmail, matchId) {
    if (!referredEmail) return null;
    const d = db._init();
    const referred = d.users.find(u => u.email === referredEmail);
    if (!referred || !referred.referred_by) return null;
    const referrer = d.users.find(u => u.referral_code === referred.referred_by);
    if (!referrer) return null;
    const newRefPoints = (referrer.referral_points || 0) + 5;
    const newPredPoints = (referrer.prediction_points || 0) + 5;
    const newTotal = (referrer.total_points || 0) + 5;
    referrer.referral_points = newRefPoints;
    referrer.prediction_points = newPredPoints;
    referrer.total_points = newTotal;
    referrer.updated_at = getNow();
    // Registrar la comisión
    d.referralCommissions.push({
      id: makeId(),
      from_email: referredEmail,
      to_email: referrer.email,
      match_id: matchId,
      level: 1,
      points_earned: 5,
      created_date: getNow(),
    });
    save(d);
    _syncInProgress = {};
    await db._syncAllToSupabase();
    notifyReactComponents();
    return referrer;
  },

  // --- Referrals ---
  referrals: {
    list(order) {
      const d = db._init().referrals;
      return sortBy(d, order || '-created_date');
    },
    findByEmail(email) {
      return db._init().referrals.find(r => r.referred_email === email);
    },
    findByReferrer(email) {
      return db._init().referrals.filter(r => r.referrer_email === email);
    },
    countByReferrer(email) {
      return db._init().referrals.filter(r => r.referrer_email === email).length;
    },
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.referrals.push(record);
      db._persist();
      return record;
    },
  },

  // --- Referral Commissions ---
  referralCommissions: {
    list(order) {
      const d = db._init().referralCommissions;
      return sortBy(d, order || '-created_date');
    },
    sumByReferrer(email) {
      return db._init().referralCommissions
        .filter(c => c.to_email === email)
        .reduce((sum, c) => sum + (c.points_earned || 0), 0);
    },
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.referralCommissions.push(record);
      db._persist();
      return record;
    },
  },

  // --- Auth ---
  getCurrentUserEmail() {
    return db._init().currentUserEmail;
  },
  setCurrentUserEmail(email) {
    db._init().currentUserEmail = email;
    db._persist();
  },
  getCurrentUser() {
    const email = db.getCurrentUserEmail();
    if (!email) return null;
    return db.users.findByEmail(email);
  },

  // --- Seed ---
  seedIfEmpty() {
    const d = this._init();
    // Solo seedear admin si no existe ni por email ni por rol
    const hasAdmin = d.users.some(u => u.email === 'admin@chessking.com' || u.role === 'admin');
    if (!hasAdmin) {
      const admin = {
        id: makeId(),
        email: 'admin@chessking.com',
        full_name: 'Admin ChessKing',
        role: 'admin',
        cedula: 'ADMIN-001',
        instagram: 'chessking_admin',
        tiktok: 'chessking_admin',
        phone: '+507 6000-0000',
        total_points: 0,
        prediction_points: 0,
        bonus_points: 0,
        profile_complete: true,
        created_date: getNow(),
      };
      d.users.push(admin);
      this._persist();
    }

    const hasSettings = d.appSettings.length > 0;
    if (!hasSettings) {
      const infoSections = JSON.stringify([
        {
          id: "participate",
          title: "Participar",
          content: "Para participar en Mundial de Kings debes:\n\n• Seguir la cuenta de Instagram @chesskingla\n• Seguir la cuenta de TikTok @chesskingla\n• Unirte al canal oficial de Instagram \"No Rules\" de Chessking\n• Crear una cuenta en la plataforma con tus datos personales\n\nSolicitaremos tu nombre, correo electrónico, número de teléfono, usuario de Instagram y TikTok para validar que cumples con los requisitos de participación y poder enviarte actualizaciones importantes sobre el concurso.\n\nTambién solicitaremos tu número de cédula con el único propósito de garantizar una sola cuenta por persona y validar la entrega de premios. La cédula presentada al reclamar el premio deberá coincidir con la registrada en la plataforma.\n\nTu información será manejada de forma confidencial y no será visible públicamente ni compartida con terceros, conforme a la Ley 81 de Protección de Datos Personales de Panamá."
        },
        {
          id: "how_to_win",
          title: "Ganar",
          content: "Después de crear tu cuenta en la plataforma, podrás realizar pronósticos diarios de los partidos del Mundial.\n\n• Los partidos se habilitarán 24 horas antes de cada encuentro\n• Los pronósticos se cerrarán automáticamente al iniciar el partido\n• Deberás predecir el marcador exacto del juego\nEjemplo: Panamá 3 - 5 Inglaterra\n\nUna vez guardes tu pronóstico, este quedará registrado automáticamente en tu perfil.\n\nPor cada marcador acertado acumularás 100 puntos.\n\nLos puntos podrán reflejarse hasta 24 horas después de finalizar el partido y confirmarse el resultado oficial.\n\nEn la sección \"Mi Perfil\" podrás ver:\n• Historial de pronósticos realizados\n• Partidos acertados\n• Puntos acumulados\n\nTen en cuenta que debes cumplir los requisitos mencionados anteriormente, seguirnos y unirte a nuestro canal.\nRevisaremos que cumplas las condiciones en caso que aciertes."
        },
        {
          id: "how_to_redeem",
          title: "Canjear Premios",
          content: "Ve a la sección de Premios.\n\nUna vez acumules los puntos necesarios, podrás canjear el producto de tu preferencia según la cantidad de puntos requeridos para cada premio.\n\n• Selecciona el producto que deseas canjear\n• Nuestro equipo revisará tu solicitud y validará que cumplas con todos los requisitos de participación\n• Una vez aprobada, te contactaremos vía WhatsApp con las instrucciones para retirar tu premio\n\nTen en cuenta que los premios requieren preparación previa para su entrega. Los retiros se realizarán únicamente los días sábado y domingo.\n\nSi resultas ganador un viernes, sábado o domingo, tu premio podrá retirarse el siguiente fin de semana, para darnos tiempo de prepararlo correctamente.\n\nCuando ganes, recibirás todas las instrucciones necesarias de forma clara y detallada."
        },
        {
          id: "extra_points",
          title: "Obtener puntos Extra",
          content: "¿Quieres obtener puntos extra?\n\nMantente conectado a nuestras redes sociales y pendiente de todas nuestras publicaciones.\nDurante el Mundial estaremos realizando dinámicas, retos y actividades especiales donde podrás ganar puntos adicionales para canjear más premios.\nSíguenos, participa y aumenta tus posibilidades de ganar."
        }
      ]);
      d.appSettings.push(
        { id: makeId(), key: 'info_sections', value: infoSections, created_date: getNow() },
      );
      this._persist();
    }

    // Migración: asignar referral_code a usuarios existentes que no tengan
    let migrated = false;
    for (const u of d.users) {
      if (!u.referral_code) {
        u.referral_code = db.generateReferralCode(u.full_name, u.email);
        u.referred_by = u.referred_by || null;
        u.referral_points = u.referral_points || 0;
        migrated = true;
      }
    }
    if (migrated) {
      save(d);
    }

    // NO seedear premios por defecto — el admin los crea desde el panel
  },
};