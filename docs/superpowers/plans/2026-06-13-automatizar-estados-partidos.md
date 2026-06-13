# Automatizar estados de partidos (pg_cron) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los estados de los partidos avancen solos en el servidor (Supabase pg_cron) — `pending→open` 24h antes y `open→live` al empezar — y que ningún partido empezado desaparezca de la vista pública.

**Architecture:** Una función SQL idempotente corre cada 5 min vía pg_cron y actualiza `matches.status` server-side (bypassa RLS). El frontend gana una red de seguridad para la ventana entre ticks y refresco automático del panel admin.

**Tech Stack:** PostgreSQL (Supabase) + pg_cron; React + React Query (Vite); Vitest.

---

## Estructura de archivos

- **Crear** `automatizar-estados-partidos.sql` (raíz) — función SQL + dry-run + schedule pg_cron. Se corre en el SQL Editor de Supabase.
- **Crear** `src/pages/matches/matchTiming.js` — helpers puros de tiempo/estado en vivo (reutilizables y testeables).
- **Crear** `src/pages/matches/matchTiming.test.js` — tests del helper `isLiveMatch`.
- **Modificar** `src/pages/Matches.jsx` — usar `isLiveMatch` (incluye `pending` empezado) en la categoría EN VIVO.
- **Modificar** `src/pages/admin/AdminMatches.jsx` — `refetchInterval: 60000` en la query `admin-matches-sorted`.

---

### Task 1: Helper puro de tiempo/estado en vivo (TDD)

**Files:**
- Create: `src/pages/matches/matchTiming.js`
- Test: `src/pages/matches/matchTiming.test.js`

- [ ] **Step 1: Escribir el test que falla**

```js
// src/pages/matches/matchTiming.test.js
import { describe, it, expect } from 'vitest';
import { isLiveMatch, hasStartedNow, getKickoffMs } from './matchTiming';

const NOW = new Date(2026, 5, 13, 15, 0, 0).getTime(); // 13 jun 2026, 15:00 local

const at = (h, m) => ({ match_date: '2026-06-13', match_time: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` });

describe('isLiveMatch', () => {
  it('pending ya empezado (hace 1h) => EN VIVO (red de seguridad)', () => {
    expect(isLiveMatch({ ...at(14, 0), status: 'pending' }, NOW)).toBe(true);
  });
  it('pending a futuro => NO en vivo', () => {
    expect(isLiveMatch({ ...at(18, 0), status: 'pending' }, NOW)).toBe(false);
  });
  it('status live => EN VIVO siempre', () => {
    expect(isLiveMatch({ ...at(18, 0), status: 'live' }, NOW)).toBe(true);
  });
  it('open ya empezado => EN VIVO', () => {
    expect(isLiveMatch({ ...at(14, 0), status: 'open' }, NOW)).toBe(true);
  });
  it('finished nunca está en vivo', () => {
    expect(isLiveMatch({ ...at(14, 0), status: 'finished' }, NOW)).toBe(false);
  });
  it('empezado hace mas de 3.5h => fuera de ventana, NO en vivo', () => {
    expect(isLiveMatch({ ...at(10, 0), status: 'pending' }, NOW)).toBe(false);
  });
  it('sin fecha/hora => NO en vivo', () => {
    expect(isLiveMatch({ status: 'pending' }, NOW)).toBe(false);
  });
});

describe('hasStartedNow / getKickoffMs', () => {
  it('getKickoffMs retorna null sin datos', () => {
    expect(getKickoffMs({})).toBe(null);
  });
  it('hasStartedNow true si empezó dentro de la ventana', () => {
    expect(hasStartedNow({ ...at(14, 30), status: 'open' }, NOW)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/pages/matches/matchTiming.test.js`
Expected: FAIL (`Failed to resolve import './matchTiming'` o similar).

- [ ] **Step 3: Implementar el helper mínimo**

```js
// src/pages/matches/matchTiming.js
// Helpers puros para decidir el estado "en vivo" de un partido según su horario.
// Interpretan la fecha del calendario de match_date + match_time como hora LOCAL
// (igual que getMatchDate en Matches.jsx). Sin dependencias de React.

const LIVE_WINDOW_H = 3.5; // un partido "en juego" hasta ~3.5h después del inicio

export function getKickoffMs(match) {
  if (!match?.match_date || !match?.match_time) return null;
  const datePart = String(match.match_date).split('T')[0];
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = String(match.match_time).split(':').map(Number);
  if ([y, mo, d, h, mi].some(Number.isNaN)) return null;
  return new Date(y, mo - 1, d, h, mi, 0).getTime();
}

export function hasStartedNow(match, nowMs = Date.now(), windowH = LIVE_WINDOW_H) {
  const k = getKickoffMs(match);
  if (k == null) return false;
  const elapsedH = (nowMs - k) / 3.6e6;
  return elapsedH >= 0 && elapsedH <= windowH;
}

// EN VIVO = 'live' en la BD, o (open/closed/pending) cuyo horario de inicio ya
// pasó y sigue dentro de la ventana de juego. Incluir 'pending' es la red de
// seguridad: evita que un partido recién empezado desaparezca entre ticks del cron.
export function isLiveMatch(match, nowMs = Date.now()) {
  if (!match) return false;
  if (match.status === 'live') return true;
  if (match.status === 'open' || match.status === 'closed' || match.status === 'pending') {
    return hasStartedNow(match, nowMs);
  }
  return false;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/pages/matches/matchTiming.test.js`
Expected: PASS (todos los casos).

- [ ] **Step 5: Commit**

```bash
git add src/pages/matches/matchTiming.js src/pages/matches/matchTiming.test.js
git commit -m "feat(matches): helper puro isLiveMatch (incluye pending empezado)"
```

---

### Task 2: Red de seguridad en la vista pública

**Files:**
- Modify: `src/pages/Matches.jsx`

- [ ] **Step 1: Importar el helper**

En `src/pages/Matches.jsx`, junto a los demás imports (después de `import { useLiveResults } from './matches/useLiveResults';`):

```js
import { isLiveMatch as isLiveByTime, hasStartedNow as hasStartedByTime } from './matches/matchTiming';
```

- [ ] **Step 2: Reemplazar la lógica inline de EN VIVO**

Reemplazar este bloque (la función local `hasStartedNow` y el filtro `liveMatches`):

```js
  // ¿El partido ya empezó (según su horario) y sigue dentro de la ventana de
  // juego (~3.5h)? Sirve para auto-pasarlo a EN VIVO sin intervención manual.
  const LIVE_WINDOW_H = 3.5;
  const hasStartedNow = (match) => {
    const kickoff = getMatchDate(match.match_date, match.match_time);
    if (!kickoff) return false;
    const elapsedH = (Date.now() - kickoff.getTime()) / 3.6e6;
    return elapsedH >= 0 && elapsedH <= LIVE_WINDOW_H;
  };

  // EN VIVO = marcado 'live' por el admin, O abierto/cerrado cuyo horario de
  // inicio ya pasó (auto). Se excluye lo ya finalizado en la BD.
  const liveMatches = matches.filter(m =>
    !pendingConfirmIds.has(m.id) && (
      m.status === 'live' ||
      ((m.status === 'open' || m.status === 'closed') && hasStartedNow(m))
    )
  );
```

por:

```js
  // ¿El partido ya empezó (según su horario) y sigue dentro de la ventana de juego?
  const hasStartedNow = (match) => hasStartedByTime(match);

  // EN VIVO = 'live' en la BD, o (open/closed/pending) cuyo horario ya empezó.
  // Incluir 'pending' es la red de seguridad: entre ticks del cron (máx 5 min),
  // un partido recién empezado se muestra acá en vez de desaparecer.
  const liveMatches = matches.filter(m =>
    !pendingConfirmIds.has(m.id) && isLiveByTime(m)
  );
```

- [ ] **Step 3: Verificar que `notStartedYet` excluye los pending empezados de PRÓXIMOS**

Confirmar (sin cambios) que el filtro de `upcomingMatches` mantiene `!liveIds.has(m.id)` y `notStartedYet(m)`. Como un `pending` empezado ahora entra en `liveIds`, queda excluido de PRÓXIMOS automáticamente (sin duplicarse).

Leer el bloque `const upcomingMatches = matches.filter(...)` y verificar que contiene `&& !liveIds.has(m.id) && notStartedYet(m)`. No requiere edición.

- [ ] **Step 4: Verificar build + lint**

Run: `npx eslint src/pages/Matches.jsx`
Expected: 0 errors (advertencias preexistentes ok).

Run: `npx vite build`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Matches.jsx
git commit -m "fix(matches): un partido empezado nunca desaparece (pending+empezado => EN VIVO)"
```

---

### Task 3: Refresco automático del panel admin

**Files:**
- Modify: `src/pages/admin/AdminMatches.jsx`

- [ ] **Step 1: Agregar refetchInterval a la query de partidos**

Reemplazar:

```js
  const { data: rawMatches = [], isLoading } = useQuery({
    queryKey: ['admin-matches-sorted'],
    queryFn: () => api.entities.Match.list(),
  });
```

por:

```js
  const { data: rawMatches = [], isLoading } = useQuery({
    queryKey: ['admin-matches-sorted'],
    queryFn: () => api.entities.Match.list(),
    // Reflejar los cambios de estado que hace el cron server-side sin recargar.
    refetchInterval: 60000,
  });
```

- [ ] **Step 2: Verificar build + lint**

Run: `npx eslint src/pages/admin/AdminMatches.jsx`
Expected: 0 errors.

Run: `npx vite build`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminMatches.jsx
git commit -m "feat(admin): refrescar partidos cada 60s para ver transiciones automaticas"
```

---

### Task 4: SQL — función, dry-run y schedule pg_cron

**Files:**
- Create: `automatizar-estados-partidos.sql`

- [ ] **Step 1: Escribir el archivo SQL completo**

```sql
-- automatizar-estados-partidos.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Transición automática de estados de partidos (Supabase pg_cron)
--   pending → open : faltan <= 24h para el inicio (abre pronósticos)
--   open    → live : ya pasó el horario de inicio (EN VIVO)
-- NO finaliza partidos (eso lo hace el admin con el resultado real).
-- NO toca 'closed' ni 'finished'. Idempotente. Zona horaria America/Panama.
--
-- CÓMO USAR: pegar todo en Supabase → SQL Editor → RUN.
--   1) Crea/actualiza la función.
--   2) Corré el DRY-RUN (sección 2) para ver qué cambiaría.
--   3) Activá el cron (sección 3).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Función ───
create or replace function public.auto_transition_match_status()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  n integer;
begin
  -- pending → open : kickoff dentro de las próximas 24h (o ya pasó)
  update public.matches
  set status = 'open', updated_at = now()
  where status = 'pending'
    and match_date is not null
    and match_time is not null
    and (left(match_date::text, 10) || ' ' || match_time)::timestamp
        at time zone 'America/Panama' <= now() + interval '24 hours';
  get diagnostics n = row_count; affected := affected + n;

  -- open → live : ya pasó el horario de inicio
  update public.matches
  set status = 'live',
      live_started_at = coalesce(live_started_at, now()),
      elapsed = coalesce(elapsed, '0'),
      updated_at = now()
  where status = 'open'
    and match_date is not null
    and match_time is not null
    and (left(match_date::text, 10) || ' ' || match_time)::timestamp
        at time zone 'America/Panama' <= now();
  get diagnostics n = row_count; affected := affected + n;

  return affected;
end;
$$;

-- ─── 2) DRY-RUN: qué cambiaría AHORA (no modifica nada) ───
select id, team1, team2, status,
  (left(match_date::text,10)||' '||match_time)::timestamp at time zone 'America/Panama' as kickoff_utc,
  case
    when status = 'pending'
         and (left(match_date::text,10)||' '||match_time)::timestamp at time zone 'America/Panama' <= now()
      then 'pending→open→live'
    when status = 'pending'
         and (left(match_date::text,10)||' '||match_time)::timestamp at time zone 'America/Panama' <= now() + interval '24 hours'
      then 'pending→open'
    when status = 'open'
         and (left(match_date::text,10)||' '||match_time)::timestamp at time zone 'America/Panama' <= now()
      then 'open→live'
    else 'sin cambio'
  end as accion
from public.matches
where match_date is not null and match_time is not null
order by kickoff_utc;

-- ─── 3) Activar el cron (cada 5 minutos) ───
create extension if not exists pg_cron;

-- Re-crear el job de forma segura (borra el anterior si existe)
do $$
begin
  perform cron.unschedule('auto-transition-matches');
exception when others then
  null; -- no existía, ignorar
end $$;

select cron.schedule(
  'auto-transition-matches',
  '*/5 * * * *',
  $cron$ select public.auto_transition_match_status(); $cron$
);

-- ─── Verificación: ver el job programado ───
select jobid, schedule, jobname, active
from cron.job
where jobname = 'auto-transition-matches';
```

- [ ] **Step 2: (Manual del operador) Correr en Supabase**

El usuario corre el archivo en Supabase → SQL Editor. Revisa la columna `accion`
del DRY-RUN. Si se ve bien, el bloque 3 ya deja el cron activo.
Verificar que la última consulta liste el job con `active = true`.

- [ ] **Step 3: Commit**

```bash
git add automatizar-estados-partidos.sql
git commit -m "feat(db): cron de transicion automatica de estados de partidos"
```

---

## Notas de verificación end-to-end (tras correr el SQL)

1. Tomar un partido `pending` cuyo inicio sea dentro de < 24h → tras un tick del
   cron (≤ 5 min) debe pasar a `open` en el panel admin (que ahora refresca solo).
2. Tomar un partido `open` cuyo horario ya pasó → tras un tick debe pasar a `live`.
3. En la vista pública, un partido recién empezado nunca debe desaparecer (aparece
   en EN VIVO aunque el cron aún no lo haya tocado).
4. Confirmar que partidos `finished`/`closed` NO cambian solos.
