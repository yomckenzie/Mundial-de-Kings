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
