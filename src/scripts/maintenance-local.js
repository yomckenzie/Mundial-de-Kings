// src/scripts/maintenance-local.js
// Simple maintenance script that works only with the localStorage database.
// It avoids importing the full db module (which pulls in Supabase) to prevent
// runtime errors when environment variables are missing.

import fs from 'fs';
import path from 'path';
const STORAGE_FILE = path.join(process.cwd(), 'chessking_db.json');

function load() {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (_) {
    // Default structure if file missing or corrupted
    return {
      users: [],
      matches: [],
      predictions: [],
      prizes: [],
      redemptions: [],
      supportTickets: [],
      pointsBonuses: [],
      appSettings: [],
      currentUserEmail: null,
    };
  }
}

function save(data) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function resetAllMatches() {
  const data = load();
  if (Array.isArray(data.matches)) {
    data.matches.forEach(m => {
      m.status = 'Pendiente';
      delete m.result;
      delete m.live_started_at;
    });
    console.log(`✅ Reset ${data.matches.length} matches to "Pendiente".`);
    save(data);
  } else {
    console.log('No matches found in local storage.');
  }
}

function deleteAllNonAdminUsers() {
  const data = load();
  if (!Array.isArray(data.users)) {
    console.log('No users data in local storage.');
    return;
  }
  const nonAdminIds = data.users.filter(u => u.role !== 'admin').map(u => u.id);

  // Remove related data (predictions, redemptions, points bonuses)
  data.predictions = (data.predictions || []).filter(p => !nonAdminIds.includes(p.user_id));
  data.redemptions = (data.redemptions || []).filter(r => !nonAdminIds.includes(r.user_id));
  data.pointsBonuses = (data.pointsBonuses || []).filter(b => !nonAdminIds.includes(b.user_id));

  // Keep only admin users
  data.users = data.users.filter(u => u.role === 'admin');

  console.log(`✅ Deleted ${nonAdminIds.length} non-admin users and their related data.`);
  save(data);
}

// Simple CLI handling
const [,, cmd] = process.argv;
if (cmd === 'reset') {
  resetAllMatches();
} else if (cmd === 'cleanup-users') {
  deleteAllNonAdminUsers();
} else {
  console.log('Usage: node src/scripts/maintenance-local.js <reset|cleanup-users>');
}
