/**
 * Migración: agregar columnas original_stock, original_sizes y selected_size
 *
 * Uso: node scripts/run-migration.js
 *
 * NOTA: Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env
 * La anon key DEBE tener permisos para ejecutar SQL (service_role recomendado para migraciones).
 * Si falla con la anon key, ejecuta manualmente el SQL en el SQL Editor.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Cargar .env manualmente (dotenv no está instalado)
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

// Extraer el project ref de la URL
const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1] || 'unknown';

console.log(`🔧 Proyecto: ${projectRef}`);
console.log('');

const MIGRATION_SQL = `
-- ============================================================
-- MIGRACIÓN: Sistema de tallas y stock dinámico
-- ============================================================
-- 1. Agregar columnas a prizes
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS original_stock INTEGER DEFAULT 0;
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS original_sizes JSONB DEFAULT NULL;
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT NULL;
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS selected_size TEXT; -- legacy, se mueve a redemptions

-- 2. Agregar selected_size a redemptions (donde debe estar)
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS selected_size TEXT;

-- 3. Índice para consultas de stock dinámico
CREATE INDEX IF NOT EXISTS idx_redemptions_prize_status ON redemptions(prize_id, status);

-- 4. Migrar datos existentes: original_stock = units_available + redemptions_activas
--    (solo para premios que no tengan ya original_stock)
UPDATE prizes p
SET original_stock = COALESCE(p.units_available, 0) + (
  SELECT COUNT(*) FROM redemptions r
  WHERE r.prize_id = p.id AND r.status IN ('pending', 'approved', 'delivered')
)
WHERE p.original_stock IS NULL OR p.original_stock = 0;

-- 5. Migrar original_sizes desde el campo sizes existente
UPDATE prizes
SET original_sizes = sizes
WHERE (original_sizes IS NULL) AND sizes IS NOT NULL;

-- 6. Migrar selected_size desde prizes hacia redemptions (si existe en prizes legacy)
--    (No hay forma de saber a qué redención pertenecía, así que esto es informativo)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prizes' AND column_name = 'selected_size') THEN
    ALTER TABLE prizes DROP COLUMN IF EXISTS selected_size;
  END IF;
END $$;

SELECT '✅ Migración completada' as resultado;
`;

async function main() {
  console.log('🚀 Ejecutando migración SQL contra Supabase...');
  console.log('');

  // Probar conexión primero
  console.log('📡 Probando conexión...');
  const { data: testData, error: testError } = await supabase
    .from('prizes')
    .select('id')
    .limit(1);

  if (testError) {
    console.error('❌ Error de conexión:', testError.message);
    console.log('');
    console.log('⚠️  No se pudo conectar con la anon key.');
    console.log('   La migración requiere permisos elevados (SQL).');
    console.log('');
    console.log('👉 Ejecuta manualmente el SQL en:');
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    console.log('');
    console.log('📋 SQL a ejecutar:');
    console.log('─'.repeat(50));
    console.log(MIGRATION_SQL);
    process.exit(1);
  }

  console.log('✅ Conexión exitosa. Intentando ejecutar SQL...');

  // Intentar ejecutar SQL vía rpc (requiere que exista pg_query)
  try {
    const { data, error } = await supabase.rpc('pg_query', {
      query_text: MIGRATION_SQL
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log('✅ Migración ejecutada exitosamente.');
    console.log('Resultado:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.log('⚠️  No se pudo ejecutar SQL vía RPC.');
    console.log('   (La función pg_query no existe o no tienes permisos)');
    console.log('');
    console.log('👉 Ejecuta manualmente el SQL en el SQL Editor:');
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    console.log('');
    console.log('📋 SQL a ejecutar:');
    console.log('─'.repeat(50));
    console.log(MIGRATION_SQL);
    console.log('─'.repeat(50));
    console.log('');
    console.log('Alternativa: usa el botón de abajo para abrir el SQL Editor directamente.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
