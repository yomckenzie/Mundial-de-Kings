/**
 * Script de verificación: confirma que los usuarios eliminados
 * no dejaron datos residuales en Supabase.
 *
 * Uso:
 *   node scripts/verify-deleted-users.mjs
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

const EMAILS = [
  'dspojgopsdj@gmail.com',
  'juanluispedro@gmail.com',
  'marawewia@empresa.com',
  'maria@empresa.com',
  'andrearobles@hotmail.com',
  'andrearobles14@hotmail.com',
  'yobanyrcfiardo@gmail.com',
  'yobanyrciardddo@gmail.com',
  'yobanyrciardo@gmail.com',
  'tatigarcia1@outlook.es',
  'test1@chessking.com',
  'testuser002@chessking.com',
  'acs12.luis@gmail.com',
  'enoc.1008@gmail.com',
];

async function countResidual(table, emailColumn, email) {
  try {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(emailColumn, email);

    if (error) return { count: -1, error: error.message };
    return { count, error: null };
  } catch (err) {
    return { count: -1, error: err.message };
  }
}

async function main() {
  console.log('========================================');
  console.log('  Verificación de eliminación');
  console.log('========================================\n');

  let totalResidual = 0;
  const tables = [
    { table: 'users', col: 'email', label: 'Usuario' },
    { table: 'predictions', col: 'user_email', label: 'Pronósticos' },
    { table: 'redemptions', col: 'user_email', label: 'Canjes' },
    { table: 'points_bonuses', col: 'user_email', label: 'Puntos extra' },
    { table: 'support_tickets', col: 'user_email', label: 'Tickets soporte' },
    { table: 'referrals', col: 'referrer_email', label: 'Referidos (ref)' },
    { table: 'referrals', col: 'referred_email', label: 'Referidos (refd)' },
    { table: 'referral_commissions', col: 'to_email', label: 'Comisiones (to)' },
    { table: 'referral_commissions', col: 'from_email', label: 'Comisiones (from)' },
  ];

  let allClean = true;

  for (const email of EMAILS) {
    console.log(`📧 ${email}`);
    let userResidual = false;

    for (const { table, col, label } of tables) {
      const { count, error } = await countResidual(table, col, email);

      if (error) {
        console.log(`   ⚠️  ${label} (${table}): error — ${error}`);
        continue;
      }

      if (count > 0) {
        console.log(`   ❌ ${label} (${table}): ${count} registro(s) RESIDUAL`);
        totalResidual += count;
        userResidual = true;
        allClean = false;
      }
    }

    if (!userResidual) {
      console.log(`   ✅ Todo limpio — sin datos residuales`);
    }
    console.log('');
  }

  console.log('='.repeat(40));
  if (totalResidual === 0) {
    console.log('✅ VEREDICTO: Todo limpio. No hay datos residuales en Supabase.');
  } else {
    console.log(`⚠️  Se encontraron ${totalResidual} registro(s) residuales en total.`);
    console.log('   Es posible que hayan sido creados después de la eliminación');
    console.log('   o que el script no los haya alcanzado.');
  }
  console.log('');

  // ─── Resumen de todos los usuarios en la BD ─────────
  console.log('📊 Total de usuarios actualmente en Supabase:');
  const { count: totalUsers, error: countErr } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });

  if (!countErr) {
    console.log(`   ${totalUsers} usuario(s) registrado(s)`);
  }

  // Mostrar los usuarios admin que quedan
  const { data: admins } = await supabase
    .from('users')
    .select('email, full_name, role')
    .eq('role', 'admin');

  if (admins && admins.length > 0) {
    console.log(`\n👑 Usuarios admin (${admins.length}):`);
    for (const a of admins) {
      console.log(`   • ${a.email} — ${a.full_name || 'sin nombre'}`);
    }
  }

  console.log('\n✅ Verificación completada.');
}

main().catch(err => {
  console.error('\n❌ Error inesperado:', err);
  process.exit(1);
});
