import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { UserPlus, ArrowLeft, Shield } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    cedula: '',
    instagram_user: '',
    tiktok_user: '',
    password: '',
  });

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.phone || !form.cedula || !form.instagram_user || !form.tiktok_user || !form.password) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    if (form.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setIsLoading(true);
    try {
      await api.users.inviteUser({
        email: form.email,
        role: 'user',
        full_name: form.full_name,
        phone: form.phone,
        cedula: form.cedula,
        instagram: form.instagram_user.replace('@', ''),
        tiktok: form.tiktok_user.replace('@', ''),
        password: form.password,
        total_points: 0,
        prediction_points: 0,
        bonus_points: 0,
        profile_complete: false,
      });

      toast.success('¡Cuenta creada exitosamente! Ahora inicia sesión.');
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`);
    } catch (err) {
      toast.error(err?.message || 'Error al crear la cuenta. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <motion.div
          className="text-center mb-8 space-y-2"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
          >
            <Link to="/" className="inline-block">
              <img
                src="/LOGOSCHESSKING_N2.png"
                alt="ChessKing"
                className="h-auto max-h-20 w-auto mx-auto mb-3 drop-shadow-lg transition-transform duration-300 hover:scale-105 cursor-pointer"
              />
            </Link>
          </motion.div>
          <h1 className="font-display text-4xl md:text-5xl tracking-wide">
            MUNDIAL DE{' '}
            <span className="text-foreground">KINGS</span>
          </h1>
          <p className="text-muted-foreground">Crea tu cuenta y empieza a pronosticar</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Card className="gradient-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="w-5 h-5" />
                Crear cuenta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Nombre completo *</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    placeholder="Tu nombre completo"
                    value={form.full_name}
                    onChange={handleChange}
                    className="transition-all duration-200 focus:ring-2 focus:ring-secondary/30"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo electrónico *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="tu@correo.com"
                    value={form.email}
                    onChange={handleChange}
                    className="transition-all duration-200 focus:ring-2 focus:ring-secondary/30"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Teléfono *</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+507 6000-0000"
                      value={form.phone}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cedula">Cédula *</Label>
                    <Input
                      id="cedula"
                      name="cedula"
                      placeholder="8-000-0000"
                      value={form.cedula}
                      onChange={handleChange}
                    />
                    <p className="text-[10px] text-muted-foreground/60 leading-tight">
                      Se usará para validar tu identidad al reclamar premios.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="instagram_user">Instagram *</Label>
                    <Input
                      id="instagram_user"
                      name="instagram_user"
                      placeholder="@tuusuario"
                      value={form.instagram_user}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tiktok_user">TikTok *</Label>
                    <Input
                      id="tiktok_user"
                      name="tiktok_user"
                      placeholder="@tuusuario"
                      value={form.tiktok_user}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Contraseña *</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={form.password}
                    onChange={handleChange}
                    className="transition-all duration-200 focus:ring-2 focus:ring-secondary/30"
                  />
                </div>

                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button type="submit" className="w-full glow-sm" disabled={isLoading}>
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creando cuenta...
                      </span>
                    ) : 'Crear cuenta'}
                  </Button>
                </motion.div>

                <div className="p-3 rounded-xl bg-muted/50 text-[11px] sm:text-xs text-muted-foreground text-center leading-relaxed">
                  <Shield className="w-4 h-4 inline-block mr-1 text-foreground align-text-bottom" />
                  Tus datos están protegidos. No serán compartidos sin autorización (Ley 81 de Protección de Datos de Panamá).
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  ¿Ya tienes cuenta?{' '}
                  <Link
                    to={`/login${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
                    className="underline text-foreground hover:text-secondary transition font-medium"
                  >
                    Inicia sesión
                  </Link>
                </p>

                <div className="text-center">
                  <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition group">
                    <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                    Volver al inicio
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
