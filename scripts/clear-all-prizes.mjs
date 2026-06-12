/**
 * Elimina TODOS los premios de Supabase para empezar de 0.
 * No hay canjes activos, así que es seguro.
 *
 * Uso:
 *   node scripts/clear-all-prizes.mjs --force
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
const BATCH_SIZE = 50;

async function getAllPrizeIds() {
  const { data, error } = await supabase
    .from('prizes')
    .select('id, name')
    .limit(5000);

  if (error) throw new Error(error.message);
  return data || [];
}

async function deletePrizeBatch(ids) {
  const { error } = await supabase
    .from('prizes')
    .delete()
    .in('id', ids);

  if (error) throw new Error(error.message);
}

async function main() {
  if (!process.argv.includes('--force')) {
    console.log('⚠️  Este script ELIMINARÁ TODOS los premios de Supabase.');
    console.log('');
    console.log('Ejecuta con --force para continuar:');
    console.log('  node scripts/clear-all-prizes.mjs --force');
    process.exit(0);
  }

  console.log('========================================');
  console.log('  Eliminación total de premios');
  console.log('========================================\n');

  // 1. Obtener todos los IDs
  console.log('🔍 Obteniendo lista de premios...');
  const prizes = await getAllPrizeIds();
  console.log(`📊 Total premios encontrados: ${prizes.length}\n`);

  if (prizes.length === 0) {
    console.log('✅ No hay premios que eliminar.');
    return;
  }

  // 2. Mostrar preview
  console.log('📋 Premios a eliminar:');
  for (const p of prizes) {
    console.log(`   • ${p.name} (${p.id})`);
  }

  // 3. Eliminar en batches
  const allIds = prizes.map(p => p.id);
  let totalDeleted = 0;

  console.log('\n🗑️  Eliminando...');
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE);
    try {
      await deletePrizeBatch(batch);
      totalDeleted += batch.length;
      console.log(`   ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} eliminados`);
    } catch (err) {
      console.error(`   ❌ Error en batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
    }
  }

  // 4. Verificación
  console.log('\n🔍 Verificando...');
  const remaining = await getAllPrizeIds();
  if (remaining.length === 0) {
    console.log('✅ Todos los premios fueron eliminados correctamente.');
  } else {
    console.log(`⚠️  Quedan ${remaining.length} premios. Intentando de nuevo...`);
    const remainingIds = remaining.map(r => r.id);
    for (let i = 0; i < remainingIds.length; i += BATCH_SIZE) {
      const batch = remainingIds.slice(i, i + BATCH_SIZE);
      await deletePrizeBatch(batch);
    }
    const finalCheck = await getAllPrizeIds();
    console.log(`   Residuo final: ${finalCheck.length} premios`);
  }

  console.log(`\n📊 Total eliminados: ${totalDeleted} premios`);
  console.log('✅ Proceso completado.');
}

main().catch(err => {
  console.error('\n❌ Error inesperado:', err);
  process.exit(1);
});
