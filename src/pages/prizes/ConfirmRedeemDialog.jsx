import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Gift, CheckCircle2 } from 'lucide-react';

export default function ConfirmRedeemDialog({ prize, open, cedulaInput, cedulaError, pending, onCedulaChange, onConfirm, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5" />
            Confirmar canje
          </DialogTitle>
        </DialogHeader>
        {prize && (
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Premio:</span> <strong>{prize.name}</strong></p>
              <p><span className="text-muted-foreground">Puntos a canjear:</span> <strong>{prize.points_cost} pts</strong></p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cedula-confirm" className="text-sm font-medium">
                Confirma tu número de cédula
                <span className="ml-1 text-xs text-muted-foreground font-normal">(debe coincidir con la que registraste)</span>
              </label>
              <Input
                id="cedula-confirm"
                value={cedulaInput}
                onChange={(e) => onCedulaChange(e.target.value)}
                placeholder="8-000-0000"
                onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
              />
              {cedulaError && <p className="text-xs text-destructive">{cedulaError}</p>}
            </div>
            <Button className="w-full gap-2" onClick={onConfirm} disabled={pending}>
              {pending ? (
                <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Canjeando...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Confirmar y canjear</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
