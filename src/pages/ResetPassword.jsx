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
  // 'checking' | 'ready' | 'invalid'  → estado de la sesión de recuperación.
  // El estado inicial se calcula de forma síncrona a partir de la URL para
  // evitar un render inicial con 'checking' innecesario. Luego el useEffect
  // (sólo monta una vez) actualiza según el resultado de la verificación async.
  const [sessionState, setSessionState] = useState(() => {
    if (!supabase) return 'invalid';
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hashParams.get('error')) return 'invalid';
    return 'checking';
  });

  useEffect(() => {
    // El estado 'invalid' ya viene del lazy initializer si no hay supabase o
    // si el hash trae error. Aquí solo corremos verificaciones async y
    // actualizamos a 'ready'/'invalid' según el resultado de la red.

    // 1. Flujo recomendado: token_hash en la query → verificar en el cliente.
    //    La verificación ocurre vía JS, así que el pre-cargado del correo
    //    (Gmail, Outlook Safe Links) NO consume el token (los escáneres no
    //    ejecutan JS). Requiere que la plantilla del correo use:
    //    {{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (tokenHash) {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: type || 'recovery' })
        .then(({ error }) => setSessionState(error ? 'invalid' : 'ready'))
        .catch(() => setSessionState('invalid'));
      return;
    }

    // 2. Compatibilidad: sesión ya establecida (flujo implícito) o el usuario
    //    ya tiene sesión activa.
    let resolved = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        resolved = true;
        setSessionState('ready');
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        resolved = true;
        setSessionState('ready');
      }
    });
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
