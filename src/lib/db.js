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

let _syncTimers = {};
let _syncInProgress = {};
let _pollInterval = null;
let _syncToSupabaseInProgress = false;
let _syncFromSupabaseInProgress = false;
let _resyncQueued = false;
let _blockFromSync = false; // Bloquea sync FROM Supabase durante operaciones destructivas
const _pendingDeletes = []; // { tableName, id }[]

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
      const keys = records.map(r => r.key).filter(Boolean);
      if (keys.length === 0) return;
      const cleaned = stripLocalFields(records);
      await supabase.from(tableName).delete().in('key', keys);
      await supabase.from(tableName).insert(cleaned);
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
    const result = await syncTableFromSupabase(tableName, localRecords);
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
      this._data = load();
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
      console.log('[DB] Sync a Supabase en progreso, saltando polling');
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
      const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings'];
      let changed = false;

      for (const jsKey of tablesToSync) {
        const localRecords = this._data[jsKey] || [];
        const remoteRecords = await syncTableFromSupabaseFn(jsKey, localRecords);
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
        console.log('[DB] Datos sincronizados desde Supabase');
        this._notifyReactComponents();
      }
    } catch (err) {
      console.warn('[DB] Error al sincronizar desde Supabase:', err);
    } finally {
      _syncFromSupabaseInProgress = false;
    }
  },

  // Sincronizar TODAS las tablas a Supabase (con await para asegurar que llegue)
  async _syncAllToSupabase() {
    if (!isSupabaseAvailable()) return;
    if (_syncToSupabaseInProgress) {
      _resyncQueued = true;
      return;
    }

    _syncToSupabaseInProgress = true;
    try {
      // Procesar eliminaciones pendientes primero
      if (_pendingDeletes.length > 0 && supabase) {
        const deletes = _pendingDeletes.splice(0);
        for (const { tableName, id } of deletes) {
          try {
            await supabase.from(tableName).delete().eq('id', id);
          } catch {}
        }
      }
      const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings'];
      for (const jsKey of tablesToSync) {
        const records = this._data[jsKey] || [];
        if (records.length > 0) {
          await syncTableToSupabaseFn(jsKey, records);
        }
      }
    } finally {
      _syncToSupabaseInProgress = false;
      if (_resyncQueued) {
        _resyncQueued = false;
        this._syncAllToSupabase();
      }
    }
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
    const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings'];
    const results = [];
    for (const jsKey of tablesToSync) {
      const records = this._data[jsKey] || [];
      const tableName = tableNameToSupabase(jsKey);
      if (records.length > 0) {
        try {
          await syncTableToSupabase(tableName, records);
          results.push({ table: tableName, count: records.length, status: 'ok' });
        } catch (err) {
          results.push({ table: tableName, count: records.length, status: 'error', error: err.message });
        }
      } else {
        results.push({ table: tableName, count: 0, status: 'empty' });
      }
    }
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
   */
  async cleanUserData() {
    // Bloquear sync FROM Supabase para evitar race condition:
    // _init() lanza _syncAllFromSupabase() en background que restauraría
    // los usuarios borrados desde Supabase después de la limpieza local.
    // Usamos _blockFromSync (no _syncToSupabaseInProgress) para que
    // _syncAllToSupabase() siga funcionando normalmente.
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

    // 2. Eliminar predicciones de usuarios no-admin
    const predsToDelete = (d.predictions || []).filter(p => nonAdminEmails.has(p.user_email));
    d.predictions = (d.predictions || []).filter(p => !nonAdminEmails.has(p.user_email));

    // 3. Eliminar canjes de usuarios no-admin
    const redemptionsToDelete = (d.redemptions || []).filter(r => nonAdminEmails.has(r.user_email));
    d.redemptions = (d.redemptions || []).filter(r => !nonAdminEmails.has(r.user_email));

    // 4. Eliminar todos los puntos extra (pointsBonuses)
    const bonusesToDelete = (d.pointsBonuses || []);
    d.pointsBonuses = [];

    // 5. Eliminar tickets de soporte de usuarios no-admin
    const ticketsToDelete = (d.supportTickets || []).filter(t => nonAdminEmails.has(t.user_email));
    d.supportTickets = (d.supportTickets || []).filter(t => !nonAdminEmails.has(t.user_email));

    // 6. Eliminar usuarios NO admin
    d.users = adminUsers;

    // ── Marcar eliminaciones pendientes para que _syncAllToSupabase las procese ──
    // Usamos _pendingDeletes en vez de direct deletes con .in('id', batch)
    // porque el mecanismo individual .eq('id', id) dentro de _syncAllToSupabase
    // es más fiable y es el mismo que usan deduplicate(), prizes.remove(), etc.
    for (const id of nonAdminIds) {
      _pendingDeletes.push({ tableName: 'users', id });
    }
    for (const p of predsToDelete) {
      _pendingDeletes.push({ tableName: 'predictions', id: p.id });
    }
    for (const r of redemptionsToDelete) {
      _pendingDeletes.push({ tableName: 'redemptions', id: r.id });
    }
    for (const b of bonusesToDelete) {
      _pendingDeletes.push({ tableName: 'points_bonuses', id: b.id });
    }
    for (const t of ticketsToDelete) {
      _pendingDeletes.push({ tableName: 'support_tickets', id: t.id });
    }

    // 8. Guardar en localStorage
    save(d);
    _syncInProgress = {};
    // _syncAllToSupabase procesa _pendingDeletes primero (individual .eq('id',id))
    // y luego hace upsert de las tablas restantes (admin user, matches, prizes, etc.)
    try {
      if (isSupabaseAvailable()) {
        await this._syncAllToSupabase();
      }
    } finally {
      // Liberar bloqueo SIEMPRE (incluso si _syncAllToSupabase falla)
      _blockFromSync = false;
    }
    notifyReactComponents();

    return { deletedUsers: nonAdminIds.length, deletedPredictions: predsToDelete.length, deletedRedemptions: redemptionsToDelete.length, deletedBonuses: bonusesToDelete.length };
  },

  // --- Users ---
  users: {
    list(order) {
      const d = db._init().users;
      return order ? [...d].sort((a, b) => {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        return ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir;
      }) : [...d];
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
  },

  // --- Matches ---
  matches: {
    list(order) {
      const d = db._init().matches;
      return order ? [...d].sort((a, b) => {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        return ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir;
      }) : [...d];
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
        u.total_points = u.bonus_points || 0;
        u.updated_at = now;
      }

      // 4. Guardar en localStorage inmediatamente
      save(d);

      // 5. Actualizar Supabase con UPDATE directo de solo las columnas que existen
      //    (evitando campos locales como live_started_at, updated_at, etc.)
      if (isSupabaseAvailable() && supabase) {
        const BATCH = 50;

        // ── Matches: UPDATE solo status, resultados y elapsed ──
        const matchIds_batches = [];
        const allMatchIds = d.matches.map(m => m.id);
        for (let i = 0; i < allMatchIds.length; i += BATCH) {
          matchIds_batches.push(allMatchIds.slice(i, i + BATCH));
        }
        for (const idBatch of matchIds_batches) {
          try {
            const { error } = await supabase
              .from('matches')
              .update({ status: 'pending', result_team1: null, result_team2: null, elapsed: null })
              .in('id', idBatch);
            if (error) console.warn('[resetAll] Error matches update:', error.message);
          } catch (err) {
            console.warn('[resetAll] Error matches update:', err.message);
          }
        }

        // ── Predictions: DELETE todas las predicciones de partidos afectados ──
        if (predsToDelete.length > 0) {
          const predIdBatches = [];
          const predIds = predsToDelete.map(p => p.id);
          for (let i = 0; i < predIds.length; i += BATCH) {
            predIdBatches.push(predIds.slice(i, i + BATCH));
          }
          for (const idBatch of predIdBatches) {
            try {
              const { error } = await supabase
                .from('predictions')
                .delete()
                .in('id', idBatch);
              if (error) console.warn('[resetAll] Error predictions delete:', error.message);
            } catch (err) {
              console.warn('[resetAll] Error predictions delete:', err.message);
            }
          }
        }

        // ── Users: UPDATE prediction_points, total_points ──
        const usersToSync = d.users.filter(u => u.role !== 'admin');
        if (usersToSync.length > 0) {
          // Usar upserts pequeños con solo id + puntos (campos que existen en Supabase)
          for (let i = 0; i < usersToSync.length; i += BATCH) {
            const batch = usersToSync.slice(i, i + BATCH).map(u => ({
              id: u.id,
              prediction_points: 0,
              total_points: u.bonus_points || 0,
            }));
            try {
              const { error } = await supabase
                .from('users')
                .upsert(batch, { onConflict: 'id' });
              if (error) console.warn('[resetAll] Error users upsert:', error.message);
            } catch (err) {
              console.warn('[resetAll] Error users upsert:', err.message);
            }
          }
        }
      }

      // 6. Notificar a componentes React
      notifyReactComponents();
    },
    bulkCreate(matchesArray) {
      const d = db._init();
      const now = getNow();

      // Eliminar partidos existentes con mismo fixture_id para evitar duplicados
      const newFixtureIds = new Set(matchesArray.map(m => m.fixture_id).filter(Boolean));
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
      return order ? [...d].sort((a, b) => {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        return ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir;
      }) : [...d];
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
      return order ? [...d].sort((a, b) => {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        return ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir;
      }) : [...d];
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
      return order ? [...d].sort((a, b) => {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        return ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir;
      }) : [...d];
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
  supportTickets: {
    list(order) {
      const d = db._init().supportTickets;
      return order ? [...d].sort((a, b) => {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        return ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir;
      }) : [...d];
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
      return d;
    },
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.supportTickets.push(record);
      db._persist();
      return record;
    },
    update(id, data) {
      const d = db._init();
      const idx = d.supportTickets.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Ticket not found');
      d.supportTickets[idx] = { ...d.supportTickets[idx], ...data, updated_at: getNow() };
      db._persist();
      return d.supportTickets[idx];
    },
  },

  // --- PointsBonuses ---
  pointsBonuses: {
    list(order) {
      const d = db._init().pointsBonuses;
      return order ? [...d].sort((a, b) => {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        return ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir;
      }) : [...d];
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
        password: 'admin123',
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
      console.log('[DB] Admin user seeded');
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

    // NO seedear premios por defecto — el admin los crea desde el panel
  },
};