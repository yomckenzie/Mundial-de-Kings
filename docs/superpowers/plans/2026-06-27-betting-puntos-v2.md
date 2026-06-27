# Betting Puntos v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el modelo de 3 picks (ganador+método+penal, máx 150) por el modelo v2 (ganador sin empate + método + marcador exacto; máx 200 ft/aet, 250 pen).

**Architecture:** Branching en `evaluateMatchPredictions`: predicción v2 (con `pred_score_team1`) usa reglas nuevas; predicción v1 legacy (con `pred_penalty_team1`) usa reglas viejas. UI dinámica: 1 input de score para 90 min/ET, 3 inputs (pre-pen + pen) cuando método=pen. Pre-pen es siempre empate → un solo número X ("goles por equipo al final del partido").

**Tech Stack:** React 18, Vite, TanStack Query, Supabase (Postgres + RLS), Vitest. Sin nuevas deps.

**Spec:** `docs/superpowers/specs/2026-06-26-nueva-metodologia-puntos-design.md`

## Global Constraints

- **Predicciones v1 legacy** (con `pred_penalty_team1/2` y `pred_winner='1'/'X'/'2'`) **siguen funcionando con reglas v1**: 50 winner + 50 method + 50 penalty = 150 max.
- **Predicciones v2 nuevas** usan las reglas v2 de este spec.
- **Pred_winner en v2** solo acepta `'1' | '2'` (no Empate). Validar en UI y backend.
- **Pre-pen siempre empate**: en v2 con método=pen, `pred_score_team1 === pred_score_team2` por validación de UI. UI muestra UN solo input "goles por equipo" que se guarda como pred_score_team1=X y pred_score_team2=X.
- **Score requiere winner correcto Y method correcto**: si pred_winner o pred_method no coinciden con el real, ni `score_correct` ni `pre_pen_correct` ni `pen_correct` suman aunque los números sean iguales (los score fields del pred se interpretan distinto según el método predicho: 90min vs pre-pen).
- **Convention values**: `pred_method` usa `'90' | 'et' | 'pen'` (no SportScore codes 'ft'/'aet'); `pred_winner` v2 usa `'1' | '2'` (mapping team1→'1', team2→'2'). NO usar `'X'` (sin Empate en v2); `match.result_method` se queda con los valores que ya usa la BD.
- **NO usar Co-Authored-By trailer en commits** (instrucción global).
- **Tests required**: cada cambio en lógica de scoring debe ir con su test antes (TDD).
- **Commits frecuentes**: 1 commit por task mínimo.
- **Idempotencia**: SQL migrations con `IF NOT EXISTS`. Recalcular puntos desde cero (no delta).

---

## File Structure

| Archivo | Cambio | Razón |
|---|---|---|
| `supabase/migrations/2026-06-27-001-v2-predictions-columns.sql` | CREATE | Migration v2 |
| `supabase/test-data/betting-3ways-e2e-setup.sql` | MODIFY | E2E usa v2 columns |
| `src/api/evaluateMatchPredictions.js` | MODIFY | Branch v1/v2 + v2 scoring |
| `src/api/evaluateMatchPredictions.test.js` | MODIFY | Tests v2 |
| `src/pages/matches/MatchCard.jsx` | MODIFY | Form v2 (sin Empate + score inputs) |
| `src/pages/matches/PredictionBreakdown.jsx` | MODIFY | Render v2 (pre-pen + pen) |
| `src/pages/Info.jsx` | MODIFY | Copy "Ganar" |
| `src/pages/Home.jsx` | MODIFY | Hero copy |

---

### Task 1: Migration SQL — agregar columnas v2

**Files:**
- Create: `supabase/migrations/2026-06-27-001-v2-predictions-columns.sql`

**Interfaces:**
- Consumes: existing `predictions` table
- Produces: new columns used by Task 2

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/2026-06-27-001-v2-predictions-columns.sql` con:

```sql
-- ============================================================================
-- Betting v2 — nuevas columnas en predictions para marcador exacto
-- ============================================================================
-- Agrega:
--   - pred_score_team1 / pred_score_team2: marcador predecido al cierre del
--     método. Para método=pen, esto es el score pre-penales (siempre empate
--     en input gracias a validación UI).
--   - pred_pen_team1 / pred_pen_team2: score de penales (solo si método=pen).
--   - pre_pen_correct / pen_correct: flags de scoring desglosado.
--   - score_correct: marca global del pick 3 (true si winner correcto + scores OK).
--
-- Las columnas legacy (pred_penalty_team1/2, pred_winner='1'/'X'/'2') se
-- mantienen intactas. La rama v1 sigue evaluándose con evaluateMatchPredictions.
--
-- Aplica desde: 2026-06-27 (partidos a partir del 28 jun)
-- ============================================================================

BEGIN;

-- Marcador exacto (nuevo, v2)
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_score_team1 INT NULL;
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_score_team2 INT NULL;

-- Marcador de penales (nuevo, v2)
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_pen_team1 INT NULL;
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_pen_team2 INT NULL;

-- Flags de scoring desglosado (nuevo, v2)
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pre_pen_correct BOOLEAN NULL;
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pen_correct BOOLEAN NULL;

-- Score pick global (nuevo, v2) — true si winner correcto + scores OK
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS score_correct BOOLEAN NULL;

-- Comentarios
COMMENT ON COLUMN public.predictions.pred_score_team1 IS
  'Marcador exacto predecido para team1 al cierre del método (90min, 120min, o 120min pre-pen).';
COMMENT ON COLUMN public.predictions.pred_score_team2 IS
  'Marcador exacto predecido para team2 al cierre del método.';
COMMENT ON COLUMN public.predictions.pred_pen_team1 IS
  'Score de penales predecido para team1 (solo si pred_method=pen).';
COMMENT ON COLUMN public.predictions.pred_pen_team2 IS
  'Score de penales predecido para team2 (solo si pred_method=pen).';

COMMIT;

-- ============================================================================
-- ROLLBACK (ejecutar manualmente si hace falta):
-- ALTER TABLE public.predictions
--   DROP COLUMN IF EXISTS pred_score_team1,
--   DROP COLUMN IF EXISTS pred_score_team2,
--   DROP COLUMN IF EXISTS pred_pen_team1,
--   DROP COLUMN IF EXISTS pred_pen_team2,
--   DROP COLUMN IF EXISTS pre_pen_correct,
--   DROP COLUMN IF EXISTS pen_correct,
--   DROP COLUMN IF EXISTS score_correct;
-- ============================================================================
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/2026-06-27-001-v2-predictions-columns.sql
git commit -m "feat(predictions): columnas v2 (score exacto + flags desglosados)"
```

**Note:** El operador debe correr este SQL en Supabase SQL Editor antes de Task 2. Las predicciones v1 existentes siguen funcionando sin cambios.

---

### Task 2: Helper `isV2Prediction` + extraer `scoreV2` puro

**Files:**
- Modify: `src/api/evaluateMatchPredictions.js:1-22`

**Interfaces:**
- Produces: `isV2Prediction(pred)` → boolean — exported
- Produces: `scoreV2(pred, result)` → `{ winnerCorrect, methodCorrect, scoreCorrect, prePenCorrect, penCorrect, points }` — internal (testable via Task 3)

- [ ] **Step 1: Escribir tests del helper en `evaluateMatchPredictions.test.js`**

Agregar al final del archivo (antes del último `});`):

```javascript
describe('isV2Prediction', () => {
  it('detecta v2 por presencia de pred_score_team1', async () => {
    const { isV2Prediction } = await import('./evaluateMatchPredictions.js');
    expect(isV2Prediction({ pred_score_team1: 1, pred_score_team2: 0 })).toBe(true);
    expect(isV2Prediction({ pred_score_team1: null, pred_score_team2: null })).toBe(false);
    expect(isV2Prediction({ pred_penalty_team1: 4, pred_penalty_team2: 3 })).toBe(false);
    expect(isV2Prediction({})).toBe(false);
  });
});
```

- [ ] **Step 2: Correr test, verificar FAIL**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vitest run src/api/evaluateMatchPredictions.test.js 2>&1 | tail -15
```

Expected: FAIL con "isV2Prediction is not a function" o similar.

- [ ] **Step 3: Implementar `isV2Prediction` y `scoreV2`**

Agregar al inicio de `src/api/evaluateMatchPredictions.js` (después de los imports y `POINTS_*`):

```javascript
const POINTS_WINNER = 50;
const POINTS_METHOD = 50;
const POINTS_SCORE_FT_AET = 100;  // método 90 min o tiempo extra
const POINTS_PRE_PEN = 50;        // marcador pre-penales (solo si método=pen)
const POINTS_PEN = 100;           // marcador de penales (solo si método=pen)
const POINTS_PENALTY_LEGACY = 50; // v1: penal score

/**
 * Detecta si una predicción usa el modelo v2 (con marcador exacto).
 * v2: tiene `pred_score_team1` o `pred_score_team2` populated.
 * v1 legacy: solo `pred_penalty_team1`/`pred_penalty_team2` populated.
 */
export function isV2Prediction(pred) {
  return pred.pred_score_team1 != null || pred.pred_score_team2 != null;
}

/**
 * Score puro v2 — recibe pred y resultado, devuelve flags + puntos.
 * Esta función es pura (sin I/O) para que sea fácil testearla directamente.
 *
 * @param {object} pred - { pred_winner, pred_method, pred_score_team1/2, pred_pen_team1/2 }
 * @param {object} result - { team1, team2, method, penaltyT1, penaltyT2 }
 *   method: '90' | 'et' | 'pen'
 *   penaltyT1/T2: solo si method='pen'
 * @returns {{ winnerCorrect, methodCorrect, scoreCorrect, prePenCorrect, penCorrect, points }}
 */
export function scoreV2(pred, result) {
  const { team1, team2, method, penaltyT1, penaltyT2 } = result;

  // Ganador real (post-pens si los hubo). Reutiliza deriveWinner existente.
  const actualWinner = deriveWinner(team1, team2, method, penaltyT1, penaltyT2);
  const winnerCorrect = actualWinner != null && pred.pred_winner === actualWinner;

  // Método correcto
  const methodCorrect = pred.pred_method === method;

  // Score pick — REQUIERE winner correcto
  let scoreCorrect = null;
  let prePenCorrect = null;
  let penCorrect = null;

  if (winnerCorrect && (method === '90' || method === 'et')) {
    scoreCorrect = pred.pred_score_team1 === team1 && pred.pred_score_team2 === team2;
  } else if (winnerCorrect && method === 'pen') {
    prePenCorrect = pred.pred_score_team1 === team1 && pred.pred_score_team2 === team2;
    penCorrect = pred.pred_pen_team1 === penaltyT1 && pred.pred_pen_team2 === penaltyT2;
    scoreCorrect = prePenCorrect && penCorrect;
  }

  // Puntos
  let points = 0;
  if (winnerCorrect) points += POINTS_WINNER;
  if (methodCorrect) points += POINTS_METHOD;

  if (method === '90' || method === 'et') {
    if (scoreCorrect) points += POINTS_SCORE_FT_AET;
  } else if (method === 'pen') {
    if (prePenCorrect) points += POINTS_PRE_PEN;
    if (penCorrect) points += POINTS_PEN;
  }

  return { winnerCorrect, methodCorrect, scoreCorrect, prePenCorrect, penCorrect, points };
}
```

Reemplazar el bloque `const POINTS_*` original (líneas 4-6) por el nuevo bloque de arriba.

- [ ] **Step 4: Reemplazar `POINTS_PENALTY = 50` con `POINTS_PENALTY_LEGACY`**

Buscar `POINTS_PENALTY` en el archivo y reemplazar usos por `POINTS_PENALTY_LEGACY` (esto se hará en Task 3 cuando integremos).

- [ ] **Step 5: Correr tests, verificar PASS**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vitest run src/api/evaluateMatchPredictions.test.js 2>&1 | tail -10
```

Expected: 1 test PASS (el de `isV2Prediction`).

- [ ] **Step 6: Commit**

```bash
git add src/api/evaluateMatchPredictions.js src/api/evaluateMatchPredictions.test.js
git commit -m "feat(scoring): helpers puros isV2Prediction + scoreV2"
```

---

### Task 3: Tests unitarios de `scoreV2`

**Files:**
- Modify: `src/api/evaluateMatchPredictions.test.js`

**Interfaces:**
- Consumes: `scoreV2` from Task 2

- [ ] **Step 1: Agregar describe block con tests de scoreV2**

Agregar después del `describe('isV2Prediction')` de Task 2:

```javascript
import { scoreV2 } from './evaluateMatchPredictions.js';

describe('scoreV2 — 90 min', () => {
  const basePred = {
    pred_winner: 'team1', pred_method: '90',
    pred_score_team1: 2, pred_score_team2: 1,
  };

  it('todos los picks correctos → 200 pts', () => {
    const r = scoreV2(basePred, { team1: 2, team2: 1, method: '90' });
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(true);
    expect(r.points).toBe(200);
  });

  it('solo ganador correcto → 50 pts', () => {
    const r = scoreV2(
      { ...basePred, pred_method: 'pen', pred_pen_team1: 4, pred_pen_team2: 3 },
      { team1: 2, team2: 1, method: '90' },
    );
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(false);
    expect(r.scoreCorrect).toBe(null);
    expect(r.points).toBe(50);
  });

  it('solo método correcto → 50 pts', () => {
    const r = scoreV2(
      { ...basePred, pred_winner: 'team2' },
      { team1: 2, team2: 1, method: '90' },
    );
    expect(r.winnerCorrect).toBe(false);
    expect(r.methodCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(null);
    expect(r.points).toBe(50);
  });

  it('score correcto con ganador incorrecto → 50 pts (winner falla, score no cuenta)', () => {
    // Caso raro: usuario predijo Visitante 2-1 y el real fue Local 2-1.
    // Score es numéricamente igual pero winner falla → no cuenta.
    const r = scoreV2(
      { ...basePred, pred_winner: 'team2' },
      { team1: 2, team2: 1, method: '90' },
    );
    expect(r.winnerCorrect).toBe(false);
    expect(r.scoreCorrect).toBe(null); // null porque winnerCorrect era false
    expect(r.points).toBe(50); // solo method
  });

  it('ninguno correcto → 0 pts', () => {
    const r = scoreV2(
      { ...basePred, pred_winner: 'team2', pred_method: 'et', pred_score_team1: 0, pred_score_team2: 0 },
      { team1: 2, team2: 1, method: '90' },
    );
    expect(r.points).toBe(0);
  });
});

describe('scoreV2 — tiempo extra', () => {
  it('todos los picks correctos → 200 pts', () => {
    const r = scoreV2(
      { pred_winner: 'team1', pred_method: 'et', pred_score_team1: 2, pred_score_team2: 2 },
      { team1: 2, team2: 2, method: 'et' },
    );
    expect(r.points).toBe(200);
    expect(r.scoreCorrect).toBe(true);
  });

  it('método correcto pero ganador incorrecto → 50 pts', () => {
    const r = scoreV2(
      { pred_winner: 'team2', pred_method: 'et', pred_score_team1: 2, pred_score_team2: 2 },
      { team1: 2, team2: 2, method: 'et' },
    );
    expect(r.winnerCorrect).toBe(false);
    expect(r.methodCorrect).toBe(true);
    expect(r.points).toBe(50);
  });
});

describe('scoreV2 — penales', () => {
  const basePred = {
    pred_winner: 'team1', pred_method: 'pen',
    pred_score_team1: 1, pred_score_team2: 1,  // pre-pen: 1-1
    pred_pen_team1: 4, pred_pen_team2: 3,
  };

  it('todos los picks correctos → 250 pts', () => {
    const r = scoreV2(basePred, { team1: 1, team2: 1, method: 'pen', penaltyT1: 4, penaltyT2: 3 });
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(true);
    expect(r.prePenCorrect).toBe(true);
    expect(r.penCorrect).toBe(true);
    expect(r.points).toBe(250);
  });

  it('pre-pen correcto, pen incorrecto → 150 pts', () => {
    const r = scoreV2(basePred, { team1: 1, team2: 1, method: 'pen', penaltyT1: 5, penaltyT2: 4 });
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(true);
    expect(r.prePenCorrect).toBe(true);
    expect(r.penCorrect).toBe(false);
    expect(r.scoreCorrect).toBe(false);
    expect(r.points).toBe(150); // 50 + 50 + 50 (pre-pen)
  });

  it('pen correcto, pre-pen incorrecto → 200 pts', () => {
    const r = scoreV2(
      { ...basePred, pred_score_team1: 2, pred_score_team2: 2 }, // user picked 2-2
      { team1: 1, team2: 1, method: 'pen', penaltyT1: 4, penaltyT2: 3 },
    );
    expect(r.winnerCorrect).toBe(true);
    expect(r.methodCorrect).toBe(true);
    expect(r.prePenCorrect).toBe(false);
    expect(r.penCorrect).toBe(true);
    expect(r.scoreCorrect).toBe(false);
    expect(r.points).toBe(200); // 50 + 50 + 100 (pen)
  });

  it('solo winner + method correctos, scores mal → 100 pts', () => {
    const r = scoreV2(
      { ...basePred, pred_score_team1: 0, pred_score_team2: 0, pred_pen_team1: 5, pred_pen_team2: 5 },
      { team1: 1, team2: 1, method: 'pen', penaltyT1: 4, penaltyT2: 3 },
    );
    expect(r.points).toBe(100); // 50 winner + 50 method
  });

  it('ganador incorrecto, scores correctos → 50 pts (solo method si correcto)', () => {
    const r = scoreV2(
      { ...basePred, pred_winner: 'team2' },
      { team1: 1, team2: 1, method: 'pen', penaltyT1: 4, penaltyT2: 3 },
    );
    expect(r.winnerCorrect).toBe(false);
    expect(r.methodCorrect).toBe(true);
    expect(r.prePenCorrect).toBe(null); // null porque winnerCorrect=false
    expect(r.penCorrect).toBe(null);
    expect(r.points).toBe(50);
  });
});
```

- [ ] **Step 2: Correr tests, verificar PASS**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vitest run src/api/evaluateMatchPredictions.test.js 2>&1 | tail -15
```

Expected: todos los tests nuevos PASS.

- [ ] **Step 3: Commit**

```bash
git add src/api/evaluateMatchPredictions.test.js
git commit -m "test(scoring): tests unitarios de scoreV2 (90/et/pen)"
```

---

### Task 4: Branch v1/v2 en `evaluateMatchPredictions`

**Files:**
- Modify: `src/api/evaluateMatchPredictions.js:78-160`

**Interfaces:**
- Consumes: `isV2Prediction`, `scoreV2` from Task 2
- Produces: `evaluateMatchPredictions` con branch — pred v1 usa reglas v1, pred v2 usa `scoreV2`

- [ ] **Step 1: Reemplazar bloque de scoring con branch**

En `src/api/evaluateMatchPredictions.js`, reemplazar el bloque actual (líneas ~78-160, el loop que calcula winnerCorrect/methodCorrect/penaltyCorrect) por:

```javascript
  // 3. Puntuar — branch v1 vs v2
  const winner = deriveWinner(resultTeam1, resultTeam2, resultMethod, penaltyScoreT1, penaltyScoreT2);
  const correctEmails = new Set();
  const allEmails = new Set();
  const predictionUpdates = [];

  for (const pred of predictions) {
    allEmails.add(pred.user_email);

    let winnerCorrect, methodCorrect, scoreCorrect, prePenCorrect, penCorrect, penaltyCorrect, pointsEarned;

    if (isV2Prediction(pred)) {
      // v2: usa scoreV2 puro
      const r = scoreV2(pred, {
        team1: resultTeam1, team2: resultTeam2,
        method: resultMethod, penaltyT1: penaltyScoreT1, penaltyT2: penaltyScoreT2,
      });
      winnerCorrect = r.winnerCorrect;
      methodCorrect = r.methodCorrect;
      scoreCorrect = r.scoreCorrect;
      prePenCorrect = r.prePenCorrect;
      penCorrect = r.penCorrect;
      penaltyCorrect = null; // v2 no usa penalty_correct
      pointsEarned = r.points;
    } else {
      // v1 legacy: reglas del modelo anterior (50 winner + 50 method + 50 penalty)
      // Componente 1: ganador (null si pred_winner es null)
      winnerCorrect = null;
      if (pred.pred_winner != null) {
        winnerCorrect = winner != null && pred.pred_winner === winner;
      }

      // Componente 2: método (null si alguno es null)
      methodCorrect = null;
      if (resultMethod != null && pred.pred_method != null) {
        methodCorrect = pred.pred_method === resultMethod;
      }

      // Componente 3: penal (solo si ambos lados apostaron a pen)
      penaltyCorrect = null;
      if (resultMethod === 'pen' && pred.pred_method === 'pen') {
        penaltyCorrect =
          pred.pred_penalty_team1 != null &&
          pred.pred_penalty_team2 != null &&
          pred.pred_penalty_team1 === penaltyScoreT1 &&
          pred.pred_penalty_team2 === penaltyScoreT2;
      }

      pointsEarned =
        (winnerCorrect === true ? POINTS_WINNER : 0) +
        (methodCorrect === true ? POINTS_METHOD : 0) +
        (penaltyCorrect === true ? POINTS_PENALTY_LEGACY : 0);

      // Para v1, scoreCorrect = winner && method && penalty (legacy simplification)
      scoreCorrect = null;
      prePenCorrect = null;
      penCorrect = null;
    }

    if (pointsEarned > 0) correctEmails.add(pred.user_email);

    predictionUpdates.push({
      id: pred.id,
      is_correct: pointsEarned > 0,
      points_earned: pointsEarned,
      winner_correct: winnerCorrect,
      method_correct: methodCorrect,
      score_correct: scoreCorrect,
      pre_pen_correct: prePenCorrect,
      pen_correct: penCorrect,
      penalty_correct: penaltyCorrect, // null para v2, bool para v1
      scored: true,
    });
  }
```

- [ ] **Step 2: Correr todos los tests, verificar PASS (v1 legacy + v2 nuevos)**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vitest run 2>&1 | tail -15
```

Expected: TODOS los tests (v1 legacy + v2 nuevos) PASS. Si un test v1 falla, revisar que `POINTS_PENALTY_LEGACY` reemplaza correctamente a `POINTS_PENALTY`.

- [ ] **Step 3: Si hay test v1 fallando por `POINTS_PENALTY`, corregir**

Si `vi.mock` o el código existente referencia `POINTS_PENALTY`, reemplazar por `POINTS_PENALTY_LEGACY`. Buscar en el archivo con `grep -n POINTS_PENALTY src/api/evaluateMatchPredictions.js`.

- [ ] **Step 4: Commit**

```bash
git add src/api/evaluateMatchPredictions.js
git commit -m "feat(scoring): branch v1/v2 en evaluateMatchPredictions"
```

---

### Task 5: MatchCard form — v2 UI (sin Empate + score dinámico)

**Files:**
- Modify: `src/pages/matches/MatchCard.jsx:56-61, 134-142, 291-374`

**Interfaces:**
- Consumes: `EMPTY_FORM` shape change (Task 5.1), `handlePredict` (existente en Matches.jsx), `handleSubmit` (existente en Matches.jsx)

- [ ] **Step 1: Cambiar `EMPTY_FORM` y la lectura de pred existente**

Reemplazar (líneas 56-61):

```javascript
export const EMPTY_FORM = {
  pred_winner: null,        // 'team1' | 'team2' (sin Empate en v2)
  pred_method: null,        // '90' | 'et' | 'pen'
  pred_score_team1: '',     // marcador predecido (90/ET) o pre-pen
  pred_score_team2: '',     // marcador predecido (90/ET) o pre-pen
  pred_pen_team1: '',       // solo si método=pen
  pred_pen_team2: '',       // solo si método=pen
};
```

Reemplazar `savedForm` (líneas 134-142):

```javascript
  // v2: incluye pred_score_team1/2 y pred_pen_team1/2.
  // Para pred v1 legacy (con pred_penalty_team1), esos campos quedan NULL.
  const savedForm = existing && (existing.pred_winner != null || existing.pred_method != null)
    ? {
        pred_winner: existing.pred_winner ?? null,
        pred_method: existing.pred_method ?? null,
        pred_score_team1: existing.pred_score_team1 != null ? String(existing.pred_score_team1) : '',
        pred_score_team2: existing.pred_score_team2 != null ? String(existing.pred_score_team2) : '',
        pred_pen_team1: existing.pred_pen_team1 != null ? String(existing.pred_pen_team1) : '',
        pred_pen_team2: existing.pred_pen_team2 != null ? String(existing.pred_pen_team2) : '',
      }
    : EMPTY_FORM;
```

- [ ] **Step 2: Reemplazar Paso 1 (Ganador sin Empate)**

Reemplazar las líneas 293-311 (paso 1):

```javascript
                    {/* Paso 1: ¿Quién gana? (v2: solo Local o Visitante) */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">¿Quién gana?</p>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { value: 'team1', label: match.team1.slice(0, 10) },
                          { value: 'team2', label: match.team2.slice(0, 10) },
                        ].map(opt => (
                          <Button
                            key={opt.value}
                            size="sm"
                            variant={form.pred_winner === opt.value ? 'default' : 'outline'}
                            className="h-8 text-xs px-1"
                            onClick={() => handlePredict(match.id, 'pred_winner', opt.value)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>
```

- [ ] **Step 3: Reemplazar Paso 3 (Score dinámico según método)**

Reemplazar las líneas 335-357 (paso 3):

```javascript
                    {/* Paso 3: Marcador exacto (v2 — depende del método) */}
                    {(form.pred_method === '90' || form.pred_method === 'et') && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Marcador {form.pred_method === '90' ? '90 min' : '120 min'}
                        </p>
                        <div className="flex items-center justify-center gap-1.5">
                          <Input
                            type="number" min="0" max="30" inputMode="numeric"
                            className="w-11 h-9 text-center text-sm font-bold"
                            placeholder="0"
                            value={form.pred_score_team1}
                            onChange={(e) => handlePredict(match.id, 'pred_score_team1', e.target.value)}
                          />
                          <span className="text-sm font-bold">-</span>
                          <Input
                            type="number" min="0" max="30" inputMode="numeric"
                            className="w-11 h-9 text-center text-sm font-bold"
                            placeholder="0"
                            value={form.pred_score_team2}
                            onChange={(e) => handlePredict(match.id, 'pred_score_team2', e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {form.pred_method === 'pen' && (
                      <>
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Pre-penales (siempre empate)
                          </p>
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">Goles por equipo</span>
                            <Input
                              type="number" min="0" max="10" inputMode="numeric"
                              className="w-11 h-9 text-center text-sm font-bold"
                              placeholder="1"
                              value={form.pred_score_team1}
                              onChange={(e) => {
                                const v = e.target.value;
                                // Sincronizar team2 con team1 (siempre empate)
                                handlePredict(match.id, 'pred_score_team1', v);
                                handlePredict(match.id, 'pred_score_team2', v);
                              }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Penales</p>
                          <div className="flex items-center justify-center gap-1.5">
                            <Input
                              type="number" min="0" max="20" inputMode="numeric"
                              className="w-11 h-9 text-center text-sm font-bold"
                              placeholder="0"
                              value={form.pred_pen_team1}
                              onChange={(e) => handlePredict(match.id, 'pred_pen_team1', e.target.value)}
                            />
                            <span className="text-sm font-bold">-</span>
                            <Input
                              type="number" min="0" max="20" inputMode="numeric"
                              className="w-11 h-9 text-center text-sm font-bold"
                              placeholder="0"
                              value={form.pred_pen_team2}
                              onChange={(e) => handlePredict(match.id, 'pred_pen_team2', e.target.value)}
                            />
                          </div>
                        </div>
                      </>
                    )}
```

- [ ] **Step 4: Actualizar copy "Hasta X pts" del botón**

Reemplazar línea 370-372:

```javascript
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium text-center">
                      Hasta <strong>200 pts</strong> (250 si va a penales)
                    </div>
```

- [ ] **Step 5: Correr build, verificar compila**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vite build 2>&1 | tail -10
```

Expected: build OK sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/pages/matches/MatchCard.jsx
git commit -m "feat(form): v2 — sin Empate + score dinámico (pre-pen siempre empate)"
```

---

### Task 6: Actualizar `handleSubmit` en Matches.jsx

**Files:**
- Modify: `src/pages/Matches.jsx:90-113`

**Interfaces:**
- Consumes: form state (Task 5)
- Produces: API call con campos v2

- [ ] **Step 1: Reemplazar `handleSubmit` con validación v2**

Reemplazar líneas 90-113:

```javascript
  // v2: envía pred_winner (team1/team2) + pred_method + score fields.
  // Pre-pen SIEMPRE va como pred_score_team1=pred_score_team2=X (validado en UI).
  // Pen score solo si método=pen.
  const handleSubmit = (data) => {
    const form = predictionsState[data.match_id] || {};
    if (!form.pred_winner) {
      toast.error('Elige quién gana');
      return;
    }
    if (!form.pred_method) {
      toast.error('Elige cómo gana');
      return;
    }
    if (form.pred_method === '90' || form.pred_method === 'et') {
      if (form.pred_score_team1 === '' || form.pred_score_team2 === '') {
        toast.error('Completa el marcador exacto');
        return;
      }
    }
    if (form.pred_method === 'pen') {
      if (form.pred_score_team1 === '') {
        toast.error('Completa el marcador pre-penales');
        return;
      }
      if (form.pred_pen_team1 === '' || form.pred_pen_team2 === '') {
        toast.error('Completa el marcador de penales');
        return;
      }
    }
    submitPrediction.mutate({
      match_id: data.match_id,
      user_email: data.user_email,
      pred_winner: form.pred_winner,
      pred_method: form.pred_method,
      pred_score_team1: form.pred_score_team1 === '' ? null : Number(form.pred_score_team1),
      pred_score_team2: form.pred_score_team2 === '' ? null : Number(form.pred_score_team2),
      pred_pen_team1: form.pred_method === 'pen' && form.pred_pen_team1 !== '' ? Number(form.pred_pen_team1) : null,
      pred_pen_team2: form.pred_method === 'pen' && form.pred_pen_team2 !== '' ? Number(form.pred_pen_team2) : null,
    });
  };
```

- [ ] **Step 2: Actualizar el toast de éxito**

Reemplazar línea 70 (`toast.success`):

```javascript
      toast.success('¡Pronóstico enviado! 🏆 hasta 250 pts si todo a penales');
```

- [ ] **Step 3: Build OK**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vite build 2>&1 | tail -10
```

Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Matches.jsx
git commit -m "feat(matches): handleSubmit v2 con score fields"
```

---

### Task 7: PredictionBreakdown — render v2

**Files:**
- Modify: `src/pages/matches/PredictionBreakdown.jsx:43-61, 131-150`

**Interfaces:**
- Consumes: existing prediction shape (v2 con `pred_score_team1`, `pred_pen_team1`, `pre_pen_correct`, `pen_correct`, `score_correct`)

- [ ] **Step 1: Actualizar `renderPickSummary` para v2**

Reemplazar líneas 43-61:

```javascript
// Renderiza el resumen del pronóstico en formato legible.
// v2: muestra ganador · método · marcador · (pen si aplica).
// Legacy: marcador simple (pred_team1/2).
function renderPickSummary(existing, match) {
  const isLegacy = existing.pred_winner == null && existing.pred_method == null
    && (existing.pred_team1 != null || existing.pred_team2 != null);
  if (isLegacy) {
    return `${match.team1} ${existing.pred_team1 ?? '?'} - ${existing.pred_team2 ?? '?'} ${match.team2}`;
  }
  // v2 (winner es 'team1'/'team2', no más '1'/'X'/'2')
  const winnerLabel = existing.pred_winner === 'team1' ? match.team1
    : existing.pred_winner === 'team2' ? match.team2
    : '?';
  const methodLabel = existing.pred_method === '90' ? '90 min'
    : existing.pred_method === 'et' ? 'T. extra'
    : existing.pred_method === 'pen' ? 'Penales'
    : '?';
  let extra = '';
  if (existing.pred_method === '90' || existing.pred_method === 'et') {
    if (existing.pred_score_team1 != null && existing.pred_score_team2 != null) {
      extra = ` · ${existing.pred_score_team1}-${existing.pred_score_team2}`;
    }
  } else if (existing.pred_method === 'pen') {
    const prePen = existing.pred_score_team1 != null ? `${existing.pred_score_team1}-${existing.pred_score_team2}` : '?-?';
    const pen = existing.pred_pen_team1 != null ? `${existing.pred_pen_team1}-${existing.pred_pen_team2}` : '?-?';
    extra = ` · ${prePen} · pen ${pen}`;
  }
  return `${winnerLabel} · ${methodLabel}${extra}`;
}
```

- [ ] **Step 2: Reemplazar desglose post-eval con filas v2**

Reemplazar líneas 128-150:

```javascript
  // Predicción nueva (v2). Mostrar desglose por componente + total pts.
  // Para ft/aet: 3 filas (ganador, método, marcador).
  // Para pen: 4 filas (ganador, método, pre-pen, pen).
  const isPen = existing.pred_method === 'pen' && match.result_method === 'pen';
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Tu pronóstico</p>
      <p className="text-xs font-bold text-foreground text-center">
        {renderPickSummary(existing, match)}
      </p>
      <div className="space-y-1">
        <PtsRow label="Ganador" correct={existing.winner_correct} pts={50} />
        <PtsRow label="Cómo gana" correct={existing.method_correct} pts={50} />
        {isPen ? (
          <>
            <PtsRow label="Pre-penales" correct={existing.pre_pen_correct} pts={50} />
            <PtsRow label="Penales" correct={existing.pen_correct} pts={100} />
          </>
        ) : (
          <PtsRow label="Marcador" correct={existing.score_correct} pts={100} notApplicable={match.result_method == null || existing.pred_method !== match.result_method} />
        )}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-xs font-bold">Total</span>
          <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
            {existing.points_earned || 0} pts
          </span>
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 3: Actualizar el veredicto en el panel admin**

Reemplazar líneas 73-86 (panel admin que muestra el pick + veredicto):

```javascript
  if (isAdmin) {
    return (
      <div className="text-center text-[11px] text-muted-foreground font-medium py-1.5 px-2 rounded-lg bg-muted/30">
        <p>Tu pronóstico: {renderPickSummary(existing, match)}</p>
        {resultKnown ? (
          <p className={`font-semibold mt-0.5 ${predHit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {predHit ? 'Acertaste' : 'No acertaste'} · los admins no acumulan puntos
          </p>
        ) : (
          <p className="text-[10px] mt-0.5">Los admins no acumulan puntos</p>
        )}
      </div>
    );
  }
```

(Nota: este bloque no cambia funcionalmente, solo nos aseguramos de que sigue usando `renderPickSummary` actualizado.)

- [ ] **Step 4: Actualizar el texto "hasta X pts" en pending**

Reemplazar líneas 95-98:

```javascript
        <div className="text-center text-[11px] text-amber-600 dark:text-amber-400 font-medium py-1.5 px-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 space-y-0.5">
          <p>⏳ Pendiente del resultado final — si aciertas podés ganar</p>
          <p className="font-bold">hasta 250 pts (si va a penales)</p>
        </div>
```

- [ ] **Step 5: Build OK**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vite build 2>&1 | tail -10
```

Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add src/pages/matches/PredictionBreakdown.jsx
git commit -m "feat(breakdown): v2 — pre-pen + pen + score desglosados"
```

---

### Task 8: Copy Info + Home

**Files:**
- Modify: `src/pages/Info.jsx:38-60` (sección "Ganar")
- Modify: `src/pages/Home.jsx:213-217` (hero)

- [ ] **Step 1: Actualizar copy en `Info.jsx`**

Reemplazar el content de la sección `how_to_win` (líneas 38-60). Para esto, actualizar DEFAULT_SECTIONS_VERSION y el content:

```javascript
const DEFAULT_SECTIONS_VERSION = '2026-06-27';
```

Reemplazar el content de la sección `how_to_win` (líneas 39-60):

```javascript
    content: `Después de crear tu cuenta en la plataforma, podrás realizar pronósticos diarios de los partidos del Mundial.

• Los partidos se habilitarán 24 horas antes de cada encuentro
• Los pronósticos se cerrarán automáticamente al iniciar el partido
• Cada pronóstico se compone de 3 picks independientes, todos obligatorios:
  1. Quién gana (Local / Visitante) → +50 pts si aciertas
  2. Cómo gana (90 minutos / Tiempo extra / Penales) → +50 pts si aciertas
  3. Marcador exacto → +100 pts si aciertas
     · Si elegiste Penales, son 2 marcadores separados:
       - Pre-penales (siempre empate: 0-0, 1-1, 2-2...) → +50 pts
       - Penales → +100 pts

Para que el marcador cuente, tenés que acertar también el ganador.
Si errás el ganador, el marcador no suma aunque los números sean iguales.

Una vez guardes tu pronóstico, este quedará registrado automáticamente en tu perfil.

Máximo por partido:
• Terminado en 90 min o tiempo extra: 200 pts
• Terminado en penales: 250 pts

Los puntos podrán reflejarse hasta 24 horas después de finalizar el partido y confirmarse el resultado oficial.

En la sección "Mi Perfil" podrás ver:
• Historial de pronósticos realizados
• Desglose por pick (ganador / método / marcador)
• Puntos acumulados

Ten en cuenta que debes cumplir los requisitos mencionados anteriormente, seguirnos y unirte a nuestro canal.
Revisaremos que cumplas las condiciones en caso que aciertes.`
```

- [ ] **Step 2: Actualizar hero copy en `Home.jsx`**

Reemplazar líneas 213-217:

```javascript
              <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto leading-relaxed">
                Participa haciendo tus pronósticos en cada partido del Mundial.
                Cada pronóstico tiene 3 picks independientes: ganador, método y marcador exacto.
                Si elegís penales, son 2 marcadores (pre-penales + penales).
                Puedes ganar hasta <strong className="text-secondary">250 puntos</strong> por partido.
                Acumula puntos y canjéalos por increíbles premios.
              </p>
```

- [ ] **Step 3: Build OK**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vite build 2>&1 | tail -10
```

Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Info.jsx src/pages/Home.jsx
git commit -m "docs(copy): v2 — marcador exacto + 200/250 max pts"
```

---

### Task 9: Actualizar E2E test SQL para v2

**Files:**
- Modify: `supabase/test-data/betting-3ways-e2e-setup.sql`

**Interfaces:**
- Consumes: v2 columns from Task 1

- [ ] **Step 1: Reemplazar INSERT de predicciones con campos v2**

Reemplazar las 3 INSERT en el bloque 5 del SQL (las predicciones del test_user). Por cada uno usar los campos v2:

Para Brasil vs Argentina (90 min):
```sql
INSERT INTO public.predictions (id, user_email, match_id, pred_winner, pred_method, pred_score_team1, pred_score_team2, pred_pen_team1, pred_pen_team2, scored, is_correct, points_earned, created_date)
VALUES (
  'aaaa1111-aaaa-1111-aaaa-111111111111',
  'test_user@chessking.com',
  '11111111-1111-1111-1111-111111111111',
  'team1',     -- Local (Brasil)
  '90',        -- 90 min
  1,           -- marcador 90 min team1
  0,           -- marcador 90 min team2
  NULL, NULL,
  FALSE, FALSE, 0,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner,
  pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1,
  pred_score_team2 = EXCLUDED.pred_score_team2,
  scored = FALSE, is_correct = FALSE, points_earned = 0;
```

Para Francia vs Alemania (ET):
```sql
INSERT INTO public.predictions (id, user_email, match_id, pred_winner, pred_method, pred_score_team1, pred_score_team2, pred_pen_team1, pred_pen_team2, scored, is_correct, points_earned, created_date)
VALUES (
  'bbbb2222-bbbb-2222-bbbb-222222222222',
  'test_user@chessking.com',
  '22222222-2222-2222-2222-222222222222',
  'team2',     -- Visitante (Alemania)
  'et',        -- Tiempo extra
  2,           -- marcador 120 min team1
  2,           -- marcador 120 min team2 (empate para forzar ET/pen)
  NULL, NULL,
  FALSE, FALSE, 0,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner,
  pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1,
  pred_score_team2 = EXCLUDED.pred_score_team2,
  scored = FALSE, is_correct = FALSE, points_earned = 0;
```

Para México vs España (penales, 4-3):
```sql
INSERT INTO public.predictions (id, user_email, match_id, pred_winner, pred_method, pred_score_team1, pred_score_team2, pred_pen_team1, pred_pen_team2, scored, is_correct, points_earned, created_date)
VALUES (
  'cccc3333-cccc-3333-cccc-333333333333',
  'test_user@chessking.com',
  '33333333-3333-3333-3333-333333333333',
  'team1',     -- Local (México)
  'pen',       -- Penales
  1, 1,        -- pre-pen: 1-1 (siempre empate)
  4, 3,        -- pen: 4-3
  FALSE, FALSE, 0,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  pred_winner = EXCLUDED.pred_winner,
  pred_method = EXCLUDED.pred_method,
  pred_score_team1 = EXCLUDED.pred_score_team1,
  pred_score_team2 = EXCLUDED.pred_score_team2,
  pred_pen_team1 = EXCLUDED.pred_pen_team1,
  pred_pen_team2 = EXCLUDED.pred_pen_team2,
  scored = FALSE, is_correct = FALSE, points_earned = 0;
```

- [ ] **Step 2: Actualizar el SELECT de verificación al final del archivo**

Reemplazar el SELECT de verificación:

```sql
SELECT
  m.id, m.team1, m.team2, m.match_date, m.match_time, m.status, m.is_test,
  p.pred_winner, p.pred_method, p.pred_score_team1, p.pred_score_team2,
  p.pred_pen_team1, p.pred_pen_team2
FROM public.matches m
LEFT JOIN public.predictions p ON p.match_id = m.id AND p.user_email = 'test_user@chessking.com'
WHERE m.is_test = TRUE
ORDER BY m.match_date, m.match_time;
```

- [ ] **Step 3: Actualizar la sección "DESPUÉS DE EJECUTAR ESTE SCRIPT"**

Reemplazar los marcadores de resultados esperados para reflejar las predicciones v2 (1-0, 2-2 ET, 1-1 pre-pen + 4-3 pen). Actualizar también la verificación SQL final con los nuevos puntos esperados (200, 200, 250).

- [ ] **Step 4: Commit**

```bash
git add supabase/test-data/betting-3ways-e2e-setup.sql
git commit -m "test(e2e): actualizar setup SQL con campos v2"
```

---

### Task 10: Run full suite + build final

**Files:** none (verificación)

- [ ] **Step 1: Correr todos los tests**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vitest run 2>&1 | tail -10
```

Expected: 72+ tests PASS (los 72 originales + los nuevos de scoreV2).

- [ ] **Step 2: Build producción**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && npx vite build 2>&1 | tail -10
```

Expected: build OK sin warnings.

- [ ] **Step 3: Verificar git status limpio**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && git status
```

Expected: working tree limpio (sin cambios sin commitear).

- [ ] **Step 4: Commit final (si hay cambios de fix)**

```bash
cd "C:\Users\yomck\OneDrive\Desktop\Pagina Chess King" && git status && git add -A && git diff --cached --quiet || git commit -m "chore: final cleanup v2"
```

---

## Self-Review (al completar)

1. **Spec coverage**: ¿Todas las secciones del spec tienen task?
   - ✅ Reglas de scoring → Task 2, 3, 4
   - ✅ Schema migration → Task 1
   - ✅ UI MatchCard → Task 5, 6
   - ✅ Breakdown → Task 7
   - ✅ Copy Info/Home → Task 8
   - ✅ Test SQL → Task 9
   - ✅ Tests unitarios → Task 3
2. **Placeholder scan**: No "TBD", "TODO", "implement later".
3. **Type consistency**: `pred_winner` usa `'team1'/'team2'` consistentemente. `pred_method` usa `'90'/'et'/'pen'` consistentemente. `pred_score_team1/2` para marcador (90/ET/pre-pen). `pred_pen_team1/2` para pen.
4. **Score vs pen**: pre-pen se guarda en `pred_score_team1/2` (siempre iguales), pen se guarda en `pred_pen_team1/2`.

---

## Out of scope (no en este plan)

- **Profile.jsx desglose**: el Profile muestra `points_earned` y `is_correct` solamente, no el desglose por componente. El desglose vive en `MatchCard`/`PredictionBreakdown`. Si querés mostrarlo en Profile, agregar task aparte.
- **Re-evaluación retroactiva**: predicciones v1 ya evaluadas no se re-evalúan.
- **Editar predicciones después de cerrar**: ya no se permite (consistente con modelo actual).
- **Admin publish UI**: ya soporta método+penalty. No requiere cambios.