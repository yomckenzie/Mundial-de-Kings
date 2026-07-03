# Design — Admin: editar partidos con selector de equipos

**Fecha:** 2026-07-03
**Scope:** feature nueva — agregar a `EditMatchDialog` la capacidad de cambiar los
nombres de los equipos (`team1` / `team2`) usando un `<Select>` poblado con equipos
ya presentes en la base de datos. Hoy solo se pueden editar `match_date`,
`match_time` y `group_stage`.

## Contexto

El admin del fixture de eliminatorias crea partidos placeholder como
`Argentina vs Ganador 101` o `Francia vs 1° Grupo A`. Cuando los partidos previos
se resuelven, el admin necesita reemplazar esos placeholders por el equipo real
que clasificó. Hoy la única vía es editar manualmente el string en la base de
datos, lo que es propenso a typos y rompe el matcheo de SportScore (que requiere
nombres exactos de `worldCupTeams.js`).

## Decisión de diseño (alto nivel)

1. Extender el `EditMatchDialog` existente en `MatchCardItem.jsx:348-445` para
   incluir `team1` y `team2` en el form. NO crear un componente nuevo.
2. La lista de opciones del `<Select>` se calcula a partir de TODOS los partidos
   que ya cargó `api.entities.Match.list()` (no solo los visibles). El admin
   debe ver TODOS los equipos ya usados en la BD para poder elegir el correcto.
3. Cada `<Select>` ofrece:
   - El equipo actual pre-seleccionado.
   - Una lista alfabética de equipos únicos presentes en otros partidos de la BD.
   - Si el equipo actual NO es un equipo real según `isRealTeam()` de
     `src/lib/worldCupTeams.js`, una opción adicional explícita
     `"<valor actual> (placeholder)"` que el admin puede elegir si quiere
     mantener el placeholder.
4. Validación en `handleSave`: si `team1 === team2`, toast de error y abortar.
5. Resto del comportamiento del dialog sin cambios: descripción actualizada,
   botones, carga desde `useMatchHandlers.editMatch`, invalidaciones existentes.

## Componente y contrato

### Archivos a modificar

- `src/pages/admin/MatchCardItem.jsx` — extender `EditMatchDialog` (líneas 348-445).
- `src/pages/admin/AdminMatches.jsx` — pasar la lista de partidos al `MatchGroupList`
  para que las cards la puedan derivar localmente. Alternativa: que cada card
  derive su propia lista local sobre `predictionCountByMatchId` + lista cruda
  que AdminMatches ya carga. Ver §"Data flow" para el approach elegido.

### Archivos NO modificados

- `src/lib/worldCupTeams.js` — se usa `isRealTeam()` (sin cambios).
- `src/api/useMatchHandlers.js` — el handler `editMatch` (líneas 112-123) ya
  acepta `{ id, data }` con subset arbitrario; pasa `team1`/`team2` directo.
  El comentario en línea 110 ("NO permite editar equipos") se actualiza para
  reflejar la nueva capacidad.
- `src/api/client.js` / `src/lib/db.js` — `api.entities.Match.update` ya
  persiste subset de campos.
- `src/components/ui/select.jsx` — ya existe y ya se importa en
  `MatchCardItem.jsx` para el selector "Cómo terminó".

### Estado del form

Extender el `useState` actual (líneas 350-354) de 3 campos a 5:

```js
const [form, setForm] = useState({
  team1: match.team1 || '',
  team2: match.team2 || '',
  match_date: match.match_date || '',
  match_time: match.match_time || '',
  group_stage: match.group_stage || '',
});
```

### Validaciones en `handleSave`

1. Check existente (líneas 372-376): si `match.status` ∈ {live, finished} Y
   `_hasScoredPredictions` → toast de error y abort. **Sin cambios.**
2. Check nuevo: si `form.team1 === form.team2` → toast
   `'Los dos equipos deben ser distintos'` y abort.

### Payload de la mutación

`editMatch.mutate({ id: match.id, data: form })` manda los 5 campos. El backend
(`api.entities.Match.update`) persiste solo lo enviado. Resultado: cero cambio
en la capa de API.

### UI del dialog (texto y layout)

- Título: "Editar partido" (sin cambios).
- Descripción: `"Modifica los equipos, fecha, hora o fase. El resultado no se
  puede cambiar."` (actualizado — antes decía que los equipos no se podían
  cambiar).
- Layout: dos columnas para los selectores de equipos (Equipo local /
  Equipo visitante), luego en fila o grid Fecha / Hora / Fase / Grupo.
- Botón "Guardar" deshabilitado mientras `editMatch.isPending`.

### Cálculo de la lista de equipos disponibles

En `MatchCardItem`, agregar un `useMemo` que reciba la lista de todos los
partidos (prop nueva `allMatches`):

```js
const usedTeams = useMemo(() => {
  if (!allMatches) return [];
  const set = new Set();
  for (const m of allMatches) {
    if (m.team1) set.add(String(m.team1).trim());
    if (m.team2) set.add(String(m.team2).trim());
  }
  // No deduplicar placeholders como "Ganador 101" y "1° Grupo A" porque
  // pueden tener sufijos distintos — preservamos todos los strings únicos.
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}, [allMatches]);
```

Cada `<Select>` recibe:
- `value = form.team1` (o `team2`).
- Lista de `<SelectItem>` con los `usedTeams`.
- Si `form.team1` NO está en `usedTeams` (caso placeholder que solo aparece
  en este partido), primer item = `"<form.team1> (placeholder actual)"` con
  el value pre-seleccionado.
- Si `form.team1` SÍ está en `usedTeams`, se renderiza como un item normal
  sin el sufijo "(placeholder actual)".

### Edge cases de la lista

- `allMatches` está vacío (caso raro: admin entra justo después de borrar todo):
  `usedTeams = []` y el select muestra solo el placeholder actual.
- `form.team1` y `form.team2` ya están en `usedTeams`: select renderiza solo
  la lista normal, sin opciones extra de placeholder.
- `form.team1` es un placeholder y `form.team2` es un equipo real: select
  de local muestra el placeholder pre-seleccionado + lista; select de visitante
  muestra solo la lista normal.

## Data flow + invalidaciones

### Cómo llega `allMatches` a cada `MatchCardItem`

`AdminMatches.jsx` ya carga partidos con `useQuery(['admin-matches-sorted'])` en
línea 32. Pasamos ese array directamente a `MatchGroupList` (línea 233) como
prop nueva `allMatches`, y `MatchGroupList` la propaga a cada `MatchCardItem`
(línea 38-55). No hace falta query extra — los datos ya están en memoria.

### Invalidaciones post-guardado

`useMatchHandlers.editMatch.onSuccess` (líneas 115-119) ya invalida:

- `['admin-matches-sorted']` → recarga la lista admin (incluyendo el partido
  recién editado).
- `['matches']` → refresca la vista pública (`useMatches.jsx`) para que el
  usuario vea el nombre nuevo.
- Predicate `'my-predictions'` → actualiza el historial del usuario (porque
  cambió la "etiqueta" del partido que vio al pronosticar).

**No hace falta agregar invalidaciones nuevas.** El comportamiento end-to-end
funciona sin cambios.

### Live polling

`useLiveResults.js:47-49` filtra partidos relevantes con
`isInPlayWindow(m) && isRealTeam(m.team1) && isRealTeam(m.team2)`. Si el admin
cambia un placeholder a un equipo real, en el siguiente ciclo de polling ese
partido pasa el filtro `isRealTeam` y SportScore puede matchearlo. Si lo
cambia a otro placeholder, sigue excluido (correcto). Sin cambios en
`useLiveResults`.

## Edge cases (cubiertos)

1. **Partido con `_hasScoredPredictions` true + status live/finished:** el
   `handleSave` existente ya lo bloquea con toast. Sin cambios.
2. **`team1 === team2`:** nuevo check en `handleSave`, toast + abort.
3. **Placeholder que no se toca:** se persiste igual (string sin cambios).
   Cero riesgo.
4. **Placeholder → equipo real:** guardado normal; live polling empieza a
   matchear ese partido.
5. **Lista de equipos pequeños (pocos partidos):** el admin puede no encontrar
   el equipo que necesita. Mitigación documentada en el spec: el admin debe
   crear primero un partido con ese equipo (vía QuickActions o BulkSync) y
   luego editar el placeholder para elegirlo. Esto NO es un caso de uso
   normal del feature.
6. **Partido que se está editando A LA VEZ que otro admin edita otro partido:**
   TanStack Query serializa las mutaciones; la última escritura gana. La UI
   refresca después vía `invalidateQueries`. Sin cambios necesarios.
7. **Live polling con equipos cambiados:** ver §"Data flow + invalidaciones".
   Sin colisión.

## Testing

- Tests unitarios NO son necesarios para este dialog porque es UI pura que
  delega a un mutation ya cubierto por la integración admin.
- Verificación end-to-end manual en localhost:
  1. Crear partido placeholder `Argentina vs Ganador 101`.
  2. Abrir dialog de editar (botón "Editar" en la card).
  3. Verificar que el select "Equipo visitante" muestra
     `"Ganador 101 (placeholder actual)"` + lista de equipos usados.
  4. Elegir `Francia`, guardar.
  5. Verificar en `/partidos` (vista pública) que el visitante ahora es
     `Francia`.
  6. Verificar en BD con `SELECT team1, team2 FROM matches WHERE id = '...'`.

## Archivos a tocar (resumen)

| Archivo | Líneas aprox | Cambio |
|---------|--------------|--------|
| `src/pages/admin/MatchCardItem.jsx` | 348-445 | Extender `EditMatchDialog` con 2 `<Select>`, validar `team1 !== team2`, agregar `useMemo` de `usedTeams`, actualizar descripción |
| `src/pages/admin/AdminMatches.jsx` | 233 | Pasar `allMatches` a `MatchGroupList` |
| `src/pages/admin/MatchGroupList.jsx` | 20, 38-55 | Aceptar prop `allMatches` y propagarla a `MatchCardItem` |
| `src/api/useMatchHandlers.js` | 110 | Actualizar comentario sobre campos editables |

**Total:** 4 archivos, ~80 líneas modificadas o agregadas (incluyendo imports
y comentarios). Ningún archivo nuevo.