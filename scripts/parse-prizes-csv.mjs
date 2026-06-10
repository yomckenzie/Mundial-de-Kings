/**
 * Procesa el CSV de premios, deduplica por nombre y genera
 * el array STATIC_PRIZES listo para copiar a Prizes.jsx
 */
import { readFileSync, writeFileSync } from 'fs';

const csv = readFileSync(new URL('../prizes_backup_20260610_rows.csv', import.meta.url), 'utf-8');
const lines = csv.trim().split('\n');
const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

// Parsear CSV respetando comillas
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const rows = lines.slice(1).map(line => {
  const vals = parseCSVLine(line);
  const row = {};
  headers.forEach((h, i) => row[h] = vals[i] || '');
  return row;
});

console.log(`📊 Total filas en CSV: ${rows.length}`);

// Agrupar por nombre (case-insensitive, trimmed)
const groups = {};
for (const r of rows) {
  const key = r.name.toLowerCase().trim();
  if (!groups[key]) groups[key] = [];
  groups[key].push(r);
}

console.log(`📦 Productos únicos: ${Object.keys(groups).length}\n`);

const gradients = [
  'from-emerald-600 to-emerald-800',
  'from-amber-500 to-orange-700',
  'from-violet-600 to-purple-900',
  'from-pink-500 to-rose-800',
  'from-cyan-500 to-blue-800',
  'from-blue-600 to-indigo-800',
  'from-rose-500 to-red-800',
  'from-teal-500 to-green-800',
  'from-orange-500 to-red-700',
  'from-sky-500 to-blue-800',
  'from-lime-500 to-green-700',
  'from-fuchsia-500 to-purple-800',
];

// Generar STATIC_PRIZES
const staticPrizes = [];
let gIdx = 0;

for (const [nameKey, group] of Object.entries(groups)) {
  // Ordenar por created_date (más reciente primero, asume que tiene mejor info)
  group.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  
  // Tomar el más reciente como base
  const prize = group[0];
  
  // Sumar stock total
  let totalStock = 0;
  const sizes = {};
  for (const g of group) {
    const stock = parseInt(g.units_available) || 0;
    totalStock += stock;
    
    // Parsear sizes del campo original_sizes (formato PostgreSQL: {"S": 5, "M": 10})
    if (g.original_sizes && g.original_sizes !== '') {
      try {
        const parsed = JSON.parse(g.original_sizes.replace(/{/g, '{').replace(/}/g, '}'));
        for (const [size, qty] of Object.entries(parsed)) {
          sizes[size] = (sizes[size] || 0) + (parseInt(qty) || 0);
        }
      } catch {}
    }
    
    // También intentar extraer tallas de la descripción
    if (g.description) {
      const sizeMatch = g.description.match(/Talla\s+([A-Za-z0-9]+)\s*(?:\(|:)?\s*(\d+)/gi);
      if (sizeMatch) {
        for (const m of sizeMatch) {
          const parts = m.match(/Talla\s+([A-Za-z0-9]+)\s*(?:\(|:)?\s*(\d+)/i);
          if (parts) {
            sizes[parts[1].toUpperCase()] = (sizes[parts[1].toUpperCase()] || 0) + (parseInt(parts[2]) || 0);
          }
        }
      }
    }
  }

  // Limpiar nombre (quitar comillas extra, espacios)
  const cleanName = prize.name.replace(/^"|"$/g, '').trim();
  
  // Precio: usar el del registro principal
  const pointsCost = parseInt(prize.points_cost) || 100;
  
  // Descripción: usar la del registro principal o generar una
  let description = prize.description ? prize.description.replace(/"/g, '').trim() : '';
  if (!description) {
    description = `Producto oficial Chess King. ${Object.keys(sizes).length > 0 ? 'Disponible en varias tallas.' : ''}`.trim();
  }

  // URL de imagen
  const imageUrl = prize.image_url || '';

  staticPrizes.push({
    id: `premio-${nameKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    name: cleanName,
    description: description.substring(0, 200), // limitar longitud
    points_cost: pointsCost,
    units_available: totalStock || 1,
    status: 'active',
    image_url: imageUrl,
    gradient: gradients[gIdx % gradients.length],
    icon: '🎁',
    sizes: Object.keys(sizes).length > 0 ? sizes : null,
  });

  gIdx++;
}

// Generar código JS
let output = '// GENERATED STATIC_PRIZES\n';
output += 'const STATIC_PRIZES = [\n';
for (const p of staticPrizes) {
  const sizesStr = p.sizes ? JSON.stringify(p.sizes) : 'null';
  output += `  {\n`;
  output += `    id: '${p.id}',\n`;
  output += `    name: '${p.name.replace(/'/g, "\\'")}',\n`;
  output += `    description: '${p.description.replace(/'/g, "\\'").replace(/\n/g, ' ')}',\n`;
  output += `    points_cost: ${p.points_cost},\n`;
  output += `    units_available: ${p.units_available},\n`;
  output += `    status: '${p.status}',\n`;
  output += `    image_url: '${p.image_url}',\n`;
  output += `    gradient: '${p.gradient}',\n`;
  output += `    icon: '🎁',\n`;
  output += `    sizes: ${sizesStr},\n`;
  output += `  },\n`;
}
output += '];\n\n';
output += `// Total: ${staticPrizes.length} premios únicos\n`;

writeFileSync('scripts/generated-prizes.js', output);
console.log(output);
console.log(`\n✅ Generados ${staticPrizes.length} premios únicos`);
