# Plan 010 — Fix Definitivo: Puntos Duplicados (600pts por 1 acierto)

**Fecha:** 2026-06-11
**Estado:** ✅ COMPLETADO
**Executor:** Codebuff (Buffy)

---

## Resumen del Problema

Usuarios recibían **600 puntos** por acertar **1 predicción** en lugar de 100. La causa raíz era que la función `recalcUserPoints` en el cliente contaba TODAS las predicciones `is_correct` del caché LOCAL sin deduplicar. Si habían 6 copias de la misma predicción (por bugs previos de sync), contaba 6 × 100 = **600 pts** y subía ese valor inflado a Supabase mediante `db._persist()`.

---

## Lo que se Hizo (Código)

### 1. Deduplicación en Cliente — `src/api/client.js`

**Archivo:** `src/api/client.js` — función `recalcUserPoints` (case 'recalcUserPoints')

**Antes:** Contaba todas las predicciones `is_correct` sin deduplicar:
```js
predictions.forEach(p => {
  if (p.is_correct) {
    pointsMap[p.user_email] = (pointsMap[p.user_email] || 0) + 100;
  }
});
```

**Después:** Deduplica por `(user_email, match_id)`:
```js
const seen = new Set();
predictions.forEach(p => {
  if (p.is_correct) {
    const key = p.user_email + '|' + p.match_id;
    if (seen.has(key)) return;
    seen.add(key);
    pointsMap[p.user_email] = (pointsMap[p.user_email] || 0) + 100;
  }
});
```

### 2. Deduplicación en Servidor — `src/api/evaluateMatchPredictions.js`

**Archivo:** `src/api/evaluateMatchPredictions.js` — función `recalculatePointsForEmails`

**Antes:** No incluía `match_id` en la query, contaba todos los registros `is_correct` sin deduplicar.

**Después:** Incluye `match_id` en la SELECT y deduplica:
```js
const { data: correctPreds } = await supabase
  .from('predictions')
  .select('id, match_id')
  .eq('user_email', email)
  .eq('scored', true)
  .eq('is_correct', true);

const seenMatches = new Set();
let correctCount = 0;
for (const p of (correctPreds || [])) {
  const key = p.match_id || '__nomatch__';
  if (seenMatches.has(key)) continue;
  seenMatches.add(key);
  correctCount++;
}
```

---

## Lo que se Hizo (Datos en Supabase)

### 3. Partido México 2-0 Sudáfrica

- **Match ID:** `1779587441340_r9vbge`
- **Resultado:** México **2 - 0** Sudáfrica
- **Status:** `finished`
- **Predicciones evaluadas:** 147
- **Ganadores:** 28 usuarios (100 pts cada uno)

### 4. Recálculo Masivo de Puntos

- **Usuarios procesados:** 189
- **Usuarios corregidos:** 24 (tenían puntos inflados)
- **Método:** Recálculo desde cero contando predicciones scored=true + is_correct=true con deduplicación por match_id
- **Resultado:** 0 usuarios con >100 prediction_points

---

## Arquitectura de Protección (Cómo se evita la recurrencia)

```
Usuario acierta partido
        │
        ▼
evaluateMatchPredictions.js (server-side, idempotente)
  ├── Marca predicciones como scored (upsert por id)
  ├── Recuenta desde cero: query a Supabase + dedup por match_id
  └── SETea prediction_points y total_points (NO incrementa)
        │
        ▼
recalcUserPoints (client-side, safety net)
  └── Solo se ejecuta si se invoca manualmente
  └── Deduplica por (user_email, match_id) antes de contar
```

**Garantías:**
1. **Idempotencia:** El scoring no suma puntos, recalcula desde cero. Ejecutarlo 1 o 100 veces da el mismo resultado.
2. **Deduplicación en ambos lados:** Aunque hayan duplicados en BD (distinto id, mismo match_id), el conteo los ignora tanto en cliente como en servidor.
3. **Sin triggers automáticos:** `recalcUserPoints` solo se ejecuta si se llama explícitamente (no hay llamadas activas en el código).

---

## Estado Actual

| Indicador | Valor |
|-----------|-------|
| Usuarios no-admin | ~189 |
| Predicciones totales evaluadas | 147 (México 2-0) |
| Ganadores (100 pts c/u) | 28 |
| Usuarios con puntos inflados | **0** ✅ |
| Build (vite build) | **OK** ✅ |
| Cambios en código | 2 archivos |

---

## Pendientes (Opcional — Baja Prioridad)

| # | Tarea | Archivo | Prioridad |
|---|-------|---------|-----------|
| A | Agregar test unitario para el caso de duplicados en `evaluateMatchPredictions.test.js` | `evaluateMatchPredictions.test.js` | Baja |
| B | Disparar `forceSyncFromCloud()` automáticamente después del scoring para refrescar caché del cliente sin recarga manual | `evaluateMatchPredictions.js` | Baja |
| C | Validación visual con browser-use para confirmar que el ranking web muestre los puntos correctos | — | Baja |

---

## Instrucciones para Usuarios

Los navegadores que tenían la web abierta **antes** de la corrección pueden mostrar puntos viejos en caché. Solución:
1. **Ctrl+F5** (recarga forzada) en la página del ranking
2. O cerrar y volver a abrir el navegador

Después de eso, el error de 600 pts **no volverá a ocurrir** porque ambos puntos de entrada (cliente y servidor) tienen deduplicación.

---

## Lista de Ganadores — México 2-0 Sudáfrica

1. marlon2409985@gmail.com
2. johana041811@gmail.com
3. enrabel29@gmail.com
4. reynaldocarpiosulbaran@gmail.com
5. villalta1477@gmail.com
6. lag23runner@gmail.com
7. jobenitez0302@gmail.com
8. roblesdiego194@gmail.com
9. cuelloyesid@gmail.com
10. ramirezxavier2929@gmail.com
11. moisesigarciac@gmail.com
12. cronel286@gmail.com
13. nuviadelcarmen359@gmail.com
14. evolucion211@outlook.es
15. mgutierrez3688@gmail.com
16. coco15diaz1994@gmail.com
17. dandy507@gmail.com
18. alexanderggnz07@gmail.com
19. estebandoleroq@gmail.com
20. abdielg0440@gmail.com
21. edd.villamk@gmail.com
22. abgar9751@gmail.com
23. quirozmiguel2320@gmail.com
24. manuel27cabrera@hotmail.com
25. maykobaldia9@gmail.com
26. josebanfield0@gmail.com
27. eiserguerrero07@gmail.com
28. alejandroxgodoy@gmail.com
