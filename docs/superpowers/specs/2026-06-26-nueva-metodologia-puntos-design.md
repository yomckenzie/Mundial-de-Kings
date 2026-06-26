# Nueva metodología de puntos (v2) — Diseño

**Fecha:** 2026-06-26
**Estado:** Pendiente de aprobación final
**Reemplaza:** spec del 25 jun (`2026-06-25-betting-3ways-design.md`) para partidos desde 28 jun 2026
**Aplica desde:** partidos a partir del 28 jun 2026

## Contexto

El spec del 25 jun propuso 3 picks independientes (ganador + método + penales,
máx 150 pts). En revisión con el usuario se decidió que ese modelo no
aprovecha bien las señales del fútbol moderno y deja afuera el marcador
exacto, que es donde está la habilidad real del pronosticador.

Este spec **reemplaza el modelo anterior** con uno más granular pero más
justo: el usuario debe predecir el partido completo (ganador + cómo gana +
marcador) en vez de apostar a pedazos.

## Objetivo

3 picks obligatorios, todos visibles, evaluados independientemente. La
granularidad incentiva el análisis profundo del partido sin volver al
"todo o nada" del modelo viejo de marcador exacto.

## Reglas de scoring

### Los 3 picks

| # | Pick | Opciones | Puntos | Notas |
|---|---|---|---|---|
| 1 | **Ganador** | Local / Visitante (sin Empate) | **+50** | El ganador es el del partido **completo** (post-pens si los hubo) |
| 2 | **Método** | 90 min / Tiempo extra / Penales | **+50** | Independiente del pick 1 |
| 3 | **Marcador exacto** | depende del método | ver abajo | **Requiere winner correcto para contar** |

### Pick 3 según método

- **Método = 90 min**: predecir score final a los 90 min → **+100 pts**
- **Método = Tiempo extra**: predecir score final a los 120 min (pre-pens) → **+100 pts**
- **Método = Penales**: el pick 3 se parte en 2 sub-picks obligatorios:
  - **3a. Marcador pre-penales** (score al final de los 120 min) → **+50 pts**
  - **3b. Marcador de penales** → **+100 pts**

### Máximos por partido

| Método | Ganador | Método | Score partido | Score penales | **Total** |
|---|---|---|---|---|---|
| 90 min | 50 | 50 | 100 | — | **200** |
| Tiempo extra | 50 | 50 | 100 | — | **200** |
| Penales | 50 | 50 | 50 | 100 | **250** |

Solo 50 pts más de reward por atreverse con penales vs 90 min, balanceado
con la complejidad de predecir 2 scores.

### Regla de dependencia (score requiere winner correcto)

Si el pick 1 (ganador) es **incorrecto**, el pick 3 (score) **no cuenta**
aunque los números sean iguales numéricamente. Justificación: si predecís
"Visitante 2-1" y el real es "Local 2-1", el score es el mismo número pero
claramente no entendiste el partido.

En penalties aplica igual: si predecís "Local, pre-pen 1-1, pen 4-3" y el
real es "Visitante, pre-pen 1-1, pen 4-3", perdés score aunque los números
coincidan.

## Esquema de base de datos

### Tabla `predictions` — columnas a AGREGAR

```sql
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_score_team1 INT NULL,
  ADD COLUMN IF NOT EXISTS pred_score_team2 INT NULL,
  ADD COLUMN IF NOT EXISTS pred_pen_team1 INT NULL,
  ADD COLUMN IF NOT EXISTS pred_pen_team2 INT NULL;
```

- `pred_score_team1/2`: score predecido al cierre del método (90min, 120min,
  o 120min pre-pen). Para método=pen, esto es el "score pre-penales".
- `pred_pen_team1/2`: score de penales, solo si método=pen.

### Tabla `predictions` — columnas LEGACY (se mantienen)

- `pred_penalty_team1`, `pred_penalty_team2`: las del modelo anterior (+50
  si método=pen y el user acertó el score de penales).
- Se mantienen para no romper predicciones ya existentes que se evaluaron
  con el modelo v1 (50+50+50 = 150 max).

### Tabla `predictions` — columna `pred_winner` cambia semántica

- **Antes (v1)**: podía ser `'team1' | 'draw' | 'team2'`
- **Ahora (v2)**: solo `'team1' | 'team2'`
- Predicciones v1 con `pred_winner='draw'` siguen funcionando con reglas v1
  en `evaluateMatchPredictions` (legacy).

## Lógica de scoring — `evaluateMatchPredictions`

### Branching: legacy vs nuevo

```javascript
function isV2Prediction(pred) {
  return pred.pred_score_team1 != null || pred.pred_score_team2 != null;
}

async function evaluateMatchPredictions(matchId, resultTeam1, resultTeam2, resultMethod, penaltyScoreT1, penaltyScoreT2) {
  // 1. Cargar predictions (igual)
  // 2. Excluir admins (igual)
  // 3. Para cada prediction:
  //    if (isV2Prediction(pred)) applyV2Rules(...)
  //    else applyLegacyV1Rules(...)
  // 4. Upsert resultados (igual)
  // 5. Recalcular puntos (igual)
}
```

### Reglas v2

```javascript
function scoreV2(pred, result) {
  const { team1, team2, method, penaltyT1, penaltyT2 } = result;

  // Ganador real (post-pens si los hubo)
  const actualWinner = deriveWinner(team1, team2, method, penaltyT1, penaltyT2);
  const winnerCorrect = actualWinner != null && pred.pred_winner === actualWinner;

  // Método
  const methodCorrect = pred.pred_method === method;

  // Score según método
  let scoreCorrect = null;
  if (winnerCorrect) {
    if (method === 'ft' || method === 'aet') {
      scoreCorrect = pred.pred_score_team1 === team1 && pred.pred_score_team2 === team2;
    } else if (method === 'pen') {
      // Para pen, "pred_score_*" ES el score pre-pen (score al final de ET)
      const prePenCorrect = pred.pred_score_team1 === team1 && pred.pred_score_team2 === team2;
      const penCorrect = pred.pred_pen_team1 === penaltyT1 && pred.pred_pen_team2 === penaltyT2;
      scoreCorrect = prePenCorrect && penCorrect;
    }
  }

  // Puntos
  let points = 0;
  if (winnerCorrect) points += 50;
  if (methodCorrect) points += 50;

  if (method === 'ft' || method === 'aet') {
    if (scoreCorrect) points += 100;
  } else if (method === 'pen') {
    // Pre-pen y pen son picks separados
    if (scoreCorrect) {
      points += 50 + 100; // pre-pen + pen, ambos requirieron winner correcto
    } else {
      // Caso raro: winner correcto, método correcto, pero solo 1 de los 2 scores correctos
      // El usuario no recibe puntos de score (es 0 o 150, no 50 ni 100 sueltos)
      // Decisión: si gana los 2 scores = 150 pts; si no = 0 pts del pick 3
      // (más simple y predecible)
    }
  }

  return { winnerCorrect, methodCorrect, scoreCorrect, points };
}
```

**Nota sobre pen con 1 solo score correcto**: si winner y método son correctos
pero solo 1 de los 2 scores es correcto, el pick 3 entero es 0 (no se
fraccionan los 50/100). Esto es consistente con el modelo v1 (penal
"todo o nada" = 50 pts). Si querés cambiar esto más adelante, queda como
decisión de UX.

### Campos a persistir por predicción v2

```javascript
{
  winner_correct: true | false,
  method_correct: true | false,
  score_correct: true | false,        // true solo si winner correcto + scores coinciden
  pre_pen_correct: true | false,     // nuevo, específico para método=pen
  pen_correct: true | false,         // nuevo, específico para método=pen
  is_correct: points > 0,
  points_earned: 50 | 100 | 150 | 200 | 250,
  scored: true,
}
```

### Columnas a AGREGAR en `predictions`

- `pre_pen_correct BOOLEAN NULL`
- `pen_correct BOOLEAN NULL`

## UI del usuario — formulario de pronóstico

3 picks siempre visibles en el formulario. Cuando se elige
método=Penales, el input único de score se transforma en 2 inputs.

```
┌──────────────────────────────────────────────────────┐
│  Partido: Brasil vs Argentina                        │
│  Hora: 28 jun 18:00                                  │
│                                                      │
│  1. ¿Quién gana?                                     │
│     [ Local ] [ Visitante ]             → +50 pts    │
│                                                      │
│  2. ¿Cómo gana?                                      │
│     [ 90 min ] [ T. extra ] [ Penales ]  → +50 pts   │
│                                                      │
│  3. Marcador exacto                                  │
│     [ _ ] - [ _ ]                     → +100 pts    │
│                                                      │
│     Si elegiste Penales, se muestran 2 inputs:       │
│     Pre-penales:  [ _ ] - [ _ ]        → +50 pts    │
│     Penales:      [ _ ] - [ _ ]        → +100 pts   │
│                                                      │
│  Si acertás todo: hasta 200 pts (250 si pen)         │
│                                                      │
│  [ Enviar pronóstico ]                               │
└──────────────────────────────────────────────────────┘
```

### Validaciones frontend

- Ganador: requerido (Local o Visitante, no nulo)
- Método: requerido
- Score team1, score team2: requeridos, enteros 0-30
- Si método=pen: pred_pen_team1, pred_pen_team2 requeridos, enteros 0-20

### UX del cambio dinámico de score

- Estado local `scoreMode = 'single' | 'double'`
- Cuando `pred_method === 'pen'`: `scoreMode = 'double'` (2 inputs)
- Caso contrario: `scoreMode = 'single'` (1 input)
- Transición instantánea sin animación (cambio claro)

## UI del admin — publicar resultado

El formulario de publicar resultado ya soporta método y penales
(auto-fill desde SportScore). Ahora también debe soportar el modelo v2
sin cambios funcionales (los admin fields son los mismos: team1, team2,
resultMethod, penaltyTeam1, penaltyTeam2).

**No hay cambios en AdminMatches** — sigue funcionando igual porque las
columnas de resultado ya tienen toda la info necesaria.

## Copy a actualizar

### `Info.jsx` (sección "Ganar")

Reemplazar el copy actual por:

```
Después de crear tu cuenta, podrás realizar pronósticos diarios.

• Los partidos se habilitarán 24 horas antes
• Los pronósticos se cierran automáticamente al iniciar el partido
• Cada pronóstico se compone de 3 picks independientes:
  1. Quién gana (Local / Visitante) → +50 pts
  2. Cómo gana (90 min / Tiempo extra / Penales) → +50 pts
  3. Marcador exacto → +100 pts
     · Si elegiste Penales, son 2 marcadores:
       - Pre-penales → +50 pts
       - Penales → +100 pts

Para que el marcador cuente, tenés que acertar también el ganador.
Sin acertar el ganador, el marcador no suma.

Máximo por partido:
• Terminado en 90 min o tiempo extra: 200 pts
• Terminado en penales: 250 pts
```

### `Home.jsx` (hero)

```
Participa haciendo pronósticos en cada partido del Mundial.
Cada pronóstico tiene 3 picks independientes: ganador, método y marcador
exacto. Si elegís penales, son 2 marcadores. Puedes ganar hasta
250 puntos por partido.
```

### `Profile.jsx` (desglose por pick)

Mostrar `winner_correct`, `method_correct`, `score_correct`,
`pre_pen_correct`, `pen_correct` cuando aplique.

## Migración y compatibilidad hacia atrás

### Predicciones existentes

- Predicciones con `pred_score_team1` NULL y `pred_penalty_team1` NOT NULL →
  son v1 (legacy). Se evalúan con reglas v1 (50 winner + 50 method + 50 penalty).
- Predicciones con `pred_score_team1` NOT NULL → son v2. Se evalúan con reglas v2.

### Backfill

**No hacer backfill**: predicciones v1 se quedan como v1. Si están
sin evaluar (`scored=false`), se evalúan con reglas v1. Si ya están
evaluadas con reglas v1, no se re-evalúan.

### Orden de rollout

1. **Migración SQL**: agregar columnas nuevas a `predictions` (idempotente).
2. **Backend scoring**: branch en `evaluateMatchPredictions` por versión.
3. **Frontend form**: lógica condicional según método.
4. **Info / Home / Profile**: actualizar copy.
5. **Tests unitarios**: cubrir reglas v2 y branch v1/v2.
6. **E2E en localhost**: 3 partidos is_test, escenarios ft / aet / pen.

## Tests unitarios a agregar

```javascript
// evaluateMatchPredictions.test.js (extender el existente)

describe('v2 — 90 min', () => {
  test('todos los picks correctos → 200 pts');
  test('solo ganador correcto → 50 pts');
  test('solo método correcto → 50 pts');
  test('score correcto con ganador incorrecto → 50 pts (solo method)');
  test('ninguno correcto → 0 pts');
});

describe('v2 — tiempo extra', () => {
  test('todos los picks correctos → 200 pts');
  test('método correcto pero ganador incorrecto → 50 pts');
});

describe('v2 — penales', () => {
  test('todos los picks correctos → 250 pts');
  test('pre-pen correcto pero pen incorrecto → 100 pts (winner+method, score 0)');
  test('pen correcto pero pre-pen incorrecto → 100 pts (winner+method, score 0)');
  test('ganador incorrecto, scores correctos → 50 pts (solo method si correcto)');
});

describe('v1 legacy', () => {
  test('predicción con pred_penalty_team1/2 se evalúa con reglas v1');
  test('max v1 sigue siendo 150');
});

describe('branching v1 vs v2', () => {
  test('isV2Prediction detecta por presencia de pred_score_team1');
  test('partido con mezcla de preds v1 y v2 evalúa cada una con sus reglas');
});
```

## Out of scope (decisiones explícitas)

- **Empate**: ya no es opción seleccionable. Partidos que terminan en empate
  durante 90 min y van a ET/pens tienen ganador al final.
- **Re-evaluación retroactiva**: predicciones v1 ya evaluadas no se
  re-evaluan. Predicciones v2 nuevas usan reglas v2.
- **UI de "cambiar de v1 a v2"**: si el usuario ya tiene una predicción v1,
  no puede migrarla a v2. Tendría que borrar (cuando esté permitido) y
  crear nueva. **Decisión**: en este deploy, no se permite editar predicciones
  después de cerrar el partido (consistente con el modelo actual).

## Riesgos identificados

1. **RLS restrictivo en producción**: las migraciones a `predictions` deben
   hacerse con rol `postgres` desde el SQL Editor. anon NO puede escribir
   ahí. **Mitigación**: usar la migration `supabase/migrations/...` con
   permisos de service_role.
2. **Predicciones v1 existentes con `pred_winner='draw'`**: si quedó alguna
   en la BD, seguirá funcionando con reglas v1 (50 winner + 50 method + 50
   penalty). No rompe nada.
3. **Admin publica sin pre-pen score cuando método=pen**: si el admin
   elige método=pen pero olvida llenar penalty_team1/2, el score de pen
   del usuario no se puede evaluar. **Mitigación**: validar en el form de
   admin que si method=pen, ambos pen scores son required.
4. **Cambio de UX en partidos ya abiertos**: si ya hay partidos con
   predicciones v1 (no evaluadas), el admin no puede "reabrir" para que
   el usuario cambie a v2. **Decisión**: aceptar este edge case. La
   mayoría de partidos con predicciones v1 ya están evaluados.