# Recuperar contraseña — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un usuario restablezca su contraseña con un enlace enviado por correo, usando el flujo nativo de Supabase Auth.

**Architecture:** Dos páginas públicas nuevas (`/forgot-password`, `/reset-password`) que usan `supabase.auth.resetPasswordForEmail` y `supabase.auth.updateUser`. La sesión de recuperación la establece supabase-js automáticamente al cargar la página de destino (`detectSessionInUrl`, evento `PASSWORD_RECOVERY`). Tras restablecer, el usuario queda con sesión activa (auto-login).

**Tech Stack:** React 18, react-router-dom v6, @supabase/supabase-js v2, framer-motion, sonner (toasts), Tailwind.

**Verificación:** Son páginas de UI/auth que dependen de Supabase; no son unit-testables de forma útil. Se verifican corriendo la app local y `pnpm lint`. El envío real del correo y el enlace dependen de la config del operador en el panel de Supabase (Site URL + Redirect URLs).

---

### Task 1: Página "Olvidé mi contraseña" (`/forgot-password`)

**Files:**
- Create: `src/pages/ForgotPassword.jsx`

- [ ] **Step 1: Crear el componente**

Crear `src/pages/ForgotPassword.jsx` con este contenido completo (reutiliza el patrón visual de `Login.jsx`):

```jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Ingresa tu correo electrónico');
      return;
    }
    if (!supabase) {
      toast.error('Servicio no disponible en este momento');
      return;
    }
    setIsLoading(true);
    try {
      // Supabase no falla si el correo no existe (no revela cuentas registradas).
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setSent(true);
    } catch (err) {
      toast.error(err?.message || 'No se pudo enviar el enlace, intenta de nuevo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <m.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="text-center mb-8 space-y-2">
          <Link to="/" className="inline-block">
            <img
              src="/logo.svg"
              alt="ChessKing"
              className="h-16 sm:h-20 md:h-24 w-auto mx-auto mb-3 drop-shadow-lg transition-transform duration-300 hover:scale-105 cursor-pointer"
            />
          </Link>
          <h1 className="font-display text-4xl md:text-5xl tracking-wide">
            MUNDIAL DE <span className="text-foreground">KINGS</span>
          </h1>
          <p className="text-muted-foreground">Recupera el acceso a tu cuenta</p>
        </div>

        <Card className="gradient-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="w-5 h-5" />
              Recuperar contraseña
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Si el correo <strong className="text-foreground">{email}</strong> está
                  registrado, te enviamos un enlace para restablecer tu contraseña.
                  Revisa tu bandeja de entrada y la carpeta de spam.
                </p>
                <Link to="/login">
                  <Button variant="outline" className="w-full">Volver a iniciar sesión</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="tu@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    className="transition-all duration-200 focus:ring-2 focus:ring-secondary/30"
                  />
                </div>

                <Button type="submit" className="w-full glow-sm" disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </span>
                  ) : 'Enviar enlace'}
                </Button>

                <div className="text-center">
                  <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition group">
                    <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                    Volver a iniciar sesión
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </m.div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint src/pages/ForgotPassword.jsx`
Expected: sin salida (sin errores).

- [ ] **Step 3: Commit**

```bash
git add src/pages/ForgotPassword.jsx
git commit -m "feat(auth): pagina /forgot-password (enviar enlace de recuperacion)"
```

---

### Task 2: Página "Nueva contraseña" (`/reset-password`)

**Files:**
- Create: `src/pages/ResetPassword.jsx`

Esta página se carga cuando el usuario abre el enlace del correo. supabase-js procesa el token de la URL automáticamente (`detectSessionInUrl`, activo por defecto) y establece una sesión de recuperación, disparando `onAuthStateChange` con evento `PASSWORD_RECOVERY`. La página detecta esa sesión, muestra el formulario y al enviar llama `updateUser`.

- [ ] **Step 1: Crear el componente**

Crear `src/pages/ResetPassword.jsx` con este contenido completo:

```jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { KeyRound, Eye, EyeOff, AlertCircle } from 'lucide-react';

const MIN_PASSWORD = 6; // mínimo por defecto de Supabase Auth

export default function ResetPassword() {
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // 'checking' | 'ready' | 'invalid'  → estado de la sesión de recuperación
  const [sessionState, setSessionState] = useState('checking');

  useEffect(() => {
    if (!supabase) {
      setSessionState('invalid');
      return;
    }
    let resolved = false;

    // 1. Si supabase-js ya estableció la sesión (token procesado al cargar).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        resolved = true;
        setSessionState('ready');
      }
    });

    // 2. Escuchar el evento de recuperación (se dispara al procesar el token).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        resolved = true;
        setSessionState('ready');
      }
    });

    // 3. Si tras unos segundos no hay sesión, el enlace no es válido/expiró.
    const timer = setTimeout(() => {
      if (!resolved) setSessionState('invalid');
    }, 4000);

    return () => {
      subscription?.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < MIN_PASSWORD) {
      toast.error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
      return;
    }
    if (form.password !== form.confirm) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: form.password });
      if (error) throw error;
      toast.success('¡Contraseña actualizada! Iniciando sesión...');
      window.location.href = '/';
    } catch (err) {
      toast.error(err?.message || 'No se pudo actualizar la contraseña');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <m.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="text-center mb-8 space-y-2">
          <Link to="/" className="inline-block">
            <img
              src="/logo.svg"
              alt="ChessKing"
              className="h-16 sm:h-20 md:h-24 w-auto mx-auto mb-3 drop-shadow-lg transition-transform duration-300 hover:scale-105 cursor-pointer"
            />
          </Link>
          <h1 className="font-display text-4xl md:text-5xl tracking-wide">
            MUNDIAL DE <span className="text-foreground">KINGS</span>
          </h1>
          <p className="text-muted-foreground">Crea tu nueva contraseña</p>
        </div>

        <Card className="gradient-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="w-5 h-5" />
              Nueva contraseña
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessionState === 'invalid' ? (
              <div className="space-y-4 text-center">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  El enlace expiró o no es válido. Solicita uno nuevo para
                  restablecer tu contraseña.
                </p>
                <Link to="/forgot-password">
                  <Button variant="outline" className="w-full">Solicitar nuevo enlace</Button>
                </Link>
              </div>
            ) : sessionState === 'checking' ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-muted border-t-foreground rounded-full animate-spin" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Nueva contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      value={form.password}
                      onChange={handleChange}
                      autoFocus
                      className="pr-10 transition-all duration-200 focus:ring-2 focus:ring-secondary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirmar contraseña</Label>
                  <Input
                    id="confirm"
                    name="confirm"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Repite tu nueva contraseña"
                    value={form.confirm}
                    onChange={handleChange}
                    className="transition-all duration-200 focus:ring-2 focus:ring-secondary/30"
                  />
                </div>

                <Button type="submit" className="w-full glow-sm" disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Guardando...
                    </span>
                  ) : 'Guardar contraseña'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </m.div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint src/pages/ResetPassword.jsx`
Expected: sin salida (sin errores).

- [ ] **Step 3: Commit**

```bash
git add src/pages/ResetPassword.jsx
git commit -m "feat(auth): pagina /reset-password (establecer nueva contrasena)"
```

---

### Task 3: Registrar las rutas en `App.jsx`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Importar las páginas**

En `src/App.jsx`, tras la línea `import CompleteProfile from './pages/CompleteProfile';` (línea 14), añadir:

```jsx
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
```

- [ ] **Step 2: Añadir las rutas públicas**

En el bloque `<Routes>`, tras `<Route path="/register" element={<Register />} />` (línea 55), añadir:

```jsx
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
```

- [ ] **Step 3: Lint**

Run: `pnpm exec eslint src/App.jsx`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(auth): registrar rutas /forgot-password y /reset-password"
```

---

### Task 4: Enlace "¿Olvidaste tu contraseña?" en Login

**Files:**
- Modify: `src/pages/Login.jsx`

- [ ] **Step 1: Añadir el enlace bajo el campo de contraseña**

En `src/pages/Login.jsx`, el campo de contraseña termina en la línea 144 (`</div>` que cierra el `div.space-y-1.5` del password). Inmediatamente después de ese `</div>` y antes del `<m.div whileHover...>` del botón (línea 146), insertar:

```jsx
                <div className="text-right -mt-1">
                  <Link
                    to="/forgot-password"
                    className="text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
```

`Link` ya está importado en `Login.jsx` (línea 2), no se necesita import nuevo.

- [ ] **Step 2: Lint**

Run: `pnpm exec eslint src/pages/Login.jsx`
Expected: sin errores.

- [ ] **Step 3: Verificar en la app local**

Run: con `pnpm dev` corriendo, abrir `http://localhost:5173/login`.
Expected: aparece el enlace "¿Olvidaste tu contraseña?" bajo el campo de contraseña; al pulsarlo navega a `/forgot-password`; ese formulario envía el correo y muestra el mensaje de confirmación.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Login.jsx
git commit -m "feat(auth): enlace '¿Olvidaste tu contrasena?' en login"
```

---

### Task 5: Verificar `AuthContext` y flujo completo

**Files:**
- Read/verify: `src/lib/AuthContext.jsx` (no se espera cambio de código)

- [ ] **Step 1: Verificar que no hay redirect no deseado**

Leer `src/lib/AuthContext.jsx`. El `onAuthStateChange` (líneas 75-90) hace login cuando hay sesión, pero NO redirige (solo `dispatch`). La ruta `/reset-password` es pública y no fuerza navegación. Confirmar que al llegar desde el correo, el usuario ve el formulario de nueva contraseña (no es expulsado a otra página).

Si se observara un redirect no deseado (no esperado), añadir una guarda mínima en el `onAuthStateChange`: ignorar el cambio de estado cuando `window.location.pathname === '/reset-password'`. Solo aplicar si la verificación manual lo demuestra necesario.

- [ ] **Step 2: Recorrido manual completo**

Con `pnpm dev`:
1. `/login` → pulsar "¿Olvidaste tu contraseña?".
2. `/forgot-password` → escribir un correo registrado → "Enviar enlace" → ver mensaje de confirmación.
3. Abrir el enlace del correo (en el mismo navegador) → llega a `/reset-password` → ver el formulario.
4. Escribir nueva contraseña + confirmar → "Guardar contraseña" → entra a Inicio con sesión activa.
5. Cerrar sesión y volver a entrar con la nueva contraseña → funciona.

Nota: el envío del correo y el dominio del enlace dependen de la config del operador en el panel de Supabase (Site URL + Redirect URLs). En desarrollo, la Site URL/Redirect debe incluir `http://localhost:5173`.

- [ ] **Step 3: Commit final (si hubo ajuste en AuthContext)**

```bash
git add -A
git commit -m "chore(auth): verificacion flujo recuperar contrasena"
```

(Si no hubo cambios de código en este task, omitir el commit.)

---

## Acciones del operador (panel de Supabase — NO código)

Para que el enlace del correo funcione y no apunte a `localhost` en producción:

1. **Auth → URL Configuration → Site URL:** poner el dominio de producción (ej. `https://chessking.la`). En desarrollo puede ser `http://localhost:5173`.
2. **Auth → URL Configuration → Redirect URLs:** agregar `https://<dominio>/reset-password` y, para desarrollo, `http://localhost:5173/reset-password`.
3. (Opcional, recomendado para producción) **Auth → Email Templates / SMTP:** configurar SMTP propio (Resend/Brevo) para evitar los límites del correo de prueba de Supabase. La plantilla de "Reset Password" ya está hecha.
