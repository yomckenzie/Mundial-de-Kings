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
