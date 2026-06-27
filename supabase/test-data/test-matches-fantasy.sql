-- ============================================================================
-- Partidos de prueba con nombres fantasía — fechas FUTURAS (corregido)
-- ============================================================================
-- ⚠️ FIX: Las fechas DEBEN ser futuras para que aparezcan como "próximos" en
-- /matches y se puedan hacer apuestas. Si pongo fechas pasadas (como 2020),
-- el filtro notStartedYet() los esconde.
--
-- CÓMO FUNCIONA:
--   · status='open' → fuerza visibilidad sin importar la ventana de 24h
--   · fecha futura → entra en "próximos partidos" en /matches
--   · is_test=true → NO aparece en /matches producción (filtro de Matches.jsx)
--   · is_test=true → SÍ aparece en /matches?include_test=1 (link de test)
--   · is_test=true → SÍ aparece en /admin/matches (admin publica)
--
-- CÓMO USAR:
--   1. Pegar y correr en Supabase SQL Editor (idempotente)
--   2. /admin/matches → publicar resultados (t1, t2, method, pen si va)
--   3. /matches?include_test=1 → hacer apuestas
--
-- LIMPIEZA cuando termines:
--   DELETE FROM public.predictions WHERE match_id IN (SELECT id FROM public.matches WHERE is_test = TRUE);
--   DELETE FROM public.matches WHERE is_test = TRUE;
-- ============================================================================

BEGIN;

-- 1. Limpieza previa (borra cualquier partido de prueba anterior)
DELETE FROM public.predictions
WHERE match_id IN (SELECT id FROM public.matches WHERE is_test = TRUE);
DELETE FROM public.matches WHERE is_test = TRUE;

-- 2. Crear los 6 partidos de prueba con fechas FUTURAS
--    CURRENT_DATE + 1 → mañana (partido 1)
--    CURRENT_DATE + 2 → pasado mañana (partido 2, 3)
--    CURRENT_DATE + 3 → en 3 días (partido 4, 5, 6)
INSERT INTO public.matches (
  id, team1, team2, match_date, match_time, status, group_stage,
  is_test, created_date, updated_at
)
VALUES
  -- Mañana
  ('aaaa1111-aaaa-1111-aaaa-111111111111', 'Dragones',     'Galácticos',  CURRENT_DATE + 1, '18:00', 'open', 'Test · Grupo A', TRUE, NOW(), NOW()),

  -- Pasado mañana
  ('aaaa2222-aaaa-2222-aaaa-222222222222', 'Dragones',     'Titanes',     CURRENT_DATE + 2, '20:00', 'open', 'Test · Grupo A', TRUE, NOW(), NOW()),
  ('aaaa3333-aaaa-3333-aaaa-333333333333', 'Galácticos',   'Fénix',       CURRENT_DATE + 2, '22:00', 'open', 'Test · Grupo A', TRUE, NOW(), NOW()),

  -- En 3 días
  ('bbbb1111-bbbb-1111-bbbb-111111111111', 'Centinelas',   'Valkirias',   CURRENT_DATE + 3, '18:00', 'open', 'Test · Grupo B', TRUE, NOW(), NOW()),
  ('bbbb2222-bbbb-2222-bbbb-222222222222', 'Centinelas',   'Espectros',   CURRENT_DATE + 3, '20:00', 'open', 'Test · Grupo B', TRUE, NOW(), NOW()),
  ('bbbb3333-bbbb-3333-bbbb-333333333333', 'Valkirias',    'Espectros',   CURRENT_DATE + 3, '22:00', 'open', 'Test · Grupo B', TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  team1 = EXCLUDED.team1, team2 = EXCLUDED.team2,
  match_date = EXCLUDED.match_date, match_time = EXCLUDED.match_time,
  status = EXCLUDED.status, is_test = EXCLUDED.is_test,
  group_stage = EXCLUDED.group_stage;

-- 3. Verificación
SELECT
  m.id, m.team1, m.team2, m.match_date, m.match_time, m.status, m.is_test, m.group_stage
FROM public.matches m
WHERE m.is_test = TRUE
ORDER BY m.match_date, m.match_time;

COMMIT;

-- ============================================================================
-- DESPUÉS DE EJECUTAR:
--
--   1. Refrescá http://localhost:5173/matches?include_test=1
--      → Banner ámbar "🧪 Modo prueba activo" arriba
--      → 6 partidos visibles: Dragones, Galácticos, Titanes, Fénix,
--        Centinelas, Valkirias, Espectros
--      → Hacés click en cada uno para apostar (3 picks: ganador/método/pen)
--
--   2. Login como admin@chessking.com → /admin/matches
--      → Mismos 6 partidos al final de la lista
--      → Para cada uno publicá resultado: t1, t2, method (90/ET/pen), pen
--      → Al publicar, evaluateMatchPredictions corre y suma puntos
--
--   3. Verificá ranking/puntos:
--      → /ranking → ves tu user con puntos
--      → /profile → ves historial de predicciones
--
--   4. Cuando termines la prueba → LIMPIEZA (descomentar abajo)
-- ============================================================================


-- ============================================================================
-- LIMPIEZA — correr cuando termines para borrar TODO lo de test
-- ============================================================================
-- BEGIN;
-- DELETE FROM public.predictions WHERE match_id IN (SELECT id FROM public.matches WHERE is_test = TRUE);
-- DELETE FROM public.matches WHERE is_test = TRUE;
-- COMMIT;
-- ============================================================================