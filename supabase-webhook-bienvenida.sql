-- ============================================================
-- WEBHOOK: enviar correo de bienvenida al registrarse
-- ============================================================
-- Crea un Database Webhook que llama a la Edge Function
-- `enviar-bienvenida` cuando se hace INSERT en `public.users`.
--
-- Pasos previos (ejecutar en orden):
--   1. Despliega la Edge Function:
--        supabase functions deploy enviar-bienvenida
--   2. Configura los secrets:
--        supabase secrets set MI_RESEND_API_KEY=re_xxxxxxxx
--        supabase secrets set MI_BREVO_API_KEY=xkeysib-xxxxxxxx
--        supabase secrets set REMITENTE_NOMBRE="ChessKing"
--        supabase secrets set REMITENTE_EMAIL="no-reply@chessking.la"
--   3. EDITA las 2 constantes de abajo con tus valores reales.
--   4. Ejecuta este script en el SQL Editor de Supabase.
--
-- Cómo obtener los valores:
--   - <TU_PROJECT_REF> = subdominio de la URL de tu proyecto
--     (ej: si tu URL es https://abcdefg.supabase.co → abcdefg)
--   - <TU_ANON_KEY> = Project Settings → API → Project API keys → anon public
-- ============================================================

do $$
declare
  v_function_url text := 'https://<TU_PROJECT_REF>.supabase.co/functions/v1/enviar-bienvenida';
  v_anon_key     text := '<TU_ANON_KEY>';
  v_hook_name    text := 'enviar_correo_bienvenida';
  v_webhook_id   bigint;
begin
  -- Eliminar webhook si ya existía (idempotente)
  delete from supabase_functions.hooks where name = v_hook_name;

  -- Crear el webhook
  -- Estructura: supabase_functions.hooks
  --   name          = nombre interno
  --   table_name    = tabla que escucha
  --   schema_name   = esquema (public)
  --   events        = array con los eventos (INSERT, UPDATE, DELETE)
  --   function_name = nombre de la Edge Function
  --   function_type = 'http' (Edge Function) o 'supabase' (DB function)
  --   url           = URL completa de la función
  --   method        = HTTP method
  --   headers       = jsonb con headers (incluye Authorization)
  --   timeout_ms    = timeout en milisegundos
  insert into supabase_functions.hooks (
    name, table_name, schema_name, events,
    function_name, function_type, url, method, headers, timeout_ms
  ) values (
    v_hook_name,
    'users',
    'public',
    array['INSERT']::text[],
    'enviar-bienvenida',
    'http',
    v_function_url,
    'POST',
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    5000
  )
  returning id into v_webhook_id;

  raise notice '✅ Webhook "%" creado con ID %', v_hook_name, v_webhook_id;
end $$;

-- Verificar que se creó
select name, table_name, events, url, method
from supabase_functions.hooks
where name = 'enviar_correo_bienvenida';
