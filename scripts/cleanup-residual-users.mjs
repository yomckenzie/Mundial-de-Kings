/**
 * Limpieza de datos residuales de usuarios específicos.
 * Versión más agresiva: busca TODOS los registros con ese email
 * (incluyendo duplicados con IDs diferentes) y los elimina.
 *
 * Uso:
 *   node scripts/cleanup-residual-users.mjs --force
 *
 * Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function loadEnv() {
  try {
    const envPath = resolve(projectRoot, '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key.startsWith('VITE_')) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.error('❌ No se pudo cargar .env:', err.message);
    process.exit(1);
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const RESIDUAL_EMAILS = [
  'yobanyricardo507@gmail.com',
  'mariad@empresa.com',
  'mariwad@empresa.com',
  'miguelpedrito@gmafed.com',
  'yobanyrciardddo@gmail.com',
];

const BATCH_SIZE = 50;

async function countRecords(table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);

  if (error) return { count: -1, error: error.message };
  return { count, error: null };
}

async function deleteByColumn(table, column, value, label) {
  try {
    const { data: records, error: fetchErr } = await supabase
      .from(table)
      .select('id')
      .eq(column, value);

    if (fetchErr) {
      console.warn(`  ⚠️  Error consultando ${table}: ${fetchErr.message}`);
      return 0;
    }

    if (!records || records.length === 0) return 0;

    const ids = records.map(r => r.id);
    let deleted = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const { error: delErr } = await supabase
        .from(table)
        .delete()
        .in('id', batch);

      if (delErr) {
        console.warn(`  ⚠️  Error eliminando de ${table} (batch ${i / BATCH_SIZE + 1}): ${delErr.message}`);
      } else {
        deleted += batch.length;
      }
    }

    if (deleted > 0) {
      console.log(`  ✅ ${deleted} ${label} eliminados de ${table}`);
    }
    return deleted;
  } catch (err) {
    console.warn(`  ⚠️  Error en ${table}: ${err.message}`);
    return 0;
  }
}

async function cleanEmail(email) {
  console.log(`\n📧 ${email}`);

  // Primero, verificar estado actual
  console.log('  🔍 Verificando estado actual...');
  const checks = [
    { table: 'users', col: 'email' },
    { table: 'predictions', col: 'user_email' },
    { table: 'redemptions', col: 'user_email' },
    { table: 'points_bonuses', col: 'user_email' },
    { table: 'support_tickets', col: 'user_email' },
    { table: 'referrals', col: 'referrer_email' },
    { table: 'referrals', col: 'referred_email' },
    { table: 'referral_commissions', col: 'to_email' },
    { table: 'referral_commissions', col: 'from_email' },
  ];

  let totalFound = 0;
  for (const { table, col } of checks) {
    const { count } = await countRecords(table, col, email);
    if (count > 0) {
      console.log(`  ⚠️  ${table}.${col}: ${count} registro(s)`);
      totalFound += count;
    }
  }

  if (totalFound === 0) {
    console.log('  ✅ Ya está limpio, no hay datos residuales');
    return 0;
  }

  console.log(`  🗑️  Eliminando ${totalFound} registro(s)...`);

  // Ahora eliminar (orden inverso por FK)
  let deleted = 0;
  deleted += await deleteByColumn('predictions', 'user_email', email, 'pronósticos');
  deleted += await deleteByColumn('redemptions', 'user_email', email, 'canjes');
  deleted += await deleteByColumn('points_bonuses', 'user_email', email, 'puntos extra');
  deleted += await deleteByColumn('support_tickets', 'user_email', email, 'tickets');
  deleted += await deleteByColumn('referrals', 'referrer_email', email, 'referidos (ref)');
  deleted += await deleteByColumn('referrals', 'referred_email', email, 'referidos (refd)');
  deleted += await deleteByColumn('referral_commissions', 'to_email', email, 'comisiones (to)');
  deleted += await deleteByColumn('referral_commissions', 'from_email', email, 'comisiones (from)');
  deleted += await deleteByColumn('users', 'email', email, 'usuarios');

  console.log(`  ✅ Total eliminado: ${deleted} registro(s)`);
  return deleted;
}

async function main() {
  if (!process.argv.includes('--force')) {
    console.log('⚠️  Este script eliminará datos residuales de:');
    for (const email of RESIDUAL_EMAILS) {
      console.log(`   • ${email}`);
    }
    console.log('\nEjecuta con --force para continuar:');
    console.log('  node scripts/cleanup-residual-users.mjs --force');
    process.exit(0);
  }

  console.log('========================================');
  console.log('  Limpieza de datos residuales');
  console.log('========================================\n');

  let totalDeleted = 0;
  for (const email of RESIDUAL_EMAILS) {
    const deleted = await cleanEmail(email);
    totalDeleted += deleted;
  }

  console.log('\n' + '='.repeat(40));
  console.log(`📊 Total: ${totalDeleted} registro(s) residuales eliminados`);
  console.log('='.repeat(40));

  // ─── Verificación post-limpieza ───────────────────
  console.log('\n🔍 Verificando post-limpieza...');
  let residual = false;

  for (const email of RESIDUAL_EMAILS) {
    const { count } = await countRecords('users', 'email', email);
    if (count > 0) {
      console.log(`  ❌ ${email}: ${count} registro(s) aún en users`);
      residual = true;
    }
  }

  if (!residual) {
    console.log('  ✅ Todos los usuarios residuales fueron eliminados correctamente');
  } else {
    console.log('  ⚠️  Quedan residuos. Puede que el RLS de Supabase esté bloqueando los DELETE.');
    console.log('     Si es así, usa el SQL Editor de Supabase y ejecuta el DELETE manual.');
  }

  console.log('\n✅ Proceso completado.');
}

main().catch(err => {
  console.error('\n❌ Error inesperado:', err);
  process.exit(1);
});
