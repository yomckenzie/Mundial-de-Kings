/**
 * Script para eliminar usuarios específicos por correo electrónico de Supabase.
 *
 * Uso:
 *   node scripts/delete-specific-users.mjs          # con confirmación
 *   node scripts/delete-specific-users.mjs --force   # sin confirmación
 *
 * Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env
 *
 * Elimina para cada usuario:
 *   - Predicciones (predictions)
 *   - Canjes (redemptions)
 *   - Puntos extra (points_bonuses)
 *   - Tickets de soporte (support_tickets)
 *   - Referidos (referrals) — como referrer y como referred
 *   - Comisiones de referidos (referral_commissions)
 *   - El registro de usuario (users)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// ─── Cargar .env ─────────────────────────────────────────
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
  console.error('❌ VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY deben estar en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1] || 'unknown';

// ─── Lista de correos a eliminar ─────────────────────────
const EMAILS_TO_DELETE = [
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

const BATCH_SIZE = 50;

async function deleteTableRecordsForEmail(table, emailColumn, email, label) {
  try {
    const { data: records, error: fetchErr } = await supabase
      .from(table)
      .select('id')
      .eq(emailColumn, email);

    if (fetchErr) {
      console.warn(`  ⚠️  Error consultando ${table} para ${email}: ${fetchErr.message}`);
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
        console.warn(`  ⚠️  Error eliminando ${table} batch para ${email}: ${delErr.message}`);
      } else {
        deleted += batch.length;
      }
    }

    if (deleted > 0) {
      console.log(`  ✅ ${deleted} ${label} eliminados`);
    }
    return deleted;
  } catch (err) {
    console.warn(`  ⚠️  Error en ${table} para ${email}: ${err.message}`);
    return 0;
  }
}

async function deleteUserData(email) {
  console.log(`\n📧 Procesando: ${email}`);

  // 1. Eliminar predicciones
  await deleteTableRecordsForEmail('predictions', 'user_email', email, 'pronósticos');

  // 2. Eliminar canjes
  await deleteTableRecordsForEmail('redemptions', 'user_email', email, 'canjes');

  // 3. Eliminar puntos extra
  await deleteTableRecordsForEmail('points_bonuses', 'user_email', email, 'puntos extra');

  // 4. Eliminar tickets de soporte
  await deleteTableRecordsForEmail('support_tickets', 'user_email', email, 'tickets de soporte');

  // 5. Eliminar referidos (donde el usuario es el referente)
  await deleteTableRecordsForEmail('referrals', 'referrer_email', email, 'referidos (como referente)');

  // 6. Eliminar referidos (donde el usuario fue referido)
  await deleteTableRecordsForEmail('referrals', 'referred_email', email, 'referidos (como referido)');

  // 7. Eliminar comisiones de referidos (donde recibe)
  await deleteTableRecordsForEmail('referral_commissions', 'to_email', email, 'comisiones recibidas');

  // 8. Eliminar comisiones de referidos (donde envía)
  await deleteTableRecordsForEmail('referral_commissions', 'from_email', email, 'comisiones enviadas');

  // 9. Eliminar el usuario
  try {
    const { data: userRecords, error: fetchErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', email);

    if (fetchErr) {
      console.warn(`  ⚠️  Error consultando usuario ${email}: ${fetchErr.message}`);
      return;
    }

    if (!userRecords || userRecords.length === 0) {
      console.log(`  ❌ Usuario no encontrado en la BD`);
      return;
    }

    const ids = userRecords.map(r => r.id);
    const { error: delErr } = await supabase
      .from('users')
      .delete()
      .in('id', ids);

    if (delErr) {
      console.warn(`  ⚠️  Error eliminando usuario ${email}: ${delErr.message}`);
    } else {
      console.log(`  ✅ Usuario eliminado (${ids.length} registro(s))`);
    }
  } catch (err) {
    console.warn(`  ⚠️  Error al eliminar usuario ${email}: ${err.message}`);
  }
}

async function main() {
  const isForce = process.argv.includes('--force');

  console.log('========================================');
  console.log('  Eliminación de usuarios específicos');
  console.log(`  Proyecto: ${projectRef}`);
  console.log('========================================');
  console.log(`\n📋 ${EMAILS_TO_DELETE.length} correos a procesar`);
  console.log('');

  if (!isForce) {
    console.log('⚠️  ESTA ACCIÓN NO SE PUEDE DESHACER.');
    console.log('   Se eliminarán permanentemente los siguientes usuarios:');
    for (const email of EMAILS_TO_DELETE) {
      console.log(`   • ${email}`);
    }
    console.log('');
    console.log('Para continuar, ejecuta con --force: node scripts/delete-specific-users.mjs --force');
    console.log('O presiona Ctrl+C para cancelar.');
    process.exit(0);
  }

  console.log('🚀 Iniciando eliminación...\n');

  // ─── 1. Primero, identificar los IDs de los usuarios ─────
  console.log('🔍 Buscando usuarios en Supabase...');
  const userMap = new Map(); // email → { id, full_name }

  for (const email of EMAILS_TO_DELETE) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('email', email);

      if (error) {
        console.warn(`  ⚠️  Error al buscar ${email}: ${error.message}`);
        continue;
      }

      if (data && data.length > 0) {
        userMap.set(email, data[0]);
      }
    } catch (err) {
      console.warn(`  ⚠️  Error al buscar ${email}: ${err.message}`);
    }
  }

  console.log(`\n📊 ${userMap.size} usuarios encontrados de ${EMAILS_TO_DELETE.length} solicitados`);

  if (userMap.size === 0) {
    console.log('\n❌ No se encontraron usuarios. Saliendo.');
    return;
  }

  // Mostrar los que se encontraron
  console.log('\n📋 Usuarios encontrados:');
  for (const [email, user] of userMap) {
    console.log(`   ✅ ${email} — ${user.full_name || 'sin nombre'} (${user.id})`);
  }

  // Mostrar los que no se encontraron
  const notFound = EMAILS_TO_DELETE.filter(e => !userMap.has(e));
  if (notFound.length > 0) {
    console.log('\n⚠️  Usuarios NO encontrados (pueden no existir o ya estar eliminados):');
    for (const email of notFound) {
      console.log(`   • ${email}`);
    }
  }

  // ─── 2. Eliminar datos de cada usuario ─────────────────
  console.log('\n' + '─'.repeat(50));
  console.log('🗑️  Eliminando datos...');
  console.log('─'.repeat(50));

  let successCount = 0;
  for (const [email] of userMap) {
    try {
      await deleteUserData(email);
      successCount++;
    } catch (err) {
      console.error(`  ❌ Error procesando ${email}: ${err.message}`);
    }
  }

  // ─── 3. Resumen ────────────────────────────────────────
  console.log('\n' + '='.repeat(40));
  console.log('📊 RESUMEN FINAL');
  console.log('='.repeat(40));
  console.log(`  Solicitados:     ${EMAILS_TO_DELETE.length}`);
  console.log(`  Encontrados:     ${userMap.size}`);
  console.log(`  Eliminados:      ${successCount}`);
  console.log(`  No encontrados:  ${notFound.length}`);
  if (notFound.length > 0) {
    console.log('\n  Usuarios no encontrados:');
    for (const email of notFound) {
      console.log(`    • ${email}`);
    }
  }
  console.log('\n✅ Proceso completado.');
}

main().catch(err => {
  console.error('\n❌ Error inesperado:', err);
  process.exit(1);
});
