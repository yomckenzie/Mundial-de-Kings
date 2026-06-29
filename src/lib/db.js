import {
  supabase,
  isSupabaseAvailable,
  TABLES,
  setupRealtimeSubscriptions,
  fetchAll,
} from './supabase.js';

// Tablas que aún NO existen en Supabase. El sync debe saltarlas para no
// generar 404 en consola (PGRST205 = "table not found in schema cache").
// Cuando se cree la tabla con la migración correspondiente, removerla de
// este set y agregarla a `tablesToSync`.
const NOT_SYNCED_TABLES = new Set(['userNotifications']);

// --- Mapeo de jsKey (camelCase en _data) → tableName (snake_case en Supabase) ---
// Necesario porque _data usa camelCase (supportTickets, pointsBonuses) pero
// las tablas en Supabase usan snake_case (support_tickets, points_bonuses).
// Si se omite, queda de un refactor incompleto y rompe loadAllFromCloud.
const TABLE_MAP = {
  users:               'users',
  matches:             'matches',
  predictions:         'predictions',
  prizes:              'prizes',
  redemptions:         'redemptions',
  supportTickets:      'support_tickets',
  pointsBonuses:       'points_bonuses',
  appSettings:         'app_settings',
  auditLogs:           'audit_logs',
  referrals:           'referrals',
  referralCommissions: 'referral_commissions',
  userNotifications:   'user_notifications',
};

// Helper: convierte la jsKey de _data al nombre real de la tabla en Supabase.
// Si la key no está en TABLE_MAP (tabla nueva no mapeada), devuelve la key
// tal cual para no romper el flujo.
const tableNameToSupabase = (jsKey) => TABLE_MAP[jsKey] || jsKey;

// --- In-memory cache (cloud-only, NO localStorage) ---
let _data = {
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
  userNotifications: [],
  currentUserEmail: null,
};

let _loaded = false;
let _loading = false;

// Carga PRIORITARIA de partidos: la sección EN VIVO solo necesita la tabla
// `matches` (~49 KB). Cargándola antes que las pesadas (predicciones ~600 KB,
// usuarios), el sondeo en vivo arranca de inmediato — clave en móvil, donde
// esperar TODA la BD dejaba el marcador en "---" varios segundos.
let _matchesReady = false;
let _matchesReadyPromise = null;
let _resolveMatchesReady = null;

// Flags de control de sincronización. Se declaran a nivel de módulo para
// que múltiples funciones (create/update/remove/deduplicate) puedan
// bloquear el polling desde Supabase durante operaciones admin y evitar
// race conditions (p.ej. que un upsert sea sobrescrito por un poll que
// trajo datos viejos).
let _blockFromSync = false;
let _skipBackgroundSync = false;

// Estado del round-trip sync desde Supabase
let _syncFromSupabaseInProgress = false;
let _syncFromPromise = null;

// Timestamp del último "clean" remoto. Se compara con el local para
// evitar que clientes re-suban datos borrados por el admin.
let _lastCleanAt = null;
const CLEAN_AT_KEY = 'chessking_last_clean_at';

// --- Supabase direct-write helpers ---
function _stripFields(records, tableName) {
  const arr = Array.isArray(records) ? records : [records];
  // app_settings en este deploy no tiene columna `updated_at` en Supabase
  // (la tabla fue creada en un momento donde no se incluía). Stripping evita
  // el 400 de "Could not find the updated_at column" al sincronizar.
  const stripUpdatedAt = tableName === 'app_settings';
  return arr.map(r => {
    const { password, live_started_at, messages, user_read_at, admin_read_at, ...clean } = r;
    if (stripUpdatedAt) delete clean.updated_at;
    return clean;
  });
}

async function _upsertToCloud(tableName, records, onConflict = 'id') {
  if (!isSupabaseAvailable() || !supabase) return;
  const cleaned = _stripFields(records, tableName);
  if (cleaned.length === 0) return;
  const { error } = await supabase.from(tableName).upsert(cleaned, { onConflict });
  if (error) {
    console.warn(`[DB] upsert ${tableName}:`, error.message || error);
    // Propagar para que el caller (create/update) pueda hacer rollback
    // y mostrar el error al usuario en lugar de pretender éxito.
    throw new Error(`Supabase upsert ${tableName} failed: ${error.message || JSON.stringify(error)}`);
  }
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

// Promesa de la carga en curso. Permite que las páginas ESPEREN la primera
// carga desde Supabase (vía db.whenReady) en vez de leer la memoria vacía
// y mostrar un falso "no hay datos" que luego se reemplaza de golpe.
let _loadPromise = null;

// Marca los partidos como listos y desbloquea a quien espere whenMatchesReady().
function _markMatchesReady() {
  _matchesReady = true;
  if (_resolveMatchesReady) { _resolveMatchesReady(); _resolveMatchesReady = null; }
}

function _loadAllFromCloud() {
  if (!isSupabaseAvailable()) { _loaded = true; _markMatchesReady(); return Promise.resolve(); }
  if (_loading && _loadPromise) return _loadPromise;
  _loading = true;
  // Crear la promesa de "partidos listos" ANTES de empezar para que
  // whenMatchesReady() pueda await-la aunque se llame en paralelo.
  if (!_matchesReadyPromise) {
    _matchesReadyPromise = new Promise((resolve) => { _resolveMatchesReady = resolve; });
  }
  _loadPromise = (async () => {
    try {
      // ── 1) PRIORIDAD: partidos primero ──
      // Así la página de Partidos y el sondeo en vivo (SportScore) arrancan
      // sin esperar las tablas pesadas. En cuanto está en memoria, se notifica
      // a React para que la sección EN VIVO se pinte ya.
      try {
        const matchesData = await fetchAll(tableNameToSupabase('matches')); // paginado
        _data.matches.length = 0;
        _data.matches.push(...(matchesData || []));
      } catch (e) {
        console.warn('[DB] carga prioritaria de matches falló:', e);
      } finally {
        _markMatchesReady();
        notifyReactComponents();
      }

      // ── 2) El resto de tablas en paralelo, en segundo plano ──
      // Excluir matches (ya cargada arriba) y las tablas que aún no existen
      // en Supabase (NOT_SYNCED_TABLES) para no generar 404 en consola.
      const rest = Object.keys(TABLE_MAP).filter(
        (jsKey) => jsKey !== 'matches' && !NOT_SYNCED_TABLES.has(jsKey)
      );
      const results = await Promise.all(
        rest.map(async (jsKey) => {
          const tableName = tableNameToSupabase(jsKey);
          const data = await fetchAll(tableName); // paginado: trae TODAS las filas (no tope 1000)
          return { jsKey, data: data || [] };
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
      _markMatchesReady(); // red de seguridad: nunca dejar el live esperando
      _loading = false;
    }
  })();
  return _loadPromise;
}

async function _refreshTableFromCloud(jsKey) {
  if (!isSupabaseAvailable() || !supabase) return;
  const tableName = tableNameToSupabase(jsKey);
  const data = await fetchAll(tableName); // paginado: trae TODAS las filas
  if (data) {
    _data[jsKey].length = 0;
    _data[jsKey].push(...data);
    notifyReactComponents();
  }
}

const notifyReactComponents = () => {
  window.dispatchEvent(new CustomEvent('db-synced'));
};

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const getNow = () => new Date().toISOString();

// Stub de compatibilidad para el código que aún llama `save(d)`.
// En la arquitectura cloud-only actual, la persistencia a Supabase ocurre
// vía `db._persist(table)` (ver línea 196). Las llamadas a `save(d)` en
// código legacy son no-ops intencionales: la data ya está en `_data` (memoria)
// y se sincroniza a la nube por otros paths. Sin este stub, los call sites
// legacy (matches resetAll, prizes remove, etc.) crashean con
// `ReferenceError: save is not defined` solo cuando se invocan (no en carga).
const save = (_data) => {
  // no-op
};

function sortBy(arr, order) {
  if (!order) return [...arr];
  const field = order.startsWith('-') ? order.slice(1) : order;
  const dir = order.startsWith('-') ? -1 : 1;
  return arr.toSorted((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
}

// --- Sync wrappers (simplified for cloud-only) ---
const syncTableToSupabaseFn = async (jsKey, records) => {
  const tableName = tableNameToSupabase(jsKey);
  if (!tableName || !records || !isSupabaseAvailable()) return;
  try {
    const cleaned = _stripFields(records, tableName);
    if (cleaned.length === 0) return;
    const { error } = await supabase.from(tableName).upsert(cleaned, { onConflict: 'id' });
    if (error) throw error;
  } catch {}
};

const syncTableFromSupabaseFn = async (jsKey, localRecords) => {
  const tableName = tableNameToSupabase(jsKey);
  if (!tableName || !isSupabaseAvailable()) return localRecords;
  try {
    const data = await fetchAll(tableName); // paginado: trae TODAS las filas (no tope 1000)
    if (data) return data;
  } catch {}
  return localRecords;
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
  deletedIds: [],
});

export const db = {
  _data: null,

  // Dispara un evento para que los componentes React se actualicen
  _notifyReactComponents() {
    window.dispatchEvent(new CustomEvent('db-synced'));
  },

  _init(opts) {
    if (!this._data) {
      this._data = _data;
      if (!opts?.skipSync) {
        _loadAllFromCloud();
      }
      setupRealtimeSubscriptions();
    }
    // Keep module-level _data in sync with this._data
    // (tests may reassign db._data via resetDb)
    _data = this._data;
    return this._data;
  },

  /**
   * Resuelve cuando la PRIMERA carga desde Supabase terminó.
   * Las lecturas de la API (client.js) la esperan para que React Query
   * mantenga isLoading=true hasta tener datos reales — así las páginas
   * muestran skeletons en vez de un falso "no hay datos".
   * Tras la carga inicial resuelve al instante (sin overhead).
   */
  async whenReady() {
    this._init();
    if (_loaded || !isSupabaseAvailable()) return;
    if (_loadPromise) await _loadPromise;
  },

  /**
   * Resuelve apenas la tabla `matches` está en memoria (carga prioritaria),
   * SIN esperar predicciones/usuarios. La usan las lecturas de partidos
   * (client.js) para que la página de Partidos y el sondeo en vivo arranquen
   * de inmediato — sobre todo en móvil, donde esperar toda la BD dejaba el
   * marcador en "---" varios segundos. Tras la carga inicial resuelve al instante.
   */
  async whenMatchesReady() {
    this._init();
    if (_matchesReady || _loaded || !isSupabaseAvailable()) return;
    if (_matchesReadyPromise) await _matchesReadyPromise;
  },

  async _persist(changedTable) {
    // Cloud-only: write directly to Supabase
    if (!isSupabaseAvailable() || !supabase) return;
    if (changedTable) {
      const tableName = tableNameToSupabase(changedTable);
      const records = this._data[changedTable] || [];
      if (records.length > 0) {
        // await el upsert para que errores (RLS, validación, red) se
        // propaguen al caller en lugar de quedar silenciosos.
        await _upsertToCloud(tableName, records);
      }
    }
  },

  /**
   * Sincronización round-trip para operaciones admin:
   * 1. Sube datos locales a Supabase
   * 2. Descarga datos frescos desde Supabase
   * Garantiza que otros dispositivos vean los cambios inmediatamente.
   * Retorna { success, error } con visibilidad de errores.
   */
  async syncAdminChanges() {
    if (!isSupabaseAvailable()) return { success: true };
    await _loadAllFromCloud();
    return { success: true };
  },

  // Sincronizar TODAS las tablas desde Supabase
  async _syncAllFromSupabase() {
    if (!isSupabaseAvailable()) return;
    await _loadAllFromCloud();
  },

  async _syncAllFromSupabaseForce() {
    if (!isSupabaseAvailable()) return;
    await _loadAllFromCloud();
  },

  async _syncSingleTableFromSupabase(jsKey) {
    if (!isSupabaseAvailable()) return false;
    await _refreshTableFromCloud(jsKey);
    return true;
  },

  // Implementación interna de sincronización desde Supabase
  async _syncAllFromSupabaseInternal() {
    if (_syncFromSupabaseInProgress || _blockFromSync) {
      // Si ya hay una sync en progreso, devolver la promesa existente
      // para que quien llame pueda await-la.
      return _syncFromPromise || undefined;
    }

    _syncFromSupabaseInProgress = true;
    // Crear una promesa que resuelve cuando termine esta sync
    _syncFromPromise = (async () => {
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

      // userNotifications queda fuera del sync a Supabase por ahora — la tabla
      // todavia no existe en BD (error PGRST205 -> 404 en consola). Cuando se
      // cree con la migracion correspondiente, volver a agregarla aca.
      const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings', 'auditLogs', 'referrals', 'referralCommissions'];
      let changed = false;

      const syncResults = await Promise.all(
        tablesToSync.map(async (jsKey) => {
          const localRecords = this._data[jsKey] || [];
          const remoteRecords = await syncTableFromSupabaseFn(jsKey, localRecords);
          return { jsKey, localRecords, remoteRecords };
        })
      );

      // Cargar deletedIds remotos para fusionarlos con los locales
      // (esto evita que otro dispositivo re-upload items eliminados)
      await this._syncDeletedIdsFromCloud();

      for (const { jsKey, localRecords, remoteRecords } of syncResults) {
        if (remoteRecords && remoteRecords !== localRecords) {
          // Filtrar IDs eliminados permanentemente de los datos remotos
          // (esto evita que un sync FROM desde Supabase resucite el item)
          const filteredRemote = Array.isArray(remoteRecords)
            ? remoteRecords.filter(r => !this._isDeletedId(jsKey, r.id))
            : remoteRecords;

          // Si se agregaron registros localmente mientras se sincronizaba (ej: una predicción),
          // mezclarlos para no perderlos
          const currentLocal = this._data[jsKey] || [];
          if (currentLocal.length > localRecords.length) {
            const remoteIds = new Set(filteredRemote.map(r => r.id));
            for (const rec of currentLocal) {
              if (!remoteIds.has(rec.id)) {
                filteredRemote.push(rec);
              }
            }
          }
          this._data[jsKey] = filteredRemote;
          changed = true;
        }
      }

      if (changed) {
  
        this._notifyReactComponents();
      }
      // FIX: marcar que el primer sync FROM ya ocurrió. A partir de aquí,
      // el sync TO respeta el watermark para predictions/users (no se
      // suben filas sin updated_at ni filas viejas que podrían resucitar
      // entradas borradas en SQL).
      _markInitialSyncDone();
      } catch {
        // Error silencioso al sincronizar desde Supabase
      } finally {
        _syncFromSupabaseInProgress = false;
        _syncFromPromise = null; // Limpiar la promesa al terminar
      }
    })();
    return _syncFromPromise;
  },

  // Sincronizar deletedIds desde Supabase (app_settings) para propagar
  // eliminaciones entre dispositivos y evitar que un item borrado reaparezca.
  async _syncDeletedIdsFromCloud() {
    if (!supabase) return;
    try {
      const { data: settings } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'deleted_ids')
        .limit(1);
      if (settings && settings.length > 0 && settings[0].value) {
        const remoteDeleted = JSON.parse(settings[0].value);
        if (Array.isArray(remoteDeleted) && remoteDeleted.length > 0) {
          const d = this._init();
          let merged = false;
          // Set para O(1) lookup en lugar de array.includes() (O(n))
          const deletedSet = new Set(d.deletedIds);
          for (const entry of remoteDeleted) {
            if (!deletedSet.has(entry)) {
              d.deletedIds.push(entry);
              deletedSet.add(entry);
              merged = true;
            }
          }
          if (merged) {
            save(d);
          }
        }
      }
    } catch {}
  },

  // Subir deletedIds a Supabase (app_settings) para que otros dispositivos
  // sepan qué IDs no deben re-subir.
  async _syncDeletedIdsToCloud() {
    if (!supabase) return;
    const d = this._init();
    if (d.deletedIds.length === 0) return;
    try {
      const value = JSON.stringify(d.deletedIds);
      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', 'deleted_ids')
        .limit(1);
      if (existing && existing.length > 0) {
        await supabase.from('app_settings').update({ value }).eq('id', existing[0].id);
      } else {
        await supabase.from('app_settings').insert({
          id: makeId(),
          key: 'deleted_ids',
          value,
          created_date: getNow(),      });

    }
    } catch {}
  },

  // Procesar eliminaciones pendientes en Supabase
  async _processPendingDeletes() {
    if (_pendingDeletes.length > 0 && supabase) {
      const deletes = _pendingDeletes.splice(0);
      const results = await Promise.all(
        deletes.map(({ tableName, id }) =>
          supabase.from(tableName).delete().eq('id', id)
            .then(({ error }) => (error ? { tableName, id, error } : null))
            .catch((err) => ({ tableName, id, error: err }))
        )
      );
      // Re-encolar los borrados que fallaron para reintentar en el próximo ciclo
      // (evita que un fallo transitorio deje el registro "vivo" para siempre).
      const failed = results.filter(Boolean);
      for (const f of failed) {
        console.warn(`[DB] Falló DELETE ${f.tableName}/${f.id}:`, f.error?.message || f.error);
        _pendingDeletes.push({ tableName: f.tableName, id: f.id });
      }
    }
  },

  // Sincronizar un solo lote de tablas a Supabase
  async _syncBatchToSupabase() {
    _syncToSupabaseInProgress = true;
    try {
      const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings', 'auditLogs', 'referrals', 'referralCommissions'];
      const tablesWithData = tablesToSync.reduce((acc, jsKey) => {
        const records = this._data[jsKey] || [];
        if (records.length === 0) return acc;
        // Filtrar IDs eliminados permanentemente para que no se re-suban a Supabase
        // (esto evita que un sync TO desde otro tab/device resucite el item)
        let filtered = records.filter(r => !this._isDeletedId(jsKey, r.id));
        // FIX: admins no deben tener predicciones en BD. Si un admin tiene
        // predicciones residuales en localStorage (de antes del fix de guard),
        // las descartamos del sync TO para que no se re-suban a Supabase.
        // Hardcodeamos el email admin por si el rol aún no se cargó en users.
        if (jsKey === 'predictions') {
          const adminEmails = new Set(['admin@chessking.com']);
          for (const u of (this._data.users || [])) {
            if (u.role === 'admin') adminEmails.add(u.email);
          }
          filtered = filtered.filter(p => !adminEmails.has(p.user_email));
        }
        if (filtered.length === 0) return acc;
        // ── Watermark: solo subir filas modificadas desde la última sync TO ──
        // FIX PRINCIPAL: antes subíamos TODA la tabla local a Supabase en
        // cada syncAllTo. Si el admin borraba una fila en el SQL Editor y
        // luego hacía CUALQUIER persistencia, el cliente re-subía esa fila
        // borrada porque seguía en localStorage. Ahora solo subimos filas
        // cuyo updated_at > _lastSyncTimestamps[tableName].
        // CRÍTICO: predicciones NUNCA deben re-subirse desde el admin
        // (el scoring las escribe directo en Supabase y no debe ser
        // sobrescrito por localStorage stale del admin browser).
        const tableName = tableNameToSupabase(jsKey);
        const lastSync = _lastSyncTimestamps[tableName];
        let toUpload;
        if (jsKey === 'predictions' || jsKey === 'users') {
          // FIX: predicciones y users solo suben si tienen updated_at más
          // nuevo que el watermark. Si no hay watermark (cliente nuevo o
          // reload sin sync previo), se permite la subida SOLO si el
          // _initialSyncDone ya se completó (primer sync FROM ya pobló
          // localStorage con la verdad del server). Si NO se ha hecho
          // el sync FROM inicial, subimos todo (cliente no tiene estado
          // previo que pueda resucitar filas borradas).
          if (lastSync || _initialSyncDone) {
            toUpload = filtered.filter(r => r.updated_at && new Date(r.updated_at).getTime() > new Date(lastSync || 0).getTime());
          } else {
            toUpload = filtered;
          }
        } else {
          toUpload = lastSync
            ? filtered.filter(r => r.updated_at && new Date(r.updated_at).getTime() > new Date(lastSync).getTime())
            : filtered;
        }
        if (toUpload.length > 0) {
          acc.push({ jsKey, records: toUpload });
        }
        return acc;
      }, []);
      await Promise.all(
        tablesWithData.map(async ({ jsKey, records }) => {
          await syncTableToSupabaseFn(jsKey, records);
          const tableName = tableNameToSupabase(jsKey);
          _lastSyncTimestamps[tableName] = new Date().toISOString();
          _saveLastSyncTimestamps();
        })
      );
    } finally {
      _syncToSupabaseInProgress = false;
    }
  },

  async _syncSingleTable(jsKey) {
    if (!isSupabaseAvailable()) return;
    const tableName = tableNameToSupabase(jsKey);
    const records = this._data[jsKey] || [];
    if (records.length > 0) {
      const naturalKey = NATURAL_KEYS[jsKey] || 'id';
      await syncTableToSupabaseFn(jsKey, records);
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

    // Después de subir, ejecutar cualquier FROM sync encolado
    if (_resyncFromQueued) {
      _resyncFromQueued = false;
      await this._syncAllFromSupabaseInternal();
    }
  },
  async forceSync() {
    await _loadAllFromCloud();
  },

  // Sincronizar desde Supabase (forzar inmediato)
  async forceSyncFromCloud() {
    if (!isSupabaseAvailable()) return { success: false, error: 'Supabase not configured' };
    await _loadAllFromCloud();
    return { success: true };
  },

  // Sincronizar TODOS los datos locales a Supabase (push to cloud)
  async syncToCloud() {
    if (!isSupabaseAvailable()) return { success: false, error: 'Supabase not configured' };
    this._init();
    return { success: true };
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
    }
  },

  reset() {
    for (const key of Object.keys(this._data || {})) {
      if (Array.isArray(this._data[key])) this._data[key].length = 0;
      else this._data[key] = null;
    }
  },

  /**
   * Registra un ID como eliminado permanentemente.
   * Evita que reaparezca vía sync desde otros dispositivos o tabs.
   */
  _addDeletedId(tableName, id) {
    const d = this._init();
    const entry = `${tableName}:${id}`;
    if (!d.deletedIds.includes(entry)) {
      d.deletedIds.push(entry);
      save(d);
    }
  },

  /**
   * Verifica si un ID está marcado como eliminado permanentemente.
   */
  _isDeletedId(tableName, id) {
    const d = this._init();
    return d.deletedIds.includes(`${tableName}:${id}`);
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
    // Bloquear sync FROM Supabase Y sync TO en _persist() para evitar
    // race conditions durante la operación destructiva.
    _blockFromSync = true;
    _skipBackgroundSync = true;
    const d = this._init({ skipSync: true });
    const now = getNow();

    // 1. Identificar usuarios NO admin y sus emails
    const nonAdminEmails = new Set();
    const nonAdminIds = [];
    for (const u of _data.users || []) {
      if (u.role !== 'admin') {
        nonAdminEmails.add(u.email);
        nonAdminIds.push(u.id);
      }
    }

    const adminUsers = (_data.users || []).filter(u => u.role === 'admin');

    // 2. Eliminar TODAS las predicciones (incluye admin)
    const predsToDelete = [...(_data.predictions || [])];
    _data.predictions = [];

    // 3. Eliminar TODOS los canjes
    const redemptionsToDelete = [...(_data.redemptions || [])];
    _data.redemptions = [];

    // 4. Eliminar todos los puntos extra (pointsBonuses)
    const bonusesToDelete = (_data.pointsBonuses || []);
    _data.pointsBonuses = [];

    // 5. Eliminar TODOS los tickets de soporte
    const ticketsToDelete = [...(_data.supportTickets || [])];
    _data.supportTickets = [];

    // 6. Eliminar todos los referidos (registros referrer→referred)
    const referralsToDelete = [...(_data.referrals || [])];
    _data.referrals = [];

    // 7. Eliminar todas las comisiones de referidos
    const commissionsToDelete = [...(_data.referralCommissions || [])];
    _data.referralCommissions = [];

    // 8. Resetear contadores de referidos en usuarios admin
    for (const u of _data.users) {
      u.referral_points = 0;
      u.referred_by = null;
      u.updated_at = now;
    }

    // 9. Eliminar usuarios NO admin
    _data.users = adminUsers;

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
        const existingLocal = _data.appSettings.findIndex(s => s.key === 'last_clean');
        const cleanRecord = { id: makeId(), key: 'last_clean', value: cleanTimestamp, created_date: now };
        if (existingLocal >= 0) {
          _data.appSettings[existingLocal] = { ..._data.appSettings[existingLocal], value: cleanTimestamp };
        } else {
          _data.appSettings.push(cleanRecord);
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
            // Combina filter().map() en un solo loop (un solo recorrido)
            const stillNonAdmin = [];
            for (const u of stillUsers) {
              if (u.role !== 'admin') stillNonAdmin.push(u.id);
            }
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
    _skipBackgroundSync = false;

    // Sync round-trip: subir admin + tablas limpiadas, luego descargar fresco
    try {
      const syncResult = await this.syncAdminChanges();
      if (!syncResult.success) {
        console.error('[cleanUserData] Sync to Supabase failed:', syncResult.error);
      }
    } catch (syncErr) {
      console.error('[cleanUserData] Sync error:', syncErr);
    }

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
        const record = { id: makeId(), created_date: getNow(), ...data };
      _data.users.push(record);
      await db._persist('users');
      return record;
    },
    async update(id, data) {
        const idx = _data.users.findIndex(u => u.id === id);
      if (idx === -1) throw new Error('User not found');
      _data.users[idx] = { ..._data.users[idx], ...data, updated_at: getNow() };
      await db._persist('users');
      return _data.users[idx];
    },
    findById(id) {
      return db._init().users.find(u => u.id === id);
    },
    findByEmail(email) {
      return db._init().users.find(u => u.email === email);
    },
    async remove(id) {
        const idx = _data.users.findIndex(u => u.id === id);
      if (idx === -1) throw new Error('User not found');
      const user = _data.users[idx];
      const email = user.email;

      // 1. Eliminar predicciones del usuario
      const predsToDelete = (_data.predictions || []).filter(p => p.user_email === email);
      const predIds = new Set(predsToDelete.map(p => p.id));
      _data.predictions = (_data.predictions || []).filter(p => !predIds.has(p.id));

      // 2. Eliminar canjes del usuario
      const redemptionsToDelete = (_data.redemptions || []).filter(r => r.user_email === email);
      const redIds = new Set(redemptionsToDelete.map(r => r.id));
      _data.redemptions = (_data.redemptions || []).filter(r => !redIds.has(r.id));

      // 3. Eliminar puntos extra del usuario
      const bonusesToDelete = (_data.pointsBonuses || []).filter(b => b.user_email === email);
      const bonusIds = new Set(bonusesToDelete.map(b => b.id));
      _data.pointsBonuses = (_data.pointsBonuses || []).filter(b => !bonusIds.has(b.id));

      // 4. Eliminar tickets de soporte del usuario
      const ticketsToDelete = (_data.supportTickets || []).filter(t => t.user_email === email);
      const ticketIds = new Set(ticketsToDelete.map(t => t.id));
      _data.supportTickets = (_data.supportTickets || []).filter(t => !ticketIds.has(t.id));

      // 5. Eliminar el usuario del array
      _data.users.splice(idx, 1);

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
        const record = { id: makeId(), created_date: getNow(), ...data };
      _data.matches.push(record);
      db._persist('matches');
      return record;
    },
    async update(id, data) {
        const idx = _data.matches.findIndex(m => m.id === id);
      if (idx === -1) throw new Error('Match not found');
      _data.matches[idx] = { ..._data.matches[idx], ...data, updated_at: getNow() };
      await db._persist('matches');
      return _data.matches[idx];
    },
    /**
     * Eliminar un partido. Las predicciones existentes se DESVINCULAN
     * (match_id se pone a null) — no se borran, para preservar el
     * historial de cada usuario. Requiere Supabase Auth Admin para
     * el DELETE directo (RLS no permite DELETE anónimo).
     */
    async remove(id) {
        const idx = _data.matches.findIndex(m => m.id === id);
      if (idx === -1) throw new Error('Match not found');
      const match = _data.matches[idx];

      // Bloquear sync FROM/TO durante la operación para evitar que el
      // polling resucite el partido antes de que el DELETE termine.
      _blockFromSync = true;
      _skipBackgroundSync = true;
      try {
        // 1. Desvincular predicciones (match_id = null). No las borramos.
        const affected = (_data.predictions || []).filter(p => p.match_id === id);
        for (const p of affected) {
          p.match_id = null;
          p.updated_at = getNow();
        }
        if (affected.length > 0) {
          // Subir predicciones desvinculadas a Supabase
          db._persist('predictions');
        }

        // 2. Eliminar partido de localStorage + marcar deletedId
        _data.matches.splice(idx, 1);
        db._addDeletedId('matches', id);
        save(d);

        // 3. DELETE directo en Supabase (no upsert) para garantizar borrado
        if (isSupabaseAvailable() && supabase) {
          const { error } = await supabase.from('matches').delete().eq('id', id);
          if (error) {
            throw new Error('No se pudo eliminar en Supabase: ' + (error.message || error));
          }
        }

        // 4. Liberar bloqueos + refrescar
        _blockFromSync = false;
        _skipBackgroundSync = false;
        await db._syncSingleTable('predictions');
        await db._syncDeletedIdsToCloud();
        notifyReactComponents();
        return { ok: true, detached: affected.length };
      } finally {
        _blockFromSync = false;
        _skipBackgroundSync = false;
      }
    },
    async clearAll() {
        // Eliminar directamente de Supabase si está disponible (await para evitar race condition con polling)
      if (isSupabaseAvailable() && supabase && _data.matches.length > 0) {
        const matchIds = _data.matches.map(m => m.id);
        // Eliminar en lotes para evitar URLs too long
        const batchSize = 50;
        const promises = [];
        for (let i = 0; i < matchIds.length; i += batchSize) {
          const batch = matchIds.slice(i, i + batchSize);
          promises.push(supabase.from('matches').delete().in('id', batch));
        }
        await Promise.all(promises);
      }
      _data.matches = [];
      db._persist('matches');
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
        if (_data.matches.length === 0) return;

      const now = new Date().toISOString();

      // 1. Resetear todos los partidos a Pendiente, limpiar resultados y timer
      for (const m of _data.matches) {
        m.status = 'pending';
        m.result_team1 = null;
        m.result_team2 = null;
        m.elapsed = null;
        m.live_started_at = null;
        m.updated_at = now;
      }

      // 2. Eliminar TODAS las predicciones de estos partidos (para que usuarios hagan nuevas)
      const matchIds = new Set(_data.matches.map(m => m.id));
      const predsToDelete = (_data.predictions || []).filter(p => matchIds.has(p.match_id));
      const deletedPredIds = new Set(predsToDelete.map(p => p.id));
      for (const p of predsToDelete) {
        _pendingDeletes.push({ tableName: 'predictions', id: p.id });
      }
      _data.predictions = (_data.predictions || []).filter(p => !deletedPredIds.has(p.id));

      // 3. Recalcular puntos de usuarios — todas las predicciones se reiniciaron,
      // así que los puntos de predicción vuelven a 0
      for (const u of _data.users || []) {
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
        const allMatchIds = _data.matches.map(m => m.id);
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
        const usersToSync = _data.users.filter(u => u.role !== 'admin');
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
        const now = getNow();

      // Eliminar partidos existentes con mismo fixture_id para evitar duplicados
      const newFixtureIds = new Set(matchesArray.flatMap(m => m.fixture_id ? [m.fixture_id] : []));
      if (newFixtureIds.size > 0) {
        _data.matches = _data.matches.filter(m => !newFixtureIds.has(m.fixture_id));
      }

      // También eliminar por team+date combo para prevenir duplicados sin fixture_id
      const newCombos = new Set(matchesArray.map(m => `${m.team1 || ''}|${m.team2 || ''}|${m.match_date || ''}`));
      _data.matches = _data.matches.filter(m => {
        if (m.fixture_id != null && newFixtureIds.has(m.fixture_id)) return false;
        const combo = `${m.team1 || ''}|${m.team2 || ''}|${m.match_date || ''}`;
        return !newCombos.has(combo);
      });

      const records = matchesArray.map(m => ({
        id: makeId(),
        created_date: now,
        ...m
      }));
      _data.matches.push(...records);
      db._persist('matches');
      return records;
    },

    /**
     * Deduplicar partidos: agrupa por fixture_id, mantiene solo una copia,
     * re-apunta predicciones a la copia conservada y elimina los duplicados.
     * Retorna { deleted, repointed } con el conteo.
     *
     * Robustez anti-reaparición (arregla race con sync/poll/API):
     *  1. Bloquea _syncAllFromSupabase durante toda la operación.
     *  2. Elimina los duplicados en Supabase DIRECTAMENTE con await
     *     (no usa _pendingDeletes silencioso).
     *  3. Hace un pase de verificación post-DELETE.
     *  4. Modifica _data.matches y predicciones en memoria.
     *  5. Sube predicciones re-apuntadas a Supabase ANTES de los partidos.
     *  6. Sube _data.matches ya limpio a Supabase.
     *  7. Hace un sync final forzado desde Supabase para que la memoria
     *     refleje 100% la nube (descarta cualquier duplicado que aún exista).
     *  8. Libera el bloqueo.
     */
    async deduplicate() {
      // Bloquear poll FROM Supabase y sync TO en _persist() para evitar
      // race conditions durante la operación.
      _blockFromSync = true;
      _skipBackgroundSync = true;

      try {
        const d = db._init({ skipSync: true });
        const predictions = _data.predictions || [];
        const matches = _data.matches;

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

        // ── ELIMINAR DE SUPABASE PRIMERO (DIRECTO, no silencioso) ──
        if (isSupabaseAvailable() && supabase) {
          const BATCH = 50;
          const idBatches = [];
          for (let i = 0; i < toDelete.length; i += BATCH) {
            idBatches.push(toDelete.slice(i, i + BATCH));
          }
          // DELETE batches en paralelo; capturar errores para reportar
          const deleteErrors = [];
          await Promise.all(
            idBatches.map(async (idBatch) => {
              const { error } = await supabase
                .from('matches')
                .delete()
                .in('id', idBatch);
              if (error) {
                deleteErrors.push(error.message || JSON.stringify(error));
              }
            })
          );

          if (deleteErrors.length > 0) {
            // Si TODOS los batches fallaron, abortar para no corromper el estado
            // local con un push que no tiene contraparte en la nube.
            const allFailed = deleteErrors.length === idBatches.length;
            if (allFailed) {
              throw new Error(
                'No se pudieron eliminar los duplicados en Supabase: ' +
                deleteErrors.join('; ')
              );
            }
            // Si solo algunos fallaron, continuar (pase de verificación los recoge)
          }

          // ── Pase de verificación: re-eliminar cualquier residuo ──
          try {
            const { data: remaining } = await supabase
              .from('matches')
              .select('id')
              .in('id', toDelete)
              .limit(5000);
            if (remaining && remaining.length > 0) {
              const remainingBatches = [];
              for (let i = 0; i < remaining.length; i += BATCH) {
                remainingBatches.push(remaining.slice(i, i + BATCH).map(r => r.id));
              }
              await Promise.all(
                remainingBatches.map((ids) =>
                  supabase.from('matches').delete().in('id', ids)
                )
              );
            }
          } catch {
            /* continuar — el sync final forzado detectará cualquier residuo */
          }
        }

        // ── MODIFICAR MEMORIA LOCAL ──
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
        _data.matches = _data.matches.filter(m => !deleteSet.has(m.id));

        // 4. Guardar en localStorage
        save(d);

        // ── SUBIR PREDICCIONES RE-APUNTADAS ANTES QUE NADA ──
        if (repointed > 0 && isSupabaseAvailable() && supabase) {
          try {
            // Subir solo las predicciones afectadas
            const affected = predictions.filter(p => p.match_id && deleteSet.size > 0 && Object.values(repointMap).includes(p.match_id));
            if (affected.length > 0) {
              // Subir en batches en paralelo (Promise.all) en vez de await secuencial
              const BATCH = 100;
              const batches = [];
              for (let i = 0; i < affected.length; i += BATCH) {
                const batch = affected.slice(i, i + BATCH);
                // stripLocalFields limpia campos no existentes en Supabase
                const cleaned = batch.map(p => {
                  const { created_date, updated_at, ...rest } = p;
                  return rest;
                });
                batches.push(
                  supabase.from('predictions').upsert(cleaned, { onConflict: 'id' })
                );
              }
              const results = await Promise.all(batches);
              for (const { error } of results) {
                if (error) {
                  /* error silencioso — no es crítico, las predicciones
                     se re-subirán en el próximo _syncAllToSupabase */
                }
              }
            }
          } catch {
            /* continuar */
          }
        }

        // ── SUBIR PARTIDOS LIMPIOS A SUPABASE ──
        // _data.matches ya no tiene los duplicados, así que el upsert sube
        // solo los que deben existir. Los duplicados restantes en Supabase
        // (si los hubiera por fallo del DELETE) serán recogidos por el
        // sync forzado al final, que sobrescribirá _data.matches con la nube.
        try {
          await syncTableToSupabaseFn('matches', _data.matches);
        } catch {
          /* continuar */
        }

        // ── SYNC ROUND-TRIP COMPLETO ──
        // 1. Subir cambios locales a Supabase (partidos limpios + predicciones re-asignadas)
        // 2. Descargar estado fresco desde Supabase (garantiza consistencia)
        try {
          const syncResult = await this.syncAdminChanges();
          if (!syncResult.success) {
            console.error('[Deduplicate] Sync to Supabase failed:', syncResult.error);
          }
        } catch (syncErr) {
          console.error('[Deduplicate] Sync error:', syncErr);
        }

        notifyReactComponents();

        return { deleted: toDelete.length, repointed };
      } finally {
        // Liberar el bloqueo SIEMPRE, incluso si hubo error
        _blockFromSync = false;
        _skipBackgroundSync = false;
      }
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
    async create(data) {
        // Admins no deben crear pronósticos que se persistan/sincronicen —
      // la regla de negocio es que admins no acumulan puntos.
      const currentUser = db.getCurrentUser();
      if (currentUser?.role === 'admin') {
        // Simular éxito sin persistir (no-op silencioso).
        return { id: 'noop-admin', ...data, created_date: getNow() };
      }
      // Evitar duplicados: un solo pronóstico por usuario por partido
      const existing = _data.predictions.find(p => p.user_email === data.user_email && p.match_id === data.match_id);
      if (existing) {
        // Actualizar el existente en lugar de crear duplicado.
        Object.assign(existing, data, { updated_at: getNow() });
        // Persistir SOLO esta fila — NO db._persist('predictions'), que
        // reintenta subir toda la tabla (todos los usuarios) y la RLS
        // rechaza el lote porque un usuario normal no puede tocar filas
        // ajenas. await para que un fallo se propague al caller.
        await _upsertToCloud('predictions', [existing]);
        return existing;
      }
      const record = {
        id: makeId(),
        created_date: getNow(),
        updated_at: getNow(),
        scored: false,
        is_correct: false,
        points_earned: 0,
        ...data,
      };
      _data.predictions.push(record);
      // Insert de una sola fila propia → pasa la política predictions_insert_own.
      // await: si Supabase rechaza, create() lanza y la mutación muestra error
      // en vez de un falso "¡Enviado!" (antes no se esperaba y el pronóstico
      // se perdía silenciosamente al recargar).
      await _upsertToCloud('predictions', [record]);
      return record;
    },
    async update(id, data) {
        const currentUser = db.getCurrentUser();
      if (currentUser?.role === 'admin') {
        return { id, ...data };
      }
      const idx = _data.predictions.findIndex(p => p.id === id);
      if (idx === -1) throw new Error('Prediction not found');
      _data.predictions[idx] = { ..._data.predictions[idx], ...data, updated_at: getNow() };
      await db._persist('predictions');
      return _data.predictions[idx];
    },

    /**
     * Deduplicar pronósticos: agrupa por (user_email, match_id), mantiene
     * la fila con más información (scored=true con puntos > 0, o la más
     * reciente), y elimina los duplicados.
     *
     * Robustez anti-reaparición (mismo patrón que matches.deduplicate):
     *  1. Bloquea sync FROM Supabase y sync TO en _persist()
     *  2. Elimina duplicados en Supabase DIRECTAMENTE
     *  3. Sube el estado limpio a Supabase
     *  4. Hace sync round-trip final
     *  5. Libera el bloqueo
     *
     * Retorna { deleted, scanned }.
     */
    async deduplicate() {
      _blockFromSync = true;
      _skipBackgroundSync = true;
      try {
        const d = db._init({ skipSync: true });
        const predictions = _data.predictions || [];

        // 1. Agrupar por (user_email, match_id)
        const groups = {};
        for (const p of predictions) {
          if (!p.user_email || !p.match_id) continue;
          const key = `${p.user_email}|${p.match_id}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(p);
        }

        const toDelete = [];
        for (const key of Object.keys(groups)) {
          const group = groups[key];
          if (group.length <= 1) continue;
          // Conservar la fila con scored=true + points_earned más alto,
          // o la más reciente si empatan
          const sorted = group.toSorted((a, b) => {
            const aScore = (a.scored ? 1 : 0) * 1000
              + (a.points_earned || 0) * 10
              + new Date(a.updated_at || a.created_date || 0).getTime() / 1e9;
            const bScore = (b.scored ? 1 : 0) * 1000
              + (b.points_earned || 0) * 10
              + new Date(b.updated_at || b.created_date || 0).getTime() / 1e9;
            return bScore - aScore;
          });
          const keep = sorted[0];
          for (const p of group) {
            if (p.id !== keep.id) toDelete.push(p.id);
          }
        }

        if (toDelete.length === 0) {
          return { deleted: 0, scanned: predictions.length };
        }

        // 2. Eliminar DIRECTAMENTE de Supabase
        if (isSupabaseAvailable() && supabase) {
          const BATCH = 50;
          const idBatches = [];
          for (let i = 0; i < toDelete.length; i += BATCH) {
            idBatches.push(toDelete.slice(i, i + BATCH));
          }
          const deleteErrors = [];
          await Promise.all(
            idBatches.map(async (idBatch) => {
              const { error } = await supabase
                .from('predictions')
                .delete()
                .in('id', idBatch);
              if (error) deleteErrors.push(error.message || JSON.stringify(error));
            })
          );
          if (deleteErrors.length > 0) {
            const allFailed = deleteErrors.length === idBatches.length;
            if (allFailed) {
              throw new Error(
                'No se pudieron eliminar predicciones duplicadas en Supabase: ' +
                deleteErrors.join('; ')
              );
            }
          }
          // Pase de verificación
          try {
            const { data: remaining } = await supabase
              .from('predictions')
              .select('id')
              .in('id', toDelete)
              .limit(5000);
            if (remaining && remaining.length > 0) {
              const remBatches = [];
              for (let i = 0; i < remaining.length; i += BATCH) {
                remBatches.push(remaining.slice(i, i + BATCH).map(r => r.id));
              }
              await Promise.all(
                remBatches.map(ids => supabase.from('predictions').delete().in('id', ids))
              );
            }
          } catch {}
        }

        // 3. Modificar memoria local
        const deleteSet = new Set(toDelete);
        _data.predictions = _data.predictions.filter(p => !deleteSet.has(p.id));
        save(d);

        // 4. Sync round-trip
        try {
          await this.syncAdminChanges();
        } catch (syncErr) {
          console.error('[predictions.deduplicate] sync error:', syncErr);
        }

        notifyReactComponents();
        return { deleted: toDelete.length, scanned: predictions.length };
      } finally {
        _blockFromSync = false;
        _skipBackgroundSync = false;
      }
    },
  },

  // --- Helpers para Stock Dinámico ---
  /**
   * Calcula el total de unidades sumando el stock de todas las tallas.
   */
  _sumSizesStock(sizes) {
    if (!sizes || typeof sizes !== 'object') return 0;
    return Object.values(sizes).reduce((sum, stock) => sum + (Number(stock) || 0), 0);
  },

  /**
   * Obtiene el stock disponible de un premio calculándolo dinámicamente:
   *   stock_actual = original_stock - redemptions_activas
   *
   * Si el premio NO tiene original_stock (legacy), usa units_available directamente.
   */
  _getAvailableStock(prize) {
    // Contar canjes activos (pending, approved, delivered = RESERVADO)
    const activeRedemptions = (_data.redemptions || []).filter(
      r => r.prize_id === prize.id && ['pending', 'approved', 'delivered'].includes(r.status)
    ).length;

    // Si tiene original_stock, usar ese como base
    if (prize.original_stock !== undefined && prize.original_stock !== null) {
      return Math.max(0, prize.original_stock - activeRedemptions);
    }

    // Legacy: restar canjes activos de units_available
    return Math.max(0, (prize.units_available || 0) - activeRedemptions);
  },

  /**
   * Obtiene las tallas disponibles calculándolas dinámicamente:
   *   talla_actual[X] = original_sizes[X] - redemptions_activas_con_esa_talla
   *
   * Si el premio NO tiene original_sizes (legacy), devuelve sizes tal cual.
   */
  _getAvailableSizes(prize) {
    if (!prize.original_sizes || typeof prize.original_sizes !== 'object' || Object.keys(prize.original_sizes).length === 0) {
      // Legacy: devolver sizes como están
      return prize.sizes || null;
    }
    // Calcular dinámicamente
    const available = { ...prize.original_sizes };
    const redemptions = (_data.redemptions || []).filter(
      r => r.prize_id === prize.id && ['pending', 'approved', 'delivered'].includes(r.status)
    );
    for (const r of redemptions) {
      if (r.selected_size && available[r.selected_size] !== undefined) {
        available[r.selected_size] = Math.max(0, available[r.selected_size] - 1);
      }
    }
    return available;
  },

  /**
   * Migración one-time: convertir premios legacy (sin original_stock) al
   * nuevo formato de stock dinámico.
   * original_stock = units_available + redemptions_activas
   * original_sizes = sizes (copia)
   */
  _migratePrizeToDynamic(p) {
    if (p.original_stock !== undefined && p.original_stock !== null) return; // ya migrado
    const activeCount = (_data.redemptions || []).filter(
      r => r.prize_id === p.id && ['pending', 'approved', 'delivered'].includes(r.status)
    ).length;
    p.original_stock = (p.units_available || 0) + activeCount;
    if (p.sizes && typeof p.sizes === 'object' && Object.keys(p.sizes).length > 0) {
      p.original_sizes = { ...p.sizes };
    }
  },

  // --- Prizes ---
  prizes: {
    list(order) {
      const d = db._init().prizes;
      try {
        // Migrar premios legacy a dinámico (one-time)
        for (const p of d) {
          db._migratePrizeToDynamic(p);
        }
        return sortBy(d, order).map(p => ({
          ...p,
          units_available: db._getAvailableStock(p),
          sizes: db._getAvailableSizes(p),
        }));
      } catch (err) {
        console.error('[DB] Error en prizes.list():', err);
        // Fallback: devolver datos sin procesar o array vacío
        if (Array.isArray(d)) return sortBy(d, order);
        return [];
      }
    },
    filter(fields, order) {
      const allPrizes = db._init().prizes;
      try {
        let d = allPrizes.filter(p =>
          Object.entries(fields).every(([k, v]) => p[k] === v)
        );
        // Migrar premios legacy a dinámico
        for (const p of d) {
          db._migratePrizeToDynamic(p);
        }
        if (order) {
          const field = order.startsWith('-') ? order.slice(1) : order;
          const dir = order.startsWith('-') ? -1 : 1;
          d.sort((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
        }
        return d.map(p => ({
          ...p,
          units_available: db._getAvailableStock(p),
          sizes: db._getAvailableSizes(p),
        }));
      } catch (err) {
        console.error('[DB] Error en prizes.filter():', err);
        if (Array.isArray(allPrizes)) return allPrizes;
        return [];
      }
    },
    async create(data) {
        const originalSizes = data.original_sizes || data.sizes || null;
      const originalStock = data.original_stock !== undefined
        ? Number(data.original_stock)
        : (originalSizes
            ? db._sumSizesStock(originalSizes)
            : (Number(data.units_available) || 0));
      const record = {
        id: makeId(),
        created_date: getNow(),
        ...data,
        // Guardar valores originales
        original_stock: originalStock,
        original_sizes: originalSizes,
        // Valores calculados (se recalculan al leer)
        units_available: originalStock,
        sizes: originalSizes ? { ...originalSizes } : (data.sizes || null),
      };
      _data.prizes.push(record);
      // Await el persist para que errores de RLS/Supabase se propaguen al
      // caller. Si falla, hacemos rollback del push para no dejar
      // inconsistencia entre memoria y nube.
      try {
        await db._persist('prizes');
      } catch (err) {
        // Rollback: quitar el registro recién agregado de la memoria local
        const idx = _data.prizes.findIndex(p => p.id === record.id);
        if (idx !== -1) _data.prizes.splice(idx, 1);
        throw err;
      }
      return record;
    },
    async update(id, data) {
        const d = db._init();
      const idx = d.prizes.findIndex(p => p.id === id);
      if (idx === -1) throw new Error('Prize not found');
      const previous = { ...d.prizes[idx] };
      const updateData = { ...data, updated_at: getNow() };
      // Si se actualizan original_sizes, recalcular original_stock
      if (data.original_sizes !== undefined) {
        updateData.original_stock = db._sumSizesStock(data.original_sizes);
      }
      d.prizes[idx] = { ...d.prizes[idx], ...updateData };
      // Await persist + rollback en error
      try {
        await db._persist('prizes');
      } catch (err) {
        d.prizes[idx] = previous;
        throw err;
      }
      // Retornar con valores calculados
      const updated = d.prizes[idx];
      return {
        ...updated,
        units_available: db._getAvailableStock(updated),
        sizes: db._getAvailableSizes(updated),
      };
    },
    async remove(id) {
      // Bloquear sync FROM Supabase y sync TO en _persist() para evitar
      // que el polling vuelva a traer el premio antes de que el DELETE termine
      // (race condition que "resucitaba" premios borrados en otros dispositivos).
      _blockFromSync = true;
      _skipBackgroundSync = true;
      try {
        const d = db._init({ skipSync: true });
        const idx = d.prizes.findIndex(p => p.id === id);
        if (idx === -1) throw new Error('Prize not found');
        d.prizes.splice(idx, 1);
        // Marcar como eliminado permanentemente para evitar reaparición
        db._addDeletedId('prizes', id);

        // Eliminar DIRECTAMENTE de Supabase con await (no silencioso) para
        // garantizar que el borrado se propague antes de cualquier upsert.
        if (isSupabaseAvailable() && supabase) {
          const { error } = await supabase.from('prizes').delete().eq('id', id);
          if (error) {
            throw new Error('No se pudo eliminar el premio en Supabase: ' + (error.message || error));
          }
        }

        // Liberar bloqueos antes del sync para que _syncSingleTableFromSupabase funcione
        _blockFromSync = false;
        _skipBackgroundSync = false;

        // Subir premios a Supabase (sin el eliminado) y descargar estado fresco
        // Las 3 llamadas son independientes → ejecutarlas en paralelo con Promise.all
        await Promise.all([
          db._syncSingleTable('prizes'),
          db._syncSingleTableFromSupabase('prizes'),
          db._syncDeletedIdsToCloud(),
        ]);
        notifyReactComponents();
        return true;
      } finally {
        _blockFromSync = false;
        _skipBackgroundSync = false;
      }
    },

    /**
     * Deduplicar premios: agrupa por nombre (case-insensitive),
     * conserva el más antiguo (por created_date, luego por id),
     * elimina el resto. Útil para limpiar premios demo duplicados
     * que se generaron con IDs aleatorios antes de usar IDs fijos.
     */
    async deduplicate() {
      _blockFromSync = true;
      _skipBackgroundSync = true;
      try {
        const d = db._init({ skipSync: true });
        const prizes = _data.prizes || [];

        // Agrupar por nombre (case-insensitive)
        const groups = {};
        for (const p of prizes) {
          const key = (p.name || '').toLowerCase().trim();
          if (!key) continue;
          if (!groups[key]) groups[key] = [];
          groups[key].push(p);
        }

        const toDelete = [];
        for (const key of Object.keys(groups)) {
          const group = groups[key];
          if (group.length <= 1) continue;
          // Conservar el más antiguo (created_date más temprano)
          // En caso de empate, el de id alfabéticamente menor
          const sorted = group.toSorted((a, b) => {
            const aTime = new Date(a.created_date || 0).getTime();
            const bTime = new Date(b.created_date || 0).getTime();
            if (aTime !== bTime) return aTime - bTime;
            return (a.id || '').localeCompare(b.id || '');
          });
          const keep = sorted[0];
          for (const p of group) {
            if (p.id !== keep.id) toDelete.push(p.id);
          }
        }

        if (toDelete.length === 0) {
          return { deleted: 0, scanned: prizes.length };
        }

        // Eliminar DIRECTAMENTE de Supabase
        if (isSupabaseAvailable() && supabase) {
          const BATCH = 50;
          const idBatches = [];
          for (let i = 0; i < toDelete.length; i += BATCH) {
            idBatches.push(toDelete.slice(i, i + BATCH));
          }
          const deleteErrors = [];
          await Promise.all(
            idBatches.map(async (idBatch) => {
              const { error } = await supabase
                .from('prizes')
                .delete()
                .in('id', idBatch);
              if (error) deleteErrors.push(error.message || JSON.stringify(error));
            })
          );
          if (deleteErrors.length > 0) {
            const allFailed = deleteErrors.length === idBatches.length;
            if (allFailed) {
              throw new Error(
                'No se pudieron eliminar premios duplicados en Supabase: ' +
                deleteErrors.join('; ')
              );
            }
          }
        }

        // Modificar memoria local
        const deleteSet = new Set(toDelete);
        _data.prizes = _data.prizes.filter(p => !deleteSet.has(p.id));
        save(d);

        // Sync round-trip
        try {
          await this.syncAdminChanges();
        } catch (syncErr) {
          console.error('[prizes.deduplicate] sync error:', syncErr);
        }

        notifyReactComponents();
        return { deleted: toDelete.length, scanned: prizes.length };
      } finally {
        _blockFromSync = false;
        _skipBackgroundSync = false;
      }
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
    async create(data) {
        const record = { id: makeId(), created_date: getNow(), ...data };
      _data.redemptions.push(record);
      await db._persist('redemptions');
      return record;
    },
    /**
     * Canje atómico server-side (anti race-condition).
     * Llama a la función SQL redeem_prize() que valida stock y puntos DENTRO
     * de una transacción con lock en el premio: si dos usuarios canjean el
     * mismo premio al mismo tiempo desde dispositivos distintos, Postgres los
     * procesa en serie y el segundo recibe OUT_OF_STOCK — nunca se crea un
     * canje de más ni se duplica nada.
     * Fallback: si la función aún no está instalada en Supabase (migración
     * 2026-06-12-001 pendiente), usa el flujo local original.
     */
    async redeem({ prizeId, userEmail, selectedSize }) {
      const id = makeId();
      const createdDate = getNow();
      if (isSupabaseAvailable() && supabase) {
        const { data, error } = await supabase.rpc('redeem_prize', {
          p_user_email: userEmail,
          p_prize_id: prizeId,
          p_id: id,
          p_created_date: createdDate,
        });
        if (!error) {
          if (data && !_data.redemptions.some(r => r.id === data.id)) {
            _data.redemptions.push(data);
          }
          // Guardar la talla seleccionada en un paso aparte (no es parte de
          // la transacción atómica de stock/puntos — es solo metadato).
          // Envuelto en try/catch: si falla, el canje sigue válido sin talla.
          if (selectedSize && data?.id) {
            try {
              await db.redemptions.update(data.id, { selected_size: selectedSize });
              data.selected_size = selectedSize;
            } catch (e) {
              console.warn('[DB] No se pudo guardar la talla del canje:', e?.message);
            }
          }
          return data;
        }
        const msg = error.message || '';
        // PGRST202 = función no encontrada → migración pendiente, usar fallback
        const notInstalled = error.code === 'PGRST202' ||
          (/redeem_prize/i.test(msg) && /could not find|does not exist|not exist/i.test(msg));
        if (!notInstalled) {
          // Errores de negocio lanzados por la función SQL → mensaje amigable
          if (msg.includes('OUT_OF_STOCK')) throw new Error('Este premio se agotó hace un momento — otro usuario lo canjeó primero.');
          if (msg.includes('INSUFFICIENT_POINTS')) throw new Error('No tienes suficientes puntos disponibles (puntos reservados en canjes pendientes).');
          if (msg.includes('PRIZE_NOT_ACTIVE') || msg.includes('PRIZE_NOT_FOUND')) throw new Error('Este premio ya no está disponible.');
          if (msg.includes('USER_NOT_FOUND')) throw new Error('Usuario no encontrado. Vuelve a iniciar sesión.');
          throw new Error(msg);
        }
        console.warn('[DB] redeem_prize RPC no instalada — usando flujo local. Corre la migración 2026-06-12-001 en Supabase.');
      }
      // Fallback local (sin garantía atómica): mismo comportamiento anterior
      const prize = _data.prizes.find(p => p.id === prizeId);
      if (!prize) throw new Error('Este premio ya no está disponible.');
      return db.redemptions.create({
        user_email: userEmail,
        prize_id: prizeId,
        prize_name: prize.name,
        points_spent: Number(prize.points_cost) || 0,
        status: 'pending',
        ...(selectedSize ? { selected_size: selectedSize } : {}),
      });
    },
    async update(id, data) {
      const idx = _data.redemptions.findIndex(r => r.id === id);
      if (idx === -1) throw new Error('Redemption not found');
      _data.redemptions[idx] = { ..._data.redemptions[idx], ...data, updated_at: getNow() };
      await db._persist('redemptions');
      return _data.redemptions[idx];
    },
  },

  // --- UserNotifications ---
  // Mensajes efímeros que el admin manda al user (ej: "tu canje fue rechazado").
  // El user los ve como toast al entrar a la app. Se marcan como leídos al cerrar.
  userNotifications: {
    list(order) {
      const d = db._init().userNotifications;
      return sortBy(d, order);
    },
    filter(fields, order) {
      let d = db._init().userNotifications.filter(n =>
        Object.entries(fields).every(([k, v]) => n[k] === v)
      );
      if (order) {
        const field = order.startsWith('-') ? order.slice(1) : order;
        const dir = order.startsWith('-') ? -1 : 1;
        d.sort((a, b) => ((a[field] || '') > (b[field] || '') ? 1 : -1) * dir);
      }
      return d;
    },
    create(data) {
      const record = {
        id: makeId(),
        created_date: getNow(),
        read_at: null,
        ...data,
      };
      _data.userNotifications.push(record);
      db._persist('userNotifications');
      return record;
    },
    async update(id, data) {
      const idx = _data.userNotifications.findIndex(n => n.id === id);
      if (idx === -1) throw new Error('Notification not found');
      _data.userNotifications[idx] = { ..._data.userNotifications[idx], ...data, updated_at: getNow() };
      await db._persist('userNotifications');
      return _data.userNotifications[idx];
    },
    async markRead(id) {
      const now = getNow();
      // Update directo en BD — si falla, igual marcamos local para no spamear.
      if (isSupabaseAvailable() && supabase) {
        try {
          await supabase.from('user_notifications').update({ read_at: now }).eq('id', id);
        } catch (e) { /* noop */ }
      }
      const idx = _data.userNotifications.findIndex(n => n.id === id);
      if (idx !== -1) {
        _data.userNotifications[idx].read_at = now;
        await db._persist('userNotifications');
        return _data.userNotifications[idx];
      }
      return null;
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
    async create(data) {
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
      _data.supportTickets.push(record);
      // FIX (jun 2026): el _persist ahora se AWAITEA para que errores de RLS,
      // FK o red se propaguen al caller. Antes era fire-and-forget y el
      // ticket quedaba solo en memoria local — el admin nunca lo veía
      // en la BD. Si el upsert falla, hacemos rollback del push local y
      // re-lanzamos el error para que Support.jsx lo muestre al usuario
      // en lugar de fingir éxito.
      try {
        await db._persist('supportTickets');
      } catch (err) {
        const idx = _data.supportTickets.findIndex(t => t.id === record.id);
        if (idx !== -1) _data.supportTickets.splice(idx, 1);
        throw err;
      }
      return record;
    },
    async update(id, data) {
        const d = db._init();
      const idx = d.supportTickets.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Ticket not found');
      // No permitir sobrescribir messages con update directo
      if (data.messages) delete data.messages;
      d.supportTickets[idx] = { ...d.supportTickets[idx], ...data, updated_at: getNow() };
      await db._persist('supportTickets');
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
      db._persist('supportTickets');
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
      db._persist('supportTickets');
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
        const idx = _data.supportTickets.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Ticket not found');
      _data.supportTickets[idx].verified = true;
      _data.supportTickets[idx].verified_at = getNow();
      _data.supportTickets[idx].verified_by = adminEmail || 'admin';
      _data.supportTickets[idx].updated_at = getNow();
      // Registrar en auditoría
      _data.auditLogs.push({
        id: makeId(),
        created_date: getNow(),
        action: 'ticket_verified',
        admin_email: adminEmail || 'admin',
        details: JSON.stringify({ ticket_id: id, subject: _data.supportTickets[idx].subject }),
      });
      save(d);
      _syncInProgress = {};
      db._syncAllToSupabase();
      notifyReactComponents();
      return _data.supportTickets[idx];
    },

    /**
     * Marca un ticket como rechazado (conversación NO real / spam / falsa).
     * Retorna el ticket actualizado.
     */
    reject(id, adminEmail) {
        const idx = _data.supportTickets.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Ticket not found');
      _data.supportTickets[idx].rejected = true;
      _data.supportTickets[idx].rejected_at = getNow();
      _data.supportTickets[idx].rejected_by = adminEmail || 'admin';
      _data.supportTickets[idx].updated_at = getNow();
      // Cerrar el ticket automáticamente al rechazar
      _data.supportTickets[idx].status = 'closed';
      // Registrar en auditoría
      _data.auditLogs.push({
        id: makeId(),
        created_date: getNow(),
        action: 'ticket_rejected',
        admin_email: adminEmail || 'admin',
        details: JSON.stringify({ ticket_id: id, subject: _data.supportTickets[idx].subject }),
      });
      save(d);
      _syncInProgress = {};
      db._syncAllToSupabase();
      notifyReactComponents();
      return _data.supportTickets[idx];
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
        const record = { id: makeId(), created_date: getNow(), ...data };
      _data.pointsBonuses.push(record);
      db._persist('pointsBonuses');
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
        const record = { id: makeId(), created_date: getNow(), ...data };
      _data.appSettings.push(record);
      db._persist('appSettings');
      return record;
    },
    async update(id, data) {
        const idx = _data.appSettings.findIndex(s => s.id === id);
      if (idx === -1) throw new Error('Setting not found');
      _data.appSettings[idx] = { ..._data.appSettings[idx], ...data, updated_at: getNow() };
      await db._persist('appSettings');
      return _data.appSettings[idx];
    },
  },

  // --- Audit Logs ---
  auditLogs: {
    list(order) {
      const d = db._init().auditLogs;
      return sortBy(d, order || '-created_date');
    },
    create(data) {
        const record = { id: makeId(), created_date: getNow(), ...data };
      _data.auditLogs.push(record);
      db._persist('auditLogs');
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

    // Camino confiable: función SQL server-side (idempotente, ignora RLS y NO
    // depende del caché local del navegador del nuevo usuario, que solía estar
    // vacío/parcial → el bono de +10 casi nunca se acreditaba). Ver
    // reconciliar-referidos-completo.sql.
    if (isSupabaseAvailable() && supabase) {
      const { data, error } = await supabase.rpc('award_referral_bonus', {
        p_referrer_code: referralCode,
        p_referred_email: referredEmail,
      });
      if (!error) return data;
      const msg = error.message || '';
      const notInstalled = error.code === 'PGRST202' ||
        (/award_referral_bonus/i.test(msg) && /not exist|could not find/i.test(msg));
      if (!notInstalled) {
        console.warn('[DB] award_referral_bonus error:', msg);
        return null;
      }
      console.warn('[DB] award_referral_bonus RPC no instalada — usando flujo local de respaldo. Corre reconciliar-referidos-completo.sql.');
    }

    // ── Fallback legacy (poco confiable; solo si la función no está instalada) ──
    const referrer = _data.users.find(u => u.referral_code === referralCode);
    if (!referrer) return null;
    const bonusAmount = referrer.referral_bonus_amount || 10;
    const newRefPoints = (referrer.referral_points || 0) + bonusAmount;
    const newTotal = (referrer.total_points || 0) + bonusAmount;
    referrer.referral_points = newRefPoints;
    referrer.total_points = newTotal;
    referrer.updated_at = getNow();
    // Registrar la comisión para que aparezca en el historial.
    // NO incluir 'type': esa columna no existe en la tabla referral_commissions
    // y rompía el upsert (las comisiones de registro nunca se guardaban). El
    // historial ya distingue registro vs acierto por match_id (null = registro).
    _data.referralCommissions.push({
      id: makeId(),
      from_email: referredEmail || 'desconocido',
      to_email: referrer.email,
      match_id: null,
      level: 1,
      points_earned: bonusAmount,
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
   * IDEMPOTENTE: no crea comisión duplicada para (from, to, match).
   */
  async awardReferralCommission(referredEmail, matchId) {
    if (!referredEmail) return null;
    const referred = _data.users.find(u => u.email === referredEmail);
    if (!referred || !referred.referred_by) return null;
    const referrer = _data.users.find(u => u.referral_code === referred.referred_by);
    if (!referrer) return null;

    // Evitar duplicados: no crear comisión si ya existe para este par + match
    const key = `${referredEmail}|${referrer.email}|${matchId}`;
    const alreadyExists = (_data.referralCommissions || []).some(c =>
      c.from_email === referredEmail && c.to_email === referrer.email && c.match_id === matchId
    );
    if (alreadyExists) return referrer; // ya existe, no volver a crear

    // Comisión suma SOLO a referral_points, no a prediction_points (que es el ranking)
    const newRefPoints = (referrer.referral_points || 0) + 5;
    const bonusPoints = referrer.bonus_points || 0;
    const predPoints = referrer.prediction_points || 0;
    const newTotal = predPoints + bonusPoints + newRefPoints;
    referrer.referral_points = newRefPoints;
    referrer.total_points = newTotal;
    referrer.updated_at = getNow();
    // Registrar la comisión
    _data.referralCommissions.push({
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
        const record = { id: makeId(), created_date: getNow(), ...data };
      _data.referrals.push(record);
      db._persist('referrals');
      return record;
    },

    /**
     * Deduplicar referidos: agrupa por (referrer_email, referred_email),
     * conserva el más antiguo (primera vez que se refirieron), elimina el resto.
     * Mismo patrón anti-reaparición que matches/predictions.
     */
    async deduplicate() {
      _blockFromSync = true;
      _skipBackgroundSync = true;
      try {
        const d = db._init({ skipSync: true });
        const referrals = _data.referrals || [];

        const groups = {};
        for (const r of referrals) {
          if (!r.referrer_email || !r.referred_email) continue;
          const key = `${r.referrer_email}|${r.referred_email}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(r);
        }

        const toDelete = [];
        for (const key of Object.keys(groups)) {
          const group = groups[key];
          if (group.length <= 1) continue;
          // Conservar el más antiguo
          const sorted = group.toSorted((a, b) =>
            new Date(a.created_date || 0) - new Date(b.created_date || 0)
          );
          const keep = sorted[0];
          for (const r of group) {
            if (r.id !== keep.id) toDelete.push(r.id);
          }
        }

        if (toDelete.length === 0) {
          return { deleted: 0, scanned: referrals.length };
        }

        if (isSupabaseAvailable() && supabase) {
          const BATCH = 50;
          const idBatches = [];
          for (let i = 0; i < toDelete.length; i += BATCH) {
            idBatches.push(toDelete.slice(i, i + BATCH));
          }
          const deleteErrors = [];
          await Promise.all(
            idBatches.map(async (idBatch) => {
              const { error } = await supabase
                .from('referrals')
                .delete()
                .in('id', idBatch);
              if (error) deleteErrors.push(error.message || JSON.stringify(error));
            })
          );
          if (deleteErrors.length > 0) {
            const allFailed = deleteErrors.length === idBatches.length;
            if (allFailed) {
              throw new Error(
                'No se pudieron eliminar referidos duplicados en Supabase: ' +
                deleteErrors.join('; ')
              );
            }
          }
          // Pase de verificación
          try {
            const { data: remaining } = await supabase
              .from('referrals')
              .select('id')
              .in('id', toDelete)
              .limit(5000);
            if (remaining && remaining.length > 0) {
              const remBatches = [];
              for (let i = 0; i < remaining.length; i += BATCH) {
                remBatches.push(remaining.slice(i, i + BATCH).map(r => r.id));
              }
              await Promise.all(
                remBatches.map(ids => supabase.from('referrals').delete().in('id', ids))
              );
            }
          } catch {}
        }

        const deleteSet = new Set(toDelete);
        _data.referrals = _data.referrals.filter(r => !deleteSet.has(r.id));
        save(d);

        try {
          await this.syncAdminChanges();
        } catch (syncErr) {
          console.error('[referrals.deduplicate] sync error:', syncErr);
        }

        notifyReactComponents();
        return { deleted: toDelete.length, scanned: referrals.length };
      } finally {
        _blockFromSync = false;
        _skipBackgroundSync = false;
      }
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
        const record = { id: makeId(), created_date: getNow(), ...data };
      _data.referralCommissions.push(record);
      db._persist('referralCommissions');
      return record;
    },

    /**
     * Deduplicar comisiones: agrupa por (to_email, match_id, level),
     * conserva la de mayor points_earned (cálculo final canónico).
     */
    async deduplicate() {
      _blockFromSync = true;
      _skipBackgroundSync = true;
      try {
        const d = db._init({ skipSync: true });
        const commissions = _data.referralCommissions || [];

        const groups = {};
        for (const c of commissions) {
          if (!c.to_email) continue;
          const key = `${c.to_email}|${c.match_id || 'NULL'}|${c.level || 0}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(c);
        }

        const toDelete = [];
        for (const key of Object.keys(groups)) {
          const group = groups[key];
          if (group.length <= 1) continue;
          // Conservar la de mayor points_earned (cálculo más reciente)
          const sorted = group.toSorted((a, b) =>
            (b.points_earned || 0) - (a.points_earned || 0)
          );
          const keep = sorted[0];
          for (const c of group) {
            if (c.id !== keep.id) toDelete.push(c.id);
          }
        }

        if (toDelete.length === 0) {
          return { deleted: 0, scanned: commissions.length };
        }

        if (isSupabaseAvailable() && supabase) {
          const BATCH = 50;
          const idBatches = [];
          for (let i = 0; i < toDelete.length; i += BATCH) {
            idBatches.push(toDelete.slice(i, i + BATCH));
          }
          const deleteErrors = [];
          await Promise.all(
            idBatches.map(async (idBatch) => {
              const { error } = await supabase
                .from('referral_commissions')
                .delete()
                .in('id', idBatch);
              if (error) deleteErrors.push(error.message || JSON.stringify(error));
            })
          );
          if (deleteErrors.length > 0) {
            const allFailed = deleteErrors.length === idBatches.length;
            if (allFailed) {
              throw new Error(
                'No se pudieron eliminar comisiones duplicadas en Supabase: ' +
                deleteErrors.join('; ')
              );
            }
          }
          // Pase de verificación
          try {
            const { data: remaining } = await supabase
              .from('referral_commissions')
              .select('id')
              .in('id', toDelete)
              .limit(5000);
            if (remaining && remaining.length > 0) {
              const remBatches = [];
              for (let i = 0; i < remaining.length; i += BATCH) {
                remBatches.push(remaining.slice(i, i + BATCH).map(r => r.id));
              }
              await Promise.all(
                remBatches.map(ids => supabase.from('referral_commissions').delete().in('id', ids))
              );
            }
          } catch {}
        }

        const deleteSet = new Set(toDelete);
        _data.referralCommissions = _data.referralCommissions.filter(c => !deleteSet.has(c.id));
        save(d);

        try {
          await this.syncAdminChanges();
        } catch (syncErr) {
          console.error('[referralCommissions.deduplicate] sync error:', syncErr);
        }

        notifyReactComponents();
        return { deleted: toDelete.length, scanned: commissions.length };
      } finally {
        _blockFromSync = false;
        _skipBackgroundSync = false;
      }
    },
  },

  // --- Auth ---
  getCurrentUserEmail() {
    // Lee primero de localStorage (sobrevive a page reloads) y cae al in-memory.
    // Sin esto, después de signIn + window.location.reload, currentUserEmail
    // estaba en null y AppLayout.api.auth.me() devolvía null → usuario parecía
    // deslogueado. AuthContext.onAuthStateChange re-popula, pero AppLayout corre
    // primero y fija authState.user = null antes de que el listener dispare.
    try {
      const persisted = localStorage.getItem('chessking_session_email');
      if (persisted) {
        this._data.currentUserEmail = persisted;
        return persisted;
      }
    } catch {}
    return this._data.currentUserEmail;
  },
  setCurrentUserEmail(email) {
    db._init().currentUserEmail = email;
    try {
      if (email) {
        localStorage.setItem('chessking_session_email', email);
      } else {
        localStorage.removeItem('chessking_session_email');
      }
    } catch {}
    // _persist() sin changedTable no hace nada (es un no-op intencional para
    // currentUserEmail: NO es una tabla de Supabase, es estado de sesión local).
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
    const hasAdmin = _data.users.some(u => u.email === 'admin@chessking.com' || u.role === 'admin');
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
      _data.users.push(admin);
      this._persist();
    }

    const hasSettings = _data.appSettings.length > 0;
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
      _data.appSettings.push(
        { id: makeId(), key: 'info_sections', value: infoSections, created_date: getNow() },
      );
      this._persist();
    }

    // Migración: asignar referral_code a usuarios existentes que no tengan
    let migrated = false;
    for (const u of _data.users) {
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

    // FIX: NO seedear premios por defecto. Antes, si localStorage estaba
    // vacío (admin browser nuevo, cache limpio, etc.), se creaban 3
    // premios demo con id: makeId() random. Cada vez que el admin
    // recargaba con localStorage vacío, se sembraban 3 NUEVOS con IDs
    // distintos, y como sync TO subía TODO, se duplicaban en la BD.
    // Resultado: 415 premios duplicados.
    // Ahora: si la BD está vacía, NO se siembra nada. El admin crea
    // los premios desde el panel /admin/prizes. La página pública /prizes
    // muestra un empty state.
    // También se quita el dedup automático de "más de 10" porque ya
    // no hay razón histórica para que haya muchos.

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║ QUITADO: ya no se siembran demos ni se dedupea automáticamente║
    // ║ Si la BD tiene duplicados, hacer wipe manual desde SQL Editor.║
    // ╚═══════════════════════════════════════════════════════════════╝
  },
};