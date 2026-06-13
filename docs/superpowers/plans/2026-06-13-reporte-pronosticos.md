# Reporte de Pronósticos (vista + PDF) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar Admin → Pronósticos con filtros (estado), buscador por @instagram/nombre/correo, modo resumen por usuario, y exportación a PDF (por partido y total tipo el reporte de Gemini).

**Architecture:** La lógica de armado del reporte vive en `src/lib/predictionsReport.js` (pura, testeable). La generación del PDF en `src/lib/predictionsPdf.js` (jsPDF + autotable). `AdminPredictions.jsx` consume ambas y añade UI (modos, filtros, buscador, botones).

**Tech Stack:** React 18, react-query, jsPDF + jspdf-autotable, vitest, pnpm.

**Datos:** `predictions` tiene `user_email, match_id, pred_team1, pred_team2, scored, is_correct, points_earned`. `matches` tiene `team1, team2, result_team1, result_team2, status, match_date, match_time`. `users` tiene `email, full_name, instagram, role`. Se cruza predictions→users por correo. Los admins (`role === 'admin'`) se excluyen de métricas y tabla de posiciones.

---

### Task 1: Instalar dependencias de PDF

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Instalar jsPDF y autotable**

Run: `pnpm add jspdf jspdf-autotable`
Expected: se añaden a `dependencies` y se actualiza el lockfile.

- [ ] **Step 2: Verificar que importan sin error**

Run:
```bash
node -e "import('jspdf').then(m=>console.log('jspdf', typeof m.default)).catch(e=>{console.error(e);process.exit(1)})"
```
Expected: `jspdf function`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: agregar jspdf y jspdf-autotable para reportes PDF"
```

---

### Task 2: Lógica pura del reporte (`predictionsReport.js`) con tests

**Files:**
- Create: `src/lib/predictionsReport.js`
- Create: `src/lib/predictionsReport.test.js`

- [ ] **Step 1: Escribir el test (falla porque el módulo no existe)**

Crear `src/lib/predictionsReport.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  statusOf, usersByEmailMap, buildMatchReport, buildStandings, buildGlobalStats,
} from './predictionsReport';

const users = [
  { email: 'ana@x.com', full_name: 'Ana López', instagram: 'ana', role: 'user' },
  { email: 'luis@x.com', full_name: 'Luis Mora', instagram: 'luismora', role: 'user' },
  { email: 'admin@x.com', full_name: 'Admin', instagram: 'admin', role: 'admin' },
];
const m1 = { id: 'm1', team1: 'USA', team2: 'Paraguay', result_team1: 4, result_team2: 1, status: 'finished' };
const m2 = { id: 'm2', team1: 'Brasil', team2: 'Haití', status: 'open' }; // sin resultado
const preds = [
  { user_email: 'ana@x.com', match_id: 'm1', pred_team1: 4, pred_team2: 1, scored: true, is_correct: true, points_earned: 100 },
  { user_email: 'luis@x.com', match_id: 'm1', pred_team1: 2, pred_team2: 0, scored: true, is_correct: false, points_earned: 0 },
  { user_email: 'admin@x.com', match_id: 'm1', pred_team1: 4, pred_team2: 1, scored: true, is_correct: true, points_earned: 100 },
  { user_email: 'ana@x.com', match_id: 'm2', pred_team1: 1, pred_team2: 0 }, // pendiente
];

describe('statusOf', () => {
  it('gana con marcador exacto en partido finalizado', () => {
    expect(statusOf(preds[0], m1)).toBe('ganó');
  });
  it('pierde si no acierta en partido finalizado', () => {
    expect(statusOf(preds[1], m1)).toBe('perdió');
  });
  it('pendiente si el partido no tiene resultado', () => {
    expect(statusOf(preds[3], m2)).toBe('pendiente');
  });
});

describe('buildMatchReport', () => {
  it('arma filas y métricas excluyendo admin', () => {
    const map = usersByEmailMap(users);
    const r = buildMatchReport(m1, preds, map);
    expect(r.resultText).toBe('4-1');
    // admin excluido → 2 participantes
    expect(r.stats.participants).toBe(2);
    expect(r.stats.hits).toBe(1);
    expect(r.stats.effectiveness).toBe('50.0%');
    const ana = r.rows.find(x => x.email === 'ana@x.com');
    expect(ana.instagram).toBe('ana');
    expect(ana.name).toBe('Ana López');
    expect(ana.status).toBe('ganó');
    expect(ana.points).toBe(100);
  });
});

describe('buildStandings', () => {
  it('acumula por usuario, excluye admin, ordena por puntos', () => {
    const map = usersByEmailMap(users);
    const s = buildStandings(preds, [m1, m2], map);
    expect(s.find(x => x.email === 'admin@x.com')).toBeUndefined();
    const ana = s.find(x => x.email === 'ana@x.com');
    // ana: 1 acierto en m1 (m2 pendiente no cuenta en total de finalizados)
    expect(ana.hits).toBe(1);
    expect(ana.total).toBe(1);
    expect(ana.points).toBe(100);
    expect(s[0].rank).toBe(1);
  });
});

describe('buildGlobalStats', () => {
  it('cuenta partidos finalizados y participantes únicos sin admin', () => {
    const g = buildGlobalStats(preds, [m1], usersByEmailMap(users));
    expect(g.totalMatches).toBe(1);
    expect(g.participants).toBe(2);
    expect(g.hits).toBe(1);
    expect(g.effectiveness).toBe('50.0%');
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm exec vitest run src/lib/predictionsReport.test.js`
Expected: FALLA (módulo no encontrado / funciones indefinidas).

- [ ] **Step 3: Implementar `src/lib/predictionsReport.js`**

```js
// Lógica pura para armar reportes de pronósticos (sin React).
// Cruza predictions con users (por correo) para mostrar @instagram y nombre.
// Excluye admins de métricas y tabla de posiciones (igual que la evaluación).

const POINTS_PER_CORRECT = 100;

const hasResult = (match) =>
  match && match.result_team1 != null && match.result_team2 != null;

// 'ganó' | 'perdió' | 'pendiente'
export function statusOf(pred, match) {
  if (!hasResult(match)) return 'pendiente';
  const correct = pred.scored
    ? !!pred.is_correct
    : Number(pred.pred_team1) === Number(match.result_team1) &&
      Number(pred.pred_team2) === Number(match.result_team2);
  return correct ? 'ganó' : 'perdió';
}

// Mapa email → { instagram, name, role }
export function usersByEmailMap(users) {
  const map = new Map();
  for (const u of (users || [])) {
    map.set(u.email, { instagram: u.instagram || '', name: u.full_name || '', role: u.role || 'user' });
  }
  return map;
}

const isAdmin = (email, usersByEmail) => usersByEmail.get(email)?.role === 'admin';

const pct = (hits, total) => (total > 0 ? `${((hits / total) * 100).toFixed(1)}%` : '0.0%');

// Reporte de un partido: filas + métricas. Excluye admins de las métricas,
// pero las filas incluyen a todos (el admin puede querer verse). Dedup por correo.
export function buildMatchReport(match, predictions, usersByEmail) {
  const seen = new Set();
  const rows = [];
  for (const p of predictions) {
    if (p.match_id !== match.id) continue;
    if (seen.has(p.user_email)) continue;
    seen.add(p.user_email);
    const u = usersByEmail.get(p.user_email) || {};
    rows.push({
      instagram: u.instagram || '',
      name: u.name || '',
      email: p.user_email,
      pred: `${p.pred_team1}-${p.pred_team2}`,
      status: statusOf(p, match),
      points: p.scored ? (p.points_earned ?? (p.is_correct ? POINTS_PER_CORRECT : 0)) : (statusOf(p, match) === 'ganó' ? POINTS_PER_CORRECT : 0),
    });
  }
  rows.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  // Métricas sin admins
  const noAdmin = rows.filter(r => !isAdmin(r.email, usersByEmail));
  const participants = noAdmin.length;
  const hits = noAdmin.filter(r => r.status === 'ganó').length;
  return {
    match,
    resultText: hasResult(match) ? `${match.result_team1}-${match.result_team2}` : 'sin resultado',
    rows,
    stats: { participants, hits, effectiveness: pct(hits, participants) },
  };
}

// Tabla de posiciones acumulada (solo partidos finalizados), dedup por correo,
// excluye admins, ordena por puntos desc y luego nombre.
export function buildStandings(predictions, matches, usersByEmail) {
  const matchById = new Map(matches.map(m => [m.id, m]));
  const finishedIds = new Set(matches.filter(m => m.status === 'finished' && hasResult(m)).map(m => m.id));
  // Dedup por (email, match) para no contar doble
  const seenPair = new Set();
  const byUser = new Map(); // email → { hits, total, points }
  for (const p of predictions) {
    if (!finishedIds.has(p.match_id)) continue;
    if (isAdmin(p.user_email, usersByEmail)) continue;
    const pairKey = `${p.user_email}|${p.match_id}`;
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);
    const match = matchById.get(p.match_id);
    const won = statusOf(p, match) === 'ganó';
    const cur = byUser.get(p.user_email) || { hits: 0, total: 0, points: 0 };
    cur.total += 1;
    if (won) { cur.hits += 1; cur.points += POINTS_PER_CORRECT; }
    byUser.set(p.user_email, cur);
  }
  const list = [...byUser.entries()].map(([email, v]) => {
    const u = usersByEmail.get(email) || {};
    return { instagram: u.instagram || '', name: u.name || '', email, hits: v.hits, total: v.total, points: v.points };
  });
  list.sort((a, b) => b.points - a.points || (a.name || a.email).localeCompare(b.name || b.email));
  return list.map((r, i) => ({ rank: i + 1, ...r }));
}

// Métricas globales (solo partidos finalizados, sin admins).
export function buildGlobalStats(predictions, finishedMatches, usersByEmail) {
  const finishedIds = new Set(finishedMatches.filter(m => m.status === 'finished' && hasResult(m)).map(m => m.id));
  const matchById = new Map(finishedMatches.map(m => [m.id, m]));
  const participants = new Set();
  const seenPair = new Set();
  let hits = 0;
  for (const p of predictions) {
    if (!finishedIds.has(p.match_id)) continue;
    if (usersByEmail && isAdmin(p.user_email, usersByEmail)) continue;
    const pairKey = `${p.user_email}|${p.match_id}`;
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);
    participants.add(p.user_email);
    if (statusOf(p, matchById.get(p.match_id)) === 'ganó') hits += 1;
  }
  return {
    totalMatches: finishedIds.size,
    participants: participants.size,
    hits,
    effectiveness: pct(hits, seenPair.size),
  };
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm exec vitest run src/lib/predictionsReport.test.js`
Expected: PASS (todos los casos).

- [ ] **Step 5: Lint y commit**

Run: `pnpm exec eslint src/lib/predictionsReport.js src/lib/predictionsReport.test.js`
Expected: sin errores.

```bash
git add src/lib/predictionsReport.js src/lib/predictionsReport.test.js
git commit -m "feat(reporte): logica pura de reporte de pronosticos con tests"
```

---

### Task 3: Generador de PDF (`predictionsPdf.js`)

**Files:**
- Create: `src/lib/predictionsPdf.js`

- [ ] **Step 1: Implementar el módulo**

Crear `src/lib/predictionsPdf.js`:

```js
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const NAVY = [31, 41, 55];
const slug = (s) => String(s || '').replace(/[^\w]+/g, '').slice(0, 30);

// Fila de 4 métricas tipo "tarjetas" como texto.
function metricsLine(doc, startY, metrics) {
  doc.setFontSize(10);
  doc.setTextColor(120);
  const labels = metrics.map(m => m.label);
  const values = metrics.map(m => String(m.value));
  autoTable(doc, {
    startY,
    head: [labels],
    body: [values],
    theme: 'grid',
    headStyles: { fillColor: [245, 247, 250], textColor: 90, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { halign: 'center', fontStyle: 'bold', textColor: NAVY, fontSize: 13 },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY;
}

function matchTable(doc, startY, title, rows) {
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(title, 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    head: [['@Instagram', 'Nombre', 'Correo', 'Pron.', 'Estado', 'Pts']],
    body: rows.map(r => [r.instagram ? '@' + r.instagram : '', r.name, r.email, r.pred, r.status, r.points]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY;
}

// PDF de un solo partido.
export function exportMatchPdf(matchReport) {
  const doc = new jsPDF();
  const { match, resultText, rows, stats } = matchReport;
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(`Pronósticos: ${match.team1} vs ${match.team2} (${resultText})`, 14, 18);
  let y = metricsLine(doc, 24, [
    { label: 'Participantes', value: stats.participants },
    { label: 'Aciertos', value: stats.hits },
    { label: 'Efectividad', value: stats.effectiveness },
  ]);
  matchTable(doc, y + 8, 'Detalle por usuario', rows);
  doc.save(`pronosticos_${slug(match.team1)}_vs_${slug(match.team2)}.pdf`);
}

// PDF total: métricas globales + tabla por cada partido + tabla de posiciones.
export function exportTotalPdf({ globalStats, matchReports, standings }) {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text('Reporte de Pronósticos', 14, 18);
  let y = metricsLine(doc, 26, [
    { label: 'Partidos', value: globalStats.totalMatches },
    { label: 'Participantes', value: globalStats.participants },
    { label: 'Aciertos', value: globalStats.hits },
    { label: 'Efectividad', value: globalStats.effectiveness },
  ]);

  for (const mr of matchReports) {
    y = matchTable(doc, y + 10, `Partido: ${mr.match.team1} vs ${mr.match.team2} (${mr.resultText})`, mr.rows);
    if (y > 250) { doc.addPage(); y = 18; }
  }

  doc.addPage();
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text('Tabla de Posiciones Final', 14, 18);
  autoTable(doc, {
    startY: 24,
    head: [['#', '@Instagram', 'Nombre', 'Correo', 'Aciertos', 'Puntos']],
    body: standings.map(s => [s.rank, s.instagram ? '@' + s.instagram : '', s.name, s.email, `${s.hits}/${s.total}`, `${s.points} pts`]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  doc.save('reporte_pronosticos.pdf');
}
```

- [ ] **Step 2: Smoke test de generación (sin navegador)**

Crear archivo temporal `_smoke_pdf.mjs` en la raíz:
```js
import { exportTotalPdf } from './src/lib/predictionsPdf.js';
// jsPDF en Node genera el doc; save escribe en disco vía fs si está disponible.
try {
  globalThis.window = undefined;
  exportTotalPdf({
    globalStats: { totalMatches: 1, participants: 2, hits: 1, effectiveness: '50.0%' },
    matchReports: [{ match: { team1: 'USA', team2: 'Paraguay' }, resultText: '4-1', rows: [{ instagram: 'ana', name: 'Ana', email: 'a@x.com', pred: '4-1', status: 'ganó', points: 100 }] }],
    standings: [{ rank: 1, instagram: 'ana', name: 'Ana', email: 'a@x.com', hits: 1, total: 1, points: 100 }],
  });
  console.log('PDF generado sin error');
} catch (e) { console.error('FALLO:', e.message); process.exit(1); }
```
Run: `node _smoke_pdf.mjs; rm -f _smoke_pdf.mjs reporte_pronosticos.pdf`
Expected: "PDF generado sin error" (o, si `doc.save` requiere DOM, el error será solo en `save` — en ese caso el smoke se considera OK si la construcción llegó hasta `save`). Si `save` falla en Node, ajustar el smoke para usar `doc.output('arraybuffer')` en lugar de `save`. La verificación real es en el navegador (Task 5).

- [ ] **Step 3: Lint y commit**

Run: `pnpm exec eslint src/lib/predictionsPdf.js`
Expected: sin errores.

```bash
git add src/lib/predictionsPdf.js
git commit -m "feat(reporte): generador de PDF (por partido y total) con jspdf-autotable"
```

---

### Task 4: Rediseñar `AdminPredictions.jsx`

**Files:**
- Modify: `src/pages/admin/AdminPredictions.jsx`

- [ ] **Step 1: Reescribir el componente completo**

Reemplazar todo el contenido de `src/pages/admin/AdminPredictions.jsx` por:

```jsx
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, Layers, Download, FileText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { usersByEmailMap, buildMatchReport, buildStandings, buildGlobalStats, statusOf } from '@/lib/predictionsReport';
import { exportMatchPdf, exportTotalPdf } from '@/lib/predictionsPdf';

export default function AdminPredictions() {
  const [selectedMatch, setSelectedMatch] = useState('all');
  const [mode, setMode] = useState('match');        // 'match' | 'user'
  const [statusFilter, setStatusFilter] = useState('all'); // all|ganó|perdió|pendiente
  const [search, setSearch] = useState('');
  const [deduping, setDeduping] = useState(false);
  const queryClient = useQueryClient();

  const { data: matches = [] } = useQuery({
    queryKey: ['admin-matches-pred'],
    queryFn: () => api.entities.Match.list('-match_date'),
  });
  const { data: allPredictions = [], isLoading } = useQuery({
    queryKey: ['admin-predictions-all'],
    queryFn: () => api.entities.Prediction.list(),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['admin-users-pred'],
    queryFn: () => api.entities.User.list(),
  });

  const matchMap = React.useMemo(() => {
    const m = {}; matches.forEach(x => { m[x.id] = x; }); return m;
  }, [matches]);
  const usersMap = React.useMemo(() => usersByEmailMap(users), [users]);

  // Pronósticos del partido seleccionado (o todos)
  const matchPredictions = React.useMemo(() => (
    selectedMatch === 'all' ? allPredictions : allPredictions.filter(p => p.match_id === selectedMatch)
  ), [allPredictions, selectedMatch]);

  const matchesText = (email) => {
    const u = usersMap.get(email) || {};
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.instagram || '').toLowerCase().includes(q)
      || (u.name || '').toLowerCase().includes(q)
      || email.toLowerCase().includes(q);
  };

  // Filas filtradas para el modo "Por partido"
  const filteredRows = React.useMemo(() => {
    return matchPredictions
      .filter(p => matchesText(p.user_email))
      .map(p => {
        const match = matchMap[p.match_id];
        const st = match ? statusOf(p, match) : 'pendiente';
        return { p, match, st };
      })
      .filter(({ st }) => statusFilter === 'all' || st === statusFilter)
      .sort((a, b) => (a.p.created_date || '').localeCompare(b.p.created_date || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchPredictions, statusFilter, search, matchMap, usersMap]);

  // Resumen por usuario (modo "Por usuario")
  const standings = React.useMemo(
    () => buildStandings(allPredictions, matches, usersMap).filter(s => matchesText(s.email)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPredictions, matches, usersMap, search]
  );

  const handleDedupe = async () => {
    if (!window.confirm('¿Eliminar pronósticos duplicados (mismo usuario + mismo partido)?\n\nSe conservará la versión con más información (scored + puntos).')) return;
    setDeduping(true);
    try {
      const result = await db.predictions.deduplicate();
      toast.success(result.deleted === 0 ? 'No se encontraron duplicados ✅' : `🧹 ${result.deleted} duplicados eliminados (de ${result.scanned})`);
      queryClient.invalidateQueries({ queryKey: ['admin-predictions-all'] });
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
    } catch (e) {
      toast.error('Error al deduplicar: ' + e.message);
    } finally {
      setDeduping(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredRows.length === 0) { toast.error('No hay pronósticos para exportar'); return; }
    const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ['Partido', 'Instagram', 'Nombre', 'Correo', 'Pronóstico', 'Estado', 'Puntos'];
    const rows = filteredRows.map(({ p, match, st }) => {
      const u = usersMap.get(p.user_email) || {};
      const partido = match ? `${match.team1} vs ${match.team2}` : 'Desconocido';
      const puntos = p.scored ? (p.points_earned ?? (p.is_correct ? 100 : 0)) : (st === 'ganó' ? 100 : 0);
      return [partido, u.instagram ? '@' + u.instagram : '', u.name || '', p.user_email, `${p.pred_team1} - ${p.pred_team2}`, st, puntos];
    });
    const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nombre = selectedMatch !== 'all' && matchMap[selectedMatch]
      ? `${matchMap[selectedMatch].team1}_vs_${matchMap[selectedMatch].team2}`.replace(/\s+/g, '') : 'todos';
    a.href = url; a.download = `pronosticos_${nombre}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exportados ${filteredRows.length} pronósticos`);
  };

  const handleMatchPdf = () => {
    const match = matchMap[selectedMatch];
    if (!match) { toast.error('Selecciona un partido para el PDF'); return; }
    const report = buildMatchReport(match, allPredictions, usersMap);
    if (report.rows.length === 0) { toast.error('Ese partido no tiene pronósticos'); return; }
    exportMatchPdf(report);
    toast.success('PDF del partido generado');
  };

  const handleTotalPdf = () => {
    const finished = matches.filter(m => m.status === 'finished' && m.result_team1 != null && m.result_team2 != null);
    if (finished.length === 0) { toast.error('No hay partidos finalizados todavía'); return; }
    const globalStats = buildGlobalStats(allPredictions, finished, usersMap);
    const matchReports = finished.map(m => buildMatchReport(m, allPredictions, usersMap));
    const standingsAll = buildStandings(allPredictions, matches, usersMap);
    exportTotalPdf({ globalStats, matchReports, standings: standingsAll });
    toast.success('PDF total generado');
  };

  const userLabel = (email) => {
    const u = usersMap.get(email) || {};
    return u.instagram ? '@' + u.instagram : (u.name || email);
  };

  return (
    <div className="space-y-4">
      {/* Toggle de modo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border p-0.5">
          <button onClick={() => setMode('match')} className={`px-3 py-1 text-sm rounded-md ${mode === 'match' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>Por partido</button>
          <button onClick={() => setMode('user')} className={`px-3 py-1 text-sm rounded-md ${mode === 'user' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>Por usuario</button>
        </div>
        <Button variant="secondary" size="sm" onClick={handleDedupe} disabled={deduping} className="gap-2">
          <Layers className="w-4 h-4" /> {deduping ? 'Deduplicando...' : 'Deduplicar'}
        </Button>
        <Button variant="outline" size="sm" onClick={handleTotalPdf} className="gap-2">
          <FileText className="w-4 h-4" /> PDF total
        </Button>
      </div>

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por @instagram, nombre o correo" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {mode === 'match' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedMatch} onValueChange={setSelectedMatch}>
              <SelectTrigger className="w-full max-w-xs"><SelectValue placeholder="Filtrar por partido" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los partidos</SelectItem>
                {matches.map(m => <SelectItem key={m.id} value={m.id}>{m.team1} vs {m.team2}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ganó">Acertados</SelectItem>
                <SelectItem value="perdió">Perdidos</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filteredRows.length === 0} className="gap-2">
              <Download className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleMatchPdf} disabled={selectedMatch === 'all'} className="gap-2">
              <FileText className="w-4 h-4" /> PDF de este partido
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{filteredRows.length} pronósticos</p>

          {isLoading ? <p className="text-muted-foreground">Cargando...</p> : (
            <div className="space-y-2">
              {filteredRows.map(({ p, match, st }) => (
                <Card key={p.id}>
                  <CardContent className="p-3 text-sm flex items-center justify-between">
                    <div>
                      <p className="font-medium">{userLabel(p.user_email)}</p>
                      <p className="text-muted-foreground text-xs">{p.user_email}</p>
                      <p className="text-muted-foreground">{match ? `${match.team1} vs ${match.team2}` : 'Partido desconocido'}</p>
                      <p>Pronóstico: <strong>{p.pred_team1} - {p.pred_team2}</strong></p>
                    </div>
                    {st === 'pendiente' ? (
                      <Badge variant="outline">Pendiente</Badge>
                    ) : (
                      <Badge className={st === 'ganó' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}>
                        {st === 'ganó'
                          ? <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />+100</span>
                          : <span className="flex items-center gap-1"><X className="w-3 h-3" />0</span>}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{standings.length} participantes</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-2">#</th><th className="pr-2">Usuario</th><th className="pr-2">Correo</th><th className="pr-2">Aciertos</th><th className="pr-2 text-right">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(s => (
                  <tr key={s.email} className="border-b last:border-0">
                    <td className="py-2 pr-2 text-muted-foreground">{s.rank}</td>
                    <td className="pr-2 font-medium">{s.instagram ? '@' + s.instagram : s.name}</td>
                    <td className="pr-2 text-muted-foreground">{s.email}</td>
                    <td className="pr-2">{s.hits}/{s.total}</td>
                    <td className="pr-2 text-right font-bold">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint src/pages/admin/AdminPredictions.jsx`
Expected: sin errores (los `eslint-disable` cubren las deps de useMemo con funciones inline).

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminPredictions.jsx
git commit -m "feat(admin): pronosticos con modos por partido/usuario, filtros, buscador y PDF"
```

---

### Task 5: Verificación final

- [ ] **Step 1: Tests + lint + build**

Run: `pnpm exec vitest run src/lib/predictionsReport.test.js && pnpm exec eslint src/lib/predictionsReport.js src/lib/predictionsPdf.js src/pages/admin/AdminPredictions.jsx && pnpm build`
Expected: tests PASS, lint sin errores, build exit 0.

- [ ] **Step 2: Recorrido manual en la app (como admin)**

1. Admin → Pronósticos: modo "Por partido" — filtrar por estado (Acertados/Perdidos/Pendientes) y buscar por @instagram/nombre/correo.
2. Seleccionar un partido finalizado → "PDF de este partido" → abre PDF con métricas y tabla.
3. "PDF total" → abre PDF con métricas globales, una tabla por partido finalizado y la tabla de posiciones.
4. Modo "Por usuario" → tabla de resumen con récord y puntos; buscador funciona.
5. "CSV" sigue funcionando.

- [ ] **Step 3: Commit final (si hubo ajustes)**

```bash
git add -A
git commit -m "chore(reporte): ajustes finales del reporte de pronosticos"
```
