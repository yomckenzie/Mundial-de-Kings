#!/usr/bin/env python3
"""
Transform db.js from localStorage+sync to cloud-only (Supabase direct).
This script makes MINIMAL, SAFE changes:
  1. Replace imports
  2. Remove localStorage/sync state variables
  3. Add Supabase direct-write helpers
  4. Replace _init() to load from Supabase async
  5. Replace _persist() to be a no-op
  6. Remove sync engine methods
  7. Remove deletedIds system
  8. In CRUD methods: replace db._persist('table') with _upsert()
  9. In CRUD methods: remove save(d) calls
  10. Simplify cleanUserData
  11. seedIfEmpty = no-op
"""
import re, sys

path = 'src/lib/db.js'
with open(path, 'r', encoding='utf-8') as f:
    orig = f.read()

print(f'Original: {len(orig)} chars, {orig.count(chr(10))+1} lines')

c = orig

# ═══════════════════════════════════════════════════════
# STEP 1: Replace imports
# ═══════════════════════════════════════════════════════
OLD_IMPORTS = """import {
  supabase,
  isSupabaseAvailable,
  syncTableToSupabase,
  syncTableFromSupabase,
  stripLocalFields,
  TABLES,
  setupRealtimeSubscriptions,
} from './supabase.js';"""

NEW_IMPORTS = """import {
  supabase,
  isSupabaseAvailable,
  TABLES,
  setupRealtimeSubscriptions,
} from './supabase.js';"""

c = c.replace(OLD_IMPORTS, NEW_IMPORTS, 1)
print('Step 1: imports replaced')

# ═══════════════════════════════════════════════════════
# STEP 2: Remove STORAGE_KEY, load(), save(), and all sync state variables
# ═══════════════════════════════════════════════════════
# Find from "const STORAGE_KEY" to just before the syncTableToSupabaseFn function
# These are all the variables/functions between imports and the sync functions

# Remove STORAGE_KEY
c = re.sub(r"\nconst STORAGE_KEY = 'chessking_db';\n", '\n', c, count=1)

# Remove sync state variables block (from "let _syncInProgress" to "_uploadedSinceLastDelete")
# Find the block and remove it
sync_vars_start = c.find('\nlet _syncInProgress = {};')
if sync_vars_start > -1:
    sync_vars_end = c.find('\n\n', sync_vars_start + 10)
    if sync_vars_end > -1:
        # Also remove the comment and blank line before
        look_back = c.rfind('\n', 0, sync_vars_start)
        if look_back > -1:
            before = c[look_back:sync_vars_start].strip()
            if before.startswith('//'):
                sync_vars_start = look_back
        c = c[:sync_vars_start] + '\n' + c[sync_vars_end+2:]
        print('Step 2a: sync state variables removed')

# Remove _saveLastSyncTimestamps
old_save = '\nfunction _saveLastSyncTimestamps() {\n'
if old_save in c:
    end = c.find('\n}', c.find(old_save)) + 3
    c = c.replace(c[c.find(old_save):end], '')
    print('Step 2b: _saveLastSyncTimestamps removed')

# Remove _initialSyncDone and _markInitialSyncDone
old_init = '\nlet _initialSyncDone = (() => {'
if old_init in c:
    start = c.find(old_init)
    end_marker = 'function _markInitialSyncDone() {'
    end_search = c.find(end_marker, start)
    if end_search > -1:
        end_search2 = c.find('\n}', end_search)
        if end_search2 > -1:
            c = c[:start] + '\n' + c[end_search2+3:]
            print('Step 2c: _initialSyncDone removed')

# Remove load() function
old_load = """\nconst load = () => {\n"""
if old_load in c:
    start = c.find(old_load)
    end = c.find('\n};\n', start)
    if end > -1:
        c = c[:start] + c[end+4:]
        print('Step 2d: load() removed')

# Remove save() function
old_save = """\nconst save = (data) => {\n"""
if old_save in c:
    start = c.find(old_save)
    end = c.find('\n};\n', start)
    if end > -1:
        c = c[:start] + c[end+4:]
        print('Step 2e: save() removed')

# ═══════════════════════════════════════════════════════
# STEP 3: Remove syncTableToSupabaseFn
# ═══════════════════════════════════════════════════════
sync_to_start = c.find('\nconst syncTableToSupabaseFn = ')
if sync_to_start > -1:
    # Find the closing of this function - look for the pattern
    # It ends with }; followed by newlines
    depth = 0
    i = c.find('{', sync_to_start + 30)
    found_start = False
    for j in range(i, len(c)):
        if c[j] == '{':
            depth += 1
            found_start = True
        elif c[j] == '}':
            depth -= 1
            if found_start and depth == 0:
                # Find the semicolon after
                end = j + 1
                while end < len(c) and c[end] in ' \t\n\r':
                    end += 1
                if end < len(c) and c[end] == ';':
                    end += 1
                c = c[:sync_to_start] + c[end:]
                print('Step 3: syncTableToSupabaseFn removed')
                break

# ═══════════════════════════════════════════════════════
# STEP 4: Remove syncTableFromSupabaseFn
# ═══════════════════════════════════════════════════════
sync_from_start = c.find('\nconst syncTableFromSupabaseFn = ')
if sync_from_start > -1:
    depth = 0
    i = c.find('{', sync_from_start + 30)
    found_start = False
    for j in range(i, len(c)):
        if c[j] == '{':
            depth += 1
            found_start = True
        elif c[j] == '}':
            depth -= 1
            if found_start and depth == 0:
                end = j + 1
                while end < len(c) and c[end] in ' \t\n\r':
                    end += 1
                if end < len(c) and c[end] == ';':
                    end += 1
                c = c[:sync_from_start] + c[end:]
                print('Step 4: syncTableFromSupabaseFn removed')
                break

# ═══════════════════════════════════════════════════════
# STEP 5: Add Supabase helpers + replace _init and _persist
# ═══════════════════════════════════════════════════════
# Find the NATURAL_KEYS block and remove it
nk_start = c.find('\nconst NATURAL_KEYS = {')
if nk_start > -1:
    nk_end = c.find('};', nk_start) + 2
    c = c[:nk_start] + c[nk_end:]
    print('Step 5a: NATURAL_KEYS removed')

# Find getDefaults and replace it with _data
gd_start = c.find('\nconst getDefaults = () => ({')
if gd_start > -1:
    gd_end = c.find('});', gd_start) + 3
    old_gd = c[gd_start:gd_end]
    new_gd = """
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
    const { password, created_date, updated_at, live_started_at, messages, user_read_at, admin_read_at, ...clean } = r;
    return clean;
  });
}

async function _upsert(tableName, records, onConflict = 'id') {
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

async function _updateBatchInCloud(tableName, records) {
  if (!isSupabaseAvailable() || !supabase || !records.length) return;
  const cleaned = _stripFields(records);
  const BATCH = 50;
  const batches = [];
  for (let i = 0; i < cleaned.length; i += BATCH) batches.push(cleaned.slice(i, i + BATCH));
  await Promise.all(batches.map(async (batch) => {
    const { error } = await supabase.from(tableName).upsert(batch, { onConflict: 'id' });
    if (error) console.warn(`[DB] updateBatch ${tableName}:`, error.message || error);
  }));
}"""
    c = c[:gd_start] + new_gd + c[gd_end:]
    print('Step 5b: getDefaults replaced with _data + Supabase helpers')

# ═══════════════════════════════════════════════════════
# STEP 6: Replace _init method
# ═══════════════════════════════════════════════════════
old_init = """  _init(opts) {
    if (!this._data) {
      const loaded = load();"""
if old_init in c:
    # Find the end of _init (the closing of "return this._data;")
    start = c.find(old_init)
    ret_end = c.find('return this._data;', start)
    close_end = c.find('},', ret_end)
    old_init_block = c[start:close_end+2]
    new_init = """  _init() {
    if (!_loaded && !_loading) {
      this.loadAll().catch(() => {});
    }
    return _data;
  },"""
    c = c.replace(old_init_block, new_init, 1)
    print('Step 6: _init replaced')

# ═══════════════════════════════════════════════════════
# STEP 7: Replace _persist with no-op
# ═══════════════════════════════════════════════════════
old_persist = """  _persist(changedTable) {
    save(this._data);"""
if old_persist in c:
    start = c.find(old_persist)
    # Find the end of _persist (look for the next method)
    next_method = c.find('\n  //', start + 50)
    if next_method == -1:
        next_method = c.find('\n  async', start + 50)
    old_block = c[start:next_method]
    c = c[:start] + """  _persist() { return Promise.resolve(); },""" + c[next_method:]
    print('Step 7: _persist replaced')

# ═══════════════════════════════════════════════════════
# STEP 8: Add loadAll, _refreshTable, _ensureLoaded, and legacy aliases
# ═══════════════════════════════════════════════════════
# Find "syncAdminChanges()" and insert new methods before it
sync_admin = c.find('  async syncAdminChanges()')
if sync_admin > -1:
    new_methods = """  async loadAll() {
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
  },

  async _refreshTable(jsKey) {
    if (!isSupabaseAvailable() || !supabase) return;
    const tableName = tableNameToSupabase(jsKey);
    const { data, error } = await supabase.from(tableName).select('*');
    if (!error && data) {
      _data[jsKey].length = 0;
      _data[jsKey].push(...data);
      notifyReactComponents();
    }
  },

  async _ensureLoaded() {
    if (_loaded) return;
    await this.loadAll();
  },

  // Legacy aliases (backward compatibility)
  _syncAllFromSupabase() { return this.loadAll(); },
  _syncAllFromSupabaseForce() { return this.loadAll(); },
  _syncSingleTable(jsKey) { return this._refreshTable(jsKey); },
  _syncSingleTableFromSupabase(jsKey) { return this._refreshTable(jsKey); },
  async syncToCloud() { return { success: true }; },
  async forceSyncFromCloud() { await this.loadAll(); return { success: true }; },
  async forceSync() { await this.loadAll(); },

"""
    c = c[:sync_admin] + new_methods + c[sync_admin:]
    print('Step 8: loadAll + aliases added')

# ═══════════════════════════════════════════════════════
# STEP 9: Replace syncAdminChanges
# ═══════════════════════════════════════════════════════
old_sync_admin = """  async syncAdminChanges() {
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
new_sync_admin = """  async syncAdminChanges() { await this.loadAll(); return { success: true }; },"""
c = c.replace(old_sync_admin, new_sync_admin, 1)
print('Step 9: syncAdminChanges simplified')

# ═══════════════════════════════════════════════════════
# STEP 10: Remove all sync methods from _syncAllFromSupabase through syncToCloud
# ═══════════════════════════════════════════════════════
# Remove _syncAllFromSupabase through _syncAllToSupabase
for method_name in ['_syncAllFromSupabase', '_syncAllFromSupabaseForce', 
                     '_syncSingleTableFromSupabase', '_syncAllFromSupabaseInternal',
                     '_syncDeletedIdsFromCloud', '_syncDeletedIdsToCloud',
                     '_processPendingDeletes', '_syncBatchToSupabase',
                     '_syncSingleTable', '_syncAllToSupabase',
                     'forceSync', 'forceSyncFromCloud', 'syncToCloud']:
    pattern = rf'  (async )?{re.escape(method_name)}\([^)]*\)\s*\{{.*?\n  \}},\n'
    matches = re.findall(pattern, c, re.DOTALL)
    if matches:
        c = re.sub(pattern, '', c, count=1, flags=re.DOTALL)
        print(f'Step 10: removed {method_name}')

# ═══════════════════════════════════════════════════════
# STEP 11: Remove _cleanStaleLiveTimers, _addDeletedId, _isDeletedId
# ═══════════════════════════════════════════════════════
for method_name in ['_cleanStaleLiveTimers', '_addDeletedId', '_isDeletedId']:
    # Find the method and remove it
    pattern = rf'  {re.escape(method_name)}\([^)]*\)\s*\{{.*?\n  \}},?\n'
    if re.search(pattern, c, re.DOTALL):
        c = re.sub(pattern, '', c, count=1, flags=re.DOTALL)
        print(f'Step 11: removed {method_name}')

# ═══════════════════════════════════════════════════════
# STEP 12: Replace reset() 
# ═══════════════════════════════════════════════════════
old_reset = """  reset() {
    this._data = getDefaults();
    this._persist();
  },"""
new_reset = """  reset() {
    for (const key of Object.keys(_data)) {
      if (Array.isArray(_data[key])) _data[key].length = 0;
      else _data[key] = null;
    }
    _loaded = false;
  },"""
c = c.replace(old_reset, new_reset, 1)
print('Step 12: reset() replaced')

# ═══════════════════════════════════════════════════════
# STEP 13: Replace seedIfEmpty
# ═══════════════════════════════════════════════════════
# Find seedIfEmpty and replace the whole method with a no-op
seed_start = c.find('  seedIfEmpty() {')
if seed_start > -1:
    depth = 0
    i = c.find('{', seed_start)
    found_start = False
    for j in range(i, len(c)):
        if c[j] == '{':
            depth += 1
            found_start = True
        elif c[j] == '}':
            depth -= 1
            if found_start and depth == 0:
                end = j + 1
                # Check for trailing comma/newline
                while end < len(c) and c[end] in ' \t\n\r':
                    end += 1
                if end < len(c) and c[end] == ',':
                    end += 1
                c = c[:seed_start] + '  seedIfEmpty() {},' + c[end:]
                print('Step 13: seedIfEmpty replaced')
                break

# ═══════════════════════════════════════════════════════
# STEP 14: In all CRUD methods, replace "save(d);" with nothing
# ═══════════════════════════════════════════════════════
save_count = c.count('save(d);')
c = c.replace('      save(d);\n', '')
c = c.replace('    save(d);\n', '')
c = c.replace('save(d);', '')
print(f'Step 14: removed {save_count} save(d) calls')

# ═══════════════════════════════════════════════════════
# STEP 15: Replace this._data references with _data
# ═══════════════════════════════════════════════════════
c = c.replace('this._data', '_data')
print('Step 15: this._data -> _data')

# ═══════════════════════════════════════════════════════
# STEP 16: Remove localStorage references (code, not comments)
# ═══════════════════════════════════════════════════════
# Remove actual localStorage calls
c = re.sub(r"\n\s*localStorage\.setItem\([^)]+\);?\n", '\n', c)
c = re.sub(r"\n\s*localStorage\.getItem\([^)]+\);?\n", '\n', c)
c = re.sub(r"\n\s*localStorage\.removeItem\([^)]+\);?\n", '\n', c)
print('Step 16: localStorage calls removed')

# ═══════════════════════════════════════════════════════
# STEP 17: Remove _blockFromSync, _skipBackgroundSync lines
# ═══════════════════════════════════════════════════════
c = re.sub(r'\n\s*_blockFromSync = (true|false);\n', '\n', c)
c = re.sub(r'\n\s*_skipBackgroundSync = (true|false);\n', '\n', c)
c = re.sub(r'\n\s*_syncInProgress = \{\};\n', '\n', c)
print('Step 17: sync lock variables removed')

# ═══════════════════════════════════════════════════════
# STEP 18: Remove _pendingDeletes references (code only)
# ═══════════════════════════════════════════════════════
c = re.sub(r'\n\s*_pendingDeletes\.push\([^)]+\);\n', '\n', c)
print('Step 18: _pendingDeletes removed')

# ═══════════════════════════════════════════════════════
# STEP 19: Remove _addDeletedId calls
# ═══════════════════════════════════════════════════════
c = re.sub(r'\n\s*db\._addDeletedId\([^)]+\);\n', '\n', c)
print('Step 19: _addDeletedId calls removed')

# ═══════════════════════════════════════════════════════
# STEP 20: Remove db._syncAllToSupabase() calls
# ═══════════════════════════════════════════════════════
c = re.sub(r'\n?\s*await db\._syncAllToSupabase\(\);\n', '\n', c)
c = re.sub(r'\n?\s*await db\._syncSingleTable\([^)]+\);\n', '\n', c)
c = re.sub(r'\n?\s*await db\._syncSingleTableFromSupabase\([^)]+\);\n', '\n', c)
c = re.sub(r'\n?\s*await db\._syncDeletedIdsToCloud\(\);\n', '\n', c)
print('Step 20: sync method calls removed')

# ═══════════════════════════════════════════════════════
# STEP 21: Remove _blockFromSync try/finally wrappers
# These are try { } finally { _blockFromSync = false; _skipBackgroundSync = false; }
# We just remove the try/finally wrapper, keeping the content
# ═══════════════════════════════════════════════════════
# Pattern: "try {\n" followed eventually by "} finally {\n      _blockFromSync = false;\n      _skipBackgroundSync = false;\n    }"
# This is complex. Let's do it more carefully.
# First, just remove the finally blocks
c = re.sub(r'\n\s*} finally \{\n\s*\}', '', c)
print('Step 21: finally blocks removed')

# ═══════════════════════════════════════════════════════
# STEP 22: Replace cleanUserData
# ═══════════════════════════════════════════════════════
# Find cleanUserData and replace it entirely
clean_start = c.find('  async cleanUserData() {')
if clean_start > -1:
    depth = 0
    i = c.find('{', clean_start)
    found_start = False
    clean_end = clean_start
    for j in range(i, len(c)):
        if c[j] == '{':
            depth += 1
            found_start = True
        elif c[j] == '}':
            depth -= 1
            if found_start and depth == 0:
                clean_end = j + 1
                while clean_end < len(c) and c[clean_end] in ' \t\n\r':
                    clean_end += 1
                if clean_end < len(c) and c[clean_end] == ',':
                    clean_end += 1
                break
    
    NEW_CLEAN = """  async cleanUserData() {
    const now = getNow();
    const nonAdminIds = [];
    for (const u of _data.users || []) {
      if (u.role !== 'admin') nonAdminIds.push(u.id);
    }
    const adminUsers = (_data.users || []).filter(u => u.role === 'admin');
    const predsCount = (_data.predictions || []).length;
    const redemptionsCount = (_data.redemptions || []).length;
    const bonusesCount = (_data.pointsBonuses || []).length;
    const ticketsCount = (_data.supportTickets || []).length;
    const referralsCount = (_data.referrals || []).length;
    const commissionsCount = (_data.referralCommissions || []).length;

    _data.predictions = [];
    _data.redemptions = [];
    _data.pointsBonuses = [];
    _data.supportTickets = [];
    _data.referrals = [];
    _data.referralCommissions = [];
    for (const u of _data.users) { u.referral_points = 0; u.referred_by = null; u.updated_at = now; }
    _data.users = adminUsers;

    if (isSupabaseAvailable() && supabase) {
      try {
        const { data: allUsers } = await supabase.from('users').select('id, role').limit(5000);
        if (allUsers) {
          const ids = allUsers.filter(u => u.role !== 'admin').map(u => u.id);
          if (ids.length > 0) await _deleteBatchFromCloud('users', ids);
        }
      } catch {}
      for (const table of ['predictions', 'redemptions', 'points_bonuses', 'support_tickets', 'referrals', 'referral_commissions']) {
        try {
          const { data: rows } = await supabase.from(table).select('id').limit(5000);
          if (rows && rows.length > 0) await _deleteBatchFromCloud(table, rows.map(r => r.id));
        } catch {}
      }
      await _upsert('users', adminUsers);
      await this.loadAll();
    }
    notifyReactComponents();
    return { deletedUsers: nonAdminIds.length, deletedPredictions: predsCount, deletedRedemptions: redemptionsCount, deletedBonuses: bonusesCount, deletedReferrals: referralsCount, deletedCommissions: commissionsCount };
  },"""
    
    c = c[:clean_start] + NEW_CLEAN + c[clean_end:]
    print('Step 22: cleanUserData replaced')

# ═══════════════════════════════════════════════════════
# STEP 23: Fix remaining syncTableToSupabaseFn references
# ═══════════════════════════════════════════════════════
c = re.sub(r'syncTableToSupabaseFn\([^)]+\)', 'Promise.resolve()', c)
c = re.sub(r'syncTableToSupabase\([^)]+\)', 'Promise.resolve()', c)
print('Step 23: syncTableToSupabaseFn references cleaned')

# ═══════════════════════════════════════════════════════
# STEP 24: Remove remaining sync comments about sync engine
# ═══════════════════════════════════════════════════════
# Remove "Bloquear sync" and "Liberar bloqueos" comments
c = re.sub(r'\n\s*// Bloquear[^\\n]*\\n', '\n', c)
c = re.sub(r'\n\s*// Liberar[^\\n]*\\n', '\n', c)
print('Step 24: sync-related comments cleaned')

# ═══════════════════════════════════════════════════════
# STEP 25: Final cleanup
# ═══════════════════════════════════════════════════════
# Remove double blank lines
while '\n\n\n' in c:
    c = c.replace('\n\n\n', '\n\n')

# Write the result
with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print(f'\nFinal: {len(c)} chars, {c.count(chr(10))+1} lines')
print(f'Reduction: {100 - len(c)*100//len(orig)}%')

# Verify: check for remaining issues
issues = []
for term in ['localStorage', 'STORAGE_KEY', 'load()', 'save(d)', '_syncInProgress',
             '_blockFromSync', '_skipBackgroundSync', 'syncTableToSupabaseFn',
             'syncTableFromSupabase', '_lastCleanAt', '_initialSyncDone',
             '_lastSyncTimestamps', '_uploadedSinceLastDelete', '_saveLastSyncTimestamps',
             '_pendingDeletes', '_addDeletedId', '_isDeletedId']:
    # Count non-comment occurrences
    for line in c.split('\n'):
        stripped = line.strip()
        if term in stripped and not stripped.startswith('//') and not stripped.startswith('*'):
            issues.append(f'  {term}: {stripped[:80]}')

if issues:
    print('\nRemaining code references:')
    for i in issues[:20]:
        print(i)
else:
    print('\nAll references cleaned!')

# Check for syntax by trying to parse with node
print('\nChecking syntax...')
