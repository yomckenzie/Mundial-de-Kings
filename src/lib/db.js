const STORAGE_KEY = 'chessking_db';
const SHARED_DB_API = '/api/shared-db';

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const getNow = () => new Date().toISOString();

let _syncTimer = null;
let _syncInProgress = false;
let _pendingSyncData = null;

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

// --- Sincronización con servidor compartido (red local) ---

const syncToServer = (data) => {
  // Agendar sincronización con debounce
  _pendingSyncData = JSON.parse(JSON.stringify(data));
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(doSyncToServer, 100);
};

const doSyncToServer = async () => {
  if (_syncInProgress || !_pendingSyncData) return;
  _syncInProgress = true;
  try {
    await fetch(SHARED_DB_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_pendingSyncData),
    });
    _pendingSyncData = null;
  } catch (err) {
    // Silently fail - servidor no disponible (ej: archivo abierto directo)
  } finally {
    _syncInProgress = false;
  }
};

const syncFromServer = async () => {
  try {
    const res = await fetch(SHARED_DB_API);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

  _init() {
    if (!this._data) {
      this._data = load();
      this.seedIfEmpty();
      // Cargar datos del servidor compartido en segundo plano
      // Los componentes React se actualizarán vía evento 'db-synced'
      this._loadFromServer();
    }
    return this._data;
  },

  _persist() {
    save(this._data);
    // Sincronizar cambios al servidor compartido
    syncToServer(this._data);
  },

  // Sincronizar datos desde el servidor compartido (red local)
  async _loadFromServer() {
    try {
      const serverData = await syncFromServer();
      if (!serverData) return;

      const hasData = serverData.appSettings && serverData.appSettings.length > 0;
      if (!hasData) {
        // El servidor está vacío, subir datos locales como fuente de verdad
        if (this._data.appSettings && this._data.appSettings.length > 0) {
          syncToServer(this._data);
        }
        return;
      }

      // Solo sincronizar appSettings del servidor (banners, Instagram, etc.)
      // Mantener datos locales de usuarios, predicciones, partidos, etc.
      this._data.appSettings = JSON.parse(JSON.stringify(serverData.appSettings));

      // Actualizar localStorage
      save(this._data);
      console.log('[DB] Datos sincronizados desde el servidor compartido');

      // Notificar a los componentes React para que se actualicen
      notifyReactComponents();
    } catch (err) {
      console.warn('[DB] Error al sincronizar desde el servidor:', err);
    }
  },

  // Forzar sincronización manual desde el servidor
  async forceSync() {
    await this._loadFromServer();
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
      d.users[idx] = { ...d.users[idx], ...data };
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
      d.matches[idx] = { ...d.matches[idx], ...data };
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
      d.predictions[idx] = { ...d.predictions[idx], ...data };
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
      d.prizes[idx] = { ...d.prizes[idx], ...data };
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
      d.redemptions[idx] = { ...d.redemptions[idx], ...data };
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
      d.supportTickets[idx] = { ...d.supportTickets[idx], ...data };
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
      d.appSettings[idx] = { ...d.appSettings[idx], ...data };
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
    const hasAdmin = d.users.some(u => u.role === 'admin');
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
        total_points: 999999,
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
        { id: makeId(), key: 'home_banners', value: JSON.stringify([
          'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=1200&h=375&fit=crop',
          'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1200&h=375&fit=crop',
          'https://images.unsplash.com/photo-1511882150382-421056c89033?w=1200&h=375&fit=crop'
        ]), created_date: getNow() },
      );
      this._persist();
    }

    const hasPrizes = d.prizes.length > 0;
    if (!hasPrizes) {
      d.prizes.push(
        {
          id: makeId(),
          name: 'Tarjeta de Regalo $10',
          description: 'Tarjeta de regalo para canjear en tus tiendas favoritas.',
          points_cost: 200,
          units_available: 10,
          status: 'active',
          created_date: getNow(),
        },
        {
          id: makeId(),
          name: 'Camiseta Oficial',
          description: 'Camiseta oficial del Mundial de Kings 2026.',
          points_cost: 500,
          units_available: 5,
          status: 'active',
          created_date: getNow(),
        },
        {
          id: makeId(),
          name: 'Audífonos Inalámbricos',
          description: 'Audífonos Bluetooth con cancelación de ruido.',
          points_cost: 800,
          units_available: 3,
          status: 'active',
          created_date: getNow(),
        },
        {
          id: makeId(),
          name: 'Tarjeta de Regalo $25',
          description: 'Tarjeta de regalo por $25 para gastar donde quieras.',
          points_cost: 1000,
          units_available: 5,
          status: 'active',
          created_date: getNow(),
        },
      );
      this._persist();
    }
  },
};