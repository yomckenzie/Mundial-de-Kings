import { db } from '@/lib/db';

const P = (fn) => (...args) => Promise.resolve().then(() => fn(...args));

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
      list: P((order) => db.matches.list(order)),
      filter: P((fields, order) => db.matches.filter(fields, order)),
      create: P((data) => db.matches.create(data)),
      update: P((id, data) => db.matches.update(id, data)),
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
      update: P((id, data) => db.redemptions.update(id, data)),
    },
    SupportTicket: {
      list: P((order) => db.supportTickets.list(order)),
      filter: P((fields, order) => db.supportTickets.filter(fields, order)),
      create: P((data) => db.supportTickets.create(data)),
      update: P((id, data) => db.supportTickets.update(id, data)),
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
          const pointsMap = {};
          predictions.forEach(p => {
            if (p.is_correct) {
              pointsMap[p.user_email] = (pointsMap[p.user_email] || 0) + 100;
            }
          });
          let updated = 0;
          Object.entries(pointsMap).forEach(([email, points]) => {
            const user = db.users.findByEmail(email);
            if (user) {
              db.users.update(user.id, { prediction_points: points, total_points: (user.bonus_points || 0) + points });
              updated++;
            }
          });
          return { data: { success: true, updated } };
        }
        default:
          return { data: {} };
      }
    },
  },

  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
      // 1. Comprimir imagen en cliente para reducir tamaño
      const [compressedBlob, { uploadImage }] = await Promise.all([
        compressImage(file, 1200, 0.8),
        import('@/lib/supabase'),
      ]);

      // 2. Subir a Supabase Storage (fallback DataURL eliminado — causaba problemas de sync)
      const publicUrl = await uploadImage(compressedBlob, file.name, 'banners');
        if (!publicUrl) {
          throw new Error('No se pudo subir la imagen a Supabase Storage. Verifica que el bucket "banners" exista y tenga políticas INSERT + SELECT para anon.');
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