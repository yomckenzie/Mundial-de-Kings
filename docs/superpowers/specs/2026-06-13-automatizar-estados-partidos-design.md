# Automatizar estados de partidos (pg_cron) — Diseño

**Fecha:** 2026-06-13
**Estado:** Aprobado

## Problema

Las transiciones de estado de los partidos (`pending → open → live → finished`) son
**100% manuales** desde el panel admin (`useMatchHandlers.js`). La lógica de "48h
visible / 24h abierto / en vivo" solo existe como cálculo al vuelo en la página
pública (`Matches.jsx`); **nunca se escribe en la base de datos**. Consecuencias:

1. **El panel admin nunca se actualiza solo.** El admin ve el estado guardado
   (`pending`) aunque los usuarios ya vean el partido "Abierto" o "En vivo".
   (`autoCloseMatches` en `client.js` es un stub vacío que no hace nada.)
2. **Partidos que desaparecen.** Un partido en `pending` cuyo horario de inicio ya
   pasó cae en un hueco de la página pública: ya no es "Próximo" (regla: aún no
   empezó) y `pending` no puede mostrarse "En vivo" automáticamente (solo
   `open`/`closed`). No entra en ninguna categoría → desaparece. El admin debía
   cambiarlo a `open` (→ aparecía EN VIVO) y luego a `live` manualmente.

## Objetivo

Que los estados avancen **automáticamente en el servidor** (Supabase pg_cron), de
modo que el panel admin refleje la realidad y ningún partido empezado desaparezca.

## Diseño

### Transiciones automáticas (server-side)

Una función SQL corre cada 5 minutos y mueve los estados **solo hacia adelante**:

| Transición | Condición (hora America/Panamá) | Efecto |
|---|---|---|
| `pending` → `open` | `now() >= kickoff - 24h` | abre pronósticos |
| `open` → `live` | `now() >= kickoff` | EN VIVO; setea `live_started_at`, `elapsed='0'` |

Reglas de seguridad (decisiones de diseño):

- **Nunca finaliza** un partido. `live → finished` requiere el resultado real y
  dispara la evaluación de pronósticos → sigue siendo manual del admin.
- **No toca `closed` ni `finished`.** Si el admin congela/cierra a mano, se respeta.
- **Solo avanza**, nunca retrocede.
- **Idempotente**: solo actualiza filas cuyo estado realmente cambia. Seguro de
  correr cada 5 min.
- Salta partidos sin `match_date`/`match_time` o con fecha inválida.

### Zona horaria

`kickoff` se calcula tomando la **parte de fecha** de `match_date` (los primeros 10
caracteres `yyyy-MM-dd`, soporta tanto fecha simple como timestamp ISO) combinada
con `match_time` (`HH:mm`), interpretada como **America/Panamá** (UTC-5):

```sql
(left(match_date, 10) || ' ' || match_time)::timestamp at time zone 'America/Panama'
```

Esto coincide con cómo el frontend interpreta la hora (`getMatchDate` usa la fecha
del calendario como hora local).

### Por qué resuelve ambos síntomas

- El admin lee el estado de la BD → al cambiarlo el cron, se actualiza solo
  (se le agrega `refetchInterval` 60s a la query del panel para no recargar).
- El "desaparecer" se elimina: un `pending` pasa a `open` 24h antes y a `live` al
  empezar; nunca queda "empezado pero pending".

### Red de seguridad en el front (defensa en profundidad)

Entre tick y tick del cron (máx. 5 min) podría haber un partido recién empezado aún
en `pending`. Para que **nunca** desaparezca, en `Matches.jsx` se incluye en la
sección EN VIVO cualquier partido **ya empezado y no finalizado**, aunque la BD diga
`pending` (hoy solo lo hace para `open`/`closed`).

## Componentes

1. **Función SQL** `public.auto_transition_match_status()` — hace las 2
   transiciones, timezone Panamá, idempotente.
2. **Schedule pg_cron** — `*/5 * * * *` llama a la función. Requiere habilitar la
   extensión `pg_cron` una vez.
3. **Dry-run de verificación** — `SELECT` que muestra qué partidos cambiaría antes
   de activar el cron.
4. **`Matches.jsx`** — red de seguridad: `pending` + ya empezó + no finalizado → EN VIVO.
5. **`AdminMatches.jsx`** — `refetchInterval: 60000` en la query `admin-matches-sorted`.

## Entrega

- El SQL (función + cron + dry-run) se entrega como archivo `.sql` para correr en el
  **SQL Editor de Supabase** (único lugar con privilegios; el cron bypassa RLS).
  Igual que `fix-pronosticos-sin-evaluar.sql`.
- Los cambios de frontend (red de seguridad + refetch) se implementan en el código.

## Flujo de datos

```
pg_cron (cada 5 min)
  → auto_transition_match_status()
    → UPDATE public.matches.status   (bypassa RLS, corre como owner)
Admin / público leen matches vía sus queries → ven el estado actualizado
Red de seguridad del front cubre la ventana < 5 min
```

## Casos borde

- **Partido creado < 24h antes del inicio:** el cron lo abre en el próximo tick
  (≤ 5 min). La ventana de visibilidad de 48h del front lo muestra igual.
- **Partido sin equipos reales (placeholders de eliminatoria):** igual recibe
  transiciones de estado (tienen fecha); el polling en vivo de SportScore ya los
  ignora aparte.
- **Partido sin fecha/hora:** se salta.
- **pg_cron retrasado/caído:** la red de seguridad del front evita que algo
  desaparezca; el estado de la BD se pone al día en el siguiente tick.

## Fuera de alcance (v1)

- Opt-out de automatización por partido (todos se automatizan igual).
- Auto-finalización (queda manual, por el resultado y la evaluación).
- `closed → live` automático (se respeta el cierre manual del admin).

## Parámetros por defecto

- Frecuencia: cada 5 minutos.
- Zona horaria: America/Panamá (UTC-5).
