#!/usr/bin/env python3
"""Apply changes 3-16 to db.js after CHANGE 1 (imports) and CHANGE 2 (storage layer) were applied."""
import sys

path = 'src/lib/db.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

print(f'Start: {len(c)} chars')

def rep(text, old, new, label):
    if old in text:
        return text.replace(old, new, 1), True, f'  {label}: replaced'
    return text, False, f'  {label}: NOT FOUND'

# CHANGE 3: Replace _init
c, ok, msg = rep(c,
    """  _init(opts) {
    if (!this._data) {
      const loaded = load();
      // Migraci\u00f3n: garantizar que todas las keys nuevas existan (ej. referrals,
      // referralCommissions se agregaron despu\u00e9s \u2014 usuarios con localStorage viejo
      // no las tienen, y d.referrals.push() tira TypeError).
      this._data = { ...getDefaults(), ...loaded };
      // Limpiar live_started_at para partidos que NO est\u00e1n en vivo (evita timers stale)
      this._cleanStaleLiveTimers();
      this.seedIfEmpty();
      // Cargar datos desde Supabase en segundo plano.
      // IMPORTANTE: NO subimos datos locales de vuelta a Supabase aqu\u00ed.
      // El bug hist\u00f3rico era que al hacer `syncFrom` se hac\u00eda `syncTo`
      // inmediatamente, lo cual re-sub\u00eda filas borradas en el server.
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
          // (ej: el scoring dispara predictions y users seguidos \u2014 el refresh
          // de predictions se perd\u00eda siempre).
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
  },""",
    """  _init(opts) {
    if (!this._data) {
      this._data = _data;
      if (!opts?.skipSync) {
        _loadAllFromCloud();
      }
      setupRealtimeSubscriptions();
    }
    return this._data;
  },""",
    'CHANGE 3: _init')
print(msg)

# CHANGE 4: Replace _persist
c, ok, msg = rep(c,
    """  _persist(changedTable) {
    save(this._data);
    // Limpiar locks para que los cambios se suban a Supabase
    _syncInProgress = {};
    // Durante operaciones admin (dedup, clean), el sync expl\u00edcito se encarga.
    // Evita race condition donde _persist() lanza un sync que choca con el admin sync.
    if (_skipBackgroundSync) return Promise.resolve();
    if (!isSupabaseAvailable()) return Promise.resolve();

    // Debounce de subida: si llegan m\u00faltiples _persist() en r\u00e1pida sucesi\u00f3n
    // (t\u00edpico cuando un flujo toca varias tablas), solo subimos una vez al final.
    // Esto evita el problema cl\u00e1sico: el cliente sube 1 fila, recibe el eco via
    // Realtime, hace syncFrom, y luego sube de nuevo \u2014 duplicando el trabajo.
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
  },""",
    """  _persist(changedTable) {
    // Cloud-only: write directly to Supabase
    if (!isSupabaseAvailable() || !supabase) return Promise.resolve();
    if (changedTable) {
      const tableName = tableNameToSupabase(changedTable);
      const records = this._data[changedTable] || [];
      if (records.length > 0) {
        _upsertToCloud(tableName, records);
      }
    }
    return Promise.resolve();
  },""",
    'CHANGE 4: _persist')
print(msg)

# CHANGE 5: Simplify syncAdminChanges
c, ok, msg = rep(c,
    """  async syncAdminChanges() {
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
  },""",
    """  async syncAdminChanges() {
    if (!isSupabaseAvailable()) return { success: true };
    await _loadAllFromCloud();
    return { success: true };
  },""",
    'CHANGE 5: syncAdminChanges')
print(msg)

# CHANGE 6: Simplify _syncAllFromSupabase
c, ok, msg = rep(c,
    """  async _syncAllFromSupabase() {
    if (!isSupabaseAvailable()) return;
    // Si estamos subiendo datos, encolar un sync FROM diferido para cuando termine
    if (_syncToSupabaseInProgress) {
      _resyncFromQueued = true;
      return;
    }
    // Bloqueado durante operaciones destructivas (cleanUserData)
    if (_blockFromSync) return;
    return this._syncAllFromSupabaseInternal();
  },""",
    """  async _syncAllFromSupabase() {
    if (!isSupabaseAvailable()) return;
    await _loadAllFromCloud();
  },""",
    'CHANGE 6: _syncAllFromSupabase')
print(msg)

# CHANGE 7: Simplify _syncAllFromSupabaseForce
c, ok, msg = rep(c,
    """  // Forzar sincronizaci\u00f3n desde Supabase (ignora el lock de subida)
  async _syncAllFromSupabaseForce() {
    if (!isSupabaseAvailable()) return;
    return this._syncAllFromSupabaseInternal();
  },""",
    """  async _syncAllFromSupabaseForce() {
    if (!isSupabaseAvailable()) return;
    await _loadAllFromCloud();
  },""",
    'CHANGE 7: _syncAllFromSupabaseForce')
print(msg)

# CHANGE 8: Simplify forceSyncFromCloud
c, ok, msg = rep(c,
    """  async forceSyncFromCloud() {
    if (!isSupabaseAvailable()) {
      return { success: false, error: 'Supabase no est\u00e1 configurado' };
    }
    this._init();
    // Si ya hay una sync en progreso (de _init()), esperarla
    if (_syncFromPromise) {
      await _syncFromPromise;
    } else {
      await this._syncAllFromSupabaseForce();
    }
    return { success: true };
  },""",
    """  async forceSyncFromCloud() {
    if (!isSupabaseAvailable()) return { success: false, error: 'Supabase not configured' };
    await _loadAllFromCloud();
    return { success: true };
  },""",
    'CHANGE 8: forceSyncFromCloud')
print(msg)

# CHANGE 9: Simplify syncToCloud
c, ok, msg = rep(c,
    """  async syncToCloud() {
    if (!isSupabaseAvailable()) {
      return { success: false, error: 'Supabase no est\u00e1 configurado. Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env' };
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
  },""",
    """  async syncToCloud() {
    if (!isSupabaseAvailable()) return { success: false, error: 'Supabase not configured' };
    this._init();
    return { success: true };
  },""",
    'CHANGE 9: syncToCloud')
print(msg)

# CHANGE 10: Simplify _syncSingleTableFromSupabase
c, ok, msg = rep(c,
    """  // Sincronizar UNA SOLA tabla desde Supabase (para Realtime / cambios puntuales)
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
  },""",
    """  async _syncSingleTableFromSupabase(jsKey) {
    if (!isSupabaseAvailable()) return false;
    await _refreshTableFromCloud(jsKey);
    return true;
  },""",
    'CHANGE 10: _syncSingleTableFromSupabase')
print(msg)

# CHANGE 11: Simplify _syncSingleTable
c, ok, msg = rep(c,
    """  // Sincronizar UNA SOLA tabla a Supabase (para escrituras individuales)
  async _syncSingleTable(jsKey) {
    if (!isSupabaseAvailable()) return;
    await this._processPendingDeletes();
    const records = this._data[jsKey] || [];
    let filtered = records.filter(r => !this._isDeletedId(jsKey, r.id));""",
    """  async _syncSingleTable(jsKey) {
    if (!isSupabaseAvailable()) return;
    const tableName = tableNameToSupabase(jsKey);
    const records = this._data[jsKey] || [];
    if (records.length > 0) {
      const naturalKey = NATURAL_KEYS[jsKey] || 'id';
      await syncTableToSupabaseFn(jsKey, records);
    }
  },
  // _syncSingleTable_OLD: """,
    'CHANGE 11: _syncSingleTable')
print(msg)

# CHANGE 12: Simplify forceSync
c, ok, msg = rep(c,
    """  async forceSync() {
    await this._syncAllFromSupabaseForce();
  },""",
    """  async forceSync() {
    await _loadAllFromCloud();
  },""",
    'CHANGE 12: forceSync')
print(msg)

# CHANGE 13: Replace reset
c, ok, msg = rep(c,
    """  reset() {
    this._data = getDefaults();
    this._persist();
  },""",
    """  reset() {
    for (const key of Object.keys(this._data || {})) {
      if (Array.isArray(this._data[key])) this._data[key].length = 0;
      else this._data[key] = null;
    }
  },""",
    'CHANGE 13: reset')
print(msg)

# CHANGE 14: Replace getCurrentUserEmail
c, ok, msg = rep(c,
    """  getCurrentUserEmail() {
    return db._init().currentUserEmail;
  },""",
    """  getCurrentUserEmail() {
    return this._data.currentUserEmail;
  },""",
    'CHANGE 14: getCurrentUserEmail')
print(msg)

# CHANGE 15: Replace getCurrentUser
c, ok, msg = rep(c,
    """  getCurrentUser() {
    const email = db.getCurrentUserEmail();
    if (!email) return null;
    return db._init().users.find(u => u.email === email) || null;
  },""",
    """  getCurrentUser() {
    const email = db.getCurrentUserEmail();
    if (!email) return null;
    return (this._data?.users || []).find(u => u.email === email) || null;
  },""",
    'CHANGE 15: getCurrentUser')
print(msg)

# CHANGE 16: Remove save() calls
before = len(c)
c = c.replace('      save(this._data);\n', '')
c = c.replace('    save(this._data);\n', '')
after = len(c)
print(f'  CHANGE 16: removed {before - after} chars of save() calls')

# CHANGE 17: Replace syncToCloud result format
c, ok, msg = rep(c,
    """    return { success: true, results };
  },""",
    """    return { success: true };
  },""",
    'CHANGE 17: syncToCloud result format')
print(msg)

# CHANGE 18: Replace getCurrentUserEmail usage in awardReferralBonus
c = c.replace(
    "    const email = db.getCurrentUserEmail();\n    if (!email) return null;\n    const referrer = db._init().users.find",
    "    const email = db.getCurrentUserEmail();\n    if (!email) return null;\n    const referrer = this._data.users.find"
)

# CHANGE 19: Replace db._init() references in CRUD methods
c = c.replace("    const d = db._init();\n", "")

# Remove "const d = this._data" if present
c = c.replace("    const d = this._data;\n", "")

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print(f'\nFinal: {len(c)} chars, {c.count(chr(10))+1} lines')
print(f'Reduction: {100 - len(c)*100//103526}%')
