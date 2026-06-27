# Betting 3-Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace exact-score predictions with 3 independent picks (winner/method/penalty) scoring 50+50+50 (max 150 pts/match). Applies from 2026-06-28 onwards.

**Architecture:** Add flat columns to `predictions` and `matches`. Refactor `evaluateMatchPredictions` to evaluate 3 components independently and sum. Extend `sportscore.js` to expose method (`ft`/`aet`/`pen`) and penalty scores. UI changes only in `Matches.jsx` (user) and `MatchCardItem.jsx` / batch publish (admin). SportScore provides auto-detection; admin can override manually.

**Tech Stack:** React 18, Vite, TanStack Query, Supabase (Postgres + RLS), Vitest, SportScore public API.

**Spec:** `docs/superpowers/specs/2026-06-25-betting-3ways-design.md`

## Global Constraints

- **Activation date**: 2026-06-28 (round of 16 onwards). No migration of existing predictions (none exist).
- **Idempotency**: `evaluateMatchPredictions` MUST be safe to call repeatedly without duplicating points. Recalculate user totals from scratch every time.
- **RLS unchanged**: existing policies (`predictions_insert_own_or_admin`, `predictions_update_own_or_admin`) cover new columns automatically.
- **Admin publishes ONLY goals**: `result_team1`/`result_team2` are mandatory; `result_method` and `penalty_score_*` come from SportScore or manual override. Cannot publish if `result_method='pen'` and `penalty_score_*` are null.
- **Penalty input only if user picked `pred_method='pen'`**: never shown otherwise.
- **Scoring per component**: each correct = +50 pts. Max 150/match. Sum is `points_earned`.
- **`scored=true` semantics**: tried to evaluate with available data. If `result_method` is null, `method_correct` stays null (0 pts).
- **Referral commission**: 5 pts flat per match where user scored > 0. Does NOT scale with points earned.
- **No breaking changes to old fields**: `pred_team1`/`pred_team2` stay in schema for backward compat; UI/eval ignores them.

---

## File Structure

**Create:**
- `supabase/migrations/2026-06-25-001-betting-3ways.sql` — schema migration
- `src/lib/sportscore.test.js` — tests for new method/penalty extraction

**Modify:**
- `src/lib/sportscore.js` — return `method` from `normalizeState`; expose penalty scores
- `src/api/evaluateMatchPredictions.js` — 3-component scoring
- `src/api/evaluateMatchPredictions.test.js` — new test cases for 3 components
- `src/pages/admin/useMatchHandlers.js` — pass method + penalties; clear on reopen
- `src/pages/admin/MatchCardItem.jsx` (and any batch-publish UI) — show method/penalty inputs
- `src/pages/Matches.jsx` — 3-pick flow + post-eval breakdown

**NOT touched:**
- `src/lib/supabase.js` — sync logic already handles `predictions` correctly (cloud wins for evaluation fields)
- `src/lib/db.js` — no changes needed
- Cron jobs (no changes)
- RLS policies (inherited from existing)

---

## Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/2026-06-25-001-betting-3ways.sql`

**Interfaces:**
- Produces: `predictions.pred_winner`, `pred_method`, `pred_penalty_team1/2`, `winner_correct`, `method_correct`, `penalty_correct`
- Produces: `matches.result_method`, `penalty_score_team1/2`
- Produces: CHECK constraint that penalty pair is all-or-nothing

- [ ] **Step 1: Create migration file with schema additions**

Write `supabase/migrations/2026-06-25-001-betting-3ways.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════
-- Migración: Nuevo modelo de apuestas 3 componentes
-- Fecha: 2026-06-25
-- Spec: docs/superpowers/specs/2026-06-25-betting-3ways-design.md
--
-- Agrega columnas para:
--   - Ganador (1/X/2) + Método (90/et/pen) + Marcador penales
--   - 3 columnas de scoring por componente (winner_correct, etc.)
--   - result_method y penalty_score_* en matches
--
-- Aplica desde 28 jun 2026 (16avos en adelante).
-- ROLLBACK: ver bloque al final del archivo.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── Tabla predictions ───
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_winner        text    CHECK (pred_winner IN ('1','X','2')),
  ADD COLUMN IF NOT EXISTS pred_method        text    CHECK (pred_method IN ('90','et','pen')),
  ADD COLUMN IF NOT EXISTS pred_penalty_team1 integer CHECK (pred_penalty_team1 IS NULL OR pred_penalty_team1 >= 0),
  ADD COLUMN IF NOT EXISTS pred_penalty_team2 integer CHECK (pred_penalty_team2 IS NULL OR pred_penalty_team2 >= 0),
  ADD COLUMN IF NOT EXISTS winner_correct     boolean,
  ADD COLUMN IF NOT EXISTS method_correct     boolean,
  ADD COLUMN IF NOT EXISTS penalty_correct    boolean;

-- Los penales vienen en par o ninguno
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'predictions_penalty_pair'
  ) THEN
    ALTER TABLE public.predictions
      ADD CONSTRAINT predictions_penalty_pair
      CHECK (
        (pred_penalty_team1 IS NULL AND pred_penalty_team2 IS NULL)
        OR (pred_penalty_team1 IS NOT NULL AND pred_penalty_team2 IS NOT NULL)
      );
  END IF;
END $$;

-- ─── Tabla matches ───
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS result_method        text    CHECK (result_method IN ('90','et','pen')),
  ADD COLUMN IF NOT EXISTS penalty_score_team1  integer CHECK (penalty_score_team1 IS NULL OR penalty_score_team1 >= 0),
  ADD COLUMN IF NOT EXISTS penalty_score_team2  integer CHECK (penalty_score_team2 IS NULL OR penalty_score_team2 >= 0);

-- Si el método del partido es 'pen', los penales deben estar presentes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_penalty_pair'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_penalty_pair
      CHECK (
        result_method IS NULL
        OR result_method <> 'pen'
        OR (penalty_score_team1 IS NOT NULL AND penalty_score_team2 IS NOT NULL)
      );
  END IF;
END $$;

-- Índices para acelerar queries de evaluación y ranking
CREATE INDEX IF NOT EXISTS predictions_match_id_scored_idx
  ON public.predictions (match_id, scored);

CREATE INDEX IF NOT EXISTS predictions_user_email_scored_idx
  ON public.predictions (user_email, scored);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (ejecutar manualmente si hay que revertir):
-- ═══════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE public.predictions
--   DROP CONSTRAINT IF EXISTS predictions_penalty_pair,
--   DROP COLUMN IF EXISTS penalty_correct,
--   DROP COLUMN IF EXISTS method_correct,
--   DROP COLUMN IF EXISTS winner_correct,
--   DROP COLUMN IF EXISTS pred_penalty_team2,
--   DROP COLUMN IF EXISTS pred_penalty_team1,
--   DROP COLUMN IF EXISTS pred_method,
--   DROP COLUMN IF EXISTS pred_winner;
-- ALTER TABLE public.matches
--   DROP CONSTRAINT IF EXISTS matches_penalty_pair,
--   DROP COLUMN IF EXISTS penalty_score_team2,
--   DROP COLUMN IF EXISTS penalty_score_team1,
--   DROP COLUMN IF EXISTS result_method;
-- DROP INDEX IF EXISTS predictions_match_id_scored_idx;
-- DROP INDEX IF EXISTS predictions_user_email_scored_idx;
-- COMMIT;
```

- [ ] **Step 2: Verify SQL syntax locally with a Postgres parser**

If `psql` is available locally with a test DB:
```bash
psql "$DATABASE_URL" --variable=ON_ERROR_STOP=1 -f supabase/migrations/2026-06-25-001-betting-3ways.sql
```
Run against a sandbox DB (NOT production). Expected: succeeds.

If no local DB available, the operator will validate in Supabase SQL Editor (Task 0, external). Skip this step.

- [ ] **Step 3: Commit migration file**

```bash
git add supabase/migrations/2026-06-25-001-betting-3ways.sql
git commit -m "feat(db): migración apuestas 3 componentes (schema only)

- predictions: pred_winner/method/penalty_team1-2 + winner/method/penalty_correct
- matches: result_method + penalty_score_team1-2
- CHECK constraints: penalty pair all-or-nothing
- Índices para queries de evaluación
- Bloque ROLLBACK al final del archivo

Spec: docs/superpowers/specs/2026-06-25-betting-3ways-design.md"
```

**Operator action (not part of this task):** El operador corre este `.sql` en Supabase SQL Editor ANTES del deploy de código. Sin esto, los nuevos campos no existen y el código falla.

---

## Task 2: Extend sportscore.js — method + penalty extraction

**Files:**
- Modify: `src/lib/sportscore.js:76-82` (`normalizeState`)
- Modify: `src/lib/sportscore.js:121-189` (`getLiveResultForMatch`)
- Create: `src/lib/sportscore.test.js`

**Interfaces:**
- `getLiveResultForMatch(match)` now returns `method: '90' | 'et' | 'pen' | null` and `penaltyScore: { team1: number, team2: number } | null` in the result object.

- [ ] **Step 1: Write failing test for `normalizeState` returning method**

Create `src/lib/sportscore.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the fetch layer before importing the module under test
vi.mock('./sportscore.js', async () => {
  const actual = await vi.importActual('./sportscore.js');
  return {
    ...actual,
    _normalizeStateForTest: actual.normalizeState,
  };
});

// We need to export normalizeState for testing — see step 3 for the export.
import { _normalizeStateForTest as normalizeState } from './sportscore.js';

describe('normalizeState — método + estado', () => {
  it.each([
    ['ft', 'finished', '90'],
    ['FT', 'finished', '90'],
    ['aet', 'finished', 'et'],
    ['AET', 'finished', 'et'],
    ['pen', 'finished', 'pen'],
    ['PEN', 'finished', 'pen'],
    ['finished', 'finished', null], // genérico sin info de método
  ])('status %s → state=%s method=%s', (raw, expectedState, expectedMethod) => {
    const r = normalizeState(raw);
    expect(r.state).toBe(expectedState);
    expect(r.method).toBe(expectedMethod);
  });

  it('upcoming mantiene method=null', () => {
    const r = normalizeState('notstarted');
    expect(r.state).toBe('upcoming');
    expect(r.method).toBe(null);
  });

  it('live mantiene method=null', () => {
    const r = normalizeState('1h');
    expect(r.state).toBe('live');
    expect(r.method).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sportscore.test.js
```
Expected: FAIL because `_normalizeStateForTest` is not exported and current `normalizeState` returns string, not object.

- [ ] **Step 3: Refactor `normalizeState` to return object + add export**

In `src/lib/sportscore.js`, replace the existing `normalizeState` (lines 76-82):

```javascript
// Normaliza el status crudo de SportScore a {state, method}.
// state: 'live' | 'finished' | 'upcoming'
// method: '90' | 'et' | 'pen' | null  (null si no se puede inferir)
export function normalizeState(raw) {
  const s = (raw || '').toLowerCase();
  if (s === 'ft') return { state: 'finished', method: '90' };
  if (s === 'aet') return { state: 'finished', method: 'et' };
  if (s === 'pen') return { state: 'finished', method: 'pen' };
  if (s === 'finished') return { state: 'finished', method: null };
  if (s === 'upcoming' || s === 'notstarted' || s === 'not_started' || s === 'scheduled')
    return { state: 'upcoming', method: null };
  // Cualquier otra cosa (inprogress, live, 1h, 2h, ht, inplay) = en vivo
  return { state: 'live', method: null };
}
```

Also add an alias export for backward compat in tests:
```javascript
// Para tests
export const _normalizeStateForTest = normalizeState;
```

- [ ] **Step 4: Update all callers of `normalizeState` to use new return shape**

Search for callers: `normalizeState(` across `src/`.

The only caller is inside `getLiveResultForMatch` (lines ~159). Replace:
```javascript
// OLD:
const state = normalizeState(fx.status);
// NEW:
const { state, method } = normalizeState(fx.status);
```

Also extend the return object of `getLiveResultForMatch` to include `method`. Replace the return block at the end of the function (around line 175):

```javascript
      // Intentar leer marcador de penales del detalle (si está disponible y es 'pen')
      let penaltyScore = null;
      if (state === 'finished' && method === 'pen') {
        const detail = await _getMatchDetail(matchSlugFromUrl(fx.url));
        const hs = detail?.home_score_pen ?? detail?.home_pen_score;
        const aws = detail?.away_score_pen ?? detail?.away_pen_score;
        if (hs != null && aws != null) {
          penaltyScore = {
            team1: homeIsTeam1 ? hs : aws,
            team2: homeIsTeam1 ? aws : hs,
          };
        }
      }

      return {
        state,
        method,
        penaltyScore,
        label: buildLiveLabel(state, fx.status, minute),
        minute,
        team1Score: team1Score ?? null,
        team2Score: team2Score ?? null,
        raw: fx,
      };
```

- [ ] **Step 5: Update JSDoc on `getLiveResultForMatch`**

Replace the JSDoc above `getLiveResultForMatch` (lines ~120-131) to include `method` and `penaltyScore`:

```javascript
/**
 * Busca el resultado/estado en vivo de un partido nuestro.
 * @param {{team1:string, team2:string}} match  equipos en español
 * @returns {Promise<null | {
 *   state: 'live'|'finished'|'upcoming',
 *   method: '90'|'et'|'pen'|null,  // cómo terminó (null si no se sabe)
 *   penaltyScore: {team1:number, team2:number}|null,  // marcador de penales (si aplica)
 *   label: string,                  // "67'", "HT", "Finalizado"...
 *   minute: string|null,            // minuto real crudo ("86", "90+"); solo en vivo
 *   team1Score: number, team2Score: number,  // orientados a NUESTRO team1/team2
 *   raw: object
 * }>}
 */
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/lib/sportscore.test.js
```
Expected: PASS for all `normalizeState` tests.

- [ ] **Step 7: Run full test suite to catch regressions**

```bash
npx vitest run
```
Expected: no regressions in other tests (the only change in shape is internal to `getLiveResultForMatch` which is consumed by `useLiveResults.js`).

- [ ] **Step 8: Check the consumer of getLiveResultForMatch**

Read `src/pages/matches/useLiveResults.js` and confirm it doesn't destructure `state` in a way that breaks. If it does, update accordingly. Most likely it's just `liveResult.state` and `liveResult.label` — should still work.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sportscore.js src/lib/sportscore.test.js
git commit -m "feat(sportscore): exponer method + penaltyScore desde getLiveResultForMatch

- normalizeState ahora devuelve {state, method} en vez de string solo
- method: '90' | 'et' | 'pen' | null (null si no se puede inferir)
- getLiveResultForMatch intenta leer penaltyScore del endpoint de detalle
  cuando method === 'pen'
- Tests nuevos para todos los códigos de estado"
```

---

## Task 3: Refactor evaluateMatchPredictions.js — 3-component scoring

**Files:**
- Modify: `src/api/evaluateMatchPredictions.js`
- Modify: `src/api/evaluateMatchPredictions.test.js`

**Interfaces:**
- New signature: `evaluateMatchPredictions(matchId, resultTeam1, resultTeam2, resultMethod = null, penaltyScoreT1 = null, penaltyScoreT2 = null)`
- Returns: `{ evaluated: number, correct: number }` (unchanged shape)
- Side effects: upserts `predictions.winner_correct`, `method_correct`, `penalty_correct`, `points_earned`, `is_correct` (true if points > 0), `scored=true`
- Side effects: recomputes `users.prediction_points = SUM(points_earned WHERE is_correct=true AND scored=true)`

- [ ] **Step 1: Add new test cases for 3-component scoring**

Append to `src/api/evaluateMatchPredictions.test.js`, after the existing tests inside `describe('evaluateMatchPredictions')`:

```javascript
  // Helper: crea una predicción con el nuevo formato
  function makePred(overrides) {
    return {
      id: 'p', user_email: 'u@test.com', match_id: 'm1',
      pred_team1: 0, pred_team2: 0, // legacy, ignorado
      scored: false, is_correct: false, points_earned: 0,
      ...overrides,
    };
  }

  it('3 componentes correctos = 150 pts', async () => {
    _predictionRows = [makePred({
      id: 'p150', pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 5, pred_penalty_team2: 4,
    })];
    _adminRows = [];
    _userMap = { 'u@test.com': { id: 'u150', prediction_points: 0, total_points: 0 } };

    const r = await evaluateMatchPredictions('m1', 2, 1, 'pen', 5, 4);
    expect(r.evaluated).toBe(1);
    expect(r.correct).toBe(1);

    const up = _upsertedPredictions.find(p => p.id === 'p150');
    expect(up.points_earned).toBe(150);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(true);
    expect(up.penalty_correct).toBe(true);
    expect(_updatedUsers.u150.prediction_points).toBe(150);
  });

  it('solo ganador correcto = 50 pts', async () => {
    _predictionRows = [makePred({
      id: 'p50', pred_winner: '1', pred_method: '90',
    })];
    _userMap = { 'u@test.com': { id: 'u50', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, '90');
    const up = _upsertedPredictions.find(p => p.id === 'p50');
    expect(up.points_earned).toBe(50);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(true);
    expect(up.penalty_correct).toBe(null); // no aplica
    expect(_updatedUsers.u50.prediction_points).toBe(50);
  });

  it('ganador + método correcto pero penal mal = 100 pts', async () => {
    _predictionRows = [makePred({
      id: 'p100', pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 5, pred_penalty_team2: 4,
    })];
    _userMap = { 'u@test.com': { id: 'u100', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, 'pen', 5, 3); // real 5-3, pred 5-4
    const up = _upsertedPredictions.find(p => p.id === 'p100');
    expect(up.points_earned).toBe(100);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(true);
    expect(up.penalty_correct).toBe(false);
  });

  it('apostó a penales pero partido NO fue a penales = 50 pts (solo ganador)', async () => {
    _predictionRows = [makePred({
      id: 'p_pen_was_90', pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 5, pred_penalty_team2: 4,
    })];
    _userMap = { 'u@test.com': { id: 'u_pen90', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, '90', null, null);
    const up = _upsertedPredictions.find(p => p.id === 'p_pen_was_90');
    expect(up.points_earned).toBe(50);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(false);
    expect(up.penalty_correct).toBe(null);
  });

  it('empate X en 90 min que va a penales: X NO gana aunque haya sido empate 120 min', async () => {
    _predictionRows = [makePred({
      id: 'p_tie', pred_winner: 'X', pred_method: 'pen',
      pred_penalty_team1: 4, pred_penalty_team2: 5,
    })];
    _userMap = { 'u@test.com': { id: 'u_tie', prediction_points: 0, total_points: 0 } };

    // Resultado: 0-0 en 90, 0-0 en ET, visitante gana penales 4-5
    await evaluateMatchPredictions('m1', 0, 0, 'pen', 4, 5);
    const up = _upsertedPredictions.find(p => p.id === 'p_tie');
    expect(up.winner_correct).toBe(false); // alguien ganó (visitante)
    expect(up.method_correct).toBe(true);
    expect(up.penalty_correct).toBe(true);
    expect(up.points_earned).toBe(100); // método + penal, NO ganador
  });

  it('result_method null → method_correct null, suma solo ganador', async () => {
    _predictionRows = [makePred({
      id: 'p_no_method', pred_winner: '1', pred_method: '90',
    })];
    _userMap = { 'u@test.com': { id: 'u_nm', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, null); // SportScore caído
    const up = _upsertedPredictions.find(p => p.id === 'p_no_method');
    expect(up.points_earned).toBe(50);
    expect(up.winner_correct).toBe(true);
    expect(up.method_correct).toBe(null);
    expect(up.penalty_correct).toBe(null);
  });

  it('re-ejecución: 150 puntos no se duplican a 300 (idempotencia)', async () => {
    _predictionRows = [makePred({
      id: 'p_idem', pred_winner: '1', pred_method: 'pen',
      pred_penalty_team1: 5, pred_penalty_team2: 4,
      scored: true, is_correct: true, points_earned: 150,
    })];
    _userMap = { 'u@test.com': { id: 'u_idem', prediction_points: 150, total_points: 150 } };

    await evaluateMatchPredictions('m1', 2, 1, 'pen', 5, 4);
    expect(_updatedUsers.u_idem.prediction_points).toBe(150);
  });

  it('legacy: predicción sin nuevas columnas (pred_winner=null) = 0 pts', async () => {
    _predictionRows = [makePred({ id: 'p_legacy' })];
    _userMap = { 'u@test.com': { id: 'u_leg', prediction_points: 0, total_points: 0 } };

    await evaluateMatchPredictions('m1', 2, 1, '90');
    const up = _upsertedPredictions.find(p => p.id === 'p_legacy');
    expect(up.points_earned).toBe(0);
    expect(up.winner_correct).toBe(null);
  });
```

Also update the mock supabase chain to handle the new fields. In the same test file, modify `_userMap` and `_predictionRows` initial states are fine. Add `makePred` helper at top of describe block.

- [ ] **Step 2: Run new tests to verify they fail**

```bash
npx vitest run src/api/evaluateMatchPredictions.test.js
```
Expected: NEW tests FAIL (function doesn't accept the new params yet). Old tests might still pass or might break depending on signature change.

- [ ] **Step 3: Refactor `evaluateMatchPredictions` to 3-component logic**

Replace `src/api/evaluateMatchPredictions.js` entirely with:

```javascript
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

const POINTS_WINNER = 50;
const POINTS_METHOD = 50;
const POINTS_PENALTY = 50;

// Deriva el ganador del resultado final (no del 90 min).
function deriveWinner(team1, team2) {
  if (team1 == null || team2 == null) return null;
  if (team1 > team2) return '1';
  if (team1 < team2) return '2';
  return 'X';
}

/**
 * Evalúa todos los pronósticos de un partido contra el resultado real.
 *
 * 3 componentes independientes:
 *   - Ganador correcto (1/X/2): +50 pts
 *   - Método correcto ('90'/'et'/'pen'): +50 pts
 *   - Penal exacto (solo si pred_method='pen' y result_method='pen'): +50 pts
 *
 * IDEMPOTENTE: recalcula desde cero. Apto para llamar N veces.
 *
 * @param {string} matchId
 * @param {number} resultTeam1
 * @param {number} resultTeam2
 * @param {'90'|'et'|'pen'|null} resultMethod
 * @param {number|null} penaltyScoreT1  — penales del team1 si resultMethod='pen'
 * @param {number|null} penaltyScoreT2
 * @returns {{ evaluated: number, correct: number }}
 */
export async function evaluateMatchPredictions(
  matchId,
  resultTeam1,
  resultTeam2,
  resultMethod = null,
  penaltyScoreT1 = null,
  penaltyScoreT2 = null,
) {
  if (!supabase) {
    console.warn('[evaluateMatchPredictions] Supabase no disponible');
    return { evaluated: 0, correct: 0 };
  }

  // 1. Cargar pronósticos del partido
  const { data: allPredictions, error: predErr } = await supabase
    .from('predictions')
    .select('id, user_email, pred_winner, pred_method, pred_penalty_team1, pred_penalty_team2')
    .eq('match_id', matchId);

  if (predErr) {
    console.error('[evaluateMatchPredictions] Error cargando predictions:', predErr);
    return { evaluated: 0, correct: 0 };
  }
  if (!allPredictions || allPredictions.length === 0) {
    return { evaluated: 0, correct: 0 };
  }

  // 2. Excluir admins
  const { data: adminRows } = await supabase
    .from('users')
    .select('email')
    .eq('role', 'admin');
  const adminEmails = new Set((adminRows || []).map(u => u.email));
  const predictions = allPredictions.filter(p => !adminEmails.has(p.user_email));
  if (predictions.length === 0) return { evaluated: 0, correct: 0 };

  // 3. Puntuar — 3 componentes independientes
  const winner = deriveWinner(resultTeam1, resultTeam2);
  const correctEmails = new Set();
  const allEmails = new Set();
  const predictionUpdates = [];

  for (const pred of predictions) {
    allEmails.add(pred.user_email);

    // Componente 1: ganador
    const winnerCorrect =
      winner != null && pred.pred_winner != null && pred.pred_winner === winner;

    // Componente 2: método (null si resultMethod es null)
    const methodCorrect =
      resultMethod != null && pred.pred_method != null && pred.pred_method === resultMethod
        ? true
        : (resultMethod != null && pred.pred_method != null ? false : null);

    // Componente 3: penal (solo si ambos lados apostaron a pen)
    let penaltyCorrect = null;
    if (resultMethod === 'pen' && pred.pred_method === 'pen') {
      penaltyCorrect =
        pred.pred_penalty_team1 != null &&
        pred.pred_penalty_team2 != null &&
        pred.pred_penalty_team1 === penaltyScoreT1 &&
        pred.pred_penalty_team2 === penaltyScoreT2;
    }

    const pointsEarned =
      (winnerCorrect === true ? POINTS_WINNER : 0) +
      (methodCorrect === true ? POINTS_METHOD : 0) +
      (penaltyCorrect === true ? POINTS_PENALTY : 0);

    if (pointsEarned > 0) correctEmails.add(pred.user_email);

    predictionUpdates.push({
      id: pred.id,
      is_correct: pointsEarned > 0,
      points_earned: pointsEarned,
      winner_correct: winnerCorrect,
      method_correct: methodCorrect,
      penalty_correct: penaltyCorrect,
      scored: true,
    });
  }

  // 4. Upsert en lotes
  const BATCH = 100;
  const batches = [];
  for (let i = 0; i < predictionUpdates.length; i += BATCH) {
    const batch = predictionUpdates.slice(i, i + BATCH);
    batches.push(supabase.from('predictions').upsert(batch, { onConflict: 'id' }));
  }
  const results = await Promise.all(batches);
  for (const { error } of results) {
    if (error) console.error('[evaluateMatchPredictions] Error actualizando predictions:', error);
  }

  // 5. Recalcular puntos de usuarios afectados
  await recalculatePointsForEmails(allEmails);

  // 6. Comisión de referidos
  if (correctEmails.size > 0) {
    try {
      await Promise.all(
        [...correctEmails].map(email => db.awardReferralCommission(email, matchId))
      );
    } catch (e) {
      console.warn('[evaluateMatchPredictions] awardReferralCommission error:', e?.message);
    }
  }

  // 7. Refrescar cache local
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('db-cloud-change', { detail: { tableName: 'predictions' } }));
      window.dispatchEvent(new CustomEvent('db-cloud-change', { detail: { tableName: 'users' } }));
    } catch {}
  }

  return { evaluated: predictions.length, correct: correctEmails.size };
}

/**
 * Recalcula prediction_points y total_points desde cero.
 * prediction_points = SUM(points_earned WHERE is_correct=true AND scored=true)
 *   deduplicado por (user_email, match_id).
 */
async function recalculatePointsForEmails(emails) {
  await Promise.all([...emails].map(async (email) => {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('id, bonus_points, referral_points')
        .eq('email', email)
        .single();
      if (!user) return;

      const { data: scoredPreds } = await supabase
        .from('predictions')
        .select('id, match_id, points_earned, is_correct, scored')
        .eq('user_email', email)
        .eq('scored', true)
        .eq('is_correct', true);

      const seenMatches = new Set();
      let totalPoints = 0;
      for (const p of (scoredPreds || [])) {
        const key = p.match_id || '__nomatch__';
        if (seenMatches.has(key)) continue;
        seenMatches.add(key);
        totalPoints += p.points_earned || 0;
      }

      const bonusPoints = user.bonus_points || 0;
      const referralPoints = user.referral_points || 0;
      const newTotal = totalPoints + bonusPoints + referralPoints;

      await supabase
        .from('users')
        .update({
          prediction_points: totalPoints,
          total_points: newTotal,
        })
        .eq('id', user.id);
    } catch (e) {
      console.warn(`[recalculatePointsForEmails] Error recalculando ${email}:`, e?.message);
    }
  }));
}
```

- [ ] **Step 4: Update existing test cases that depend on `POINTS_PER_CORRECT = 100`**

In `src/api/evaluateMatchPredictions.test.js`, the existing test cases assume 100 pts per correct. With the refactor, those tests should be updated to use the new 3-component model or kept as legacy tests for old predictions. Recommended: rewrite them to use the new model with `makePred` helper.

Update the 4 existing tests (`'pronóstico correcto otorga 100 puntos'`, `'re-ejecutar sobre scored=true no duplica puntos'`, `'los admins se excluyen'`, `'pronóstico incorrecto no suma puntos'`) to use the new format. For example, the first one:

```javascript
it('pronóstico correcto otorga 150 puntos y marca scored=true (3 componentes)', async () => {
  _predictionRows = [makePred({
    id: 'p1', user_email: 'jugador@test.com', match_id: 'match-1',
    pred_winner: '1', pred_method: 'pen',
    pred_penalty_team1: 2, pred_penalty_team2: 1,
  })];
  _adminRows = [];
  _userMap = { 'jugador@test.com': { id: 'u1', prediction_points: 0, total_points: 0 } };

  const resultado = await evaluateMatchPredictions('match-1', 2, 1, 'pen', 2, 1);

  expect(resultado.evaluated).toBe(1);
  expect(resultado.correct).toBe(1);

  const upserteado = _upsertedPredictions.find(p => p.id === 'p1');
  expect(upserteado).toBeDefined();
  expect(upserteado.scored).toBe(true);
  expect(upserteado.points_earned).toBe(150);
  expect(upserteado.is_correct).toBe(true);

  const updates = _updatedUsers['u1'];
  expect(updates).toBeDefined();
  expect(updates.prediction_points).toBe(150);
  expect(updates.total_points).toBe(150);
});
```

- [ ] **Step 5: Run all evaluateMatchPredictions tests**

```bash
npx vitest run src/api/evaluateMatchPredictions.test.js
```
Expected: ALL tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```
Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/api/evaluateMatchPredictions.js src/api/evaluateMatchPredictions.test.js
git commit -m "feat(eval): 3 componentes independientes (ganador + método + penal)

- evaluateMatchPredictions ahora acepta resultMethod + penaltyScore
- Componentes se evalúan independientemente; suman 50+50+50 (max 150)
- winner_correct/method_correct/penalty_correct se persisten por separado
- Recalcula prediction_points sumando points_earned (en vez de count*100)
- scoring=true con method_correct null cuando resultMethod es null (SportScore caído)
- 9 tests nuevos para los escenarios del spec"
```

---

## Task 4: useMatchHandlers.js — pass new fields + clear on reopen

**Files:**
- Modify: `src/pages/admin/useMatchHandlers.js:143-203` (`handlePublishResult`)
- Modify: `src/pages/admin/useMatchHandlers.js:79-141` (`handleStatusChange` — clear new fields on `finished→open`)

**Interfaces:**
- `handlePublishResult(match, forceFinish=false)` now reads `result_method` and `penalty_score_*` from local form state, calls `evaluateMatchPredictions(match.id, t1, t2, method, pT1, pT2)`.
- The status change that goes from `finished` to anything else must clear `result_method` and `penalty_score_team1/2` (currently only clears `result_team1/2`).

- [ ] **Step 1: Add tests for the admin handler — manual verification**

There is no existing test file for `useMatchHandlers` (it's a React hook that calls `useMutation`/`useQueryClient`, hard to unit-test without a full app shell). For this task, rely on:
- Integration smoke test in Task 7 (manual end-to-end)
- Visual verification in dev server (Step 7 of Task 5 already covers admin UI)

**Not adding automated tests for this task** — `evaluateMatchPredictions` (Task 3) and the UI (Task 5) have the bulk of the logic and ARE tested.

- [ ] **Step 2: Add new fields to the publish state shape**

In `src/pages/admin/useMatchHandlers.js`, the `handlePublishResult` function (line 143) needs to know the method and penalty scores. Update it to read from `results.form[match.id]`:

```javascript
const handlePublishResult = async (match, forceFinish = false) => {
  if (!canPublishResult(match) && !forceFinish) {
    toast.error('El partido debe estar EN VIVO o FINALIZADO para actualizar el marcador.');
    return;
  }
  // Guard: si el partido ya está finalizado con el mismo resultado, no re-ejecutar scoring
  if (match.status === 'finished' && match.result_team1 != null && match.result_team2 != null) {
    const r = results.form[match.id];
    const sameResult = r && Number(r.team1) === match.result_team1 && Number(r.team2) === match.result_team2;
    const sameMethod = (r?.resultMethod ?? null) === (match.result_method ?? null);
    const samePenalty =
      (r?.penaltyTeam1 ?? null) === (match.penalty_score_team1 ?? null) &&
      (r?.penaltyTeam2 ?? null) === (match.penalty_score_team2 ?? null);
    if (sameResult && sameMethod && samePenalty) {
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
  const resultMethod = r.resultMethod ?? null;
  const penaltyT1 = r.penaltyTeam1 != null && r.penaltyTeam1 !== '' ? Number(r.penaltyTeam1) : null;
  const penaltyT2 = r.penaltyTeam2 != null && r.penaltyTeam2 !== '' ? Number(r.penaltyTeam2) : null;

  // Validar: si el método es 'pen', los penales son obligatorios
  if (resultMethod === 'pen' && (penaltyT1 == null || penaltyT2 == null)) {
    toast.error('Si el partido terminó en penales, completa el marcador de penales.');
    return;
  }

  // Solo actualizar marcador en vivo
  if (match.status === 'live' && !forceFinish) {
    await api.entities.Match.update(match.id, {
      result_team1: resultTeam1,
      result_team2: resultTeam2,
    });
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
    result_team1: resultTeam1,
    result_team2: resultTeam2,
    result_method: resultMethod,
    penalty_score_team1: penaltyT1,
    penalty_score_team2: penaltyT2,
    status: 'finished',
  });
  const evalResult = await evaluateMatchPredictions(
    match.id, resultTeam1, resultTeam2, resultMethod, penaltyT1, penaltyT2,
  );
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
      ? `✅ ${evalResult.correct} pronóstico${evalResult.correct > 1 ? 's' : ''} acertado${evalResult.correct > 1 ? 's' : ''} (de ${evalResult.evaluated} evaluado${evalResult.evaluated > 1 ? 's' : ''})`
      : `${evalResult.evaluated} pronóstico${evalResult.evaluated > 1 ? 's' : ''} evaluado${evalResult.evaluated > 1 ? 's' : ''} — sin aciertos`
  );
};
```

- [ ] **Step 3: Update `handleStatusChange` to clear new fields on `finished→X`**

In the `handleStatusChange` function (line 79), the block that resets result fields when leaving `live/finished` currently only clears `result_team1/2`, `elapsed`, `live_started_at`. Extend it to also clear the new fields:

```javascript
if (STATUS_KEEPS_RESULT.has(match.status) && !STATUS_KEEPS_RESULT.has(newStatus)) {
  extra.result_team1 = null;
  extra.result_team2 = null;
  extra.elapsed = null;
  extra.live_started_at = null;
  // Nuevos campos: limpiar también para que el partido vuelva a estado "sin resultado"
  extra.result_method = null;
  extra.penalty_score_team1 = null;
  extra.penalty_score_team2 = null;
}
```

Also update the auto-evaluation call inside `handleStatusChange` (around line 121):

```javascript
if (newStatus === 'finished' && !alreadyFinished && match.result_team1 != null && match.result_team2 != null) {
  const evalResult = await evaluateMatchPredictions(
    match.id,
    match.result_team1,
    match.result_team2,
    match.result_method ?? null,
    match.penalty_score_team1 ?? null,
    match.penalty_score_team2 ?? null,
  );
  // ... resto del bloque (toasts, sync, invalidate)
}
```

- [ ] **Step 4: Update `handleBatchPublish` to pass new fields**

Find `handleBatchPublish` (around line 205) and update it to extract method/penalty from the bulk form and pass to `evaluateMatchPredictions`:

```javascript
const publishResults = await Promise.allSettled(
  matchesToPublish.map(async ([matchId, r]) => {
    const match = matchById.get(matchId);
    if (!match) return;
    if (!canPublishResult(match)) { return; }
    const resultTeam1 = Number(r.team1);
    const resultTeam2 = Number(r.team2);
    const resultMethod = r.resultMethod ?? null;
    const penaltyT1 = r.penaltyTeam1 != null && r.penaltyTeam1 !== '' ? Number(r.penaltyTeam1) : null;
    const penaltyT2 = r.penaltyTeam2 != null && r.penaltyTeam2 !== '' ? Number(r.penaltyTeam2) : null;
    if (resultMethod === 'pen' && (penaltyT1 == null || penaltyT2 == null)) {
      console.warn(`[batch] Partido ${matchId}: método=pen pero penales vacíos, se saltea`);
      return;
    }
    await api.entities.Match.update(matchId, {
      result_team1: resultTeam1,
      result_team2: resultTeam2,
      result_method: resultMethod,
      penalty_score_team1: penaltyT1,
      penalty_score_team2: penaltyT2,
      status: 'finished',
    });
    const evalResult = await evaluateMatchPredictions(
      matchId, resultTeam1, resultTeam2, resultMethod, penaltyT1, penaltyT2,
    );
    totalCorrect += evalResult.correct;
    return matchId;
  })
);
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/useMatchHandlers.js
git commit -m "feat(admin): pasar result_method + penalty_score_* a evaluate

- handlePublishResult valida que pen implique penales llenos
- handleStatusChange limpia result_method/penalty_score_* al salir de live/finished
- handleBatchPublish soporta los nuevos campos con guard
- Compara method + penalties en el guard de idempotencia"
```

---

## Task 5: Admin UI — show method + penalty fields in MatchCardItem + BatchPublishCard

**Files:**
- Modify: `src/pages/admin/MatchCardItem.jsx` — add method + penalty inputs
- Modify: `src/pages/admin/BatchPublishCard.jsx` — add method + penalty columns

**Interfaces:**
- Form state now includes: `{ team1, team2, resultMethod, penaltyTeam1, penaltyTeam2 }` per match
- Method is auto-detected from `liveResult.method` (when present) but admin can override
- Penalty inputs only enabled when method=pen

- [ ] **Step 1: Find current form-rendering code**

Read `src/pages/admin/MatchCardItem.jsx` to find where the `team1`/`team2` inputs are rendered. Likely inside the publish dialog or batch card. Save the surrounding code as context.

- [ ] **Step 2: Extend the form state shape**

Wherever the form state is initialized (likely `useState({team1:'', team2:''})` or via `results.form[match.id]`), extend to:

```javascript
{
  team1: '',
  team2: '',
  resultMethod: null, // '90' | 'et' | 'pen' | null
  penaltyTeam1: '',
  penaltyTeam2: '',
}
```

- [ ] **Step 3: Auto-detect method from SportScore**

When the form opens for a match, if there's a `liveResult` available with `method !== null`, prefill `resultMethod`. If `method='pen'` and `liveResult.penaltyScore` is set, prefill the penalty inputs.

```javascript
// Effect: cuando se abre el form, sincronizar con datos detectados
useEffect(() => {
  if (!isFormOpen) return;
  const live = liveResults[match.id];
  if (live?.method && !form.resultMethod) {
    setForm(f => ({ ...f, resultMethod: live.method }));
    if (live.method === 'pen' && live.penaltyScore) {
      setForm(f => ({
        ...f,
        penaltyTeam1: String(live.penaltyScore.team1),
        penaltyTeam2: String(live.penaltyScore.team2),
      }));
    }
  }
}, [isFormOpen, liveResults, match.id]);
```

- [ ] **Step 4: Add the UI controls**

Below the existing `team1`/`team2` inputs, add:

```jsx
<div className="flex items-center gap-2 mt-2">
  <Label className="text-xs">Cómo terminó:</Label>
  <Select value={form.resultMethod ?? ''} onValueChange={(v) => setForm(f => ({ ...f, resultMethod: v || null }))}>
    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="90">90 min</SelectItem>
      <SelectItem value="et">Tiempo extra</SelectItem>
      <SelectItem value="pen">Penales</SelectItem>
    </SelectContent>
  </Select>
</div>

{form.resultMethod === 'pen' && (
  <div className="flex items-center gap-2 mt-2">
    <Label className="text-xs">Penales:</Label>
    <Input
      type="number"
      min="0"
      className="w-14 h-8 text-center"
      placeholder="0"
      value={form.penaltyTeam1}
      onChange={(e) => setForm(f => ({ ...f, penaltyTeam1: e.target.value }))}
    />
    <span>-</span>
    <Input
      type="number"
      min="0"
      className="w-14 h-8 text-center"
      placeholder="0"
      value={form.penaltyTeam2}
      onChange={(e) => setForm(f => ({ ...f, penaltyTeam2: e.target.value }))}
    />
  </div>
)}

{form.resultMethod === 'pen' && (!form.penaltyTeam1 || !form.penaltyTeam2) && (
  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
    ⚠ Completa el marcador de penales antes de publicar.
  </p>
)}
```

- [ ] **Step 5: Disable "Publicar" button if method=pen with empty penalties**

In the button:
```jsx
<Button
  disabled={
    submitPrediction.isPending ||
    !form.team1 || !form.team2 ||
    (form.resultMethod === 'pen' && (!form.penaltyTeam1 || !form.penaltyTeam2))
  }
  onClick={...}
>
```

- [ ] **Step 6: Apply the same UI pattern to BatchPublishCard**

In `src/pages/admin/BatchPublishCard.jsx`, add the same 3 fields (method + penalty team1/team2) to each row in the batch publish table. Use the same auto-detect-from-`liveResult` pattern. Use the same validation (pen requires penalties). The exact code mirrors Steps 3-5 with `form[matchId].resultMethod` instead of `form.resultMethod`.

- [ ] **Step 7: Manual verification**

Run the dev server:
```bash
npm run dev
```
Open the admin panel, open a finished match (or simulate one), verify:
- Method dropdown shows "Auto" by default
- If SportScore says `pen`, the dropdown auto-selects "Penales" and penalty inputs appear
- Penalty inputs are required if method=pen
- If you select `90`, the penalty inputs disappear
- Publishing with valid data succeeds

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/MatchCardItem.jsx src/pages/admin/BatchPublishCard.jsx
git commit -m "feat(admin ui): campos método + marcador penales en publish form

- Auto-detecta método desde liveResult.method (SportScore)
- Inputs de penales solo se muestran cuando método = pen
- Validación: no se puede publicar con método=pen sin penales
- Aplica tanto al publish individual como al batch"
```

---

## Task 6: User UI — Matches.jsx 3-pick flow

**Files:**
- Modify: `src/pages/Matches.jsx`

**Interfaces:**
- Form state per match: `{ pred_winner: '1'|'X'|'2'|null, pred_method: '90'|'et'|'pen'|null, pred_penalty_team1: '', pred_penalty_team2: '' }`
- Submit sends all 3 to `api.entities.Prediction.create(...)`
- Display post-eval breakdown: ✅/❌ for each component + total pts

- [ ] **Step 1: Replace `predictionsState` shape**

In `src/pages/Matches.jsx`, find `const [predictionsState, setPredictionsState] = useState({})`. The shape stays an object keyed by `matchId`, but each entry now has the 3-pick structure:

```javascript
const EMPTY_FORM = { pred_winner: null, pred_method: null, pred_penalty_team1: '', pred_penalty_team2: '' };
```

- [ ] **Step 2: Rewrite `handlePredict` and `handleSubmit`**

Replace the existing handlers:

```javascript
const handlePredict = (matchId, field, value) => {
  setPredictionsState(prev => ({
    ...prev,
    [matchId]: { ...EMPTY_FORM, ...(prev[matchId] || {}), [field]: value },
  }));
};

const handleSubmit = (data) => {
  const form = predictionsState[data.match_id] || {};
  // Validación
  if (!form.pred_winner) {
    toast.error('Elige quién gana');
    return;
  }
  if (!form.pred_method) {
    toast.error('Elige cómo gana (90 min / tiempo extra / penales)');
    return;
  }
  if (form.pred_method === 'pen' && (form.pred_penalty_team1 === '' || form.pred_penalty_team2 === '')) {
    toast.error('Si elegiste penales, completa el marcador de penales');
    return;
  }

  submitPrediction.mutate({
    match_id: data.match_id,
    user_email: data.user_email,
    pred_winner: form.pred_winner,
    pred_method: form.pred_method,
    pred_penalty_team1: form.pred_method === 'pen' ? Number(form.pred_penalty_team1) : null,
    pred_penalty_team2: form.pred_method === 'pen' ? Number(form.pred_penalty_team2) : null,
  });
};
```

- [ ] **Step 3: Rewrite the prediction form rendering in `MatchCard`**

Find where the 2 score `<Input>` are rendered (around line 343). Replace with 3 sections:

```jsx
{isOpen ? (
  <m.div ...>
    <div className="bg-muted/40 border border-border/50 rounded-xl p-2 sm:p-3 space-y-2">
      {/* Paso 1: ¿Quién gana? */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">¿Quién gana?</p>
        <div className="grid grid-cols-3 gap-1">
          {[
            { value: '1', label: match.team1.slice(0, 8) },
            { value: 'X', label: 'Empate' },
            { value: '2', label: match.team2.slice(0, 8) },
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

      {/* Paso 2: ¿Cómo gana? */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">¿Cómo gana?</p>
        <div className="grid grid-cols-3 gap-1">
          {[
            { value: '90', label: '90 min' },
            { value: 'et', label: 'T. extra' },
            { value: 'pen', label: 'Penales' },
          ].map(opt => (
            <Button
              key={opt.value}
              size="sm"
              variant={form.pred_method === opt.value ? 'default' : 'outline'}
              className="h-8 text-xs px-1"
              onClick={() => handlePredict(match.id, 'pred_method', opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Paso 3: Marcador penales (solo si eligió pen) */}
      {form.pred_method === 'pen' && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Marcador de penales</p>
          <div className="flex items-center justify-center gap-1.5">
            <Input
              type="number" min="0" inputMode="numeric"
              className="w-11 h-9 text-center text-sm font-bold"
              placeholder="0"
              value={form.pred_penalty_team1}
              onChange={(e) => handlePredict(match.id, 'pred_penalty_team1', e.target.value)}
            />
            <span className="text-sm font-bold">-</span>
            <Input
              type="number" min="0" inputMode="numeric"
              className="w-11 h-9 text-center text-sm font-bold"
              placeholder="0"
              value={form.pred_penalty_team2}
              onChange={(e) => handlePredict(match.id, 'pred_penalty_team2', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Botón enviar */}
      <Button
        onClick={() => handleSubmit({ match_id: match.id, user_email: user.email })}
        disabled={submitPrediction.isPending || !form.pred_winner || !form.pred_method}
        size="sm"
        className="w-full gap-1.5 h-9 text-xs font-semibold"
      >
        <Send className="w-3.5 h-3.5" />
        <span>{submitPrediction.isPending ? 'Enviando...' : 'Enviar'}</span>
      </Button>

      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium text-center">
        Hasta <strong>150 pts</strong> si aciertas los 3
      </div>
    </div>
  </m.div>
) : ...
```

- [ ] **Step 4: Update the "existing prediction" display**

When the user already submitted, show the breakdown instead of just the score. Find the existing display (line 257) and replace:

```jsx
{existing && resultKnown && user?.role !== 'admin' ? (
  <div className="space-y-1.5">
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Tu pronóstico</p>
    <p className="text-xs font-bold text-foreground text-center">
      {existing.pred_winner === '1' ? match.team1 : existing.pred_winner === '2' ? match.team2 : 'Empate'}
      {' · '}
      {existing.pred_method === '90' ? '90 min' : existing.pred_method === 'et' ? 'T. extra' : 'Penales'}
      {existing.pred_method === 'pen' && existing.pred_penalty_team1 != null &&
        ` · ${existing.pred_penalty_team1}-${existing.pred_penalty_team2}`}
    </p>
    <div className="space-y-1">
      <PtsRow label="Ganador" correct={existing.winner_correct} pts={50} />
      <PtsRow label="Cómo gana" correct={existing.method_correct} pts={50} />
      <PtsRow label="Penales" correct={existing.penalty_correct} pts={50} notApplicable={
        match.result_method !== 'pen' || existing.pred_method !== 'pen'
      } />
      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <span className="text-xs font-bold">Total</span>
        <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
          {existing.points_earned || 0} pts
        </span>
      </div>
    </div>
  </div>
) : ...}

// Helper component inside Matches.jsx (above MatchCard):
function PtsRow({ label, correct, pts, notApplicable }) {
  if (notApplicable) {
    return (
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/60">⏸ no aplica</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-between text-[11px] ${
      correct ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
    }`}>
      <span>{label}</span>
      <span className="font-semibold">{correct ? `✅ +${pts}` : '❌ 0'}</span>
    </div>
  );
}
```

- [ ] **Step 5: Update toast message**

In the `onSuccess` of `submitPrediction` (line 474):
```javascript
toast.success('¡Pronóstico enviado! 🏆 hasta 150 pts si aciertas los 3');
```

- [ ] **Step 6: Manual verification**

Run dev server:
```bash
npm run dev
```
- Open Matches page, find an open match
- Verify 3-step flow renders correctly
- Fill all 3 steps (with method=pen → penalty inputs appear)
- Submit, verify prediction saves
- Re-open the match, verify pre-filled state
- Switch method to `90` → verify penalty inputs disappear
- Switch back to `pen` → verify they reappear (with values cleared or preserved — decide)

- [ ] **Step 7: Commit**

```bash
git add src/pages/Matches.jsx
git commit -m "feat(matches ui): pronóstico 3 pasos (ganador/método/penal)

- Reemplaza inputs de marcador por 3 secciones: ¿quién gana?, ¿cómo gana?, penales
- Inputs de penales solo aparecen si eligió method=pen
- Validación: los 3 picks requeridos (penal solo si method=pen)
- Post-evaluación: muestra desglose con ✅/❌ por componente + total pts
- Hasta 150 pts/match"
```

---

## Task 7: Integration verification + rollback test

**Files:**
- No new files. End-to-end testing.

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass (sportscore, evaluateMatchPredictions, supabase, etc.).

- [ ] **Step 2: Smoke test in dev server**

Start dev server and execute the full flow:

```bash
npm run dev
```

1. **Register a test user** (or use existing)
2. **Go to Matches**, find an open match
3. **Pick "1" + "90 min"** → submit → verify saved (check via admin or DB)
4. **Pick a different match: "X" + "Penales" + "4-3"** → submit → verify saved
5. **In admin**, publish the first match result: 2-1, method auto-detected as `90`
6. **Verify**: user got 100 pts (winner + method, no penalty)
7. **In admin**, publish the second match: 0-0 → goes to penalties in real life. Set method=`pen`, penalties=4-3
8. **Verify**: user got 150 pts (winner wrong → 0, method correct, penalty correct)
9. **Reopen the second match** (finished → open). Verify `result_method` and `penalty_score_*` are cleared.
10. **Republish** with a different result (e.g., 1-1, method=et). Verify points recalculated to 0 (winner was wrong, method was right, but penalty not applied since method≠pen).

- [ ] **Step 3: Verify ranking**

Check the Ranking page — user with 250 pts (100 + 150) should be at the top of any matches they predicted.

- [ ] **Step 4: Verify the admin recovery flow**

- Open a finished match, change result_method from `90` to `pen`
- Re-publish
- Verify all predictions for that match are re-evaluated (some users may now have different points)

- [ ] **Step 5: Build production bundle**

```bash
npm run build
```
Expected: build succeeds without errors.

- [ ] **Step 6: Final commit**

If any tweaks were made during smoke testing:
```bash
git add -A
git commit -m "chore: ajustes finales después de smoke test E2E"
```

---

## Rollback Plan

If something goes catastrophically wrong on 28 jun:

1. **Revert SQL** by running the ROLLBACK block from `2026-06-25-001-betting-3ways.sql` in Supabase SQL Editor.
2. **Revert code**: `git revert HEAD~7..HEAD` (or however many commits), redeploy.
3. **Predictions saved with new format will remain** in `predictions` table but the UI/eval will ignore them (the `pred_winner`/`pred_method` columns just sit there unused).

This is safe because we kept `pred_team1`/`pred_team2` in the schema — old predictions (if any) still work.

---

## Self-Review Checklist (run before delivering to operator)

- [ ] All spec requirements covered by a task (verify against `2026-06-25-betting-3ways-design.md`)
- [ ] No "TBD"/"TODO"/"similar to" placeholders in steps
- [ ] Type/signature consistency across tasks (`evaluateMatchPredictions` signature, form state shape, etc.)
- [ ] All commands runnable (paths exist, scripts available)
- [ ] Test counts add up (1 sportscore + 9 eval = 10 new tests)
- [ ] Operator actions clearly marked
