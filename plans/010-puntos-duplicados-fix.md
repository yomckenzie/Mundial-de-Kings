# Estado Actual — Migración RLS + Supabase Auth

**Fecha:** 2026-06-11

---

## ✅ Completado

| # | Tarea | Estado |
|---|-------|--------|
| 1 | **Script SQL de migración** (`supabase/migrations/2026-06-11-003-auth-rls-migration.sql`) aplicado | ✅ |
| 2 | **RLS policies** en todas las tablas usando `auth.uid()::text` y `auth.jwt()->>'email'` | ✅ |
| 3 | **Función `is_admin()`** actualizada para usar `auth.uid()::text` | ✅ |
| 4 | **6 usuarios** con IDs viejos migrados a `auth.users` (contraseñas temporales) | ✅ |
| 5 | **190/190 usuarios** con UUID en `public.users` | ✅ |
| 6 | **Admin** creado en `auth.users` (UUID: `46404e4f-cbdc-4f99-90a7-d94500eb2fb3`) | ✅ |
| 7 | **UUIDs sincronizados** (`uuid_mismatch: 0` entre auth.users y public.users) | ✅ |
| 8 | **Build** compila sin errores | ✅ |
| 9 | **RLS activo** — anon bloqueado al insertar en matches | ✅ |

## ❌ Problema Actual

- **Login falla con "Database error querying schema"** (o `500 Unable to process request` en /recover)
- Causa probable: El servicio **GoTrue** (Auth de Supabase) tiene un caché de schema stale después de manipular `auth.users` directamente vía SQL (DELETE + INSERT múltiples intentos)
- Los datos en `auth.users` son correctos (admin existe con UUID, contraseña hasheada, identidad creada)
- `public.users.id` coincide con `auth.users.id`

## 🔍 Diagnóstico Real (2026-06-11 — vía REST API)

El login con `admin@chesskings.com` (con "s") daba `400 invalid_credentials`. La investigación reveló que **hay DOS problemas distintos**:

1. **Typo en el email**: el admin real es **`admin@chessking.com`** (sin "s").
   - `public.users.role=admin` tiene 1 fila: `admin@chessking.com`, UUID `46404e4f-cbdc-4f99-90a7-d94500eb2fb3`.
   - `admin@chesskings.com` (con "s") NO existía en `auth.users` → un `signUp` de prueba lo creó por accidente como `16bd31ac-...` con password `TestProbe123!`. **Hay que limpiarlo.**

2. **GoTrue corrupto**: con el email correcto (`admin@chessking.com`), login y recover dan 500. La fila en `auth.users` quedó en estado inconsistente tras los múltiples `DELETE+INSERT` manuales. NO hay triggers custom en `auth.users` (verificado en migraciones), así que es problema interno de GoTrue.

## 🛠 Fix

→ Ejecutar `supabase/migrations/2026-06-11-004-fix-admin-auth.sql` en el SQL Editor de Supabase. Hace:
1. Borra el duplicado accidental (`16bd31ac-...` + su identity)
2. Borra la fila corrupta del admin real
3. Recrea `auth.users` con el UUID preservado `46404e4f-...` (mantiene FK con `public.users`)
4. Recrea `auth.identities`
5. Hashea password `[REDACTED-ROTAR]` con `crypt(..., gen_salt('bf'))`
6. `NOTIFY pgrst, 'reload schema'` para forzar recarga de cache

Después del fix: login con `admin@chessking.com` (sin "s") / `[REDACTED-ROTAR]`.

## 📁 Archivos Creados/Modificados

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/2026-06-11-003-auth-rls-migration.sql` | Migración principal: RLS policies, is_admin(), auth.users |
| `supabase/migrations/2026-06-11-003-fix-admin.sql` | Fix inicial para admin UUID |
| `supabase/migrations/2026-06-11-003-force-admin.sql` | Recreación forzada de admin (DELETE+INSERT) |
| `supabase/migrations/2026-06-11-003-update-admin-pw.sql` | Update de contraseña del admin |
| `supabase/migrations/2026-06-11-003-diagnose-auth.sql` | Diagnóstico de schema auth.users |
| `supabase/migrations/2026-06-11-003-recreate-admin-auth.sql` | Recreación completa con identidad |
| `supabase/migrations/2026-06-11-003-diagnose-full.sql` | Diagnóstico completo de auth schema |
| `supabase/migrations/2026-06-11-003-force-admin-pw.sql` | Forzar contraseña admin vía SQL |
| `supabase/migrations/2026-06-11-003-verify-final.sql` | Verificar UUIDs |
| `supabase/migrations/2026-06-11-003-auth-healthcheck.sql` | Health check de auth.users |
| `supabase/migrations/2026-06-11-003-auth-last-resort.sql` | Última verificación de esquema |
| `supabase/migrations/2026-06-11-003-refresh-auth.sql` | Refresh de schema |

## 📋 Pendientes

| # | Tarea | Prioridad |
|---|-------|-----------|
| A | Resolver login: "Database error querying schema" en GoTrue | ✅ **Resuelto (2026-06-11)** |
| B | Probar registro de nuevos usuarios (signUp) con RLS | 🟡 Media |
| C | Probar scoring de predicciones (evaluateMatchPredictions con admin logueado) | 🟡 Media |
| D | Verificar que los 6 usuarios migrados puedan hacer "Olvidé mi contraseña" | 🟢 Baja |
| E | Revisar `src/pages/Login.jsx` por email hardcoded mal (`admin@chesskings.com` con "s") | 🟡 Media |

## ✅ Resuelto: Login admin (2026-06-11)

Ejecutado `supabase/migrations/2026-06-11-004-fix-admin-auth.sql`. Resultado:
- Eliminado duplicado accidental `16bd31ac-...` (creado por signUp de prueba)
- Recreado `auth.users` limpio para `admin@chessking.com` con UUID `46404e4f-...`
- Recreada `auth.identities` con provider=email
- `NOTIFY pgrst, 'reload schema'` aplicado
- Login confirmado funcional con `admin@chessking.com` / `[REDACTED-ROTAR]`

## 🔧 Posibles Soluciones para el Login

1. **Regenerar JWT secret** en Supabase Dashboard → Settings → API → JWT Settings
2. **Contactar a Supabase support** — el servicio GoTrue可能需要 reinicio
3. **Deshabilitar y re-habilitar Auth** en el proyecto (Settings → Authentication)
4. **Probar desde la API REST directamente** para ver el error exacto de GoTrue
