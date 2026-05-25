import React, { useState } from 'react';
import { api } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Gift } from 'lucide-react';

export default function GrantPointsModal({ user, open, onClose }) {
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleGrant = async () => {
    const pts = parseInt(points);
    if (!pts || pts <= 0) { toast.error('Ingresa una cantidad válida de puntos'); return; }
    if (!reason.trim()) { toast.error('Debes justificar el motivo'); return; }

    setLoading(true);
    try {
      const newBonus = (user.bonus_points || 0) + pts;
      const newTotal = (user.total_points || 0) + pts;

      // Update user points
      await api.entities.User.update(user.id, {
        bonus_points: newBonus,
        total_points: newTotal,
      });

      // Log the bonus
      const me = await api.auth.me();
      await api.entities.PointsBonus.create({
        user_email: user.email,
        user_name: user.full_name || '',
        points: pts,
        reason: reason.trim(),
        granted_by: me.email,
        type: 'manual',
      });

      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-bonuses'] });
      toast.success(`✅ ${pts} puntos otorgados a @${user.instagram}`);
      setPoints('');
      setReason('');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5" />
            Otorgar puntos extra
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p className="font-medium">{user?.full_name}</p>
            <p className="text-muted-foreground">@{user?.instagram} · {user?.email}</p>
            <div className="mt-2 flex gap-4 text-xs">
              <span>Por pronósticos: <b>{user?.prediction_points || 0} pts</b></span>
              <span>Bonos: <b>{user?.bonus_points || 0} pts</b></span>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Puntos a otorgar</Label>
            <Input
              type="number"
              min="1"
              placeholder="Ej: 50"
              value={points}
              onChange={e => setPoints(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Motivo / Justificación <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Explica por qué se otorgan estos puntos..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Esto quedará registrado en el historial interno.</p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button onClick={handleGrant} disabled={loading}>
              {loading ? 'Guardando...' : 'Otorgar puntos'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}