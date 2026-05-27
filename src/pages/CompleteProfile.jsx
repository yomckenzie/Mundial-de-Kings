import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Trophy, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const wa = whatsapp.trim();
    if (!wa) {
      setError('El número de WhatsApp es obligatorio.');
      return;
    }

    setSaving(true);

    try {
      await api.auth.updateMe({
        whatsapp: wa,
        total_points: 100,
        bonus_points: 100,
        prediction_points: 0,
        profile_complete: true,
      });

      toast.success('¡Perfil completado! Recibiste 100 puntos de bienvenida 🎉');
      navigate('/');
      window.location.reload();
    } catch (err) {
      setError(err?.message || 'Error al guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3">
            <Trophy className="w-7 h-7 text-primary-foreground" />
          </div>
          <CardTitle className="font-display text-3xl tracking-wide">KINGS WORLD CUP</CardTitle>
          <CardDescription>
            Solo falta tu WhatsApp para completar tu registro y recibir 100 puntos de bienvenida 🎉
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label>Número de WhatsApp *</Label>
              <Input
                placeholder="Ej: 3001234567"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Guardando...' : 'Completar Registro'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
