/**
 * Fachada de acceso a datos (Fase 3 del refactor).
 *
 * Por ahora es un re-export 1:1 de `db.js` — backwards compatible al 100%.
 * Cualquier archivo que importe desde acá (`@/lib/db`) sigue funcionando
 * exactamente igual.
 *
 * ¿Por qué existe?
 *   1. Punto de entrada único para los importers (los 17 archivos que hoy
 *      importan `@/lib/db` siguen funcionando; los nuevos pueden importar
 *      `@/lib/db` directamente y migrar gradualmente).
 *   2. Cuando dividamos `db.js` en `db/users.js`, `db/predictions.js`, etc.
 *      (Fase 4), este archivo será el que agregue los `re-exports` para
 *      que los importers no se enteren del refactor.
 *   3. Aísla el blast radius: cambiar la implementación interna (storage,
 *      sync strategy) no rompe a los callers.
 *
 * IMPORTANTE: este archivo es una SHIM. No agregar lógica nueva acá todavía
 * — primero se divide `db.js` en módulos, después se actualiza este index
 * para reexportar desde los módulos. Mantener el orden.
 *
 * @example
 *   // Antes (sigue funcionando):
 *   import { db } from '@/lib/db';
 *
 *   // Nuevo (recomendado para nuevos archivos):
 *   import { db } from '@/lib/db';
 *   // ^ mismo path — el bundler resuelve a este index.js o a db.js
 *   //   según exista el directorio.
 */

export { db } from '../db.js';

// Re-export explícito de tipos/helpers si se agregan en el futuro:
// (vacío por ahora — placeholder para Fase 4)