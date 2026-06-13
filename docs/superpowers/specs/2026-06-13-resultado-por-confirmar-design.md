# Resultado "Por confirmar" desde SportScore

**Fecha:** 2026-06-13
**Estado:** Aprobado

## Problema

Cuando un partido termina en SportScore, la app intentaba guardar el resultado
final automáticamente en la base de datos desde el navegador del usuario. Esto
falla con error `401 / row-level security` porque las políticas RLS de Supabase
solo permiten que un admin modifique la tabla `matches`. Además, escribir el
resultado automáticamente desde el cliente no es deseable: el admin debe
revisar y publicar el resultado oficial.

## Objetivo

- El marcador y el minuto en vivo se siguen mostrando desde SportScore (solo
  lectura, para todos los usuarios).
- Cuando SportScore reporta el partido como **finalizado**, el partido pasa a
  estado visual **"Por confirmar"** sin escribir en la base de datos.
- El admin ve el resultado sugerido precargado y, con un solo botón, publica el
  resultado oficial (evalúa pronósticos y notifica a los usuarios).

## Decisiones de diseño

1. **Fuente de verdad única.** Tanto la vista de usuario como el panel admin
   consumen el mismo hook `useLiveResults`, que consulta SportScore. (Enfoque A.)
2. **El cliente nunca escribe el resultado en la BD.** Se elimina el
   auto-guardado. Solo el admin escribe, al publicar.
3. **Mientras está "Por confirmar", no hay veredicto.** Al usuario se le muestra
   el marcador final y su pronóstico, pero NO se le dice si acertó ni se otorgan
   puntos hasta que el admin publique.
4. **Un solo botón "Publicar resultado"** en el admin (no dos pasos).

## Componentes

### 1. Motor de datos — `src/pages/matches/useLiveResults.js`

- **Quitar** el bloque `updateMatchResult` y toda escritura a
  `api.entities.Match.update`. El hook queda de solo lectura.
- Sigue devolviendo `{ matchId → { state, label, minute, team1Score, team2Score } }`.
- `state` puede ser `'live' | 'finished' | 'upcoming'`.
- Lo consumen tanto `Matches.jsx` (vista usuario) como el panel admin.

### 2. Vista de usuario — `src/pages/Matches.jsx`

- Un partido cuyo `liveResults[m.id].state === 'finished'` se considera
  **finalizado-por-SportScore**, aunque en la BD siga como `live`/`open`/`closed`.
- Clasificación:
  - **EN VIVO**: partidos en juego cuyo `liveResults` NO está `finished`.
  - **FINALIZADOS**: incluye los partidos `finished` en la BD **y** los
    finalizados-por-SportScore (override visual). Un partido "por confirmar"
    **sale de EN VIVO y salta a FINALIZADOS**.
- En la tarjeta de un partido "por confirmar":
  - Marcador = marcador final de SportScore (`team1Score - team2Score`).
  - Etiqueta **"Por confirmar"** (gris/ámbar, sin punto rojo pulsante).
  - El pronóstico del usuario se muestra **sin veredicto** (sin "¡Ganaste!"/
    "Perdiste", sin puntos). El veredicto aparece solo cuando el admin publica
    (la BD pasa a `finished` con `result_team1/2`).

### 3. Panel admin — `src/pages/admin/MatchCardItem.jsx` (+ contenedor)

- El admin consume `useLiveResults` para los partidos visibles.
- Un partido finalizado-por-SportScore aparece **resaltado** (borde/fondo ámbar)
  con etiqueta **"Resultado por confirmar"**.
- El **marcador sugerido de SportScore se precarga automáticamente** en
  `results.form[match.id]` (sin pulsar el botón "SportScore" manual; este se
  conserva como respaldo).
- Un solo botón **"Publicar resultado"** que:
  - Fija el marcador (de los inputs, que el admin pudo corregir) como oficial.
  - Pone el partido en `status: 'finished'`.
  - Evalúa los pronósticos (`evaluateMatchPredictions`), otorga +100 pts a los
    aciertos y deja el veredicto visible para los usuarios.
  - Es la lógica de publicación que ya existe (`handlePublishResult` /
    `handleStatusChange` a finished); se asegura de funcionar también cuando el
    partido venía de `live`/`open`.
- El admin puede **corregir el marcador** en los inputs antes de publicar.

## Flujo completo

1. Partido en juego → EN VIVO (usuario) con marcador y minuto reales de SportScore.
2. SportScore reporta `finished`:
   - Usuario: el partido salta a FINALIZADOS con marcador final + "Por confirmar",
     sin veredicto.
   - Admin: el partido se resalta con marcador sugerido precargado + "Resultado
     por confirmar".
3. Admin pulsa **"Publicar resultado"** (corrige antes si hace falta):
   - BD: `status='finished'`, `result_team1/2` guardados.
   - Pronósticos evaluados, puntos otorgados, ranking actualizado.
   - Usuario: ve el veredicto final (¡Ganaste! / Perdiste) y sus puntos.

## Fuera de alcance

- Edge Function / cron de backend para publicar sin admin (descartado por ahora).
- Estado intermedio persistido tipo "confirmado pero no publicado" (se optó por
  un solo botón).

## Verificación

- Manual con el partido real (USA vs Paraguay) corriendo la app local y
  observando: minuto en vivo → "Por confirmar" al terminar → publicación desde
  admin → veredicto para el usuario.
- `pnpm lint` sin errores nuevos en los archivos modificados.
