import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { m } from 'framer-motion';

export default function SuccessDialog({ prize, open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="sr-only">Premio canjeado</DialogTitle>
          <DialogDescription className="sr-only">Confirmación de canje exitoso e instrucciones de recogida.</DialogDescription>
        </DialogHeader>
        {prize && (
          <div className="text-center space-y-4 py-2">
            <m.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
            </m.div>
            <div>
              <h3 className="text-xl font-bold">¡Felicidades!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Has canjeado <strong>{prize.name}</strong> exitosamente.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4 text-sm space-y-2 text-left">
              <p className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                Te indicaremos el punto de recogida por <strong className="whitespace-nowrap">WhatsApp</strong>.
              </p>
              <p className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                Debes presentar tu cédula para retirar el premio.
              </p>
            </div>
            <Button onClick={onClose} className="w-full">Entendido</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
