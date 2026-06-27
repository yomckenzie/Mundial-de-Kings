-- ============================================================================
-- Partidos de prueba para apuestas manuales (is_test=true)
-- ============================================================================
-- OBJETIVO: 5 partidos con status='open' y fechas futuras, listos para que
-- el usuario haga apuestas por la UI y las evalúe manualmente cambiando
-- status a 'live'/'finished' desde /admin/matches.
--
-- AISLAMIENTO (vía flag is_test=true, ya soportado por Matches.jsx):
--   · NO aparecen en /matches producción para usuarios no-admin
--   · NO aparecen en /matches cuando admin los pasa a 'live' (producción)
--   · NO aparecen como live en producción (filtro aplica a todos los status)
--   · SÍ aparecen en /admin/matches (admin publica resultados)
--   · SÍ aparecen en /matches?include_test=1 (link de test manual)
--
-- NOTA: /profile y /ranking del usuario SÍ los muestran (no filtran is_test)
-- — esto es código, no SQL. La limpieza al final los borra de la BD.
-- ============================================================================

BEGIN;

-- 1. Limpieza previa (idempotente)
DELETE FROM public.predictions
WHERE match_id IN (SELECT id FROM public.matches WHERE is_test = TRUE);
DELETE FROM public.matches WHERE is_test = TRUE;

-- 2. Crear 5 partidos de prueba — todos status='open' (habilitados para apostar)
--    Fechas futuras escalonadas para que aparezcan en "próximos" de /matches
--    Nombres fantasía para reconocerlos como test
INSERT INTO public.matches (
  id, team1, team2, match_date, match_time, status, group_stage,
  is_test, created_date, updated_at
)
VALUES
  -- Mañana (90 min probable)
  ('manual-m1-0001-0001-0001-0001-00000001', 'Dragones',     'Galácticos',  CURRENT_DATE + 1, '15:00', 'open', 'Test · Manual #1', TRUE, NOW(), NOW()),

  -- Pasado mañana (ET probable)
  ('manual-m2-0002-0002-0002-0002-00000002', 'Titanes',      'Fenrir',       CURRENT_DATE + 2, '17:00', 'open', 'Test · Manual #2', TRUE, NOW(), NOW()),

  -- En 3 días (Pen probable)
  ('manual-m3-0003-0003-0003-0003-00000003', 'Centinelas',   'Valkirias',    CURRENT_DATE + 3, '19:00', 'open', 'Test · Manual #3', TRUE, NOW(), NOW()),

  -- En 4 días
  ('manual-m4-0004-0004-0004-0004-00000004', 'Espectros',    'Fénix',        CURRENT_DATE + 4, '16:00', 'open', 'Test · Manual #4', TRUE, NOW(), NOW()),

  -- En 5 días
  ('manual-m5-0005-0005-0005-0005-00000005', 'Galácticos',   'Espectros',    CURRENT_DATE + 5, '20:00', 'open', 'Test · Manual #5', TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  team1 = EXCLUDED.team1, team2 = EXCLUDED.team2,
  match_date = EXCLUDED.match_date, match_time = EXCLUDED.match_time,
  status = EXCLUDED.status, is_test = EXCLUDED.is_test,
  group_stage = EXCLUDED.group_stage;

-- 3. Verificación
SELECT
  m.id, m.team1, m.team2, m.match_date, m.match_time, m.status, m.is_test
FROM public.matches m
WHERE m.is_test = TRUE
ORDER BY m.match_date, m.match_time;

COMMIT;

-- ============================================================================
-- FLUJO DESPUÉS DE EJECUTAR:
--
--   1. Login como cualquier user (admin o user normal)
--      · Como admin: /admin/matches → ves los 5 partidos
--      · Como user normal: /matches?include_test=1 → banner ámbar + 5 partidos
--
--   2. Hacer apuestas manualmente desde la UI:
--      · Click en cada partido
--      · Elegir ganador (1/X/2) + método (90/ET/pen) + marcador (si pen)
--      · Submit predicción → queda guardada
--
--   3. Probar ciclo de estados (como admin en /admin/matches):
--      · Status='open' → aparece en /matches?include_test=1 como "próximo"
--      · Status='live' → aparece en /matches?include_test=1 como "en vivo"
--                       → NO aparece en /matches producción (filtro is_test)
--      · Status='finished' (con resultado publicado) → aparece como finalizado
--                              con desglose de puntos
--
--   4. Verificar aislamiento en producción:
--      · Logout → entrar como user normal SIN ?include_test=1
--      · /matches → NO ve ninguno de los 5 partidos
--      · Cambiá el status a 'live' desde admin en otra ventana
--      · Volvé a /matches (sin ?include_test=1) → SIGUE sin verlos ✅
--
--   5. LIMPIEZA cuando termines:
--      DELETE FROM public.predictions WHERE match_id IN (SELECT id FROM public.matches WHERE is_test = TRUE);
--      DELETE FROM public.matches WHERE is_test = TRUE;
-- ============================================================================