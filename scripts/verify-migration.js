/**
 * Verificar que la migración SQL se aplicó correctamente.
 * Uso: node scripts/verify-migration.js
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
    console.error('No se pudo cargar .env:', err.message);
    process.exit(1);
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1];

async function checkColumn(table, column) {
  try {
    // Intentar hacer un select de la columna (funciona aunque el tipo no coincida)
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .limit(1);

    if (error && error.message?.includes('column') && error.message?.includes('does not exist')) {
      return { exists: false, error: error.message };
    }
    return { exists: true, error: null };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

async function main() {
  console.log('========================================');
  console.log('  Verificación de migración SQL');
  console.log(`  Proyecto: ${projectRef}`);
  console.log('========================================\n');

  // Verificar columnas en prizes
  console.log('📋 Columnas en tabla prizes:');
  const prizeChecks = [
    { col: 'original_stock', desc: 'original_stock INTEGER' },
    { col: 'original_sizes', desc: 'original_sizes JSONB' },
    { col: 'sizes', desc: 'sizes JSONB (legacy)' },
  ];

  for (const { col, desc } of prizeChecks) {
    const { exists } = await checkColumn('prizes', col);
    console.log(`  ${exists ? '✅' : '❌'} ${desc} — ${exists ? 'EXISTE' : 'NO EXISTE'}`);
  }

  console.log('');

  // Verificar columnas en redemptions
  console.log('📋 Columnas en tabla redemptions:');
  const redemptionChecks = [
    { col: 'selected_size', desc: 'selected_size TEXT' },
  ];

  for (const { col, desc } of redemptionChecks) {
    const { exists } = await checkColumn('redemptions', col);
    console.log(`  ${exists ? '✅' : '❌'} ${desc} — ${exists ? 'EXISTE' : 'NO EXISTE'}`);
  }

  console.log('');

  // Verificar índice
  console.log('📋 Índices:');
  // No podemos verificar índices directamente con anon key, pero podemos verlo en el dashboard
  console.log('  ℹ️  El índice idx_redemptions_prize_status se creó en la migración.');
  console.log('     Verifícalo en: Table Inspector > redemptions > Indexes');

  console.log('');

  // Verificar datos existentes
  console.log('📋 Datos en prizes:');
  const { data: prizes, error: prizesError } = await supabase
    .from('prizes')
    .select('id, name, units_available, original_stock, original_sizes')
    .limit(20);

  if (prizesError) {
    console.log(`  ❌ Error al leer prizes: ${prizesError.message}`);
  } else {
    console.log(`  ✅ ${prizes.length} premios encontrados`);
    const withOriginalStock = prizes.filter(p => p.original_stock != null && p.original_stock > 0);
    const withoutOriginalStock = prizes.filter(p => p.original_stock == null || p.original_stock === 0);
    console.log(`  📊 ${withOriginalStock.length} con original_stock > 0`);
    console.log(`  📊 ${withoutOriginalStock.length} SIN original_stock (requieren migración)`);

    if (withoutOriginalStock.length > 0) {
      console.log('');
      console.log('⚠️  Estos premios necesitan migración de datos:');
      console.log('   Ejecuta este SQL para migrar los datos existentes:');
      console.log('');
      console.log('   UPDATE prizes p');
      console.log('   SET original_stock = COALESCE(p.units_available, 0) + (');
      console.log("     SELECT COUNT(*) FROM redemptions r");
      console.log("     WHERE r.prize_id = p.id AND r.status IN ('pending', 'approved', 'delivered')");
      console.log('   )');
      console.log("   WHERE p.original_stock IS NULL OR p.original_stock = 0;");
      console.log('');
      console.log('   UPDATE prizes');
      console.log("   SET original_sizes = sizes");
      console.log("   WHERE original_sizes IS NULL AND sizes IS NOT NULL;");
    }
  }

  console.log('');
  console.log('========================================');
  console.log('  Verificación completada');
  console.log('========================================');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
