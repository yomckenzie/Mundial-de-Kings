import React from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, ArrowLeft, Shield } from 'lucide-react';

export default function RegisterForm({ form, fieldErrors, isLoading, handleChange, handleSubmit, redirect }) {
  return (
    <m.div
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
                className={`transition-all duration-200 focus:ring-2 focus:ring-secondary/30 ${fieldErrors.full_name ? 'border-destructive' : ''}`}
              />
              {fieldErrors.full_name && <p className="text-[11px] text-destructive">{fieldErrors.full_name}</p>}
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
                className={`transition-all duration-200 focus:ring-2 focus:ring-secondary/30 ${fieldErrors.email ? 'border-destructive' : ''}`}
              />
              {fieldErrors.email && <p className="text-[11px] text-destructive">{fieldErrors.email}</p>}
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
                  className={fieldErrors.phone ? 'border-destructive' : ''}
                />
                {fieldErrors.phone && <p className="text-[11px] text-destructive">{fieldErrors.phone}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cedula">Cédula o Pasaporte *</Label>
                <Input
                  id="cedula"
                  name="cedula"
                  placeholder="8-000-0000"
                  value={form.cedula}
                  onChange={handleChange}
                  className={fieldErrors.cedula ? 'border-destructive' : ''}
                />
                {fieldErrors.cedula && <p className="text-[11px] text-destructive">{fieldErrors.cedula}</p>}
                <p className="text-[10px] text-muted-foreground/60 leading-tight">
                  Escríbela exactamente como aparece en tu documento. Se usará para validar tu identidad al reclamar premios.
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
                  className={fieldErrors.instagram_user ? 'border-destructive' : ''}
                />
                {fieldErrors.instagram_user && <p className="text-[11px] text-destructive">{fieldErrors.instagram_user}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tiktok_user">TikTok *</Label>
                <Input
                  id="tiktok_user"
                  name="tiktok_user"
                  placeholder="@tuusuario"
                  value={form.tiktok_user}
                  onChange={handleChange}
                  className={fieldErrors.tiktok_user ? 'border-destructive' : ''}
                />
                {fieldErrors.tiktok_user && <p className="text-[11px] text-destructive">{fieldErrors.tiktok_user}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="referral_code">Código de invitación <span className="text-muted-foreground">(opcional)</span></Label>
              <Input
                id="referral_code"
                name="referral_code"
                placeholder="Ej: CHESS-A1B2"
                value={form.referral_code}
                onChange={handleChange}
                className={`transition-all duration-200 focus:ring-2 focus:ring-secondary/30 ${fieldErrors.referral_code ? 'border-destructive' : ''}`}
              />
              {fieldErrors.referral_code && <p className="text-[11px] text-destructive">{fieldErrors.referral_code}</p>}
              <p className="text-[10px] text-muted-foreground/60 leading-tight">
                Si te invitaron, ingresa el código aquí para que quien te refirió gane puntos.
              </p>
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
                className={`transition-all duration-200 focus:ring-2 focus:ring-secondary/30 ${fieldErrors.password ? 'border-destructive' : ''}`}
              />
              {fieldErrors.password && <p className="text-[11px] text-destructive">{fieldErrors.password}</p>}
            </div>

            <m.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <Button type="submit" className="w-full glow-sm" disabled={isLoading}>
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creando cuenta...
                  </span>
                ) : 'Crear cuenta'}
              </Button>
            </m.div>

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
    </m.div>
  );
}
