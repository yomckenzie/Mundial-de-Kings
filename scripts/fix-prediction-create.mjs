import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, '..', 'src', 'lib', 'db.js');

let content = readFileSync(filePath, 'utf-8');

// Replace the update-existing-prediction logic
const oldBlock = `      // Evitar duplicados: un solo pronóstico por usuario por partido
      const existing = d.predictions.find(p => p.user_email === data.user_email && p.match_id === data.match_id);
      if (existing) {
        // Actualizar el existente en lugar de crear duplicado
        Object.assign(existing, data, { updated_at: getNow() });
        db._persist('predictions');
        return existing;
      }`;

const newBlock = `      // Evitar duplicados: un solo pronóstico por usuario por partido
      // Si ya existe, se devuelve sin modificar — el usuario no puede editar
      const existing = d.predictions.find(p => p.user_email === data.user_email && p.match_id === data.match_id);
      if (existing) {
        return existing;
      }`;

if (content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  writeFileSync(filePath, content, 'utf-8');
  console.log('✅ predictions.create() updated successfully');
} else {
  console.log('❌ Could not find the target block. Checking for partial match...');
  if (content.includes('Actualizar el existente en lugar de crear duplicado')) {
    console.log('   Found partial match - attempting direct replacement...');
    content = content.replace(
      /\/\/ Actualizar el existente en lugar de crear duplicado\s*\n\s*Object\.assign\(existing, data, \{ updated_at: getNow\(\) \}\);\s*\n\s*db\._persist\('predictions'\);\s*\n/,
      ''
    );
    writeFileSync(filePath, content, 'utf-8');
    console.log('✅ Fallback replacement completed');
  } else {
    console.log('❌ No matching code found at all');
  }
}
