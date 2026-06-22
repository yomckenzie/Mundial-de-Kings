import { db } from '@/lib/db';

// Todas las operaciones de entidades esperan la primera carga desde
// Supabase (db.whenReady). Sin esto, las páginas leían la memoria local
// vacía al entrar, mostraban "no hay datos" y luego todo aparecía de
// golpe cuando llegaba la nube. Tras la carga inicial no agrega latencia.
const P = (fn) => async (...args) => {
  await db.whenReady();
  return fn(...args);
};

// Lecturas de PARTIDOS: esperan solo a que cargue la tabla `matches`
// (carga prioritaria), no a las tablas pesadas (predicciones/usuarios). Así la
// página de Partidos y el sondeo en vivo arrancan de inmediato — clave en móvil.
const PMatch = (fn) => async (...args) => {
  await db.whenMatchesReady();
  return fn(...args);
};

const client = {
  auth: {
    me: async () => {
      return db.getCurrentUser();
    },
    logout: (redirectUrl) => {
      db.setCurrentUserEmail(null);
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    },
    redirectToLogin: (redirectUrl) => {
      window.location.href = `/login?redirect=${encodeURIComponent(redirectUrl || window.location.href)}`;
    },
    updateMe: async (data) => {
      const user = db.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      return db.users.update(user.id, data);
    },
  },

  entities: {
    User: {
      list: P((order) => db.users.list(order)),
      filter: P((fields, order) => db.users.filter(fields, order)),
      create: P((data) => db.users.create(data)),
      update: P((id, data) => db.users.update(id, data)),
      delete: P((id) => db.users.remove(id)),
    },
    Match: {
      list: PMatch((order) => db.matches.list(order)),
      filter: PMatch((fields, order) => db.matches.filter(fields, order)),
      create: P((data) => db.matches.create(data)),
      update: P((id, data) => db.matches.update(id, data)),
      delete: P((id) => db.matches.remove(id)),
      clearAll: P(() => db.matches.clearAll()),
      resetAll: P(() => db.matches.resetAll()),
      bulkCreate: P((matches) => db.matches.bulkCreate(matches)),
    },
    Prediction: {
      list: P((limit) => db.predictions.list()),
      filter: P((fields, order) => db.predictions.filter(fields, order)),
      create: P((data) => db.predictions.create(data)),
      update: P((id, data) => db.predictions.update(id, data)),
    },
    Prize: {
      list: P((order) => db.prizes.list(order)),
      filter: P((fields, order) => db.prizes.filter(fields, order)),
      create: P((data) => db.prizes.create(data)),
      update: P((id, data) => db.prizes.update(id, data)),
      delete: P((id) => db.prizes.remove(id)),
    },
    Redemption: {
      list: P((order) => db.redemptions.list(order)),
      filter: P((fields, order) => db.redemptions.filter(fields, order)),
      create: P((data) => db.redemptions.create(data)),
      redeem: P((args) => db.redemptions.redeem(args)),
      update: P((id, data) => db.redemptions.update(id, data)),
    },
    SupportTicket: {
      list: P((order) => db.supportTickets.list(order)),
      filter: P((fields, order) => db.supportTickets.filter(fields, order)),
      create: P((data) => db.supportTickets.create(data)),
      update: P((id, data) => db.supportTickets.update(id, data)),
    },
    UserNotification: {
      list: P((order) => db.userNotifications.list(order)),
      filter: P((fields, order) => db.userNotifications.filter(fields, order)),
      create: P((data) => db.userNotifications.create(data)),
      update: P((id, data) => db.userNotifications.update(id, data)),
      markRead: P((id) => db.userNotifications.markRead(id)),
    },
    PointsBonus: {
      list: P((order) => db.pointsBonuses.list(order)),
      filter: P((fields, order) => db.pointsBonuses.filter(fields, order)),
      create: P((data) => db.pointsBonuses.create(data)),
    },
    AppSettings: {
      list: P(() => db.appSettings.list()),
      create: P((data) => db.appSettings.create(data)),
      update: P((id, data) => db.appSettings.update(id, data)),
    },
    AuditLog: {
      list: P((order) => db.auditLogs.list(order)),
      create: P((data) => db.auditLogs.create(data)),
    },
    Referral: {
      list: P((order) => db.referrals.list(order)),
      findByReferrer: P((email) => db.referrals.findByReferrer(email)),
      countByReferrer: P((email) => db.referrals.countByReferrer(email)),
      create: P((data) => db.referrals.create(data)),
    },
    ReferralCommission: {
      list: P((order) => db.referralCommissions.list(order)),
      sumByReferrer: P((email) => db.referralCommissions.sumByReferrer(email)),
    },
  },

  admin: {
    cleanUserData: P(() => db.cleanUserData()),
  },

  users: {
    inviteUser: async (data) => {
      const existing = db.users.findByEmail(data.email);
      if (existing) throw new Error('Ya existe una cuenta con ese correo');
      return db.users.create(data);
    },
  },

  functions: {
    invoke: async (name, payload) => {
      switch (name) {
        case 'getRanking': {
          const users = db.users.list()
            .filter(u => u.profile_complete && u.role !== 'admin')
            .sort((a, b) => ((b.prediction_points || 0) - (a.prediction_points || 0)));
          return { data: { ranking: users } };
        }
        case 'autoCloseMatches': {
          return { data: { success: true } };
        }
        case 'recalcUserPoints': {
          const predictions = db.predictions.list();
          // Deduplicar: contar solo una prediccion por (user_email, match_id)
          // para evitar que duplicados inflen los puntos (ej: 600pts por 1 acierto)
          const seen = new Set();
          const pointsMap = {};
          predictions.forEach(p => {
            if (p.is_correct) {
              const key = p.user_email + '|' + p.match_id;
              if (seen.has(key)) return;
              seen.add(key);
              pointsMap[p.user_email] = (pointsMap[p.user_email] || 0) + 100;
            }
          });
          let updated = 0;
          // Actualizar usuarios directamente (evita triggers de sync individuales
          // que causaban race conditions con el polling de 60s, sobrescribiendo
          // los puntos recién calculados con datos remotos desactualizados)
          Object.entries(pointsMap).forEach(([email, points]) => {
            const user = db.users.findByEmail(email);
            if (user) {
              user.prediction_points = points;
              user.total_points = (user.bonus_points || 0) + points + (user.referral_points || 0);
              user.updated_at = new Date().toISOString();
              updated++;
            }
          });
          // Guardar y sincronizar una sola vez con await
          if (updated > 0) {
            await db._persist();
          }
          return { data: { success: true, updated } };
        }
        default:
          return { data: {} };
      }
    },
  },

  integrations: {
    Core: {
      ListFiles: async ({ bucket } = {}) => {
        const { listImages } = await import('@/lib/supabase');
        return listImages(bucket || 'banners');
      },
      UploadFile: async ({ file }) => {
      // 1. Comprimir imagen en cliente para reducir tamaño
      const [compressedBlob, { uploadImage }] = await Promise.all([
        compressImage(file, 1200, 0.8),
        import('@/lib/supabase'),
      ]);

      // 2. Subir a Supabase Storage (fallback DataURL eliminado — causaba problemas de sync)
      const publicUrl = await uploadImage(compressedBlob, file.name, 'banners');
        if (!publicUrl) {
          throw new Error('No se pudo subir la imagen. Solo el administrador puede subir archivos. Verifica que hayas iniciado sesión como admin@chessking.com y que el bucket "banners" exista en Supabase.');
        }
        return { file_url: publicUrl, storage: 'supabase' };
      },
    },
  },
};

// --- Helper: comprimir imagen en cliente ---
function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Error al comprimir la imagen'));
      }, 'image/jpeg', quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Error al cargar la imagen para comprimirla'));
    };
    img.src = URL.createObjectURL(file);
  });
}

export const api = client;