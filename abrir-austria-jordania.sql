-- ════════════════════════════════════════════════════════════════════════════
-- Reabrir el partido Austria vs Jordania (16-jun-2026, 23:00) que quedó 'closed'.
--
-- Contexto: anoche se marcó 'live' por error (live_started_at = 16-jun 04:00 UTC
-- = 15-jun 23:00 hora UTC-5) y luego pasó a 'closed'. La matriz de transiciones
-- de la app no permitía closed→open, así que el botón "Reabrir" fallaba.
-- (El fix de código ya agrega closed→open y live→open para el futuro.)
--
-- Esto lo deja en 'open' y limpia el estado en-vivo residual, para que los
-- usuarios puedan volver a pronosticar de inmediato — sin esperar el deploy.
--
-- CÓMO USAR: Supabase → SQL Editor → pegar TODO → RUN.
-- ════════════════════════════════════════════════════════════════════════════

update public.matches
set status          = 'open',
    live_started_at = null,
    result_team1    = null,
    result_team2    = null,
    elapsed         = null,
    updated_at      = now()
where id = '1780086065484_1zyjlh';   -- Austria vs Jordania

-- Verificación
select id, team1, team2, match_date, match_time, status, live_started_at
from public.matches
where id = '1780086065484_1zyjlh';
