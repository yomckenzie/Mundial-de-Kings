# Recuperar contraseña

**Fecha:** 2026-06-13
**Estado:** Aprobado

## Problema

La app usa Supabase Auth (`signInWithPassword`) pero no ofrece forma de
recuperar la contraseña. Un usuario que la olvida queda sin acceso a su cuenta.

## Objetivo

Permitir que un usuario restablezca su contraseña mediante un enlace enviado a
su correo, usando el flujo nativo de Supabase Auth.

## Decisiones de diseño

1. **Método: enlace por correo.** `supabase.auth.resetPasswordForEmail`.
2. **Correo: plantilla nativa de Supabase** (personalizable en el panel; no se
   usa la Edge Function de bienvenida).
3. **Tras restablecer con éxito: auto-login.** Supabase deja una sesión activa
   al cambiar la contraseña; el usuario entra directo a Inicio.

## Flujo

1. En `/login`, enlace "¿Olvidaste tu contraseña?" → `/forgot-password`.
2. `/forgot-password`: el usuario escribe su correo → la app llama
   `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`
   → mensaje "Si el correo existe, te enviamos un enlace" (no revela si el correo
   está registrado).
3. El usuario abre el enlace del correo → `/reset-password`. Supabase detecta el
   token en la URL (detectSessionInUrl, activo por defecto) y crea una sesión de
   recuperación. El usuario escribe su nueva contraseña (+ confirmación) →
   `supabase.auth.updateUser({ password })` → entra automáticamente a Inicio (`/`)
   con aviso de éxito.

## Componentes

### Crear `src/pages/ForgotPassword.jsx` (ruta `/forgot-password`)

- Reutiliza el patrón visual de `Login.jsx` (Card, logo, estilos).
- Un campo de correo + botón "Enviar enlace".
- Al enviar: `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/reset-password\` })`.
- Siempre muestra el mismo mensaje de confirmación (éxito), aunque el correo no
  exista. Maneja error de red con toast.
- Enlace "Volver a iniciar sesión" → `/login`.

### Crear `src/pages/ResetPassword.jsx` (ruta `/reset-password`)

- Reutiliza el patrón visual de `Login.jsx`.
- Dos campos: nueva contraseña y confirmar, con botón ojo (mostrar/ocultar) como
  en `Login.jsx`.
- Validaciones: ambas contraseñas coinciden; mínimo 6 caracteres (default de
  Supabase).
- Al enviar: `supabase.auth.updateUser({ password })`.
  - Éxito → `toast.success` + `window.location.href = '/'` (auto-login, sesión ya
    activa).
  - Error (enlace expirado / sin sesión de recuperación) → mensaje "El enlace
    expiró o no es válido, solicita uno nuevo" + botón a `/forgot-password`.

### Modificar `src/pages/Login.jsx`

- Añadir enlace "¿Olvidaste tu contraseña?" debajo del campo de contraseña,
  apuntando a `/forgot-password`.

### Modificar `src/App.jsx`

- Registrar rutas públicas `/forgot-password` y `/reset-password` (fuera de
  `AppLayout`, junto a `/login` y `/register`).

### Verificar `src/lib/AuthContext.jsx`

- `onAuthStateChange` ya hace login cuando hay sesión. Como `/reset-password` es
  ruta pública sin redirección forzada, el usuario verá el formulario sin ser
  expulsado. Verificar en implementación que el evento de recuperación no cause
  un redirect no deseado. No se espera cambio de código; si lo hubiera, será
  mínimo (ignorar redirect cuando la ruta es `/reset-password`).

## Casos borde y errores

- **Enlace expirado / acceso directo a `/reset-password` sin sesión:**
  `updateUser` falla → mensaje claro + botón para solicitar uno nuevo.
- **Correo no registrado:** `resetPasswordForEmail` no falla; mismo mensaje de
  confirmación (no filtra correos registrados).
- **Contraseñas no coinciden o muy cortas:** validación en cliente antes de
  llamar a Supabase.

## Configuración del operador (no es código)

- Panel de Supabase → Auth → URL Configuration: añadir `<dominio>/reset-password`
  a las "Redirect URLs" permitidas (y la URL local de desarrollo, p. ej.
  `http://localhost:5173/reset-password`).
- (Opcional) Personalizar la plantilla del correo de recuperación con branding
  ChessKing.
- (Opcional, recomendado para producción) Configurar SMTP propio (Resend/Brevo)
  en el panel para evitar los límites del correo de prueba de Supabase.

## Fuera de alcance

- Flujo por código OTP.
- Edge Function propia para el correo (se usa la plantilla nativa de Supabase).
- Cambio de contraseña desde el perfil estando logueado (es otra feature).

## Verificación

- Manual en la app local: solicitar enlace desde `/forgot-password`, abrir el
  enlace del correo, restablecer en `/reset-password`, confirmar auto-login.
- `pnpm lint` sin errores nuevos en los archivos tocados.
- Nota: el envío real del correo depende de la configuración del operador en el
  panel de Supabase (Redirect URLs + SMTP).
