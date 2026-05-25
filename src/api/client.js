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
    },
    Match: {
      list: P((order) => db.matches.list(order)),
      filter: P((fields, order) => db.matches.filter(fields, order)),
      create: P((data) => db.matches.create(data)),
      update: P((id, data) => db.matches.update(id, data)),
      clearAll: P(() => db.matches.clearAll()),
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
            .filter(u => u.profile_complete)
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
        // Intentar subir a Supabase Storage primero
        const { uploadImage } = await import('@/lib/supabase');
        const publicUrl = await uploadImage(file, 'banners');
        if (publicUrl) {
          return { file_url: publicUrl, storage: 'supabase' };
        }
        // Fallback: DataURL local (sin Supabase)
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({ file_url: reader.result, storage: 'local' });
          };
          reader.readAsDataURL(file);
        });
      },
    },
  },
};

export const api = client;