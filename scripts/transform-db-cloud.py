#!/usr/bin/env python3
"""Transform db.js from localStorage+sync to cloud-only (Supabase direct)."""
import re
import sys

path = 'src/lib/db.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

print(f'Original: {len(c)} chars, {c.count(chr(10))+1} lines')

# Find key markers
users_marker = '  // --- Users ---'
users_start = c.find(users_marker)
if users_start == -1:
    users_start = c.find('users: {')
print(f'Users section: {users_start}')

auth_marker = 'getCurrentUserEmail()'
auth_start = c.find(auth_marker)
print(f'Auth section: {auth_start}')

last_brace = c.rfind('};')
print(f'Last }}: {last_brace}')

# Extract sections
crud_section = c[users_start:auth_start]
auth_section = c[auth_start:last_brace+2]

print(f'CRUD: {len(crud_section)} chars, Auth: {len(auth_section)} chars')

# === Build new infrastructure ===
NEW_INFRA = r"""import {
  supabase,
  isSupabaseAvailable,
  TABLES,
  setupRealtimeSubscriptions,
} from './supabase.js';

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
}

const notifyReactComponents = () => {
  window.dispatchEvent(new CustomEvent('db-synced'));
};

export const db = {
  _data,

  _notifyReactComponents() {
    window.dispatchEvent(new CustomEvent('db-synced'));
  },

  _init() {
    if (!_loaded && !_loading) {
      this.loadAll().catch(() => {});
    }
    return _data;
  },

  async loadAll() {
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
  _persist() { return Promise.resolve(); },
  _syncAllFromSupabase() { return this.loadAll(); },
  _syncAllFromSupabaseForce() { return this.loadAll(); },
  _syncSingleTable(jsKey) { return this._refreshTable(jsKey); },
  _syncSingleTableFromSupabase(jsKey) { return this._refreshTable(jsKey); },
  async syncToCloud() { return { success: true }; },
  async forceSyncFromCloud() { await this.loadAll(); return { success: true }; },
  async syncAdminChanges() { await this.loadAll(); return { success: true }; },
  async forceSync() { await this.loadAll(); },

  reset() {
    for (const key of Object.keys(_data)) {
      if (Array.isArray(_data[key])) _data[key].length = 0;
      else _data[key] = null;
    }
    _loaded = false;
  },

  seedIfEmpty() {},

"""

# === Transform CRUD section ===
crud = crud_section

# Remove "const d = db._init();" and similar
crud = crud.replace('const d = db._init();', '')
crud = crud.replace('const d = db._init({ skipSync: true });', '')

# Replace d.tablename with _data.tablename
for table in ['users', 'matches', 'predictions', 'prizes', 'redemptions',
              'supportTickets', 'pointsBonuses', 'appSettings', 'auditLogs',
              'referrals', 'referralCommissions']:
    crud = crud.replace(f'd.{table}', f'_data.{table}')

# Remove save(d) lines
crud = re.sub(r'\n\s*save\(d\);\n', '\n', crud)

# Remove try/finally blocks that only contain sync locks
crud = re.sub(r'\n\s*try \{\n', '\n', crud)
crud = re.sub(r'\n\s*\} finally \{\n', '\n', crud)
crud = re.sub(r'\n\s*_blockFromSync = (true|false);\n', '\n', crud)
crud = re.sub(r'\n\s*_skipBackgroundSync = (true|false);\n', '\n', crud)

# Remove deletedIds system
crud = re.sub(r'\n\s*db\._addDeletedId\([^)]+\);\n', '\n', crud)
crud = re.sub(r'\n\s*_pendingDeletes\.push\([^)]+\);\n', '\n', crud)
crud = re.sub(r'\n\s*_syncInProgress = \{\};\n', '\n', crud)

# Replace db._persist('table') with direct Supabase writes
persist_map = {
    'users': 'users',
    'matches': 'matches',
    'predictions': 'predictions',
    'prizes': 'prizes',
    'redemptions': 'redemptions',
    'supportTickets': 'support_tickets',
    'pointsBonuses': 'points_bonuses',
    'appSettings': 'app_settings',
    'auditLogs': 'audit_logs',
    'referrals': 'referrals',
    'referralCommissions': 'referral_commissions',
}
for js_table, supa_table in persist_map.items():
    crud = crud.replace(
        f"db._persist('{js_table}');",
        f"await _upsert('{supa_table}', record);\n      notifyReactComponents();"
    )

# Remove sync-related method calls in dedup/clean
crud = re.sub(r'\s*await db\._syncSingleTable\([^)]+\);', '', crud)
crud = re.sub(r'\s*await db\._syncSingleTableFromSupabase\([^)]+\);', '', crud)
crud = re.sub(r'\s*await db\._syncDeletedIdsToCloud\(\);', '', crud)
crud = re.sub(r'\s*await db\._syncAllToSupabase\(\);', '', crud)
crud = re.sub(r'\s*await this\.syncAdminChanges\(\);', '', crud)
crud = re.sub(r'\s*try \{\n\s*await this\.syncAdminChanges\(\);\n\s*\} catch \(syncErr\) \{[^}]+\}', '', crud)
crud = re.sub(r'\n\s*await db\._syncAllToSupabase\(\);\n', '\n', crud)
crud = re.sub(r'\n\s*save\(d\);\n\s*_syncInProgress = \{\};\n\s*await db\._syncAllToSupabase\(\);', '\n      await _upsert(\'audit_logs\', record);', crud)

# Replace save(d) again (in case missed)
crud = re.sub(r'\n\s*save\(d\);\n', '\n', crud)

# Fix remaining sync references
crud = re.sub(r'syncTableToSupabaseFn\([^)]+\)', 'Promise.resolve()', crud)
crud = re.sub(r'\s*await db\._ensureLoaded\(\);', '', crud)

print(f'CRUD transformed: {len(crud)} chars')

# === Transform auth section ===
auth = auth_section

# Replace db._init() references
auth = auth.replace('return db._init().currentUserEmail;', 'return _data.currentUserEmail;')
auth = auth.replace('return db._init().users.find', 'return _data.users.find')
auth = auth.replace('const d = db._init();', '')
auth = auth.replace('d.users', '_data.users')
auth = auth.replace('d.referralCommissions', '_data.referralCommissions')

# Remove localStorage references
auth = re.sub(r"\n\s*localStorage\.removeItem\('chessking_token'\);\n", '\n', auth)

# Remove sync references
auth = re.sub(r'\n\s*_syncInProgress = \{\};\n', '\n', auth)
auth = re.sub(r'\s*await db\._syncAllToSupabase\(\);', '', auth)
auth = re.sub(r'\n\s*_blockFromSync = (true|false);\n', '\n', auth)
auth = re.sub(r'\n\s*_skipBackgroundSync = (true|false);\n', '\n', auth)
auth = re.sub(r'\n\s*save\(d\);\n', '\n', auth)
auth = re.sub(r'\n\s*try \{\n', '\n', auth)
auth = re.sub(r'\n\s*\} finally \{\n', '\n', auth)

# Replace cleanUserData with cloud-only version
clean_start = auth.find('async cleanUserData()')
if clean_start > -1:
    depth = 0
    i = auth.find('{', clean_start)
    clean_end = i
    for j in range(i, len(auth)):
        if auth[j] == '{':
            depth += 1
        elif auth[j] == '}':
            depth -= 1
            if depth == 0:
                clean_end = j + 1
                break

    NEW_CLEAN = """async cleanUserData() {
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

    auth = auth[:clean_start] + NEW_CLEAN + auth[clean_end:]
    print('cleanUserData replaced')

# Close the db object properly
auth = auth.rstrip()
if not auth.endswith('};'):
    auth = auth + '\n};\n'

# === Assemble final file ===
final = NEW_INFRA + crud + '\n\n  // --- Auth ---\n\n  ' + auth

# Clean up double/triple blank lines
final = re.sub(r'\n{4,}', '\n\n\n', final)

# Remove any remaining localStorage references
final = re.sub(r"\s*localStorage\.\w+\([^)]*\);?\n", '\n', final)

# Remove remaining sync state references
final = re.sub(r'\n\s*_(?:syncInProgress|blockFromSync|skipBackgroundSync)[^;]*;\n', '\n', final)

# Remove remaining _blockFromSync try/finally blocks
final = re.sub(r'\n\s*try \{\n\s*\} catch \{\}\n', '\n', final)

# Remove syncTableToSupabase references
final = re.sub(r'\s*syncTableToSupabase\([^)]+\)', '', final)

# Remove NATURAL_KEYS if still present
nk_start = final.find('const NATURAL_KEYS')
if nk_start > -1:
    nk_end = final.find('};', nk_start) + 2
    final = final[:nk_start] + final[nk_end:]

# Remove getDefaults if still present
gd_start = final.find('const getDefaults')
if gd_start > -1:
    gd_end = final.find('};', gd_start) + 2
    final = final[:gd_start] + final[gd_end:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(final)

# Verify
remaining = []
for term in ['localStorage', 'STORAGE_KEY', '_syncInProgress', '_blockFromSync',
             '_skipBackgroundSync', 'syncTableToSupabase', 'syncTableFromSupabase',
             'load()', 'save(d)', 'NATURAL_KEYS', 'getDefaults', '_pendingDeletes',
             '_lastCleanAt', '_initialSyncDone', '_markInitialSyncDone',
             '_lastSyncTimestamps', '_uploadedSinceLastDelete', '_saveLastSyncTimestamps']:
    count = final.count(term)
    if count > 0:
        remaining.append(f'  {term}: {count}')

if remaining:
    print('\nWARNING: Remaining references to remove:')
    for r in remaining:
        print(r)
else:
    print('\nAll localStorage/sync references removed!')

print(f'\nFinal: {len(final)} chars, {final.count(chr(10))+1} lines')
print(f'Reduction: {100 - len(final)*100//len(c)}% smaller')
print('DONE')
