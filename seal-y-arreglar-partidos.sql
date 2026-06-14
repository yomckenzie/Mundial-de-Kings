-- ════════════════════════════════════════════════════════════════════════════
-- SELLAR partidos/pronósticos terminados + ARREGLAR los 4 revertidos
--
-- Causa del desastre: un cliente con caché vieja re-sincroniza y pisa la nube,
-- revirtiendo finalizaciones y evaluaciones (matches → 'live', predictions →
-- scored=null). Esto sella a nivel de BD: una vez evaluado/finalizado, NINGÚN
-- cliente (anon/authenticated) puede revertirlo. Solo el SQL Editor (postgres).
--
-- El trigger NO tira error (eso rompería el upsert de otras filas): simplemente
-- IGNORA el cambio en los campos sellados y preserva el valor bueno.
--
-- CÓMO USAR: Supabase → SQL Editor → pegar TODO → RUN. Termina en COMMIT.
-- IMPORTANTE: verificá que los resultados de la sección "res" sean los reales
-- ANTES de correr (se usan para re-evaluar).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- PARTE 1 — SELLO (triggers). Idempotente (create or replace).
-- ─────────────────────────────────────────────────────────────────

-- Predicciones: una vez scored=true, los clientes no pueden revertir la evaluación.
create or replace function public.seal_scored_prediction()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') and old.scored is true then
    -- preservar la evaluación (la app no puede deshacerla)
    new.scored        := old.scored;
    new.is_correct    := old.is_correct;
    new.points_earned := old.points_earned;
  end if;
  return new;
end$$;

drop trigger if exists trg_seal_scored_prediction on public.predictions;
create trigger trg_seal_scored_prediction
  before update on public.predictions
  for each row execute function public.seal_scored_prediction();

-- Partidos: una vez finished, los clientes no pueden cambiar estado ni resultado.
create or replace function public.seal_finished_match()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') and old.status = 'finished' then
    new.status       := old.status;
    new.result_team1 := old.result_team1;
    new.result_team2 := old.result_team2;
  end if;
  return new;
end$$;

drop trigger if exists trg_seal_finished_match on public.matches;
create trigger trg_seal_finished_match
  before update on public.matches
  for each row execute function public.seal_finished_match();

-- ─────────────────────────────────────────────────────────────────
-- PARTE 2 — ARREGLAR el dato (corre como postgres → ignora el sello).
-- ─────────────────────────────────────────────────────────────────

begin;

create temp table res(match_id text, r1 int, r2 int) on commit drop;
insert into res values
  ('1780086065484_w5vc11', 1, 1),  -- Brasil 1 - 1 Marruecos
  ('1779587441340_5x7bd0', 4, 1),  -- Estados Unidos 4 - 1 Paraguay
  ('1779917659182_nobhk8', 1, 1),  -- Canadá 1 - 1 Bosnia
  ('1779587441340_ihskxm', 1, 1),  -- Catar 1 - 1 Suiza
  ('1779587441340_pxv8yf', 2, 1),  -- Rep. de Corea 2 - 1 Rep. Checa
  ('1779587441340_r9vbge', 2, 0);  -- México 2 - 0 Sudáfrica

-- 1) Finalizar los 6 partidos con su resultado oficial
update public.matches m
set status = 'finished', result_team1 = r.r1, result_team2 = r.r2, updated_at = now()
from res r
where m.id = r.match_id;

-- 2) Re-evaluar TODAS las predicciones de esos partidos
update public.predictions p
set scored        = true,
    is_correct    = (p.pred_team1 = r.r1 AND p.pred_team2 = r.r2),
    points_earned = case when (p.pred_team1 = r.r1 AND p.pred_team2 = r.r2) then 100 else 0 end
from res r
where p.match_id = r.match_id;

-- 3) Recalcular puntos de TODOS los usuarios (idempotente, dedup por partido)
with correct as (
  select user_email, count(distinct match_id) as aciertos
  from public.predictions
  where scored = true and is_correct = true
  group by user_email
)
update public.users u
set prediction_points = coalesce(c.aciertos, 0) * 100,
    total_points      = coalesce(c.aciertos, 0) * 100
                        + coalesce(u.bonus_points, 0)
                        + coalesce(u.referral_points, 0),
    updated_at        = now()
from correct c
right join public.users uu on uu.email = c.user_email
where u.email = uu.email
  and (uu.role <> 'admin' or uu.role is null);

-- ─── VERIFICACIÓN ───
select 'partidos finished' as chequeo, count(*) as valor
from public.matches where status = 'finished';

select 'predicciones sin evaluar (debe ser 0 en finished)' as chequeo, count(*) as valor
from public.predictions p join res r on r.match_id = p.match_id where p.scored is null;

select instagram, prediction_points, total_points
from public.users where role <> 'admin' or role is null
order by prediction_points desc, total_points desc limit 10;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- A partir de ahora: un partido finished y sus pronósticos quedan SELLADOS.
-- Para corregir un resultado en el futuro: por SQL acá (UPDATE como postgres).
-- ════════════════════════════════════════════════════════════════════════════
