// src/scripts/maintenance.js
/**
 * Maintenance utilities for Pagina Chess King
 * -------------------------------------------------
 * • resetAllMatches(): sets every match to "pending" and clears results.
 * • deleteAllNonAdminUsers(): removes all users except the admin account
 *   (and cascades related predictions, redemptions, points bonuses).
 *
 * Run with:
 *   node src/scripts/maintenance.js reset
 *   node src/scripts/maintenance.js cleanup-users
 *
 * BUGS CORREGIDOS:
 *   - status 'Pendiente' → 'pending' (coincide con el CHECK constraint del schema)
 *   - p.user_id → p.user_email (el schema usa user_email como FK)
 *   - r.user_id → r.user_email
 *   - b.user_id → b.user_email
 *
 * WARNING: Estas operaciones son destructivas. Usar solo en staging
 * o después de hacer backup de la base de datos.
 */

import { db } from '../lib/db.js';
import { supabase, isSupabaseAvailable } from '../lib/supabase.js';

async function resetAllMatches() {
  const { matches } = db._init();
  matches.forEach(m => {
    m.status = 'pending';
    delete m.result;
    delete m.live_started_at;
  });
  localStorage.setItem('chessking_db', JSON.stringify(db._init()));
  console.log(`✅ Reset ${matches.length} matches to "pending".`);

  if (isSupabaseAvailable()) {
    const { error } = await supabase
      .from('matches')
      .update({ status: 'pending' });
    if (error) console.warn('Supabase sync error:', error.message);
    else console.log('✅ Supabase matches reset.');
  }
}

async function deleteAllNonAdminUsers() {
  const { users, predictions, redemptions, pointsBonuses } = db._init();
  const admin = users.find(u => u.role === 'admin');
  const nonAdminEmails = new Set(
    users.filter(u => u.role !== 'admin').map(u => u.email)
  );

  // Remove related data — usar user_email (FK real) en vez de user_id
  db._init().predictions = predictions.filter(p => !nonAdminEmails.has(p.user_email));
  db._init().redemptions = redemptions.filter(r => !nonAdminEmails.has(r.user_email));
  db._init().pointsBonuses = pointsBonuses.filter(b => !nonAdminEmails.has(b.user_email));

  // Keep only admin user
  db._init().users = users.filter(u => u.role === 'admin');

  localStorage.setItem('chessking_db', JSON.stringify(db._init()));
  console.log(`✅ Deleted ${nonAdminEmails.size} non-admin users and their data.`);

  if (isSupabaseAvailable()) {
    // Borrar todos los users con role != 'admin' usando neq
    // (alternativa: SELECT ids + DELETE en batches si neq falla por nulls)
    const { error } = await supabase
      .from('users')
      .delete()
      .neq('role', 'admin');
    if (error) console.warn('Supabase delete error:', error.message);
    else console.log('✅ Supabase non-admin users removed.');
  }
}

// Simple CLI handling
const [,, cmd] = process.argv;
if (cmd === 'reset') resetAllMatches();
else if (cmd === 'cleanup-users') deleteAllNonAdminUsers();
else console.log('Usage: node src/scripts/maintenance.js <reset|cleanup-users>');
