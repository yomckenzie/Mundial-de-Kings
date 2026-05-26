import {
  supabase,
  isSupabaseAvailable,
  syncTableToSupabase,
  syncTableFromSupabase,
  stripLocalFields,
  TABLES
} from './supabase';

const STORAGE_KEY = 'chessking_db';

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const getNow = () => new Date().toISOString();

let _syncTimers = {};
let _syncInProgress = {};
let _pollInterval = null;
let _syncToSupabaseInProgress = false;
let _syncFromSupabaseInProgress = false;

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

  _init() {
    if (!this._data) {
      this._data = load();
      this.seedIfEmpty();
      // Cargar datos desde Supabase en segundo plano
      // Los componentes React se actualizarán vía evento 'db-synced'
      this._syncAllFromSupabase().then(() => {
        // Subir datos locales que aun no esten en la nube (ej: cambios del admin antes del deploy)
        this._syncAllToSupabase();
      });

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
    // Sincronizar cambios a Supabase INMEDIATAMENTE
    this._syncAllToSupabase();
  },

  // Sincronizar TODAS las tablas desde Supabase
  async _syncAllFromSupabase() {
    if (!isSupabaseAvailable()) return;
    // Evitar race condition: si estamos subiendo datos, no bajar al mismo tiempo
    if (_syncToSupabaseInProgress) {
      console.log('[DB] Sync a Supabase en progreso, saltando polling');
      return;
    }
    return this._syncAllFromSupabaseInternal();
  },

  // Forzar sincronización desde Supabase (ignora el lock de subida)
  async _syncAllFromSupabaseForce() {
    if (!isSupabaseAvailable()) return;
    return this._syncAllFromSupabaseInternal();
  },

  // Implementación interna de sincronización desde Supabase
  async _syncAllFromSupabaseInternal() {
    if (_syncFromSupabaseInProgress) return;

    _syncFromSupabaseInProgress = true;
    try {
      const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings'];
      let changed = false;

      for (const jsKey of tablesToSync) {
        const localRecords = this._data[jsKey] || [];
        const remoteRecords = await syncTableFromSupabaseFn(jsKey, localRecords);
        // Si el resultado es un nuevo array (diferente referencia), hubo cambios
        if (remoteRecords && remoteRecords !== localRecords) {
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
    if (_syncToSupabaseInProgress) return;

    _syncToSupabaseInProgress = true;
    try {
      const tablesToSync = ['users', 'matches', 'predictions', 'prizes', 'redemptions', 'supportTickets', 'pointsBonuses', 'appSettings'];
      for (const jsKey of tablesToSync) {
        const records = this._data[jsKey] || [];
        if (records.length > 0) {
          await syncTableToSupabaseFn(jsKey, records);
        }
      }
    } finally {
      _syncToSupabaseInProgress = false;
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

  reset() {
    this._data = getDefaults();
    this._persist();
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
    create(data) {
      const d = db._init();
      const record = { id: makeId(), created_date: getNow(), ...data };
      d.users.push(record);
      db._persist();
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
    clearAll() {
      const d = db._init();
      d.matches = [];
      db._persist();
    },
    bulkCreate(matchesArray) {
      const d = db._init();
      const now = getNow();
      const records = matchesArray.map(m => ({
        id: makeId(),
        created_date: now,
        ...m
      }));
      d.matches.push(...records);
      db._persist();
      return records;
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
      console.log('[DB] Admin user seeded: admin@chessking.com / admin123');
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
        { id: makeId(), key: 'social_header', value: 'Recuerda seguirnos en instagram y tiktok y unirte a nuestro canal para participar', created_date: getNow() },
        { id: makeId(), key: 'instagram1_url', value: 'https://instagram.com', created_date: getNow() },
        { id: makeId(), key: 'instagram1_title', value: 'Instagram 1', created_date: getNow() },
        { id: makeId(), key: 'instagram2_url', value: 'https://instagram.com', created_date: getNow() },
        { id: makeId(), key: 'instagram2_title', value: 'Instagram 2', created_date: getNow() },
        { id: makeId(), key: 'tiktok_url', value: 'https://tiktok.com', created_date: getNow() },
        { id: makeId(), key: 'tiktok_title', value: 'TikTok', created_date: getNow() },
        { id: makeId(), key: 'hero_subtitle', value: 'Síguenos, predice resultados y gana premios', created_date: getNow() },
        { id: makeId(), key: 'info_sections', value: infoSections, created_date: getNow() },
        { id: makeId(), key: 'home_banners', value: JSON.stringify([]), created_date: getNow() },
      );
      this._persist();
    }

    // NO seedear premios por defecto — el admin los crea desde el panel
  },
};