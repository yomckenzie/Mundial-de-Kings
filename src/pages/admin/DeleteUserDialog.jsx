import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2 } from 'lucide-react';

export default function DeleteUserDialog({ user, open, aciertosMap, canjesMap, deleting, onConfirm, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Eliminar usuario
          </DialogTitle>
          <DialogDescription className="pt-2">
            ¿Estás seguro de eliminar a <strong>{user?.full_name || user?.email}</strong>?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium text-destructive">Esta acción no se puede deshacer.</p>
            <p className="text-muted-foreground text-xs">
              Se eliminarán permanentemente:
            </p>
            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
              <li>El usuario y su perfil completo</li>
              <li>Todos sus pronósticos ({aciertosMap[user?.email] || 0} aciertos)</li>
              <li>Todos sus canjes ({canjesMap[user?.email] || 0} canjes)</li>
              <li>Puntos extra otorgados</li>
              <li>Tickets de soporte</li>
            </ul>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting} className="gap-1.5">
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Eliminando...' : 'Eliminar usuario'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
