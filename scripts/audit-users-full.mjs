/**
 * Auditoría COMPLETA de usuarios (incluye admin) — SOLO LECTURA.
 *
 * Reglas según el código:
 *  - prediction_points = 100 × partidos distintos con predicción scored+correcta
 *  - total_points      = prediction_points + bonus_points + referral_points
 *  - referral_points   = suma de referral_commissions.points_earned (to_email)
 *  - bonus_points      = 100 (bono de registro) + suma points_bonuses.amount
 *  - saldo disponible  = total_points − suma redemptions.points_spent (no negativo)
 *  - admins: sin predicciones, sin puntos
 *
 * Uso: node scripts/audit-users-full.mjs
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

async function fetchAll(table) {
  const PAGE = 1000;
  let rows = [], from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) { console.error(`❌ Error leyendo ${table}:`, error.message); return rows; }
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

const [users, predictions, matches, bonuses, commissions, redemptions, referrals, prizes] = await Promise.all([
  fetchAll('users'), fetchAll('predictions'), fetchAll('matches'), fetchAll('points_bonuses'),
  fetchAll('referral_commissions'), fetchAll('redemptions'), fetchAll('referrals'), fetchAll('prizes'),
]);

console.log('=== CONTEOS ===');
console.log({ users: users.length, predictions: predictions.length, matches: matches.length,
  points_bonuses: bonuses.length, referral_commissions: commissions.length,
  redemptions: redemptions.length, referrals: referrals.length, prizes: prizes.length });

const emailSet = new Set(users.map(u => u.email));
const admins = users.filter(u => u.role === 'admin');
const adminEmails = new Set(admins.map(u => u.email));
const matchIds = new Set(matches.map(m => m.id));
const prizeById = new Map(prizes.map(p => [p.id, p]));
const codeToUser = new Map();

// ── A. Sanidad de campos de usuario ──
const fieldIssues = [];
const emailCount = new Map();
const idCount = new Map();
for (const u of users) {
  emailCount.set(u.email, (emailCount.get(u.email) || 0) + 1);
  idCount.set(u.id, (idCount.get(u.id) || 0) + 1);
  const probs = [];
  if (!u.email) probs.push('sin email');
  if (!u.full_name) probs.push('sin full_name');
  if (u.role !== 'admin' && !u.referral_code) probs.push('sin referral_code');
  if (u.referral_code) {
    if (codeToUser.has(u.referral_code)) probs.push(`referral_code DUPLICADO con ${codeToUser.get(u.referral_code)}`);
    else codeToUser.set(u.referral_code, u.email);
  }
  for (const f of ['total_points', 'prediction_points', 'bonus_points', 'referral_points']) {
    const v = u[f];
    if (v != null && (typeof v !== 'number' || !Number.isInteger(v) || v < 0)) probs.push(`${f}=${JSON.stringify(v)} inválido`);
  }
  if (probs.length) fieldIssues.push({ email: u.email, id: u.id, probs });
}
const dupEmails = [...emailCount].filter(([, n]) => n > 1).map(([e, n]) => ({ email: e, copias: n }));
const dupIds = [...idCount].filter(([, n]) => n > 1).map(([id, n]) => ({ id, copias: n }));

// ── B. referred_by apunta a un referral_code existente ──
const badReferredBy = [];
for (const u of users) {
  if (u.referred_by && !codeToUser.has(u.referred_by)) {
    badReferredBy.push({ email: u.email, referred_by: u.referred_by });
  }
}

// ── C. Recomputar puntos por usuario ──
const correctByUser = new Map();
for (const p of predictions) {
  if (!(p.scored && p.is_correct)) continue;
  if (!correctByUser.has(p.user_email)) correctByUser.set(p.user_email, new Set());
  correctByUser.get(p.user_email).add(p.match_id || '__nomatch__');
}
const bonusByUser = new Map();
for (const b of bonuses) bonusByUser.set(b.user_email, (bonusByUser.get(b.user_email) || 0) + (Number(b.amount) || 0));
const commByUser = new Map();
for (const c of commissions) commByUser.set(c.to_email, (commByUser.get(c.to_email) || 0) + (Number(c.points_earned) || 0));
const spentByUser = new Map();
for (const r of redemptions) spentByUser.set(r.user_email, (spentByUser.get(r.user_email) || 0) + (Number(r.points_spent) || 0));

const pointIssues = [];
for (const u of users) {
  if (u.role === 'admin') continue;
  const pred = u.prediction_points || 0;
  const bonus = u.bonus_points || 0;
  const ref = u.referral_points || 0;
  const total = u.total_points || 0;
  const expPred = (correctByUser.get(u.email)?.size || 0) * 100;
  const sumComms = commByUser.get(u.email) || 0;
  const sumBonuses = bonusByUser.get(u.email) || 0;
  const probs = [];
  if (pred !== expPred) probs.push(`prediction_points=${pred}, esperado ${expPred}`);
  if (total !== pred + bonus + ref) probs.push(`total_points=${total} ≠ pred+bonus+ref=${pred + bonus + ref}`);
  if (ref !== sumComms) probs.push(`referral_points=${ref} ≠ suma comisiones=${sumComms}`);
  if (bonus !== 100 + sumBonuses) probs.push(`bonus_points=${bonus} ≠ 100+bonos otorgados (${100 + sumBonuses})`);
  const spent = spentByUser.get(u.email) || 0;
  if (total - spent < 0) probs.push(`saldo disponible NEGATIVO: ${total}−${spent}=${total - spent}`);
  if (probs.length) pointIssues.push({ email: u.email, name: u.full_name, total, pred, bonus, ref, probs });
}

// ── D. Admins ──
const adminIssues = [];
for (const u of admins) {
  const probs = [];
  if ((u.prediction_points || 0) !== 0) probs.push(`prediction_points=${u.prediction_points}`);
  if ((u.total_points || 0) !== 0) probs.push(`total_points=${u.total_points}`);
  if ((u.bonus_points || 0) !== 0) probs.push(`bonus_points=${u.bonus_points}`);
  if ((u.referral_points || 0) !== 0) probs.push(`referral_points=${u.referral_points}`);
  if (u.referred_by) probs.push(`referred_by=${u.referred_by} (admin no debería tener referente)`);
  const preds = predictions.filter(p => p.user_email === u.email);
  if (preds.length) probs.push(`${preds.length} predicciones en BD (ids: ${preds.map(p => p.id).join(', ')})`);
  if (probs.length) adminIssues.push({ email: u.email, probs });
}
console.log(`\nAdmins encontrados: ${admins.map(a => a.email).join(', ') || 'ninguno'}`);

// ── E. Registros huérfanos (referencian usuarios/partidos inexistentes) ──
const orphans = [];
for (const p of predictions) {
  if (p.user_email && !emailSet.has(p.user_email)) orphans.push({ tabla: 'predictions', id: p.id, user: p.user_email });
  if (p.match_id && !matchIds.has(p.match_id)) orphans.push({ tabla: 'predictions(match)', id: p.id, match: p.match_id });
}
for (const r of redemptions) if (r.user_email && !emailSet.has(r.user_email)) orphans.push({ tabla: 'redemptions', id: r.id, user: r.user_email });
for (const b of bonuses) if (b.user_email && !emailSet.has(b.user_email)) orphans.push({ tabla: 'points_bonuses', id: b.id, user: b.user_email });
for (const c of commissions) {
  if (c.to_email && !emailSet.has(c.to_email)) orphans.push({ tabla: 'referral_commissions(to)', id: c.id, user: c.to_email });
  if (c.from_email && c.from_email !== 'desconocido' && !emailSet.has(c.from_email)) orphans.push({ tabla: 'referral_commissions(from)', id: c.id, user: c.from_email });
}
for (const r of referrals) {
  if (r.referrer_email && !emailSet.has(r.referrer_email)) orphans.push({ tabla: 'referrals(referrer)', id: r.id, user: r.referrer_email });
  if (r.referred_email && !emailSet.has(r.referred_email)) orphans.push({ tabla: 'referrals(referred)', id: r.id, user: r.referred_email });
}

// ── F. Comisiones duplicadas (from, to, match, type) ──
const commKey = new Map();
const dupComms = [];
for (const c of commissions) {
  const k = `${c.from_email}|${c.to_email}|${c.match_id ?? 'reg'}|${c.type ?? 'match'}`;
  if (commKey.has(k)) dupComms.push({ key: k, ids: [commKey.get(k), c.id] });
  else commKey.set(k, c.id);
}

// ── G. Referrals vs referred_by cruzado ──
const refMismatch = [];
for (const r of referrals) {
  const referred = users.find(u => u.email === r.referred_email);
  if (!referred) continue;
  const referrer = users.find(u => u.email === r.referrer_email);
  if (referred.referred_by && referrer && referred.referred_by !== referrer.referral_code) {
    refMismatch.push({ referred: r.referred_email, referred_by_en_user: referred.referred_by, code_del_referrer: referrer.referral_code });
  }
  if (!referred.referred_by) refMismatch.push({ referred: r.referred_email, issue: 'en referrals pero user.referred_by vacío' });
}

// ── H. Canjes: status válido, costo vs premio, usuario admin ──
const redIssues = [];
const validStatus = new Set(['pending', 'approved', 'delivered', 'rejected']);
for (const r of redemptions) {
  const probs = [];
  if (!validStatus.has(r.status)) probs.push(`status desconocido: ${r.status}`);
  if (adminEmails.has(r.user_email)) probs.push('canje de un ADMIN');
  const prize = r.prize_id ? prizeById.get(r.prize_id) : null;
  if (r.prize_id && !prize) probs.push(`prize_id ${r.prize_id} no existe`);
  if (prize && Number(r.points_spent) !== Number(prize.points_cost)) {
    probs.push(`points_spent=${r.points_spent} ≠ costo actual del premio=${prize.points_cost}`);
  }
  if ((Number(r.points_spent) || 0) < 0) probs.push(`points_spent negativo: ${r.points_spent}`);
  if (probs.length) redIssues.push({ id: r.id, user: r.user_email, prize: r.prize_name, status: r.status, probs });
}

// ── Reporte ──
const section = (title, arr) => {
  console.log(`\n=== ${title}: ${arr.length} ===`);
  for (const x of arr.slice(0, 40)) console.log(JSON.stringify(x));
  if (arr.length > 40) console.log(`... y ${arr.length - 40} más`);
};

section('EMAILS DUPLICADOS', dupEmails);
section('IDS DUPLICADOS', dupIds);
section('CAMPOS DE USUARIO CON PROBLEMAS', fieldIssues);
section('referred_by SIN referral_code EXISTENTE', badReferredBy);
section('USUARIOS CON PUNTOS INCONSISTENTES', pointIssues);
section('ADMINS CON PROBLEMAS', adminIssues);
section('REGISTROS HUÉRFANOS', orphans);
section('COMISIONES DUPLICADAS', dupComms);
section('REFERRALS vs referred_by INCONSISTENTES', refMismatch);
section('CANJES CON PROBLEMAS', redIssues);

console.log('\n=== RESUMEN ===');
console.log(`Usuarios: ${users.length} (${admins.length} admin)`);
console.log(`Problemas → campos:${fieldIssues.length} puntos:${pointIssues.length} admins:${adminIssues.length} huérfanos:${orphans.length} comisionesDup:${dupComms.length} referrals:${refMismatch.length} canjes:${redIssues.length}`);
