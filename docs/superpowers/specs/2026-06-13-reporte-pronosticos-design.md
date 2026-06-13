# Reporte de Pronósticos del admin (vista mejorada + PDF)

**Fecha:** 2026-06-13
**Estado:** Aprobado

## Problema

La página Admin → Pronósticos lista pronósticos en tarjetas, con filtro por
partido y distintivo ganó/perdió. Falta: filtrar por estado (acertados/
perdidos), buscar/ver por usuario, y exportar reportes presentables (por
partido y un consolidado de todos los partidos jugados). Hoy el admin recurre a
herramientas externas (un PDF generado por Gemini) para esto.

## Objetivo

1. Mejorar la vista en pantalla: filtros (estado), buscador por usuario y un
   modo resumen por usuario.
2. Exportar reportes en **PDF** (diseño tipo el reporte de Gemini): por partido
   y total (todos los partidos jugados, con tabla de posiciones acumulada).

## Identificador del usuario

El ranking público identifica a la gente por su **@instagram** (`users.instagram`,
mostrado como `@usuario` en `RankingTable.jsx`). Por eso, en buscador, tablas y
reportes el identificador principal es `@instagram`, acompañado de nombre
(`full_name`) y correo (`email`). La tabla `predictions` solo guarda
`user_email`, así que se cruza con `users` por correo para obtener `@instagram`
y nombre.

## Decisiones de diseño

1. **Formato de exportación: PDF** con `jsPDF` + `jspdf-autotable` (tablas
   multipágina, texto seleccionable). Se descartan `window.print` (poco fiable)
   y html2canvas (imágenes pesadas).
2. **Vista con dos modos:** "Por partido" (mejorado) y "Por usuario" (resumen).
3. **El CSV por partido existente se mantiene** (ya en master); el PDF se suma.
4. **El reporte total solo incluye partidos finalizados** (`status === 'finished'`
   con resultado).
5. **Deduplicación:** un pronóstico por (usuario, partido). Se reutiliza la
   lógica de dedupe existente; el reporte agrupa por `user_email`.

## Componentes

### Nuevo `src/lib/predictionsReport.js` (lógica pura, sin React)

Funciones que reciben `{ predictions, matches, usersByEmail }` y devuelven datos
listos para mostrar/exportar:

- `buildMatchReport(match, predictions, usersByEmail)` → `{ match, result,
  rows: [{ instagram, name, email, pred, status: 'ganó'|'perdió'|'pendiente',
  points }], stats: { participants, hits, effectiveness } }`.
- `buildStandings(predictions, matches, usersByEmail)` → tabla de posiciones
  acumulada: `[{ rank, instagram, name, email, hits, total, points }]`,
  ordenada por `points` desc y deduplicada por correo (un registro por usuario,
  sumando aciertos/puntos de todos los partidos finalizados).
- `buildGlobalStats(predictions, finishedMatches)` → `{ totalMatches,
  participants, hits, effectiveness }`.
- `statusOf(pred, match)` — 'ganó' si `scored && is_correct` (o cálculo por
  marcador exacto si aún no scored pero el partido tiene resultado), 'perdió' si
  hay resultado y no acertó, 'pendiente' si el partido no tiene resultado.

### Nuevo `src/lib/predictionsPdf.js` (construcción del PDF)

- `exportMatchPdf(matchReport)` — un PDF de un partido: título "Partido: A vs B
  (x-y)", fila de métricas, tabla `@instagram | Nombre | Correo | Pronóstico |
  Estado | Puntos`. Descarga `pronosticos_<A>_vs_<B>.pdf`.
- `exportTotalPdf({ globalStats, matchReports, standings })` — réplica del
  reporte de Gemini: título + métricas globales (Total Partidos, Participantes
  Únicos, Aciertos, Efectividad), una sección/tabla por cada partido finalizado,
  y al final "Tabla de Posiciones Final" (`Puesto | @instagram | Nombre | Correo
  | Aciertos (X/Y) | Puntos`). Descarga `reporte_pronosticos.pdf`.
- Usa `jspdf-autotable` para las tablas (encabezado repetido, salto de página
  automático). Estado con texto "ganó/perdió/pendiente".

### Modificar `src/pages/admin/AdminPredictions.jsx`

- Cargar también `users` (para `usersByEmail`: email → { instagram, full_name }).
- **Toggle de modo:** "Por partido" | "Por usuario".
- **Modo Por partido:** filtro de partido (existente) + **filtro de estado**
  (Todos / Acertados / Perdidos / Pendientes) + **buscador** (filtra por
  `@instagram`, nombre o correo). Cada tarjeta muestra `@instagram` y nombre
  además del correo, con el distintivo ganó/perdió existente.
- **Modo Por usuario:** tabla resumen (una fila por usuario): `@instagram`,
  nombre, correo, récord ("X/Y aciertos"), puntos. Ordenada por puntos. Con
  buscador.
- **Botones de exportación:**
  - "PDF de este partido" — habilitado cuando hay un partido seleccionado.
  - "PDF total (partidos jugados)" — siempre disponible.
  - El botón "Exportar CSV" existente se conserva.
- **Carga de datos para el reporte total / modo Por usuario:** la lista muestra
  hasta 100 pronósticos cuando se eligen "todos" (paginación de pantalla). El PDF
  total y el modo "Por usuario" NO deben quedar limitados a esos 100: cargan
  **todos** los pronósticos (consulta dedicada sin límite) y filtran a los de
  partidos finalizados al construir el reporte. Así el consolidado refleja a
  todos los participantes (el reporte de referencia tenía 163).

## Casos borde

- **Usuario sin registro en `users`** (correo huérfano): mostrar el correo y
  dejar `@instagram`/nombre vacíos; no romper el reporte.
- **Partido sin resultado** en el reporte total: se excluye (solo finalizados).
- **Sin datos:** botones de PDF deshabilitados o con aviso "no hay datos".
- **Listas largas (cientos de filas):** autotable pagina solo; el PDF total de
  ~160 participantes y varios partidos debe generarse sin colgar el navegador
  (autotable lo soporta; el reporte de referencia tenía 18 páginas).
- **Admins excluidos** de métricas/posiciones igual que en la evaluación
  (`evaluateMatchPredictions` ya excluye `role === 'admin'`); el reporte aplica
  el mismo criterio para "Aciertos Netos"/posiciones, mostrando o no a admins de
  forma consistente (se excluyen de la tabla de posiciones).

## Dependencias nuevas

- `jspdf` y `jspdf-autotable` (pinneadas, lockfile commiteado).

## Fuera de alcance

- Programar envíos automáticos del reporte.
- Exportar a Excel/CSV el reporte total (el CSV actual es por partido).
- Gráficas en el PDF.

## Verificación

- `src/lib/predictionsReport.js` es lógica pura → test aislado con datos de
  ejemplo (ganó/perdió/pendiente, dedupe por correo, posiciones, métricas).
- PDF: verificación manual generando ambos PDF en la app con datos reales y
  revisando que coincidan con lo esperado (estructura tipo el reporte de Gemini).
- `pnpm lint` y `pnpm build` sin errores.
