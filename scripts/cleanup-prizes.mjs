/**
 * Script de limpieza de premios duplicados en Supabase.
 * 
 * Uso:
 *   node scripts/cleanup-prizes.mjs
 * 
 * Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env
 * 
 * Este script:
 * 1. Consulta todos los premios en Supabase
 * 2. Agrupa por nombre (case-insensitive)
 * 3. Conserva el más antiguo de cada grupo
 * 4. Elimina los duplicados
 * 5. Reporta resultados
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanupPrizes() {
  console.log('🔍 Consultando premios en Supabase...\n');

  // 1. Obtener todos los premios
  const { data: prizes, error } = await supabase
    .from('prizes')
    .select('*')
    .order('created_date', { ascending: true });

  if (error) {
    console.error('❌ Error al consultar premios:', error.message);
    process.exit(1);
  }

  console.log(`📊 Total de premios en Supabase: ${prizes.length}\n`);

  if (prizes.length === 0) {
    console.log('✅ No hay premios que limpiar.');
    return;
  }

  // 2. Agrupar por nombre (case-insensitive)
  const groups = {};
  for (const p of prizes) {
    const key = (p.name || '').toLowerCase().trim();
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  // 3. Identificar duplicados
  const toDelete = [];
  const toKeep = [];
  let totalDeleted = 0;

  for (const [name, group] of Object.entries(groups)) {
    if (group.length <= 1) {
      toKeep.push(group[0]);
      continue;
    }

    // Ordenar por created_date (más antiguo primero), luego por id
    group.sort((a, b) => {
      const aTime = new Date(a.created_date || 0).getTime();
      const bTime = new Date(b.created_date || 0).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return (a.id || '').localeCompare(b.id || '');
    });

    const keep = group[0];
    toKeep.push(keep);
    for (const p of group.slice(1)) {
      toDelete.push(p.id);
    }

    totalDeleted += group.length - 1;
    console.log(`  "${name}": ${group.length} copias → conservando ${keep.id}, eliminando ${group.length - 1}`);
  }

  if (toDelete.length === 0) {
    console.log('\n✅ No hay premios duplicados.');
    return;
  }

  console.log(`\n🗑️  Eliminando ${toDelete.length} premios duplicados...`);

  // 4. Eliminar en batches
  const BATCH = 50;
  let deleted = 0;
  let errors = 0;

  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    const { error: delError } = await supabase
      .from('prizes')
      .delete()
      .in('id', batch);

    if (delError) {
      console.error(`  ❌ Error en batch ${i / BATCH + 1}:`, delError.message);
      errors++;
    } else {
      deleted += batch.length;
      console.log(`  ✅ Batch ${i / BATCH + 1}: ${batch.length} eliminados`);
    }
  }

  console.log(`\n📊 Resumen:`);
  console.log(`  Total original: ${prizes.length}`);
  console.log(`  Conservados: ${toKeep.length}`);
  console.log(`  Eliminados: ${deleted}`);
  if (errors > 0) console.log(`  Errores: ${errors}`);
  console.log(`  Restantes: ${prizes.length - deleted}`);
  console.log('\n✅ Limpieza completada.');
}

cleanupPrizes().catch(console.error);
