import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '..', 'src', 'lib', 'db.js');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Remove setupRealtimeSubscriptions from import
content = content.replace(
  `  setupRealtimeSubscriptions,\n} from './supabase.js';`,
  `} from './supabase.js';`
);

// 2. Remove seedIfEmpty + syncAllFromSupabase + setupRealtimeSubscriptions + cloud-change listener from _init()
const initStart = 'this._cleanStaleLiveTimers();';
const initEnd = '}\n    return this._data;\n  },';

const initStartIdx = content.indexOf(initStart);
const initEndIdx = content.indexOf(initEnd, initStartIdx);

if (initStartIdx !== -1 && initEndIdx !== -1) {
  const before = content.slice(0, initStartIdx);
  const after = content.slice(initEndIdx);
  content = before + 'this._cleanStaleLiveTimers();\n    }\n    return this._data;\n  },' + after.slice(initEnd.length);
}

// 3. Remove auto-sync from _persist() - keep only save and _syncInProgress reset
const persistStart = '  _persist(changedTable) {';
const persistEnd = '  },\n\n  /**\n   * Sincronización round-trip';

const persistIdx = content.indexOf(persistStart);
const persistEndIdx = content.indexOf(persistEnd, persistIdx);

if (persistIdx !== -1 && persistEndIdx !== -1) {
  const before = content.slice(0, persistIdx);
  const after = content.slice(persistEndIdx);
  content = before + `  _persist(changedTable) {\n    save(this._data);\n    _syncInProgress = {};\n    return Promise.resolve();\n  },\n\n  /**\n   * Sincronización round-trip` + after;
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ db.js actualizado correctamente');
