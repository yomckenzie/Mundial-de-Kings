import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, MessageCircle, MapPin, BadgeCheck } from 'lucide-react';

/**
 * Diálogo de confirmación tras canjear un premio.
 *
 * El premio se RETIRA en persona (no hay envío): por eso el copy habla de
 * "punto de recogida" y de coordinar por WhatsApp, nunca de dirección/entrega.
 */
export default function RedemptionSuccessDialog({ open, prizeName, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md gap-0 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="sr-only">Premio canjeado correctamente</DialogTitle>
        </DialogHeader>

        {/* Sello dorado de marca (amarillo corona) */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mt-1 mb-4">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-secondary/40 blur-xl"
            />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-md animate-in zoom-in-75 duration-500">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
          </div>

          <h2 className="font-display text-3xl leading-none tracking-wide">
            ¡Felicidades!
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Canjeaste{' '}
            <strong className="font-semibold text-foreground">{prizeName}</strong>{' '}
            correctamente.
          </p>
        </div>

        {/* Próximos pasos — retiro en persona, sin envío */}
        <ul className="mt-5 space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-left">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
              <MessageCircle className="h-4 w-4" />
            </span>
            <p className="text-sm leading-relaxed text-foreground">
              Te contactaremos por <strong className="font-semibold">WhatsApp</strong> para confirmar tu premio.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
              <MapPin className="h-4 w-4" />
            </span>
            <p className="text-sm leading-relaxed text-foreground">
              Te indicaremos el <strong className="font-semibold">punto de recogida</strong> por ese mismo medio.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
              <BadgeCheck className="h-4 w-4" />
            </span>
            <p className="text-sm leading-relaxed text-foreground">
              Lleva tu <strong className="font-semibold">cédula registrada</strong> para validar tu identidad al retirarlo.
            </p>
          </li>
        </ul>

        <Button className="mt-5 h-12 w-full text-base" onClick={onClose}>
          Entendido
        </Button>
      </DialogContent>
    </Dialog>
  );
}
