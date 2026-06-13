# Resultado "Por confirmar" desde SportScore — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando SportScore reporta un partido como finalizado, mostrarlo al usuario en "FINALIZADOS / Por confirmar" (sin veredicto) y al admin con marcador sugerido precargado y un botón "Publicar resultado", sin que el cliente escriba en la BD.

**Architecture:** El hook `useLiveResults` (solo lectura) es la fuente única de estado de SportScore. La vista de usuario y el panel admin lo consumen. El cliente nunca escribe el resultado; solo el admin al publicar.

**Tech Stack:** React 18, react-query, framer-motion, Supabase, Vite.

**Verificación:** Estos cambios son de UI/integración (no unitarios). Se verifican corriendo la app local (`pnpm dev`) con el partido real USA vs Paraguay y observando el flujo, más `pnpm lint` sin errores nuevos.

---

### Task 1: `useLiveResults` de solo lectura (quitar auto-guardado en BD)

**Files:**
- Modify: `src/pages/matches/useLiveResults.js`

- [ ] **Step 1: Quitar la escritura a la BD**

En `src/pages/matches/useLiveResults.js`, eliminar el import de `api`, la ref `updatedMatchesRef`, la función `updateMatchResult` y la llamada a `updateMatchResult` dentro de `poll`. El cuerpo del efecto queda así:

```js
import { useState, useEffect, useRef } from 'react';
import { getLiveResultForMatch } from '@/lib/sportscore';
import { isRealTeam } from '@/lib/worldCupTeams';

// ... (cabecera de comentarios: actualizar para decir "solo lectura;
// quien persiste el resultado es el admin al publicar")

const POLL_MS = 30000;

function isInPlayWindow(match) { /* sin cambios */ }

export function useLiveResults(matches) {
  const [results, setResults] = useState({});
  const timerRef = useRef(null);

  const relevant = (matches || []).filter(
    m => isInPlayWindow(m) && isRealTeam(m.team1) && isRealTeam(m.team2)
  );
  const key = relevant.map(m => m.id).sort().join(',');

  useEffect(() => {
    if (!relevant.length) {
      setResults({});
      return;
    }
    let cancelled = false;

    const poll = async () => {
      const entries = await Promise.all(
        relevant.map(async (m) => {
          try {
            const r = await getLiveResultForMatch(m);
            return [m.id, r];
          } catch {
            return [m.id, null];
          }
        })
      );
      if (cancelled) return;
      const next = {};
      for (const [id, r] of entries) if (r) next[id] = r;
      setResults(next);
    };

    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [key]);

  return results;
}
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint src/pages/matches/useLiveResults.js`
Expected: sin salida (sin errores).

- [ ] **Step 3: Commit**

```bash
git add src/pages/matches/useLiveResults.js
git commit -m "refactor(live): useLiveResults de solo lectura, el cliente no escribe el resultado"
```

---

### Task 2: Vista de usuario — partido "Por confirmar" salta a FINALIZADOS

**Files:**
- Modify: `src/pages/Matches.jsx`

`isInPlayWindow` ya considera `live`/`open`/`closed` con kickoff pasado. La clave: un partido cuyo `liveResults[id].state === 'finished'` (y que en la BD aún NO está `finished`) debe salir de EN VIVO y aparecer en FINALIZADOS con etiqueta "Por confirmar" y sin veredicto.

- [ ] **Step 1: Calcular el set de finalizados-por-SportScore**

En `Matches.jsx`, justo después de `const liveResults = useLiveResults(matches);` (línea ~495), añadir:

```js
  // Partidos que SportScore reporta como finalizados pero que el admin AÚN no
  // ha publicado en la BD. Override visual: salen de EN VIVO y entran a
  // FINALIZADOS con etiqueta "Por confirmar" (sin veredicto del pronóstico).
  const pendingConfirmIds = new Set(
    matches
      .filter(m => liveResults[m.id]?.state === 'finished' && m.status !== 'finished')
      .map(m => m.id)
  );
```

- [ ] **Step 2: Excluir los "por confirmar" de EN VIVO**

Modificar `liveMatches` (línea ~509) para excluir los ids del set:

```js
  const liveMatches = matches.filter(m =>
    !pendingConfirmIds.has(m.id) && (
      m.status === 'live' ||
      ((m.status === 'open' || m.status === 'closed') && hasStartedNow(m))
    )
  );
```

- [ ] **Step 3: Construir la lista de FINALIZADOS incluyendo los "por confirmar"**

Modificar `finishedMatches` (línea ~532) y añadir la lista combinada. Los "por confirmar" van primero:

```js
  const dbFinishedMatches = matches.filter(m => m.status === 'finished');
  const pendingConfirmMatches = matches.filter(m => pendingConfirmIds.has(m.id));
  const finishedMatches = [...pendingConfirmMatches, ...dbFinishedMatches];
  const closedMatches = matches.filter(m => m.status === 'closed' && !liveIds.has(m.id) && !pendingConfirmIds.has(m.id));
```

- [ ] **Step 4: Abrir la sección FINALIZADOS y pasar `liveResult` + `pendingConfirm` a cada tarjeta**

En el bloque `{finishedMatches.length > 0 && (...)}` (línea ~635), hacer el `<details>` abierto cuando hay partidos por confirmar, y pasar las props nuevas a cada `MatchCard`:

```jsx
      {finishedMatches.length > 0 && (
        <div>
          <details className="group" open={pendingConfirmMatches.length > 0}>
            <summary className="font-display text-2xl tracking-wide mb-3 cursor-pointer hover:text-secondary transition flex items-center gap-2">
              FINALIZADOS
              <span className="text-sm font-sans font-normal text-muted-foreground">({finishedMatches.length})</span>
            </summary>
            <div className="space-y-4 mt-4">
              <AnimatePresence>
                {finishedMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    user={user}
                    existing={getPredictionForMatch(match.id)}
                    predictions={predictionsState}
                    submitPrediction={submitPrediction}
                    handlePredict={handlePredict}
                    handleSubmit={handleSubmit}
                    liveResult={liveResults[match.id]}
                    pendingConfirm={pendingConfirmIds.has(match.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </details>
        </div>
      )}
```

- [ ] **Step 5: Soportar `pendingConfirm` en `MatchCard`**

Modificar la firma de `MatchCard` (línea 87) para aceptar `pendingConfirm`:

```jsx
function MatchCard({ match, user, existing, predictions, submitPrediction, handlePredict, handleSubmit, liveResult, live, pendingConfirm }) {
```

Modificar `isLive` (línea 92) para que un partido "por confirmar" NO se trate como en vivo aunque la BD diga `live`:

```jsx
  const isLive = (match.status === 'live' || !!live) && !pendingConfirm;
```

- [ ] **Step 6: Mostrar el marcador de SportScore y la etiqueta "Por confirmar"**

El bloque del marcador (línea 153) muestra score si `match.status === 'finished' || isLive`. Añadir `pendingConfirm`:

```jsx
                {match.status === 'finished' || isLive || pendingConfirm ? (
```

Dentro de ese bloque, el marcador ya usa `liveScore` si existe y cae al de BD. Para "por confirmar" `liveScore` viene de SportScore — correcto. Tras el `<m.div>` del marcador, donde está la etiqueta de minuto en vivo (línea ~170), añadir la etiqueta "Por confirmar" para el caso pendingConfirm:

```jsx
                    {/* Minuto/estado en vivo desde SportScore */}
                    {isLive && liveLabel && (
                      <span className={`text-[11px] font-bold flex items-center gap-1 ${
                        liveState === 'finished' ? 'text-muted-foreground' : 'text-red-600'
                      }`}>
                        {liveState !== 'finished' && <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />}
                        {liveState === 'finished' ? 'Finalizado' : liveLabel}
                      </span>
                    )}
                    {/* Resultado finalizado en SportScore, pendiente de confirmar por el admin */}
                    {pendingConfirm && (
                      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Por confirmar
                      </span>
                    )}
```

Nota: el marcador para "por confirmar" usa `liveScore` (de SportScore). Como `match.status !== 'finished'`, `resultKnown` es `false`, así que NO se muestra veredicto (✔ requisito). El pronóstico del usuario se muestra en su caja con el aviso "Pendiente del resultado final" existente.

- [ ] **Step 7: Verificar en la app local**

Run: `pnpm dev` (si no está corriendo) y abrir `http://localhost:5173/matches`.
Expected: El partido USA vs Paraguay, una vez SportScore lo marca finalizado, aparece bajo FINALIZADOS con el marcador final y la etiqueta ámbar "Por confirmar"; ya no está en EN VIVO; no muestra "¡Ganaste!"/"Perdiste".

- [ ] **Step 8: Lint y commit**

Run: `pnpm exec eslint src/pages/Matches.jsx`
Expected: sin errores.

```bash
git add src/pages/Matches.jsx
git commit -m "feat(partidos): partido finalizado en SportScore salta a FINALIZADOS como 'Por confirmar'"
```

---

### Task 3: Admin — consumir `useLiveResults`, precargar marcador y resaltar

**Files:**
- Modify: `src/pages/admin/AdminMatches.jsx`
- Modify: `src/pages/admin/MatchGroupList.jsx`
- Modify: `src/pages/admin/MatchCardItem.jsx`

- [ ] **Step 1: AdminMatches consume el hook y precarga el marcador sugerido**

En `src/pages/admin/AdminMatches.jsx`, importar el hook:

```js
import { useLiveResults } from '@/pages/matches/useLiveResults';
```

Dentro del componente, tras calcular `matches` (línea ~54), añadir:

```js
  // Estado en vivo de SportScore para los partidos visibles (solo lectura).
  const liveResults = useLiveResults(matches);

  // IDs de partidos finalizados en SportScore que el admin AÚN no ha publicado.
  const pendingConfirmIds = React.useMemo(() => new Set(
    matches
      .filter(m => liveResults[m.id]?.state === 'finished' && m.status !== 'finished')
      .map(m => m.id)
  ), [matches, liveResults]);

  // Precargar el marcador sugerido de SportScore en el formulario, una sola vez
  // por partido (si el admin aún no escribió nada en ese campo).
  useEffect(() => {
    setResults(prev => {
      let changed = false;
      const next = { ...prev.form };
      for (const m of matches) {
        const lr = liveResults[m.id];
        if (lr?.state === 'finished' && lr.team1Score != null && lr.team2Score != null && !next[m.id]) {
          next[m.id] = { team1: String(lr.team1Score), team2: String(lr.team2Score) };
          changed = true;
        }
      }
      return changed ? { ...prev, form: next } : prev;
    });
  }, [matches, liveResults]);
```

Pasar las props nuevas a `MatchGroupList` (línea ~163):

```jsx
      <MatchGroupList
        sortedDates={sortedDates}
        groupedMatches={groupedMatches}
        hasLockedMatches={hasLockedMatches}
        results={results}
        setResults={setResults}
        handleStatusChange={handleStatusChange}
        handlePublishResult={handlePublishResult}
        editMatch={editMatch}
        deleteMatch={deleteMatch}
        predictionCountByMatchId={predictionCountByMatchId}
        liveResults={liveResults}
        pendingConfirmIds={pendingConfirmIds}
      />
```

- [ ] **Step 2: MatchGroupList pasa el estado en vivo a cada tarjeta**

En `src/pages/admin/MatchGroupList.jsx`, añadir `liveResults` y `pendingConfirmIds` a la firma (línea 20) y pasarlos a `MatchCardItem`:

```jsx
export default function MatchGroupList({ sortedDates, groupedMatches, hasLockedMatches, results, setResults, handleStatusChange, handlePublishResult, editMatch, deleteMatch, predictionCountByMatchId, liveResults, pendingConfirmIds }) {
```

Dentro del `.map`, pasar a `MatchCardItem`:

```jsx
          <MatchCardItem
            key={match.id}
            match={{ ...match, _predictionCount: predCount, _hasScoredPredictions: hasScoredPredictions }}
            hasLockedMatches={hasLockedMatches}
            results={results}
            setResults={setResults}
            handleStatusChange={handleStatusChange}
            handlePublishResult={handlePublishResult}
            editMatch={editMatch}
            deleteMatch={deleteMatch}
            liveResult={liveResults?.[match.id]}
            pendingConfirm={pendingConfirmIds?.has(match.id)}
          />
```

- [ ] **Step 3: MatchCardItem resalta y etiqueta "Resultado por confirmar"**

En `src/pages/admin/MatchCardItem.jsx`, añadir `liveResult` y `pendingConfirm` a la firma (línea 70):

```jsx
export default function MatchCardItem({ match, hasLockedMatches, results, setResults, handleStatusChange, handlePublishResult, editMatch, deleteMatch, liveResult, pendingConfirm }) {
```

Resaltar la tarjeta (línea 111): añadir borde/fondo ámbar cuando `pendingConfirm`:

```jsx
    <Card className={`mb-2 ${match.status === 'live' && !pendingConfirm ? 'ring-2 ring-red-500/50' : ''} ${pendingConfirm ? 'ring-2 ring-amber-400/70 bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
```

Tras el `<Badge>` de estado (línea ~124), añadir una etiqueta de "por confirmar":

```jsx
            {pendingConfirm && (
              <Badge className="bg-amber-500 text-white border-0">Resultado por confirmar</Badge>
            )}
```

- [ ] **Step 4: Verificar en la app local (admin)**

Run: abrir `http://localhost:5173/admin/matches` (logueado como admin).
Expected: el partido finalizado en SportScore aparece resaltado en ámbar, con "Resultado por confirmar" y el marcador sugerido (4-1) ya en los campos.

- [ ] **Step 5: Lint y commit**

Run: `pnpm exec eslint src/pages/admin/AdminMatches.jsx src/pages/admin/MatchGroupList.jsx src/pages/admin/MatchCardItem.jsx`
Expected: sin errores.

```bash
git add src/pages/admin/AdminMatches.jsx src/pages/admin/MatchGroupList.jsx src/pages/admin/MatchCardItem.jsx
git commit -m "feat(admin): resaltar partido finalizado en SportScore y precargar marcador sugerido"
```

---

### Task 4: Admin — "Publicar resultado" finaliza desde live/open

**Files:**
- Modify: `src/pages/admin/useMatchHandlers.js`
- Modify: `src/pages/admin/MatchCardItem.jsx`

Hoy `handlePublishResult`, cuando el partido está `live`, solo actualiza el marcador SIN finalizar. Para un partido "por confirmar" el botón debe FINALIZAR + evaluar + notificar aunque venga de `live`/`open`/`closed`.

- [ ] **Step 1: Añadir parámetro `forceFinish` a `handlePublishResult`**

En `src/pages/admin/useMatchHandlers.js`, en `handlePublishResult` (línea 176), aceptar un segundo argumento y, cuando sea `true`, saltar la rama "solo marcador en vivo" y finalizar directamente. Reemplazar la firma y la rama `if (match.status === 'live')`:

```js
  const handlePublishResult = async (match, forceFinish = false) => {
    if (!canPublishResult(match) && !forceFinish) {
      toast.error('El partido debe estar EN VIVO o FINALIZADO para actualizar el marcador.');
      return;
    }
    // Guard idempotencia: ya finalizado con el mismo resultado
    if (match.status === 'finished' && match.result_team1 != null && match.result_team2 != null) {
      const r = results.form[match.id];
      const sameResult = r && Number(r.team1) === match.result_team1 && Number(r.team2) === match.result_team2;
      if (sameResult || !r || r.team1 === '' || r.team2 === '') {
        toast.info('Este partido ya fue finalizado y evaluado.');
        return;
      }
    }
    const r = results.form[match.id];
    if (r?.team1 === undefined || r?.team2 === undefined || r.team1 === '' || r.team2 === '') {
      toast.error('Ingresa el resultado de ambos equipos');
      return;
    }
    const resultTeam1 = Number(r.team1);
    const resultTeam2 = Number(r.team2);

    // Solo actualizar marcador en vivo (sin finalizar) cuando NO se fuerza el final.
    if (match.status === 'live' && !forceFinish) {
      await api.entities.Match.update(match.id, { result_team1: resultTeam1, result_team2: resultTeam2 });
      setResults(prev => {
        const { [match.id]: _, ...rest } = prev.form;
        return { ...prev, form: rest };
      });
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success('Marcador actualizado (en vivo).');
      return;
    }

    await api.entities.Match.update(match.id, {
      result_team1: resultTeam1, result_team2: resultTeam2, status: 'finished',
    });
    const evalResult = await evaluateMatchPredictions(match.id, resultTeam1, resultTeam2);
    setResults(prev => {
      const { [match.id]: _, ...rest } = prev.form;
      return { ...prev, form: rest };
    });
    try { await db._syncSingleTableFromSupabase('predictions'); } catch (e) { /* noop */ }
    try { await db._syncSingleTableFromSupabase('users'); } catch (e) { /* noop */ }
    queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
    queryClient.invalidateQueries({ queryKey: ['matches'] });
    queryClient.invalidateQueries({ queryKey: ['ranking'] });
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0]?.startsWith('my-predictions')
    });
    toast.success(
      evalResult.correct > 0
        ? `✅ ${evalResult.correct} pronóstico${evalResult.correct > 1 ? 's' : ''} acertado${evalResult.correct > 1 ? 's' : ''} de ${evalResult.evaluated} evaluado${evalResult.evaluated > 1 ? 's' : ''}`
        : `${evalResult.evaluated} pronóstico${evalResult.evaluated > 1 ? 's' : ''} evaluado${evalResult.evaluated > 1 ? 's' : ''} — sin aciertos`
    );
  };
```

- [ ] **Step 2: Botón "Publicar resultado" en MatchCardItem para partidos por confirmar**

En `src/pages/admin/MatchCardItem.jsx`, `canPublishResult` (línea 62) excluye `open`. Para un partido "por confirmar" los inputs y el botón de publicar deben mostrarse aunque esté en `open`. Modificar la condición que muestra los inputs (línea 182) para incluir `pendingConfirm`, y añadir un botón "Publicar resultado" que llame con `forceFinish = true`.

Cambiar la condición del bloque de inputs:

```jsx
          {(canPublishResult(match) || pendingConfirm) ? (
```

Dentro de ese bloque, junto al botón "Actualizar" existente, cuando `pendingConfirm` mostrar el botón de publicar (finaliza). Reemplazar el botón "Actualizar" (líneas 209-212) por:

```jsx
                {pendingConfirm ? (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handlePublishResult(match, true)}
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    title="Finaliza el partido, evalúa pronósticos y notifica a los usuarios"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Publicar resultado
                  </Button>
                ) : (
                  <Button size="sm" variant={match.status === 'finished' ? 'outline' : 'secondary'} onClick={() => handlePublishResult(match)} className="h-8 text-xs">
                    <Save className="w-3 h-3 mr-1" />
                    Actualizar
                  </Button>
                )}
```

- [ ] **Step 3: Verificar el flujo completo en la app local**

Run: como admin, en `/admin/matches`, pulsar "Publicar resultado" en el partido por confirmar.
Expected: el partido pasa a `finished`, toast de pronósticos evaluados; en la vista de usuario (`/matches`) el partido muestra el veredicto final (¡Ganaste!/Perdiste) y los puntos; ya no dice "Por confirmar".

- [ ] **Step 4: Lint y commit**

Run: `pnpm exec eslint src/pages/admin/useMatchHandlers.js src/pages/admin/MatchCardItem.jsx`
Expected: sin errores.

```bash
git add src/pages/admin/useMatchHandlers.js src/pages/admin/MatchCardItem.jsx
git commit -m "feat(admin): boton 'Publicar resultado' finaliza y evalua desde 'por confirmar'"
```

---

### Task 5: Verificación final

- [ ] **Step 1: Lint del proyecto en los archivos tocados**

Run: `pnpm exec eslint src/pages/matches/useLiveResults.js src/pages/Matches.jsx src/pages/admin/AdminMatches.jsx src/pages/admin/MatchGroupList.jsx src/pages/admin/MatchCardItem.jsx src/pages/admin/useMatchHandlers.js`
Expected: sin errores.

- [ ] **Step 2: Recorrido manual del flujo completo**

1. Partido en juego → EN VIVO con minuto real.
2. SportScore finaliza → usuario lo ve en FINALIZADOS con "Por confirmar" (sin veredicto); admin lo ve resaltado con marcador precargado.
3. Admin pulsa "Publicar resultado" → usuario ve veredicto + puntos; ranking actualizado.

- [ ] **Step 3: Commit de cierre (si quedaran ajustes sueltos)**

```bash
git add -A
git commit -m "chore(partidos): cierre flujo 'Por confirmar' (ajustes finales)"
```
