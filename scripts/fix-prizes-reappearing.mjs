/**
 * Fix definitivo para premios que reaparecen.
 *
 * 1. Obtiene TODOS los IDs de premios de Supabase
 * 2. Los elimina en batches
 * 3. Agrega los IDs a deleted_ids en app_settings (para que el watermark los bloquee)
 * 4. Elimina el array de premios de localStorage local (chessking_db.json si existe)
 * 5. Verifica que no queden residuos
 *
 * Uso:
 *   node scripts/fix-prizes-reappearing.mjs --force
 *
 * Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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
      if (key.startsWith('VITE_')) process.env[key] = val;
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
const BATCH_SIZE = 50;

async function getAllPrizeIds() {
  const { data, error } = await supabase
    .from('prizes')
    .select('id, name')
    .limit(5000);

  if (error) throw new Error(`Error fetching prizes: ${error.message}`);
  return data || [];
}

async function deletePrizeBatch(ids) {
  const { error } = await supabase
    .from('prizes')
    .delete()
    .in('id', ids);

  if (error) throw new Error(`Error deleting batch: ${error.message}`);
}

async function getExistingDeletedIds() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('id, value')
      .eq('key', 'deleted_ids')
      .limit(1);

    if (error) return { existing: null, ids: [] };
    if (data && data.length > 0) {
      try {
        const parsed = JSON.parse(data[0].value);
        return { existing: data[0], ids: Array.isArray(parsed) ? parsed : [] };
      } catch {
        return { existing: data[0], ids: [] };
      }
    }
    return { existing: null, ids: [] };
  } catch {
    return { existing: null, ids: [] };
  }
}

async function updateDeletedIds(prizeIds) {
  const { existing, ids } = await getExistingDeletedIds();
  const newEntries = prizeIds.map(id => `prizes:${id}`);
  const merged = [...new Set([...ids, ...newEntries])];

  if (existing) {
    const { error } = await supabase
      .from('app_settings')
      .update({ value: JSON.stringify(merged) })
      .eq('id', existing.id);
    if (error) console.warn(`⚠️  Error actualizando deleted_ids: ${error.message}`);
    else console.log(`   ✅ deleted_ids actualizado (${merged.length} entradas totales)`);
  } else {
    const { error } = await supabase
      .from('app_settings')
      .insert({
        id: `deleted_ids_${Date.now()}`,
        key: 'deleted_ids',
        value: JSON.stringify(merged),
      });
    if (error) console.warn(`⚠️  Error creando deleted_ids: ${error.message}`);
    else console.log(`   ✅ deleted_ids creado (${merged.length} entradas)`);
  }
}

async function setLastCleanTimestamp() {
  const now = new Date().toISOString();
  const { data: existingSettings } = await supabase
    .from('app_settings')
    .select('id')
    .eq('key', 'last_clean');

  if (existingSettings && existingSettings.length > 0) {
    const { error } = await supabase
      .from('app_settings')
      .update({ value: now })
      .eq('id', existingSettings[0].id);
    if (error) console.warn(`⚠️  Error actualizando last_clean: ${error.message}`);
  } else {
    const { error } = await supabase
      .from('app_settings')
      .insert({ id: `last_clean_${Date.now()}`, key: 'last_clean', value: now });
    if (error) console.warn(`⚠️  Error creando last_clean: ${error.message}`);
  }
  console.log(`   ✅ last_clean actualizado: ${now}`);
}

function clearLocalStoragePrizes() {
  // Intentar limpiar prizes del archivo chessking_db.json si existe
  const dbPath = resolve(projectRoot, 'chessking_db.json');
  if (existsSync(dbPath)) {
    try {
      const raw = readFileSync(dbPath, 'utf-8');
      const data = JSON.parse(raw);
      if (data.prizes && data.prizes.length > 0) {
        console.log(`   🗑️  Limpiando ${data.prizes.length} premios del archivo local`);
        data.prizes = [];
        writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log('   ✅ chessking_db.json actualizado');
      } else {
        console.log('   ℹ️  No hay premios en chessking_db.json');
      }
    } catch (err) {
      console.log(`   ℹ️  No se pudo leer chessking_db.json: ${err.message}`);
    }
  } else {
    console.log('   ℹ️  No hay archivo chessking_db.json local');
  }
}

async function verifyCleanup(originalCount) {
  console.log('\n🔍 Verificando post-limpieza...');
  const remaining = await getAllPrizeIds();
  if (remaining.length === 0) {
    console.log(`   ✅ Supabase: 0 premios restantes (se eliminaron ${originalCount})`);
    return true;
  } else {
    console.log(`   ⚠️  Quedan ${remaining.length} premios en Supabase`);
    for (const p of remaining) {
      console.log(`      • ${p.name} (${p.id})`);
    }
    return false;
  }
}

async function main() {
  if (!process.argv.includes('--force')) {
    console.log('⚠️  Este script ELIMINARÁ todos los premios de Supabase');
    console.log('   y marcará sus IDs como permanentemente eliminados.');
    console.log('');
    console.log('Ejecuta con --force para continuar:');
    console.log('  node scripts/fix-prizes-reappearing.mjs --force');
    process.exit(0);
  }

  console.log('========================================');
  console.log('  Fix: Premios que reaparecen');
  console.log('========================================\n');

  // Paso 1: Obtener premios actuales
  console.log('🔍 Obteniendo premios actuales...');
  const prizes = await getAllPrizeIds();
  console.log(`   📊 ${prizes.length} premios encontrados\n`);

  if (prizes.length === 0) {
    console.log('✅ No hay premios que eliminar.');
    // Aún así, asegurar que last_clean existe
    console.log('\n📝 Actualizando last_clean...');
    await setLastCleanTimestamp();
    console.log('\n✅ Todo listo.');
    return;
  }

  // Paso 2: Mostrar premios
  console.log('📋 Premios a eliminar:');
  for (const p of prizes) {
    console.log(`   • ${p.name} (${p.id})`);
  }

  // Paso 3: Eliminar en batches
  const allIds = prizes.map(p => p.id);
  console.log('\n🗑️  Eliminando de Supabase...');

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE);
    try {
      await deletePrizeBatch(batch);
      console.log(`   ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} eliminados`);
    } catch (err) {
      console.error(`   ❌ Error en batch: ${err.message}`);
    }
  }

  // Paso 4: Marcar IDs como eliminados permanentemente
  console.log('\n📝 Marcando IDs como eliminados permanentemente...');
  await updateDeletedIds(allIds);

  // Paso 5: Actualizar last_clean
  console.log('\n📝 Actualizando timestamp de limpieza...');
  await setLastCleanTimestamp();

  // Paso 6: Limpiar archivo local
  console.log('\n📝 Limpiando datos locales...');
  clearLocalStoragePrizes();

  // Paso 7: Verificar
  const verified = await verifyCleanup(prizes.length);

  console.log('\n' + '='.repeat(40));
  if (verified) {
    console.log('✅ Fix completado exitosamente.');
    console.log('');
    console.log('📌 Próximos pasos:');
    console.log('   1. Recarga la página en el navegador');
    console.log('   2. El sync FROM limpiará los premios del localStorage');
    console.log('   3. Los IDs eliminados evitan que se re-suban');
    console.log('   4. Crea premios nuevos desde el panel admin cuando quieras');
  } else {
    console.log('⚠️  Quedaron residuos. Revisa los mensajes anteriores.');
  }
  console.log('='.repeat(40));
}

main().catch(err => {
  console.error('\n❌ Error inesperado:', err);
  process.exit(1);
});
