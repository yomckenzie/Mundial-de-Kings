// src/scripts/maintenance.js
/**
 * Maintenance utilities for Pagina Chess King
 * -------------------------------------------------
 * • resetAllMatches(): sets every match to "Pendiente" and clears results/times.
 * • deleteAllNonAdminUsers(): removes all users except the admin account
 *   (and cascades related predictions, redemptions, points bonuses).
 *
 * Run with:
 *   node src/scripts/maintenance.js reset
 *   node src/scripts/maintenance.js cleanup-users
 *
 * WARNING: These operations are destructive. Use only in a controlled
 * environment (e.g., staging) or after taking a database backup.
 */

import { db } from '../lib/db.js';
import { supabase, isSupabaseAvailable } from '../lib/supabase.js';

async function resetAllMatches() {
  const { matches } = db._init();
  matches.forEach(m => {
    m.status = 'Pendiente';
    delete m.result;
    delete m.live_started_at;
  });
  localStorage.setItem('chessking_db', JSON.stringify(db._init()));
  console.log(`✅ Reset ${matches.length} matches to "Pendiente".`);

  if (isSupabaseAvailable()) {
    const { error } = await supabase.from('matches').update({ status: 'Pendiente' });
    if (error) console.warn('Supabase sync error:', error.message);
    else console.log('✅ Supabase matches reset.');
  }
}

async function deleteAllNonAdminUsers() {
  const { users, predictions, redemptions, pointsBonuses } = db._init();
  const admin = users.find(u => u.role === 'admin');
  const nonAdminIds = users.filter(u => u.role !== 'admin').map(u => u.id);

  // Remove related data
  db._init().predictions = predictions.filter(p => !nonAdminIds.includes(p.user_id));
  db._init().redemptions = redemptions.filter(r => !nonAdminIds.includes(r.user_id));
  db._init().pointsBonuses = pointsBonuses.filter(b => !nonAdminIds.includes(b.user_id));

  // Keep only admin user
  db._init().users = users.filter(u => u.role === 'admin');

  localStorage.setItem('chessking_db', JSON.stringify(db._init()));
  console.log(`✅ Deleted ${nonAdminIds.length} non-admin users and their data.`);

  if (isSupabaseAvailable()) {
    const { error } = await supabase.from('users').delete().neq('role', 'admin');
    if (error) console.warn('Supabase delete error:', error.message);
    else console.log('✅ Supabase non-admin users removed.');
  }
}

// Simple CLI handling
const [,, cmd] = process.argv;
if (cmd === 'reset') resetAllMatches();
else if (cmd === 'cleanup-users') deleteAllNonAdminUsers();
else console.log('Usage: node src/scripts/maintenance.js <reset|cleanup-users>');
