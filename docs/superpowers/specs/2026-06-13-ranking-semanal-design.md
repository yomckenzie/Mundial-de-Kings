# Filtro de ranking por semana — Diseño

**Fecha:** 2026-06-13
**Estado:** Aprobado

## Problema / objetivo

El ranking solo muestra el acumulado total (`prediction_points`). Se quiere poder ver
el ranking **por semana del torneo**, para todos los usuarios.

## Decisiones

- **Semana = bloque de 7 días desde el primer partido** (Sem 1 = 9–15 jun, Sem 2 =
  16–22 jun, …). Se derivan de las fechas de los partidos. Solo se muestran las
  semanas que ya empezaron (no semanas futuras vacías).
- **Visible para todos los usuarios.**
- **Puntos semanales** = aciertos cuyos partidos se jugaron en esa semana × 100. El
  bono de bienvenida y los puntos de referido NO cuentan (no son semanales).
- En modo semanal se listan **solo los que acertaron ≥ 1** esa semana. Si nadie:
  *"Nadie acertó en esta semana todavía."*
- Default = **General** (comportamiento actual, ordena por `prediction_points`).

## Diseño

### UI
Fila de chips arriba de la tabla (para todos): `[General] [Sem 1] [Sem 2] …`.
Al elegir una semana, el **podio, la tabla, "Tu puesto" y el buscador admin** pasan
a operar sobre los datos de esa semana. Título de la tabla muestra
"Semana N · 9–15 jun" cuando hay semana activa.

### Datos (sin red extra)
Se calcula en el cliente desde el caché local ya cargado: `users`, `predictions`,
`matches`. Un acierto cuenta si `is_correct === true` (scored) y el `match_date` del
partido cae en el rango `[inicio, fin)` de la semana. Se deduplica por
`(user_email, match_id)` para que predicciones duplicadas no inflen.

### Componentes
1. **`src/pages/ranking/weeklyRanking.js`** (puro, con tests):
   - `getTournamentWeeks(matches, nowMs)` → `[{ n, label, dateLabel, start, end }]`
     (semanas con `start <= now`; si ninguna empezó, devuelve la Semana 1).
   - `computeWeeklyRanking(users, predictions, matches, week)` → lista de usuarios
     `{ ...user, prediction_points: weeklyPoints, weeklyPoints, rank, gapToPrev }`,
     filtrada a `weeklyPoints > 0`, ordenada desc, con `rank` y `gapToPrev`.
     Base de usuarios: `profile_complete && role !== 'admin'` (igual que `getRanking`).
2. **`src/pages/Ranking.jsx`**: estado `selectedWeek` (null = General) + chips;
   queries de `matches` y `predictions`; `baseRanked = selectedWeek ? weekly : general`;
   el podio/tabla/Tu-puesto/buscador derivan de `baseRanked`.
3. **`src/pages/ranking/RankingTable.jsx`**: prop opcional `emptyMessage` para el
   caso "nadie acertó".

### Reuso
El resultado semanal se mapea a la misma forma que la vista general
(`prediction_points`, `rank`, `gapToPrev`), así `RankingPodium`, `RankingTable`,
`MyRankCard` y el buscador admin funcionan sin cambios de contrato.

## Casos borde
- Semana sin aciertos aún → lista vacía con mensaje propio.
- Usuario sin aciertos en la semana → no aparece; su "Tu puesto" no se muestra
  (guard `myRank > 0`).
- Predicción con `match_id` nulo o partido sin fecha → se ignora.
- Predicciones duplicadas → se cuentan una vez por `(user_email, match_id)`.

## Fuera de alcance
- Persistir puntos semanales en BD (se calcula al vuelo).
- Cambios en backend / deploy.
- Mostrar usuarios con 0 puntos en la semana.
