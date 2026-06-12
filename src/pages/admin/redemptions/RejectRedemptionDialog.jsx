import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';

const REJECTION_REASONS = [
  { value: 'producto_danado', label: 'Producto dañado' },
  { value: 'sin_stock', label: 'Sin stock / agotado' },
  { value: 'datos_incorrectos', label: 'Datos del usuario incorrectos' },
  { value: 'fraude', label: 'Posible fraude' },
  { value: 'otro', label: 'Otro (especificar)' },
];

/**
 * Modal de rechazo de canje. Estado interno (razón + razón custom) encapsulado;
 * el padre solo recibe onConfirm({ reason, customReason }) al confirmar.
 *
 * Radix Dialog desmonta el contenido cuando `open` es false, así que el estado
 * (reason, customReason) se resetea naturalmente en cada apertura — no
 * necesitamos useEffect para "limpiar al cerrar".
 */
export default function RejectRedemptionDialog({ open, redemption, onClose, onConfirm, isPending }) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const handleConfirm = () => {
    if (!reason) {
      toast.error('Selecciona una razón de rechazo');
      return;
    }
    if (reason === 'otro' && !customReason.trim()) {
      toast.error('Especifica la razón');
      return;
    }
    onConfirm({ reason, customReason });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-destructive" />
            Rechazar canje
          </DialogTitle>
          <DialogDescription className="sr-only">
            Selecciona la razón del rechazo. Los puntos se devolverán al usuario y la unidad volverá al stock del premio.
          </DialogDescription>
        </DialogHeader>

        {redemption && (
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Usuario:</span> <strong>{redemption.user_email}</strong></p>
              <p><span className="text-muted-foreground">Premio:</span> <strong>{redemption.prize_name}</strong></p>
              <p><span className="text-muted-foreground">Puntos:</span> <strong>{redemption.points_spent} pts</strong></p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-semibold">⚠️ Al rechazar:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Se devolverán <strong>{redemption.points_spent} pts</strong> al usuario</li>
                <li>La unidad volverá al stock del premio</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rejection-reason" className="text-sm font-medium">Razón del rechazo</label>
              <div className="space-y-1.5">
                {REJECTION_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                      reason === r.value
                        ? 'border-secondary bg-secondary/10'
                        : 'border-border hover:bg-muted/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rejection-reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="accent-secondary"
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {reason === 'otro' && (
              <div className="space-y-1.5">
                <label htmlFor="rejection-custom-reason" className="text-sm font-medium">Especifica la razón</label>
                <Textarea
                  id="rejection-custom-reason"
                  rows={2}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Describe brevemente la razón..."
                  maxLength={200}
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {customReason.length}/200
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending || !reason}
            className="w-full sm:w-auto gap-1"
          >
            <Ban className="w-4 h-4" />
            {isPending ? 'Rechazando...' : 'Confirmar rechazo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
