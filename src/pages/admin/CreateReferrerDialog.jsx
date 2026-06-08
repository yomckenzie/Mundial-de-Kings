import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';

export default function CreateReferrerDialog({ open, name, code, points, onNameChange, onCodeChange, onPointsChange, onClose, onCreate, isPending }) {
  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Crear referidor personalizado
          </DialogTitle>
          <DialogDescription>
            Crea un usuario con código de referido personalizado y puntos distintos al estándar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ref-name">Nombre del referidor</Label>
            <Input
              id="ref-name"
              placeholder="Ej: Influencer X"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-code">Código de referido</Label>
            <Input
              id="ref-code"
              placeholder="Ej: INFLUENCER1"
              value={code}
              onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
            />
            <p className="text-[10px] text-muted-foreground/60">Los usuarios ingresarán este código al registrarse.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-points">Puntos por referido</Label>
            <Input
              id="ref-points"
              type="number"
              min="0"
              placeholder="Ej: 20"
              value={points}
              onChange={(e) => onPointsChange(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground/60">Cada vez que alguien se registre con su código, recibirá esta cantidad de puntos.</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Resumen</p>
            <p>Nombre: <strong>{name || '—'}</strong></p>
            <p>Código: <strong>{code || '—'}</strong></p>
            <p>Puntos por referido: <strong>{points || '0'} pts</strong></p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={onCreate} disabled={isPending} className="gap-1.5">
              <UserPlus className="w-4 h-4" />
              {isPending ? 'Creando...' : 'Crear referidor'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
