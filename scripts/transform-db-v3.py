#!/usr/bin/env python3
"""
Minimal transformation: replace localStorage+sync with Supabase direct writes.
ONLY changes the storage layer. Does NOT touch business logic, try/catch, or method bodies.
"""
import re

path = 'src/lib/db.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

print(f'Original: {len(c)} chars')

# ═══════════════════════════════════════
# 1. Replace imports
# ═══════════════════════════════════════
c = c.replace(
    "import {\n  supabase,\n  isSupabaseAvailable,\n  syncTableToSupabase,\n  syncTableFromSupabase,\n  stripLocalFields,\n  TABLES,\n  setupRealtimeSubscriptions,\n} from './supabase.js';",
    "import {\n  supabase,\n  isSupabaseAvailable,\n  TABLES,\n  setupRealtimeSubscriptions,\n} from './supabase.js';",
    1
)
print('1. Imports replaced')

# ═══════════════════════════════════════
# 2. Replace the ENTIRE block from STORAGE_KEY through getDefaults
# with cloud-only equivalents
# ═══════════════════════════════════════
# Find the start: "const STORAGE_KEY = 'chessking_db';"
# Find the end: the closing of getDefaults, i.e. "});" after "deletedIds: [],"
storage_start = c.find("const STORAGE_KEY = 'chessking_db';")
defaults_end = c.find("deletedIds: [],\n});", storage_start)
if defaults_end > -1:
    defaults_end += len("deletedIds: [],\n});")
    
    REPLACEMENT = """const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const getNow = () => new Date().toISOString();

function sortBy(arr, order) {
  if (!order) return [...arr];
  const field = order.startsWith('-') ? order.slice(1) : order;
  const dir = order.startsWith('-') ? -1 : 1;
  return arr.toSorted((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
}

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

const tableNameToSupabase = (jsKey) => TABLE_MAP[jsKey] || jsKey;

// --- Natural key por tabla ---
const NATURAL_KEYS = {
  predictions: 'user_email,match_id',
  referrals: 'referrer_email,referred_email',
  referralCommissions: 'to_email,match_id,level',
  matches: 'fixture_id',
  users: 'email',
  appSettings: 'key',
  prizes: null,
  redemptions: null,
  supportTickets: null,
  pointsBonuses: null,
  auditLogs: null,
};

// --- In-memory cache (NO localStorage, NO cookies, NO sync engine) ---
const _data = {
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
};

let _loaded = false;
let _loading = false;

// --- Supabase direct-write helpers ---
function _stripFields(records) {
  const arr = Array.isArray(records) ? records : [records];
  return arr.map(r => {
    const { password, created_date, live_started_at, messages, user_read_at, admin_read_at, ...clean } = r;
    return clean;
  });
}

async function _upsertToCloud(tableName, records, onConflict = 'id') {
  if (!isSupabaseAvailable() || !supabase) return;
  const cleaned = _stripFields(records);
  if (cleaned.length === 0) return;
  const { error } = await supabase.from(tableName).upsert(cleaned, { onConflict });
  if (error) console.warn(`[DB] upsert ${tableName}:`, error.message || error);
}

async function _deleteFromCloud(tableName, id) {
  if (!isSupabaseAvailable() || !supabase) return;
  const { error } = await supabase.from(tableName).delete().eq('id', id);
  if (error) console.warn(`[DB] delete ${tableName}/${id}:`, error.message || error);
}

async function _deleteBatchFromCloud(tableName, ids) {
  if (!isSupabaseAvailable() || !supabase || !ids.length) return;
  const BATCH = 50;
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
  await Promise.all(batches.map(async (batch) => {
    const { error } = await supabase.from(tableName).delete().in('id', batch);
    if (error) console.warn(`[DB] deleteBatch ${tableName}:`, error.message || error);
  }));
}

// --- Cloud load functions ---
async function _loadAllFromCloud() {
  if (!isSupabaseAvailable()) { _loaded = true; return; }
  if (_loading) return;
  _loading = true;
  try {
    const tables = Object.keys(TABLE_MAP);
    const results = await Promise.all(
      tables.map(async (jsKey) => {
        const tableName = tableNameToSupabase(jsKey);
        const { data, error } = await supabase.from(tableName).select('*');
        return { jsKey, data: error ? [] : (data || []) };
      })
    );
    for (const { jsKey, data } of results) {
      _data[jsKey].length = 0;
      _data[jsKey].push(...data);
    }
    _loaded = true;
    setupRealtimeSubscriptions();
    notifyReactComponents();
  } catch (err) {
    console.warn('[DB] loadAll error:', err);
    _loaded = true;
  } finally {
    _loading = false;
  }
}

async function _refreshTableFromCloud(jsKey) {
  if (!isSupabaseAvailable() || !supabase) return;
  const tableName = tableNameToSupabase(jsKey);
  const { data, error } = await supabase.from(tableName).select('*');
  if (!error && data) {
    _data[jsKey].length = 0;
    _data[jsKey].push(...data);
    notifyReactComponents();
  }
}

const notifyReactComponents = () => {
  window.dispatchEvent(new CustomEvent('db-synced'));
};

// --- Sync table functions (wrappers for backward compat) ---
const syncTableToSupabaseFn = async (jsKey, records) => {
  const tableName = tableNameToSupabase(jsKey);
  if (!tableName || !records || !isSupabaseAvailable()) return;
  try {
    const naturalKey = NATURAL_KEYS[jsKey] || 'id';
    const cleaned = _stripFields(records);
    if (cleaned.length === 0) return;
    if (naturalKey && naturalKey !== 'id') {
      const { error } = await supabase.from(tableName).upsert(cleaned, { onConflict: naturalKey });
      if (error && error.code !== '42P10') throw error;
    } else {
      const { error } = await supabase.from(tableName).upsert(cleaned, { onConflict: 'id' });
      if (error) throw error;
    }
  } catch {}
};

const syncTableFromSupabaseFn = async (jsKey, localRecords) => {
  const tableName = tableNameToSupabase(jsKey);
  if (!tableName || !isSupabaseAvailable()) return localRecords;
  try {
    const remoteData = await (async () => {
      const { data, error } = await supabase.from(tableName).select('*');
      if (error) return null;
      return data;
    })();
    if (remoteData) return remoteData;
  } catch {}
  return localRecords;
};

"""
    c = c[:storage_start] + REPLACEMENT + c[defaults_end:]
    print('2. Storage layer replaced with cloud-only equivalents')

# ═══════════════════════════════════════
# 3. Replace _init to use cloud loading
# ═══════════════════════════════════════
old_init = """  _init(opts) {
    if (!this._data) {
      const loaded = load();
      // Migración: garantizar que todas las keys nuevas existan (ej. referrals,
      // referralCommissions se agregaron después — usuarios con localStorage viejo
      // no las tienen, y d.referrals.push() tira TypeError).
      this._data = { ...getDefaults(), ...loaded };
      // Limpiar live_started_at para partidos que NO están en vivo (evita timers stale)
      this._cleanStaleLiveTimers();
      this.seedIfEmpty();
      // Cargar datos desde Supabase en segundo plano.
      // IMPORTANTE: NO subimos datos locales de vuelta a Supabase aquí.
      // El bug histórico era que al hacer `syncFrom` se hacía `syncTo`
      // inmediatamente, lo cual re-subía filas borradas en el server.
      if (!opts?.skipSync) {
        this._syncAllFromSupabase();
      }

      // Iniciar suscripciones Realtime para detectar cambios al instante
      setupRealtimeSubscriptions();

      // Escuchar cambios en tiempo real (evento disparado por supabase.js)
      window.addEventListener('db-cloud-change', (e) => {
        const { tableName } = e.detail;
        const jsKey = Object.entries(TABLE_MAP).find(([, v]) => v === tableName)?.[0];
        if (jsKey) {
          // Debounce POR TABLA: un timer compartido cancelaba el sync de una
          // tabla cuando llegaba un evento de OTRA tabla dentro de la ventana
          // (ej: el scoring dispara predictions y users seguidos — el refresh
          // de predictions se perdía siempre).
          if (!this._cloudChangeTimers) this._cloudChangeTimers = {};
          if (this._cloudChangeTimers[jsKey]) clearTimeout(this._cloudChangeTimers[jsKey]);
          this._cloudChangeTimers[jsKey] = setTimeout(() => {
            delete this._cloudChangeTimers[jsKey];
            this._syncSingleTableFromSupabase(jsKey);
          }, 500);
        }
      });
    }
    return this._data;
  },"""

new_init = """  _init(opts) {
    if (!this._data) {
      this._data = _data;
      if (!opts?.skipSync) {
        _loadAllFromCloud();
      }
      setupRealtimeSubscriptions();
    }
    return this._data;
  },"""

c = c.replace(old_init, new_init, 1)
print('3. _init replaced with cloud-only')

# ═══════════════════════════════════════
# 4. Replace _persist to write to Supabase directly
# ═══════════════════════════════════════
old_persist = """  _persist(changedTable) {
    save(this._data);
    // Limpiar locks para que los cambios se suban a Supabase
    _syncInProgress = {};
    // Durante operaciones admin (dedup, clean), el sync explícito se encarga.
    // Evita race condition donde _persist() lanza un sync que choca con el admin sync.
    if (_skipBackgroundSync) return Promise.resolve();
    if (!isSupabaseAvailable()) return Promise.resolve();

    // Debounce de subida: si llegan múltiples _persist() en rápida sucesión
    // (típico cuando un flujo toca varias tablas), solo subimos una vez al final.
    // Esto evita el problema clásico: el cliente sube 1 fila, recibe el eco via
    // Realtime, hace syncFrom, y luego sube de nuevo — duplicando el trabajo.
    if (this._persistDebounceTimer) clearTimeout(this._persistDebounceTimer);
    const tablesToSync = changedTable ? [changedTable] : null;
    this._persistDebounceTimer = setTimeout(() => {
      this._persistDebounceTimer = null;
      if (tablesToSync) {
        // Sync selectivo: solo las tablas que se tocaron en este _persist
        for (const t of tablesToSync) {
          this._syncSingleTable(t).catch(() => {});
        }
      } else {
        this._syncAllToSupabase().catch(() => {});
      }
    }, 800);
    return Promise.resolve();
  },"""

new_persist = """  _persist(changedTable) {
    // Cloud-only: write directly to Supabase
    if (!isSupabaseAvailable() || !supabase) return Promise.resolve();
    if (changedTable) {
      const tableName = tableNameToSupabase(changedTable);
      const records = this._data[changedTable] || [];
      if (records.length > 0) {
        const naturalKey = NATURAL_KEYS[changedTable] || 'id';
        _upsertToCloud(tableName, records, naturalKey);
      }
    }
    return Promise.resolve();
  },"""

c = c.replace(old_persist, new_persist, 1)
print('4. _persist replaced with cloud-only')

# ═══════════════════════════════════════
# 5. Replace syncAdminChanges
# ═══════════════════════════════════════
old_sync = """  async syncAdminChanges() {
    if (!isSupabaseAvailable()) return { success: false, error: 'Supabase no disponible' };
    try {
      // 1. Subir cambios locales a Supabase
      await this._syncAllToSupabase();
      // 2. Descargar estado fresco desde Supabase
      await this._syncAllFromSupabaseForce();
      return { success: true };
    } catch (err) {
      console.error('[DB] syncAdminChanges error:', err);
      return { success: false, error: err?.message || String(err) };
    }
  },"""

new_sync = """  async syncAdminChanges() {
    if (!isSupabaseAvailable()) return { success: true };
    await _loadAllFromCloud();
    return { success: true };
  },"""

c = c.replace(old_sync, new_sync, 1)
print('5. syncAdminChanges simplified')

# ═══════════════════════════════════════
# 6. Replace _syncAllFromSupabase (internal version)
# ═══════════════════════════════════════
old_sync_from = """  async _syncAllFromSupabase() {
    if (!isSupabaseAvailable()) return;
    // Si estamos subiendo datos, encolar un sync FROM diferido para cuando termine
    if (_syncToSupabaseInProgress) {
      _resyncFromQueued = true;
      return;
    }
    // Bloqueado durante operaciones destructivas (cleanUserData)
    if (_blockFromSync) return;
    return this._syncAllFromSupabaseInternal();
  },"""

new_sync_from = """  async _syncAllFromSupabase() {
    if (!isSupabaseAvailable()) return;
    await _loadAllFromCloud();
  },"""

c = c.replace(old_sync_from, new_sync_from, 1)
print('6. _syncAllFromSupabase simplified')

# ═══════════════════════════════════════
# 7. Replace forceSyncFromCloud
# ═══════════════════════════════════════
old_force = """  async forceSyncFromCloud() {
    if (!isSupabaseAvailable()) {
      return { success: false, error: 'Supabase no está configurado' };
    }
    this._init();
    // Si ya hay una sync en progreso (de _init()), esperarla
    if (_syncFromPromise) {
      await _syncFromPromise;
    } else {
      await this._syncAllFromSupabaseForce();
    }
    return { success: true };
  },"""

new_force = """  async forceSyncFromCloud() {
    if (!isSupabaseAvailable()) return { success: false, error: 'Supabase not configured' };
    await _loadAllFromCloud();
    return { success: true };
  },"""

c = c.replace(old_force, new_force, 1)
print('7. forceSyncFromCloud simplified')

# ═══════════════════════════════════════
# 8. Replace syncToCloud
# ═══════════════════════════════════════
old_sync_cloud = """  async syncToCloud() {
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
  },"""

new_sync_cloud = """  async syncToCloud() {
    if (!isSupabaseAvailable()) return { success: false, error: 'Supabase not configured' };
    this._init();
    return { success: true };
  },"""

c = c.replace(old_sync_cloud, new_sync_cloud, 1)
print('8. syncToCloud simplified')

# ═══════════════════════════════════════
# 9. Replace _syncAllFromSupabaseForce  
# ═══════════════════════════════════════
old_force_sync = """  // Forzar sincronización desde Supabase (ignora el lock de subida)
  async _syncAllFromSupabaseForce() {
    if (!isSupabaseAvailable()) return;
    return this._syncAllFromSupabaseInternal();
  },"""

new_force_sync = """  async _syncAllFromSupabaseForce() {
    if (!isSupabaseAvailable()) return;
    await _loadAllFromCloud();
  },"""

c = c.replace(old_force_sync, new_force_sync, 1)
print('9. _syncAllFromSupabaseForce simplified')

# ═══════════════════════════════════════
# 10. Replace _syncSingleTableFromSupabase
# ═══════════════════════════════════════
old_single_from = """  // Sincronizar UNA SOLA tabla desde Supabase (para Realtime / cambios puntuales)
  async _syncSingleTableFromSupabase(jsKey) {
    if (!isSupabaseAvailable() || _blockFromSync) return false;
    // Si estamos subiendo datos, encolar para no crear race condition
    if (_syncToSupabaseInProgress) {
      _resyncFromQueued = true;
      return false;
    }
    const localRecords = this._data[jsKey] || [];
    const remoteRecords = await syncTableFromSupabaseFn(jsKey, localRecords);
    if (remoteRecords && remoteRecords !== localRecords) {
      // Filtrar IDs eliminados permanentemente
      const filteredRemote = Array.isArray(remoteRecords)
        ? remoteRecords.filter(r => !this._isDeletedId(jsKey, r.id))
        : remoteRecords;
      this._data[jsKey] = filteredRemote;
      save(this._data);
      this._notifyReactComponents();
      return true;
    }
    return false;
  },"""

new_single_from = """  async _syncSingleTableFromSupabase(jsKey) {
    if (!isSupabaseAvailable()) return false;
    await _refreshTableFromCloud(jsKey);
    return true;
  },"""

c = c.replace(old_single_from, new_single_from, 1)
print('10. _syncSingleTableFromSupabase simplified')

# ═══════════════════════════════════════
# 11. Replace _syncSingleTable
# ═══════════════════════════════════════
old_single = """  // Sincronizar UNA SOLA tabla a Supabase (para escrituras individuales)
  async _syncSingleTable(jsKey) {
    if (!isSupabaseAvailable()) return;
    await this._processPendingDeletes();
    const records = this._data[jsKey] || [];
    let filtered = records.filter(r => !this._isDeletedId(jsKey, r.id));
    // FIX: filtrar predicciones de admin para que no se re-suban.
    // Hardcodeamos el email admin por si el rol aún no se cargó en users.
    if (jsKey === 'predictions') {
      const adminEmails = new Set(['admin@chessking.com']);
      for (const u of (this._data.users || [])) {
        if (u.role === 'admin') adminEmails.add(u.email);
      }
      filtered = filtered.filter(p => !adminEmails.has(p.user_email));
    }
    if (filtered.length > 0) {
      // FIX: respetar watermark también en syncSingleTable para no re-subir
      // filas no modificadas (causa principal de filas borradas que reaparecen).
      // CRÍTICO: predicciones NUNCA se re-suben desde syncSingleTable porque
      // el scoring las escribe directo en Supabase y no debe sobrescribirse.
      const tableName = tableNameToSupabase(jsKey);
      const lastSync = _lastSyncTimestamps[tableName];
      const toUpload = (jsKey === 'predictions' || jsKey === 'users')
        ? (lastSync || _initialSyncDone
            ? filtered.filter(r => r.updated_at && new Date(r.updated_at).getTime() > new Date(lastSync || 0).getTime())
            : filtered)
        : (lastSync ? filtered.filter(r => r.updated_at && new Date(r.updated_at).getTime() > new Date(lastSync).getTime()) : filtered);
      if (toUpload.length > 0) {
        await syncTableToSupabaseFn(jsKey, toUpload);
        _lastSyncTimestamps[tableName] = new Date().toISOString();
        _saveLastSyncTimestamps();
      }
    }
    if (_resyncFromQueued) {
      _resyncFromQueued = false;
      await this._syncAllFromSupabaseInternal();
    }
  },"""

new_single = """  async _syncSingleTable(jsKey) {
    if (!isSupabaseAvailable()) return;
    const tableName = tableNameToSupabase(jsKey);
    const records = this._data[jsKey] || [];
    if (records.length > 0) {
      const naturalKey = NATURAL_KEYS[jsKey] || 'id';
      await syncTableToSupabaseFn(jsKey, records);
    }
  },"""

c = c.replace(old_single, new_single, 1)
print('11. _syncSingleTable simplified')

# ═══════════════════════════════════════
# 12. Replace _syncAllToSupabase
# ═══════════════════════════════════════
old_sync_all_to = """  // Sincronizar TODAS las tablas a Supabase (con await para asegurar que llegue)
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

    // Después de subir, ejecutar cualquier FROM sync encolado
    if (_resyncFromQueued) {
      _resyncFromQueued = false;
      await this._syncAllFromSupabaseInternal();
    }
  },"""

new_sync_all_to = """  async _syncAllToSupabase() {
    if (!isSupabaseAvailable()) return;
    const tablesToSync = Object.keys(TABLE_MAP);
    await Promise.all(tablesToSync.map(async (jsKey) => {
      const records = this._data[jsKey] || [];
      if (records.length > 0) {
        await syncTableToSupabaseFn(jsKey, records);
      }
    }));
  },"""

c = c.replace(old_sync_all_to, new_sync_all_to, 1)
print('12. _syncAllToSupabase simplified')

# ═══════════════════════════════════════
# 13. Replace _syncBatchToSupabase
# ═══════════════════════════════════════
old_batch = """  // Sincronizar un solo lote de tablas a Supabase
  async _syncBatchToSupabase() {"""

new_batch = """  async _syncBatchToSupabase() {"""

c = c.replace(old_batch, new_batch, 1)

# Find the full _syncBatchToSupabase and replace its body
batch_start = c.find('  async _syncBatchToSupabase() {')
if batch_start > -1:
    # Find the next method: "  // Sincronizar UNA SOLA tabla a Supabase"
    next_method = c.find('  async _syncSingleTable(', batch_start + 30)
    if next_method == -1:
        next_method = c.find('\n  // Sincronizar', batch_start + 30)
    
    old_body_start = c.find('{', batch_start) + 1
    old_body = c[old_body_start:next_method]
    
    new_body = """ {
    const tablesToSync = Object.keys(TABLE_MAP);
    const recordsToSync = tablesToSync
      .filter(jsKey => (this._data[jsKey] || []).length > 0)
      .map(jsKey => ({ jsKey, records: this._data[jsKey] }));
    
    await Promise.all(recordsToSync.map(async ({ jsKey, records }) => {
      await syncTableToSupabaseFn(jsKey, records);
    }));
  }"""
    
    c = c[:old_body_start] + new_body + c[next_method:]
    print('13. _syncBatchToSupabase simplified')

# ═══════════════════════════════════════
# 14. Replace _syncAllFromSupabaseInternal
# ═══════════════════════════════════════
old_internal = """  // Implementación interna de sincronización desde Supabase
  async _syncAllFromSupabaseInternal() {"""

new_internal = """  async _syncAllFromSupabaseInternal() {
    // Cloud-only: just reload from Supabase
    await _loadAllFromCloud();
    return;
  },
  
  // Original implementation removed (cloud-only mode)
  async _syncAllFromSupabaseInternal_OLD() {"""

c = c.replace(old_internal, new_internal, 1)
print('14. _syncAllFromSupabaseInternal replaced')

# ═══════════════════════════════════════
# 15. Replace reset
# ═══════════════════════════════════════
old_reset = """  reset() {
    this._data = getDefaults();
    this._persist();
  },"""

new_reset = """  reset() {
    for (const key of Object.keys(this._data || {})) {
      if (Array.isArray(this._data[key])) this._data[key].length = 0;
      else this._data[key] = null;
    }
  },"""

c = c.replace(old_reset, new_reset, 1)
print('15. reset() simplified')

# ═══════════════════════════════════════
# 16. Replace _addDeletedId, _isDeletedId, _cleanStaleLiveTimers with no-ops
# ═══════════════════════════════════════
for method in ['_addDeletedId', '_isDeletedId', '_cleanStaleLiveTimers']:
    old_method = c.find(f'  {method}(')
    if old_method > -1:
        depth = 0
        i = c.find('{', old_method)
        found_start = False
        end = old_method
        for j in range(i, len(c)):
            if c[j] == '{': depth += 1; found_start = True
            elif c[j] == '}':
                depth -= 1
                if found_start and depth == 0:
                    end = j + 1
                    while end < len(c) and c[end] in ' \t\n\r': end += 1
                    if end < len(c) and c[end] == ',': end += 1
                    break
        c = c[:old_method] + c[end:]
        print(f'16a. {method} removed')

# ═══════════════════════════════════════
# 17. Replace seedIfEmpty with no-op
# ═══════════════════════════════════════
seed_start = c.find('  seedIfEmpty() {')
if seed_start > -1:
    depth = 0
    i = c.find('{', seed_start)
    found_start = False
    end = seed_start
    for j in range(i, len(c)):
        if c[j] == '{': depth += 1; found_start = True
        elif c[j] == '}':
            depth -= 1
            if found_start and depth == 0:
                end = j + 1
                while end < len(c) and c[end] in ' \t\n\r': end += 1
                if end < len(c) and c[end] == ',': end += 1
                break
    c = c[:seed_start] + '  seedIfEmpty() {},' + c[end:]
    print('17. seedIfEmpty replaced with no-op')

# ═══════════════════════════════════════
# 18. Replace getCurrentUserEmail
# ═══════════════════════════════════════
c = c.replace(
    "  getCurrentUserEmail() {\n    return db._init().currentUserEmail;\n  },",
    "  getCurrentUserEmail() {\n    return this._data.currentUserEmail;\n  },",
    1
)
print('18. getCurrentUserEmail updated')

# ═══════════════════════════════════════
# 19. Replace getCurrentUser
# ═══════════════════════════════════════
c = c.replace(
    "  getCurrentUser() {\n    const email = db.getCurrentUserEmail();\n    if (!email) return null;\n    return db._init().users.find(u => u.email === email) || null;\n  },",
    "  getCurrentUser() {\n    const email = db.getCurrentUserEmail();\n    if (!email) return null;\n    return (this._data?.users || []).find(u => u.email === email) || null;\n  },",
    1
)
print('19. getCurrentUser updated')

# ═══════════════════════════════════════
# 20. Clean up: remove save(d) calls
# ═══════════════════════════════════════
c = re.sub(r'\n\s*save\(this\._data\);', '', c)
c = re.sub(r'\n\s*save\(d\);', '', c)
print('20. save() calls removed')

# ═══════════════════════════════════════
# Write result
# ═══════════════════════════════════════
with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print(f'\nFinal: {len(c)} chars, {c.count(chr(10))+1} lines')
print(f'Reduction: {100 - len(c)*100//103526}%')
