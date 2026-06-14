# Supabase Edge Functions

Esta carpeta contiene las **Edge Functions** desplegadas en Supabase.

## `enviar-bienvenida`

Por cada usuario nuevo hace **dos cosas**:

1. **Correo de bienvenida** (HTML con branding ChessKing). Estrategia dual-provider:
   intenta primero con **Resend**; si falla, hace fallback automático a **Brevo**.
2. **Sincroniza el contacto a una lista de Brevo** (email + nombre + teléfono),
   con `updateEnabled: true` (upsert por email). Así podés enviarles campañas y
   newsletters **desde el panel de Brevo**. Si el teléfono no tiene formato válido
   (E.164), se omite el SMS y el contacto igual se crea con email + nombre.

### Sincronizar los usuarios ACTUALES (backfill, una vez)

La función solo agrega a los usuarios **nuevos**. Para los que ya existen:

1. Supabase → Table Editor → tabla `users` → **Export** → CSV.
2. Brevo → Contactos → tu lista → **Importar contactos** → subí el CSV
   (mapeá `email` → EMAIL, `full_name` → NOMBRE, `phone` → SMS). Brevo deduplica
   por email, así que es seguro re-importar.

### Despliegue

1. Instalar la [Supabase CLI](https://github.com/supabase/cli#install-the-cli) y autenticarse:
   ```bash
   supabase login
   supabase link --project-ref <TU_PROJECT_REF>
   ```

2. Configurar los secrets (no se commitean):
   ```bash
   supabase secrets set MI_RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
   supabase secrets set MI_BREVO_API_KEY=xkeysib-xxxxxxxxxxxx
   supabase secrets set REMITENTE_NOMBRE="ChessKing"
   supabase secrets set REMITENTE_EMAIL="no-reply@chessking.la"
   supabase secrets set BREVO_LIST_ID=3   # ID de tu lista en Brevo (Contactos → Listas)
   ```

3. Desplegar la función:
   ```bash
   supabase functions deploy enviar-bienvenida
   ```
   Anota la URL que te entrega (formato: `https://<ref>.supabase.co/functions/v1/enviar-bienvenida`).

4. Configurar el **Database Webhook** ejecutando
   [`../supabase-webhook-bienvenida.sql`](../supabase-webhook-bienvenida.sql)
   en el SQL Editor de Supabase (con los valores `<TU_PROJECT_REF>` y `<TU_ANON_KEY>` reemplazados).

### Pruebas manuales

```bash
# Disparar la función manualmente con un payload simulado
curl -X POST \
  'https://<TU_PROJECT_REF>.supabase.co/functions/v1/enviar-bienvenida' \
  -H 'Authorization: Bearer <TU_ANON_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"type":"INSERT","table":"users","record":{"email":"test@example.com","full_name":"Test User","role":"user"}}'
```

### Logs

Ver invocaciones y errores en tiempo real:

```bash
supabase functions logs enviar-bienvenida --tail
```

### Ignorar registros de admin

La función ignora automáticamente cualquier `INSERT` donde `record.role != 'user'`, así que la creación del admin seed (`admin@chessking.com`) no dispara correo.
