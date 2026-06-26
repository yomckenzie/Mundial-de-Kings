# Nuevo modelo de apuestas: 3 componentes — Diseño

**Fecha:** 2026-06-25
**Estado:** Aprobado (brainstorming 25 jun 2026)
**Aplicación objetivo:** Partidos desde 28 jun 2026 (16avos de final en adelante)

## Problema

El modelo actual de apuestas obliga al usuario a predecir el **marcador exacto**
(`pred_team1` / `pred_team2`, ej. 2-1) y otorga **100 pts si acierta, 0 si falla**.
Es un solo acierto "todo o nada" que depende del resultado técnico del partido.

Limitaciones que queremos resolver:

1. **Fricción alta**: acertar el marcador exacto es difícil. La mayoría de usuarios
   obtienen 0 pts por partido y el ranking se mueve poco.
2. **No aprovecha las señales del fútbol moderno**: en partidos eliminatorios hay
   tres formas de ganar (90 min, tiempo extra, penales) que son señales
   independientes. Apostar "gana X en penales" es una habilidad distinta a
   predecir el marcador.
3. **No se distinguen partidos cerrados**: dos pronósticos con resultados cercanos
   (1-0 vs 2-1) suman lo mismo que dos pronósticos lejanos (0-0 vs 5-1). No hay
   granularidad.
4. **Datos infrautilizados**: ya leemos de SportScore si el partido terminó en
   tiempo extra o penales (`ft` / `aet` / `pen`) pero los descartamos en
   `normalizeState`.

## Objetivo

Reemplazar el modelo de "marcador exacto" por **3 picks independientes**, todos
obligatorios, evaluados por separado:

1. **Ganador** (1 / X / 2) → +50 pts si acierta
2. **Método** (90 / tiempo extra / penales) → +50 pts si acierta
3. **Marcador de penales** (solo si eligió penales y el partido fue a penales) → +50 pts si acierta

**Máximo 150 pts por partido.** Sin penal apostado: máximo 100. Solo ganador
apostado: máximo 50.

El ranking se recalcula con la misma regla de "suma de puntos de predicciones
correctas × valor", pero ahora un acierto puede valer 50, 100 o 150.

## Decisiones de diseño (acordadas)

| # | Decisión | Razón |
|---|---|---|
| 1 | Componentes independientes (no todo-o-nada) | Cada pick se evalúa solo; falla de uno no anula los otros |
| 2 | Ganador exacto de 90 min eliminado | Simplifica UX; se reemplaza por "ganador final + método" |
| 3 | Los 3 picks son obligatorios | Compromiso total por partido; sin picks a medias |
| 4 | Admin publica solo goles; método + penal auto desde SportScore | Mantiene simple el flujo admin; reduce trabajo manual |
| 5 | Sin migración de predicciones viejas | No hay predicciones previas; empieza limpio el 28 jun |
| 6 | Esquema columnas planas (no JSONB ni tabla separada) | 3 campos fijos; menos fricción con sync local↔nube y RLS |
| 7 | Input de penal **solo si el usuario eligió penales** | Regla estricta: "ya perdió, no puede hacer más nada" |
| 8 | Aplica desde 28 jun (16avos en adelante) | Activación coincide con inicio de la fase eliminatoria |

## Diseño

### 1. Modelo de datos

#### Tabla `predictions` — columnas nuevas

Se agregan 7 columnas a la tabla existente (las viejas `pred_team1` / `pred_team2`
se quedan por compatibilidad pero la UI ya no las pide):

- `pred_winner` (text): `'1'` | `'X'` | `'2'` — quién gana el partido (final)
- `pred_method` (text): `'90'` | `'et'` | `'pen'` — en qué momento se define
- `pred_penalty_team1` (integer, nullable) — penales del local (solo si method=pen)
- `pred_penalty_team2` (integer, nullable) — penales del visitante (solo si method=pen)
- `winner_correct` (boolean, nullable) — escrito al evaluar
- `method_correct` (boolean, nullable) — escrito al evaluar
- `penalty_correct` (boolean, nullable) — escrito al evaluar

Constraint: los penales vienen en par o ninguno (no se puede llenar uno solo).

`points_earned` se mantiene: en lugar de valer 0 o 100, ahora vale la **suma de
los componentes correctos** (0, 50, 100 o 150).

**Semántica de `scored`**: `scored = true` significa "se intentó evaluar con los
datos disponibles". Si el partido se publicó sin `result_method` (ej. SportScore
caído al momento de publicar), `scored` puede ser `true` pero `method_correct`
queda `null` (no se pudo determinar). El componente de método aporta 0 pts
porque no hay contra qué comparar; no falla por "ser distinto", simplemente no
se evalúa. Lo mismo aplica al `penalty_correct`: si `result_method` no es
`pen`, queda `null` y aporta 0 pts. Solo `winner_correct` siempre se puede
evaluar (los goles sí o sí están cuando se publica).

#### Tabla `matches` — columnas nuevas

- `result_method` (text, nullable): `'90'` | `'et'` | `'pen'` — cómo terminó
- `penalty_score_team1` (integer, nullable)
- `penalty_score_team2` (integer, nullable)

Se llenan automáticamente desde SportScore al finalizar el partido. El admin
puede corregirlos a mano si SportScore se equivocó.

#### RLS — sin cambios

Las políticas existentes (`predictions_insert_own_or_admin`,
`predictions_update_own_or_admin`) ya cubren INSERT/UPDATE por el propio email o
admin. Las columnas nuevas heredan esas políticas.

Regla de cliente (no BD): el usuario solo puede modificar las columnas de
predicción mientras `scored=false`. Cuando el admin publica resultado, scored
pasa a `true` y el pronóstico queda bloqueado para el usuario.

### 2. Lógica de evaluación

#### Cuándo se evalúa

Exactamente igual que ahora: cuando el admin publica el resultado final
(`evaluateMatchPredictions(matchId, resultTeam1, resultTeam2)` se llama
automáticamente desde `useMatchHandlers.js`). Lo que cambia es la comparación.

#### Las 3 comparaciones independientes

Para cada pronóstico del partido:

1. **Ganador**: comparar `pred_winner` contra el ganador del resultado final
   - `result_team1 > result_team2` → ganador = `'1'`
   - `result_team1 < result_team2` → ganador = `'2'`
   - `result_team1 == result_team2` → ganador = `'X'`
   - Coincide → `winner_correct = true`, +50 pts
2. **Método**: comparar `pred_method` contra `result_method`
   - `result_method` viene de SportScore (`ft`→'90', `aet`→'et', `pen`→'pen')
     o corregido por el admin
   - Coincide → `method_correct = true`, +50 pts
3. **Penal**: SOLO si (a) `pred_method = 'pen'` Y (b) `result_method = 'pen'`
   - Comparar `pred_penalty_team1` vs `penalty_score_team1` Y `pred_penalty_team2`
     vs `penalty_score_team2`
   - Coincide → `penalty_correct = true`, +50 pts
   - Si no aplica → `penalty_correct = null`, 0 pts

`points_earned = (winner_correct ? 50 : 0) + (method_correct ? 50 : 0) + (penalty_correct ? 50 : 0)`

#### Tabla de escenarios (resumen)

| pred_winner | pred_method | pred_penalty | resultado real | puntos |
|---|---|---|---|---|
| OK | 90 | — | terminó 90 | 100 |
| OK | et | — | terminó ET | 100 |
| OK | pen | 5-4 | terminó pen, 5-4 | 150 |
| OK | pen | 5-4 | terminó pen, 5-3 | 100 |
| OK | pen | 5-4 | terminó 90 (no fue a pen) | 50 |
| OK | 90 | — | terminó pen | 50 |
| mal | pen | 5-4 | terminó pen, 5-4 | 50 |
| mal | 90 | — | terminó 90 | 0 |
| cualquier error | — | — | — | 0 |

#### Idempotencia

Igual que ahora: la función recalcula TODOS los puntos del usuario desde cero,
mirando TODAS sus predicciones finalizadas. Si se ejecuta 1 o 100 veces, el
resultado es el mismo. No acumula, sobrescribe.

#### Comisión por referidos

Se mantiene: 5 pts al referente por partido con puntos ganados (>0).
**No escala** con la cantidad de puntos (un acierto de 150 sigue dando solo
5 pts al referente, igual que el acierto de 100 antes).

### 3. UI del usuario (Matches.jsx)

#### Tarjeta de partido abierto (sin pronóstico)

3 pasos en orden, dentro de la misma tarjeta:

**Paso 1: ¿Quién gana?** → 3 botones (LOCAL / EMPATE / VISITANTE) con nombre del
equipo debajo. Solo uno seleccionado a la vez.

**Paso 2: ¿En qué momento gana?** → 3 botones (90 MINUTOS / TIEMPO EXTRA /
PENALES). Solo uno seleccionado a la vez. Aparece después de elegir ganador.

**Paso 3: Marcador de penales** → 2 casillas con guión en el medio
(`[ 5 ] - [ 3 ]`). **Solo aparece si el usuario eligió PENALES en el paso 2.**
Etiqueta arriba: "Marcador de penales (solo si el partido va a penales)".

**Botón Enviar** → al final, apagado hasta que los 2 o 3 pasos estén completos.

#### Tarjeta con pronóstico enviado

- "Tu pronóstico": ganador + método + penal (si aplica)
- Estado del partido:
  - **Antes del partido**: "Esperando partido... podés ganar hasta 150 pts"
  - **En vivo**: "Partido en curso, esperando resultado final"
  - **Finalizado (sin publicar)**: "Por confirmar"
  - **Finalizado (publicado)**: desglose:
    - ✅/❌ Ganador: ±50 pts
    - ✅/❌ Método: ±50 pts
    - ✅/❌/⏸ Penal: ±50 pts (⏸ = no se evaluó, no fue a penales)
    - **Total: X pts**

#### Edición antes del cierre

Mismo comportamiento de hoy: el usuario puede modificar y reenviar, sobrescribe
la misma fila. Cuando el partido pasa a `live`, ya no puede cambiar.

### 4. UI del admin + integración con SportScore

#### SportScore provee

Ya lo lee `sportscore.js`. Hoy mapea `ft` / `aet` / `pen` todos a `'finished'`
en `normalizeState`. **Cambio**: separar `aet` y `pen` para devolver también
`result_method`.

Endpoint de detalle (`/api/widget/match/?...`) a veces trae `home_pen_score` /
`away_pen_score`. Cuando los trae, se usan automáticamente; cuando no, la UI del
admin muestra "Completar a mano".

#### Flujo del admin al publicar

1. Admin entra a **Admin → Partidos** y selecciona un partido finalizado.
2. Ve el formulario:
   - **Goles**: 2 casillas (Local / Visitante) — las llena a mano
   - **Cómo terminó**: campo que se autorrellena desde SportScore (`ft`→'90',
     `aet`→'et', `pen`→'pen'). Puede corregir a mano.
   - **Penales** (solo si cómo terminó = 'pen'): 2 casillas autorrellenadas si
     SportScore las trae. Puede corregir a mano.
3. Si `cómo terminó = 'pen'` y las casillas de penales están vacías, aparece
   un aviso amarillo: "Falta marcador de penales — completar a mano". El botón
   "Publicar resultado" está bloqueado hasta completarlo.
4. Admin le da "Publicar resultado". El sistema:
   - Guarda los 3 datos nuevos (goles + método + penales) en `matches`
   - Marca el partido como `finished`
   - Llama a `evaluateMatchPredictions` con la nueva lógica de 3 componentes
   - Recalcula puntos de todos los usuarios afectados desde cero

#### Publicación en masa (batch)

La pantalla de batch publish muestra todos los partidos a la vez. Cada fila
tiene los 3 campos (goles + método + penales autorrellenados). El admin revisa,
corrige lo que haga falta y le da "Publicar todos".

#### Cron automático — sin cambios

El cron `auto_transition_match_status` solo se encarga de abrir/cerrar
partidos. **No toca resultados ni evaluaciones**. Queda igual.

#### Reabrir partido finalizado

Si el admin se equivoca, puede cambiar el estado `finished → open`. Esto:
- Borra goles, método y penales
- Marca todos los pronósticos del partido como `scored = false` (vuelve a
  estado "pendiente de resultado")
- Al republicar, el sistema re-evalúa desde cero

La matriz de transiciones ya permite `finished → open` (fix del 16 jun). Hay
que asegurar que también limpia `result_method` y `penalty_score_*` (no solo
`result_team1` / `result_team2`).

### 5. Casos borde

| Caso | Manejo |
|---|---|
| Partido se suspende / reprograma | Admin reabre, borra resultado anterior, queda como `open` |
| SportScore caído o sin datos | "No se pudo detectar automáticamente — completar a mano" |
| SportScore dice `pen` pero no da penales | Aviso amarillo; admin completa a mano antes de publicar |
| Empate 90 min → ET → penales | "Ganador" = ganador final (no del 90); un usuario que apostó "empate" NO gana aunque haya sido empate hasta los 120 min |
| Admin edita partido en vivo | Equipos bloqueados; solo fecha/hora/fase editables (igual que hoy) |
| Admin publica resultado incorrecto | Reabrir → corregir → republicar (recalcula desde cero) |
| Dos partidos a la vez, admin se confunde | Fila muestra claramente equipos + fecha; reabrir si se equivocó |
| Predicción con `pred_team1`/`pred_team2` viejos | Se mantienen en BD; la UI no los usa; la evaluación los ignora |
| RLS bloquea escritura del admin | Por diseño; el admin usa sesión autenticada y tiene `is_admin()` |

### 6. Lo que NO entra en esta versión

- ❌ Penalización por pronóstico fallido (siempre 0, nunca negativo)
- ❌ Multiplicadores por confianza o por partidos importantes
- ❌ Apuestas entre usuarios
- ❌ Notificaciones push cuando se evalúa un partido
- ❌ Otros tipos de apuesta (goles totales, primer gol, etc.)

## Componentes

1. **Migración SQL** `supabase/migrations/2026-06-25-001-betting-3ways.sql`
   - ALTER TABLE a `predictions` (7 columnas nuevas + constraint de pares)
   - ALTER TABLE a `matches` (3 columnas nuevas)
   - Rollback incluido en comentarios al inicio

2. **`src/api/evaluateMatchPredictions.js`** — refactor de la lógica de scoring
   - Nueva firma: `evaluateMatchPredictions(matchId, resultTeam1, resultTeam2,
     resultMethod, penaltyT1, penaltyT2)`
   - 3 comparaciones independientes; suma de puntos
   - Mantiene idempotencia

3. **`src/lib/sportscore.js`** — extensión para leer método + penales
   - `normalizeState` separa `ft` / `aet` / `pen`
   - Nueva función `getMatchResultDetails(slug)` que intenta leer penales del
     endpoint de detalle

4. **`src/pages/Matches.jsx`** — UI de 3 pasos
   - Reemplazar inputs de goles por 3 secciones (ganador / método / penal)
   - Validación: todos los picks requeridos; penal solo si method=pen
   - Mostrar desglose post-evaluación

5. **`src/pages/admin/useMatchHandlers.js`** + UI admin
   - Pasar método + penales a `evaluateMatchPredictions`
   - Limpiar `result_method` y `penalty_score_*` al reabrir
   - Asegurar que `finished → open` también borra los nuevos campos

6. **`src/pages/admin/MatchCardItem.jsx`** y similares
   - Mostrar campos de método y penales en el formulario del admin
   - Autorrellenar desde SportScore; permitir override

7. **Tests**
   - `evaluateMatchPredictions.test.js` — extender con escenarios de 3 componentes
   - `sportscore.test.js` (nuevo) — normalización `ft`/`aet`/`pen`
   - Test de integración: predicción completa → evaluación → ranking

## Entrega

### Lo que entrego yo (programación)

1. Migración SQL lista para correr
2. Refactor de `evaluateMatchPredictions` con tests
3. UI nueva en `Matches.jsx`
4. UI admin + integración SportScore
5. Commit con todos los cambios

### Lo que hace el operador (vos)

1. **Día 25-26 jun**: correr `2026-06-25-001-betting-3ways.sql` en SQL Editor
2. **Día 26-27 jun**: hacer deploy de la app con los cambios
3. **Día 27 jun (sábado)**: pruebas manuales con partido de prueba
4. **Día 28 jun (domingo)**: activación con partidos de 16avos

### Plan de pruebas

**Automáticas** (las corro yo):
- 8 escenarios de scoring (ver tabla arriba)
- Idempotencia: ejecutar 2 veces no duplica
- Migración: predicciones viejas con `pred_team1/2` siguen funcionando
- Reabrir + republicar: recalcula correctamente
- Bloqueo: si método = pen y penales vacíos, no permite publicar

**Manuales** (las hacés vos):
- Llenar pronóstico nuevo (3 picks) → enviar → ver que se guardó
- Verificar en partido en vivo que el pronóstico se muestra
- Partido finalizado: ver desglose correcto
- Probar caso de penales con partido de prueba
- Probar reabrir y republicar

## Flujo de datos

```
Usuario envía pronóstico (Matches.jsx)
  → POST a predictions con {pred_winner, pred_method, pred_penalty_team1/2}
  → Sync a Supabase (db.js)

Partido termina en vivo
  → SportScore devuelve status 'ft' | 'aet' | 'pen' + penales (a veces)
  → useLiveResults actualiza la UI en vivo

Admin publica resultado (AdminMatches.jsx)
  → Lee método y penales de SportScore (auto) o a mano
  → UPDATE matches SET result_team1, result_team2, result_method, penalty_score_*
  → UPDATE matches SET status = 'finished'
  → evaluateMatchPredictions(matchId, t1, t2, method, pt1, pt2)
    → Para cada predicción del partido:
      → Comparar pred_winner vs ganador(t1,t2)
      → Comparar pred_method vs result_method
      → Si method='pen' y result_method='pen': comparar penales
      → UPDATE predictions SET winner_correct, method_correct, penalty_correct, points_earned
    → recalculatePointsForEmails (suma de puntos correctos × valor)
      → UPDATE users SET prediction_points, total_points

Ranking se actualiza automáticamente al cambiar users.prediction_points
```

## Parámetros por defecto

- Puntos por componente correcto: **50**
- Comisión por referido: **5 pts fijos por partido con puntos > 0**
- Frecuencia de evaluación: al publicar resultado (manual del admin)
- Aplica desde: **2026-06-28** (16avos de final en adelante)
- Zona horaria: **America/Panama** (igual que el resto del sistema)

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| SportScore no detecta `aet`/`pen` | Baja | Medio | Admin corrige a mano |
| SportScore no trae penales | Media | Bajo | Admin completa a mano |
| Migración SQL falla | Baja | Alto | Script con rollback; probar en backup primero |
| Test falla en producción | Baja | Alto | Admin reabre + republica |
| UI confunde al usuario | Media | Medio | Mensajes claros en cada paso |
| Ranking se mueve raro | Baja | Alto | Tests de idempotencia; recalcular desde cero |
| Usuarios envían antes del cambio y nuevo formato | Baja | Bajo | Deploy coordinado; ventana de 24h sin partidos entre cambios |
