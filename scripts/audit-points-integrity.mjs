/**
 * Auditoría del RANKING (SOLO LECTURA).
 *
 * El ranking ordena por prediction_points. Regla del código:
 *   prediction_points = 100 × partidos distintos con predicción scored + correcta
 *
 * Verifica:
 *  1. prediction_points en BD vs aciertos reales recontados
 *  2. is_correct coherente con el resultado real del partido
 *  3. predicciones duplicadas (user_email, match_id)
 *  4. predicciones de admins (no deberían existir)
 *  5. partidos terminados con predicciones sin evaluar
 *
 * Uso: node scripts/audit-points-integrity.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function loadEnv() {
  const content = readFileSync(resolve(projectRoot, '.env'), 'utf-8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function fetchAll(table, select = '*') {
  const PAGE = 1000;
  let rows = [], from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) { console.error(`❌ Error leyendo ${table}:`, error.message); return rows; }
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

const [users, predictions, matches] = await Promise.all([
  fetchAll('users'),
  fetchAll('predictions'),
  fetchAll('matches'),
]);

console.log('=== CONTEOS ===');
console.log({ users: users.length, predictions: predictions.length, matches: matches.length });

const admins = new Set(users.filter(u => u.role === 'admin').map(u => u.email));
const matchById = new Map(matches.map(m => [m.id, m]));

// ── 1. Predicciones duplicadas (user_email, match_id) ──
const predKey = new Map();
const dupPreds = [];
for (const p of predictions) {
  if (!p.user_email || !p.match_id) continue;
  const k = `${p.user_email}|${p.match_id}`;
  if (predKey.has(k)) dupPreds.push({ key: k, ids: [predKey.get(k).id, p.id] });
  else predKey.set(k, p);
}

// ── 2. Predicciones de admins ──
const adminPreds = predictions.filter(p => admins.has(p.user_email));

// ── 3. is_correct coherente con resultado del partido ──
const wrongScoring = [];
const scoredWithoutResult = [];
const finishedUnscored = [];
for (const p of predictions) {
  const m = p.match_id ? matchById.get(p.match_id) : null;
  if (!m) continue;
  const hasResult = m.result_team1 != null && m.result_team2 != null;
  if (p.scored && !hasResult) scoredWithoutResult.push({ pred: p.id, match: m.id, user: p.user_email });
  if (p.scored && hasResult) {
    const expect = p.pred_team1 === m.result_team1 && p.pred_team2 === m.result_team2;
    if (Boolean(p.is_correct) !== expect) {
      wrongScoring.push({ pred: p.id, user: p.user_email, match: `${m.team1} vs ${m.team2}`,
        pred_score: `${p.pred_team1}-${p.pred_team2}`, result: `${m.result_team1}-${m.result_team2}`,
        is_correct_en_bd: p.is_correct, deberia_ser: expect });
    }
    if (p.is_correct && (p.points_earned || 0) !== 100) {
      wrongScoring.push({ pred: p.id, user: p.user_email, issue: `points_earned=${p.points_earned} (esperado 100)` });
    }
  }
  if (!p.scored && hasResult && (m.status === 'finished' || m.status === 'completed')) {
    finishedUnscored.push({ pred: p.id, user: p.user_email, match: `${m.team1} vs ${m.team2}` });
  }
}

// ── 4. prediction_points vs aciertos reales (deduplicado por match, como hace el código) ──
const correctByUser = new Map();
for (const p of predictions) {
  if (!(p.scored && p.is_correct)) continue;
  if (!correctByUser.has(p.user_email)) correctByUser.set(p.user_email, new Set());
  correctByUser.get(p.user_email).add(p.match_id || '__nomatch__');
}

const issues = [];
for (const u of users) {
  if (u.role === 'admin') continue;
  const aciertos = correctByUser.get(u.email)?.size || 0;
  const esperado = aciertos * 100;
  const enBD = u.prediction_points || 0;
  if (enBD !== esperado) {
    issues.push({ email: u.email, name: u.full_name, prediction_points_BD: enBD,
      aciertos, esperado, diferencia: enBD - esperado });
  }
}

// ── Ranking actual vs ranking correcto ──
const nonAdmins = users.filter(u => u.role !== 'admin');
const rankBD = [...nonAdmins].sort((a, b) => (b.prediction_points || 0) - (a.prediction_points || 0));
const rankReal = [...nonAdmins].sort((a, b) =>
  (correctByUser.get(b.email)?.size || 0) - (correctByUser.get(a.email)?.size || 0));

const section = (title, arr) => {
  console.log(`\n=== ${title}: ${arr.length} ===`);
  for (const x of arr.slice(0, 30)) console.log(JSON.stringify(x));
  if (arr.length > 30) console.log(`... y ${arr.length - 30} más`);
};

section('PREDICCIONES DUPLICADAS (user+match)', dupPreds);
section('PREDICCIONES DE ADMINS', adminPreds.map(p => ({ id: p.id, user: p.user_email, match: p.match_id })));
section('SCORING INCOHERENTE (is_correct vs resultado)', wrongScoring);
section('SCORED SIN RESULTADO EN PARTIDO', scoredWithoutResult);
section('PARTIDO TERMINADO PERO PREDICCIÓN SIN EVALUAR', finishedUnscored);
section('USUARIOS CON prediction_points INCORRECTOS', issues);

console.log('\n=== TOP 10 RANKING SEGÚN BD (prediction_points) ===');
rankBD.slice(0, 10).forEach((u, i) =>
  console.log(`${i + 1}. ${u.full_name || u.email} — ${u.prediction_points || 0} pts (aciertos reales: ${correctByUser.get(u.email)?.size || 0})`));

console.log('\n=== TOP 10 RANKING SEGÚN ACIERTOS REALES ===');
rankReal.slice(0, 10).forEach((u, i) =>
  console.log(`${i + 1}. ${u.full_name || u.email} — ${(correctByUser.get(u.email)?.size || 0)} aciertos = ${(correctByUser.get(u.email)?.size || 0) * 100} pts`));

console.log('\n=== RESUMEN ===');
console.log(`Usuarios no-admin: ${nonAdmins.length}`);
console.log(`Usuarios con prediction_points incorrectos: ${issues.length}`);
