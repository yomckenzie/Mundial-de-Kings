# Puntos Extra — Semifinal y Final

**Fecha:** 2026-07-17
**Estado:** Diseño para revisión
**Scope:** Persistencia + scoring + UI real en `/partidos` y admin

## Contexto

En la fase final del Mundial (semifinal y final), además de los 3 picks normales
(ganador / método / marcador exacto), los usuarios podrán contestar **7 preguntas
tipo quiniela** (sí/no y opción múltiple, una con "Otro" libre). Cada acierto
suma **+5 pts extra**, independientes del gate del pick principal.

Implementado como maqueta visual en `/demo-semifinal` (ver `src/pages/DemoSemifinal.jsx`).
Este spec describe el upgrade a feature **persistente**: las respuestas se guardan
en Supabase, el admin carga las respuestas correctas, la evaluación suma puntos,
y el breakdown muestra el desglose.

## Goals

- Usuarios ven un bloque "Puntos extras" debajo del form V2 normal en MatchCard,
  solo para partidos semifinal/final del Mundial 2026.
- Cada pregunta +5 pts al acertar, independiente del pick principal (sin gate de ganador).
- Mismo timing que los picks: 24h ventana de predicción, 48h de visibilidad (reutilizar `isMatchOpenForPredictions`).
- Admin carga las respuestas correctas al publicar resultado; re-publicar sobrescribe y re-evalúa.
- Breakdown del usuario muestra ✅/❌/⏳ por pregunta.

## Non-goals

- Preguntas parametrizables desde admin UI (están **hardcoded** en código por decisión del producto).
- Preguntas para partidos que no sean las dos semifinales reales del Mundial 2026 ni la final.
- Interpolación dinámica de jugadores (las preguntas asumen Mbappé/Bellingham/Kane/Griezmann para ING-FRA y Messi/Yamal/Álvarez/Williams para ARG-ESP).
- Re-evaluación parcial (re-correr evaluateMatchPredictions para cambiar solo extras).
- Gate de ganador para las extras.

## Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Identificar partidos aplicables | **Por matchup** (`inglaterra\|francia`, `argentina\|españa`) | Preguntas asumen jugadores específicos; matchup es la única señal estable. |
| Edición admin | **En cualquier publish** | Re-evaluación ya es idempotente; fricción cero para corregir. |
| Gate | **Independientes** del pick principal | Cada pregunta suma sus 5 pts sin depender del ganador. |

## Arquitectura

### Módulo nuevo: `src/lib/extraQuestions.js`

Single source of truth de las 7 preguntas por partido. Lo consumen:

- `MatchCard.jsx` → render del sub-form del usuario.
- `PredictionBreakdown.jsx` → render de las filas del breakdown.
- `MatchCardItem.jsx` (admin) → render de los inputs de "respuesta correcta".

```js
// src/lib/extraQuestions.js
export const SEMIFINAL_QUESTIONS = [
  { id: 'mbappe',  q: '¿Anotará Kylian Mbappé al menos un gol en tiempo regular?', options: ['Sí', 'No'] },
  { id: 'belling', q: '¿Anotará Jude Bellingham en cualquier momento?',           options: ['Sí', 'No'] },
  { id: 'ambos',   q: '¿Ambos equipos anotarán en los 90m?',                       options: ['Sí', 'No'] },
  { id: 'primert', q: "¿Se anotará algún gol en el primer tiempo? (45' m)",        options: ['Sí', 'No'] },
  { id: 'amarillas', q: '¿Quién recibirá más tarjetas amarillas?',                 options: ['Francia', 'Inglaterra', 'Empate'] },
  { id: 'corners',   q: '¿Qué equipo cobrará más saques de esquina?',              options: ['Francia', 'Inglaterra', 'Empate'] },
  { id: 'primergol', q: '¿Quién marcará el primer gol del partido?',               options: ['Kylian Mbappé','Jude Bellingham','Harry Kane','Antoine Griezmann','Ninguno'], allowOther: true },
];

export const FINAL_QUESTIONS = [
  { id: 'messi',   q: '¿Anotará Lionel Messi al menos un gol en tiempo regular?', options: ['Sí', 'No'] },
  { id: 'yamal',   q: '¿Anotará Lamine Yamal en cualquier momento?',              options: ['Sí', 'No'] },
  { id: 'ambos',   q: '¿Ambos equipos anotarán en los 90m?',                       options: ['Sí', 'No'] },
  { id: 'primert', q: "¿Se anotará algún gol en el primer tiempo? (45' m)",        options: ['Sí', 'No'] },
  { id: 'amarillas', q: '¿Quién recibirá más tarjetas amarillas?',                 options: ['Argentina', 'España', 'Empate'] },
  { id: 'corners',   q: '¿Qué equipo cobrará más saques de esquina?',              options: ['Argentina', 'España', 'Empate'] },
  { id: 'primergol', q: '¿Quién marcará el primer gol del partido?',               options: ['Lionel Messi','Lamine Yamal','Julián Álvarez','Nico Williams','Ninguno'], allowOther: true },
];

// Matchup normalizado (lowercase, sin acentos, alfabético).
function normalizeMatchup(team1, team2) {
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return [norm(team1), norm(team2)].sort().join('|');
}

const MATCHUP_TO_QUESTIONS = {
  'argentina|espana':      FINAL_QUESTIONS,
  'francia|inglaterra':    SEMIFINAL_QUESTIONS,
};

// Devuelve el array de preguntas si el matchup está mapeado, o null.
export function getQuestionsForMatch(match) {
  if (!match) return null;
  const key = normalizeMatchup(match.team1, match.team2);
  return MATCHUP_TO_QUESTIONS[key] || null;
}
```

**Por qué ordenar alfabético el matchup:** normaliza `inglaterra|francia` y `francia|inglaterra` al mismo key, sin importar el orden en el que el admin cargó los equipos.

### Schema migration

`supabase/migrations/2026-07-17-001-extra-answers.sql`:

```sql
-- Predictions: respuestas del usuario + flags de acierto
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS extra_answers JSONB,
  ADD COLUMN IF NOT EXISTS extra_answers_correct JSONB;

-- Matches: respuestas correctas cargadas por el admin
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS correct_extra_answers JSONB;
```

**Trigger `recalc_v2_points()`:** NO se modifica. Sigue calculando winner/method/score. Los nuevos campos JSONB los maneja solo JS. Verificado que el trigger (`supabase/migrations/2026-06-27-002-v2-predictions-trigger.sql`) solo escribe columnas que ya maneja; cualquier columna nueva queda intacta.

### Persistencia

`db.predictions.create(data)` (`src/lib/db.js:1596-1632`) mergea `data` sin whitelist. El `usePredictionSubmit.handleSubmit` extiende el payload:

```js
// src/pages/matches/usePredictionSubmit.js
import { getQuestionsForMatch } from '@/lib/extraQuestions';

const questions = getQuestionsForMatch(match);
const extraAnswers = questions
  ? questions.map(q => ({
      id: q.id,
      value: form[`extra_${q.id}`] ?? null,         // 'Sí' | 'Mbappé' | 'Otro' | null
      other: form[`extra_other_${q.id}`] ?? null,   // texto libre si value === 'Otro'
    })).filter(a => a.value != null)
  : null;

submitPrediction.mutate({
  match_id: data.match_id,
  user_email: data.user_email,
  pred_winner, pred_method, pred_score_team1/2, pred_pen_team1/2,
  extra_answers: extraAnswers, // array de { id, value, other } | null
});
```

`extra_answers_correct` NO se setea al crear — lo calcula `evaluateMatchPredictions`.

### UI usuario: `src/components/matches/ExtraPointsCard.jsx`

Componente nuevo. Recibe `{ match, user, existing, open, disabled }`.

- Si `getQuestionsForMatch(match) === null` → no se renderiza (MatchCard decide si incluirlo).
- Renderiza un Card colapsable tipo "Puntos extras" (mismo patrón visual del demo: Trophy amarillo + Badge "Solo {Semifinal|Final}" + ChevronDown).
- Si el partido no está dentro de la ventana de visibilidad (`isWithinVisibilityWindow(match)`) → no se renderiza.
- Si está fuera de la ventana de predicción (`isMatchOpenForPredictions(match)`) pero dentro de visibilidad → colapsado con candado, no editable.
- Inputs: 7 `OptionRow` con la lista de `options` de cada pregunta. Si `allowOther`, agregar opción "Otro" con `Input` que aparece al seleccionarla.
- Estado local inicializado desde `existing.extra_answers` si existe (idempotente).
- Expone `getPayload()` para que el form padre lo serialice al enviar.

**Integración en MatchCard.jsx:** después del bloque V2 (ganador/método/marcador) y antes del botón "Enviar". Mismo handler `handleSubmit` recibe los extras via `getPayload()`.

### UI admin: bloque de respuestas correctas

`src/pages/admin/MatchCardItem.jsx`, insertar después del bloque de penales (post-línea 334), antes del guard `isMatchLocked`:

```jsx
const questions = getQuestionsForMatch(match);
const isExtraApplicable = !!questions;

{isExtraApplicable && (
  <Card className="border-amber-300/50 dark:border-amber-800/40">
    <CardContent className="p-4 space-y-3">
      <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
        Respuestas correctas · Puntos extras
      </p>
      {questions.map((q, i) => (
        <div key={q.id} className="space-y-1.5">
          <p className="text-xs font-medium">{i + 1}. {q.q}</p>
          <OptionRow
            options={q.allowOther ? [...q.options, 'Otro'] : q.options}
            value={results.form[match.id]?.correctAnswers?.[q.id] ?? null}
            onSelect={(opt) => updateForm(match.id, 'correctAnswers', { ...(results.form[match.id]?.correctAnswers || {}), [q.id]: opt })}
            cols={q.options.length + (q.allowOther ? 1) >= 4 ? 2 : q.options.length + (q.allowOther ? 1)}
          />
          {q.allowOther && results.form[match.id]?.correctAnswers?.[q.id] === 'Otro' && (
            <Input
              placeholder="Nombre del jugador"
              value={results.form[match.id]?.correctAnswers?.[`${q.id}_other`] || ''}
              onChange={(e) => updateForm(match.id, 'correctAnswers', { ...(results.form[match.id]?.correctAnswers || {}), [`${q.id}_other`]: e.target.value })}
              className="h-8 text-xs"
            />
          )}
        </div>
      ))}
    </CardContent>
  </Card>
)}
```

### Persistencia admin → match

`src/api/useMatchHandlers.js` `handlePublishResult` líneas 304-313 (`finishedUpdate`):

```js
const finishedUpdate = {
  status: 'finished',
  result_team1, result_team2, result_method,
  penalty_score_team1, penalty_score_team2,
  // NUEVO:
  correct_extra_answers:
    results.form[match.id]?.correctAnswers && Object.keys(results.form[match.id].correctAnswers).length > 0
      ? results.form[match.id].correctAnswers
      : null,
};
```

Misma línea en la rama de actualización (línea 280-284) para 'live'/'finished' re-edit.

### Evaluación: `evaluateMatchPredictions.js`

Cargar `correct_extra_answers` junto al partido:

```js
// Antes del loop de scoring (línea ~167):
const { data: matchRow } = await supabase
  .from('matches')
  .select('correct_extra_answers')
  .eq('id', matchId)
  .single();
const correctExtra = matchRow?.correct_extra_answers || null;
```

Dentro del loop por predicción (después de calcular `pointsEarned` del pick principal):

```js
// Evaluar extras (independiente del winner gate)
let extraPointsEarned = 0;
let extraAnswersCorrect = null;

if (Array.isArray(pred.extra_answers) && correctExtra && typeof correctExtra === 'object') {
  extraAnswersCorrect = {};
  for (const ans of pred.extra_answers) {
    const userValue = ans.value;
    const correctValue = correctExtra[ans.id];
    if (correctValue == null) {
      extraAnswersCorrect[ans.id] = null; // admin no cargó esta pregunta
      continue;
    }
    let isCorrect = false;
    if (userValue === 'Otro') {
      // El admin llenó el campo `${q.id}_other` con la respuesta correcta (caso Otro)
      // O el admin eligió "Otro" + texto y nosotros debemos comparar texto con texto.
      const userOther = (ans.other || '').trim();
      const correctAsOther = (correctExtra[`${ans.id}_other`] ?? '').trim();
      const correctAsDirect = (typeof correctValue === 'string' ? correctValue : '').trim();
      isCorrect = userOther !== '' && (userOther === correctAsOther || userOther.toLowerCase() === correctAsDirect.toLowerCase());
    } else {
      isCorrect = userValue === correctValue;
    }
    extraAnswersCorrect[ans.id] = isCorrect;
    if (isCorrect) extraPointsEarned += 5;
  }
  // Asegurar que todas las preguntas del módulo tengan entrada
  // (por si el usuario solo respondió 3 de 7)
}

pointsEarned += extraPointsEarned;
```

Push al `predictionUpdates`:

```js
predictionUpdates.push({
  id: pred.id,
  is_correct: pointsEarned > 0,
  points_earned: pointsEarned,
  winner_correct, method_correct, score_correct,
  pre_pen_correct, pen_correct, penalty_correct,
  // NUEVO:
  extra_answers_correct: extraAnswersCorrect,
  scored: true,
});
```

El trigger `recalc_v2_points` solo escribe winner/method/score (no `extra_answers_correct` ni `points_earned` para extras) → no hay conflicto.

### Breakdown: `src/pages/matches/PredictionBreakdown.jsx`

Después del `PtsRow` de Marcador (línea ~254), antes del `<div border-t>` del Total:

```jsx
{(() => {
  const questions = getQuestionsForMatch(match);
  const extraCorrect = existing.extra_answers_correct;
  if (!questions || !extraCorrect) return null;
  return questions.map(q => {
    const flag = extraCorrect[q.id]; // true | false | null | undefined
    const userAns = existing.extra_answers?.find(a => a.id === q.id);
    const userLabel = userAns
      ? userAns.value === 'Otro' ? `${q.q} (Otro: ${userAns.other || '—'})` : `${q.q} (${userAns.value})`
      : q.q;
    return (
      <PtsRow
        key={q.id}
        label={userLabel}
        correct={flag === true ? true : flag === false ? false : null}
        pts={5}
        notApplicable={flag == null}   // ⏳ pendiente
      />
    );
  });
})()}
```

`PtsRow` ya acepta `notApplicable` (líneas 13-38) → muestra ⏳ sin marcar ❌.

### Limpieza

- `src/pages/DemoSemifinal.jsx` se mantiene como referencia visual (no se borra), pero se puede marcar como deprecado en el header.
- El route `/demo-semifinal` se mantiene accesible (no se elimina del router).

## Edge cases

| Caso | Comportamiento |
|---|---|
| Partido sin `getQuestionsForMatch` | No se renderiza la sección en MatchCard ni en admin. |
| Admin publica sin cargar correct_extra_answers | `correct_extra_answers: null` en match → extras quedan `null` en breakdown → ⏳ pendiente. Picks normales se evalúan sin cambio. |
| Usuario no contesta ninguna extra | `extra_answers: null` en prediction → no se itera → no suma ni resta puntos. |
| Usuario contestó 3 de 7 | Las 4 no contestadas quedan con flag `null` en breakdown. |
| Admin corrige correct_extra_answers después de finalizado | Re-publica → `correct_extra_answers` se sobrescribe → `evaluateMatchPredictions` re-corre (idempotente) → `points_earned` se actualiza → `recalculatePointsForEmails` corrige `users.prediction_points` y `total_points`. |
| Partido no finalizado (status pending/live) con extras contestadas | `extra_answers` se guardan pero `extra_answers_correct` queda `null` (el JS solo escribe cuando `scored: true`). |
| Usuario es admin | Se filtra igual que los picks normales (línea 159-164 de `evaluateMatchPredictions`). |
| V1 legacy (pre-2026-06-28) | Las semis y final son todas v2 (`>= 2026-06-28`). Las preguntas extra solo aplican a v2 → no hay ambigüedad. |
| `extra_answers` con formato legacy | Versión inicial; no hay compat hacia atrás que mantener. |
| Matchup futuro no mapeado | `getQuestionsForMatch` devuelve `null` → no hay extras. Si admin quiere agregar, edita `MATCHUP_TO_QUESTIONS` en `extraQuestions.js`. |

## Archivos a tocar / crear

| Acción | Path | Notas |
|---|---|---|
| Crear | `src/lib/extraQuestions.js` | Single source of truth |
| Crear | `src/components/matches/ExtraPointsCard.jsx` | UI usuario (form sub-bloque) |
| Crear | `supabase/migrations/2026-07-17-001-extra-answers.sql` | Schema migration |
| Modificar | `src/pages/matches/MatchCard.jsx` | Renderizar `<ExtraPointsCard>` debajo del form V2; integrar `getPayload()` en submit |
| Modificar | `src/pages/matches/usePredictionSubmit.js` | Payload incluye `extra_answers` |
| Modificar | `src/pages/matches/PredictionBreakdown.jsx` | Renderizar PtsRows por pregunta |
| Modificar | `src/pages/admin/MatchCardItem.jsx` | Bloque "Respuestas correctas" post-penales |
| Modificar | `src/api/useMatchHandlers.js` | `finishedUpdate` incluye `correct_extra_answers` |
| Modificar | `src/api/evaluateMatchPredictions.js` | Carga correct_extra_answers, suma +5 por acierto, escribe flag |

## Testing

Manual en este orden:

1. **Unit check:** `getQuestionsForMatch({ team1: 'Argentina', team2: 'España' })` → array FINAL_QUESTIONS; cualquier otro matchup → null.
2. **Schema:** correr migración en Supabase; verificar columnas en tabla `predictions` y `matches`.
3. **Usuario flow:** partido semifinal/final abierto:
   - Seleccionar picks + 3 extras → enviar → ver predicción guardada.
   - Recargar → predicción prellena con los 3 extras.
   - Cerrar ventana (mock con `V2_ACTIVATION_DATE` o esperando) → no se puede editar pero se ve.
4. **Admin flow:** partido semifinal/final terminado:
   - Editar MatchCardItem → llenar correct_extra_answers para 5 preguntas, dejar 2 vacías → publicar.
   - Verificar que `matches.correct_extra_answers` tiene las 5 respuestas en BD.
5. **Evaluación:** con prediction del usuario + correct_extra_answers del admin:
   - 4 extras correctas → 4 × 5 = +20 pts sumados al `points_earned`.
   - Verificar `predictions.extra_answers_correct` con flags correctos.
   - Verificar `users.prediction_points` y `total_points` actualizados.
6. **Breakdown:** abrir MatchCard finalizado:
   - 4 ✅ + 1 ❌ + 2 ⏳ (no contestadas) → 7 PtsRows renderizadas.
   - Pregunta con "Otro" muestra `(Otro: <texto>)` en label.
7. **Re-evaluación:** admin corrige una respuesta correcta después de publicado → re-publica → `points_earned` y breakdown se actualizan.

## Riesgos

- **Trigger recalc_v2_points podría evolucionar** y empezar a tocar `points_earned` para extras. Mitigación: si pasa, la lógica de extras pasa a ser parte del trigger (refactor concurrente).
- **Tamaño del JSONB:** cada predicción suma ~7 entradas × 3 keys = ~21 keys JSONB. Insignificante (< 1 KB).
- **Drift entre admin UI y usuario UI:** mitigado por single source of truth (`getQuestionsForMatch` + `SEMIFINAL_QUESTIONS`/`FINAL_QUESTIONS`).
- **Comparación case-insensitive del "Otro":** definimos case-insensitive SOLO para "Otro" (el admin puede escribir "mbappe" o "Mbappé"). Para opciones cerradas (Sí/No, Francia, etc.) la comparación es exacta.