import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const BUCKET = 'banners';
// Nombres/rutas de los banners actualmente en uso (los viejos a borrar)
const OLD_BANNER_PATHS = [
  '1779747733118_eomu63.jpg',
  '1779747739288_tr78xa.jpg',
  '1779747734244_a9v85b.jpg',
  '1779747744244_a9v85b.jpg',
];

async function main() {
  console.log('📂 Listando archivos en el bucket "' + BUCKET + '"...\n');

  // Listar todos los archivos (paginando si hace falta)
  const { data: files, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

  if (listErr) {
    console.error('❌ Error listando:', listErr.message);
    return;
  }

  if (!files || files.length === 0) {
    console.log('(bucket vacío)');
    return;
  }

  console.log(`Encontrados: ${files.length} archivo(s)\n`);
  for (const f of files) {
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(f.name);
    const isOld = OLD_BANNER_PATHS.includes(f.name);
    const marker = isOld ? '🗑️  [VIEJO]' : '✨ [NUEVO]';
    console.log(`${marker} ${f.name}`);
    console.log(`     URL: ${urlData.publicUrl}\n`);
  }

  // Borrar los viejos
  const oldOnes = files.filter(f => OLD_BANNER_PATHS.includes(f.name));
  if (oldOnes.length === 0) {
    console.log('ℹ️  Ninguno de los banners viejos está en el bucket. ¿Ya los borraste?');
    return;
  }

  const toDelete = oldOnes.map(f => f.name);
  console.log(`\n🗑️  Borrando ${toDelete.length} banner(s) viejo(s):`, toDelete);

  const { data: removed, error: delErr } = await supabase.storage
    .from(BUCKET)
    .remove(toDelete);

  if (delErr) {
    console.error('❌ Error borrando:', delErr.message);
    return;
  }

  console.log('✅ Borrados:', removed?.map(r => r.name).join(', '));

  // Mostrar URLs finales de los que quedan
  const remaining = files.filter(f => !OLD_BANNER_PATHS.includes(f.name));
  console.log(`\n📋 URLs de los banners que quedan en el bucket (copiá estas):\n`);
  for (const f of remaining) {
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(f.name);
    console.log(`  '${urlData.publicUrl}',`);
  }
}

main().catch(console.error);
