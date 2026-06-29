import { useNavigate } from 'react-router-dom';
import { Gift, Check, X } from 'lucide-react';
import { m } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Modal "Tienes puntos para canjear".
 *
 * - Fondo claro (consistente con el resto del sitio)
 * - Corona oficial del favicon (mismo logo del sitio)
 * - Mensaje corto y directo, sin adornos editoriales
 * - Aparece una vez por sesión, solo si hay puntos disponibles.
 */

// Corona oficial — mismo SVG que public/favicon.svg (rey amarillo)
function ChessKingCrown({ size = 56 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 115 107"
      width={size}
      height={size * (107 / 115)}
      aria-hidden="true"
    >
      <defs>
        <style>{`.king-yellow { fill: #fde918; }`}</style>
      </defs>
      <g>
        <path className="king-yellow" d="M83.23,96.45c-1.83,2.17-2.15,4.42-1.96,6.88.09,1.17.21,2.37-.37,3.51-.35.27-.72.36-1.14.09-.45-1.63-.82-3.26-.96-4.93-.17-2.04-.72-2.42-3.21-2.47-3.1-.07-6.12.53-9.19.73-9.69.63-19.33,1.65-28.93,2.9-3.9.51-8.15-2.29-8.55-5.47-.22-1.7.41-3.19,2.15-4.16,2.27-1.27,4.61-2.19,7.65-2.03,2.64.15,5.35-.45,8.02-.76,10.17-1.16,20.38-1.93,30.62-2.47,2.44-.13,4.5.55,5.8,2.3,1.43,1.92,1.57,4.1.07,5.88" />
        <path className="king-yellow" d="M102.31,29.05c-2.96-1.33-5.81-.93-8.32,1.27-6.43,5.64-12.82,11.31-19.23,16.97-.39.35-.76.72-1.36,1.29-.73-2.99-1.38-5.69-2.04-8.38-2.94-12.02-6.5-23.92-10.26-35.79-1.33-4.19-8.01-5.57-11.46-3.36-1.42.91-1.95,2.16-2.22,3.54-2.4,12.1-4.97,24.17-8.8,36.03-.23.72-.48,1.44-.76,2.25-.79-.43-1.08-1.09-1.5-1.65-11.75-11.84-12.53-11.98-22.94-21.18-2.12-2.32-5.31-3.24-8.74-2.55-3.77.76-5.54,3.3-4.3,6.37,2.67,6.63,4.05,13.09,6.64,19.74,5.2,13.35,3.31,11.03,7.24,24.67.63,2.19,1.18,4.43,3.99,5.6.66.27.3.53-.03.79-1.58,1.29-1.53,2.74-.54,4.23,1.76,2.65,3.15,5.39,3.58,8.4.81,3.21.68,6.46.67,9.7,0,1.76-.08,3.52.35,5.25.32,1.29,1.1,1.62,2.67,1.17.39-.72.19-1.47.15-2.21-.26-4.22-.49-8.44-.82-12.65-.12-1.59.68-2.56,2.39-3.22,2.24-.86,4.61-1.35,7.05-1.32,11.2.15,22.37-.7,33.57-.73,7.04-.02,14.05.29,20.96,1.49,2.72.47,5.13.03,7.13-1.65,1.13-.95,1.2-2.11,1.49-3.34.72-3.07.72-6.16,1.14-9.24,1.02-7.51,2.3-14.99,4.2-22.4,1.07-4.17,2.3-8.3,3.64-12.42.9-2.76-.45-5.29-3.56-6.68M85.15,63.1c-.17.91-.02,1.85-.5,2.72-.21,2.12-.45,4.24-.63,6.36-.05.52-.24.65-.89.55-.89-.13-1.81-.14-2.71-.21-4.76-.14-9.53-.28-14.29-.42-.54.03-1.09.06-1.63.08-5.24.12-10.48.25-15.72.38-.81.03-1.62.05-2.43.08-3.17.31-6.35.13-9.52.2-.67.01-.88-.34-1.25-.66-1.19-1.07-2.17-2.4-4.2-2.58-.55-.05-.63-.36-.61-.76.16-2.56-.57-4.78-3.6-6.12-.27-.12-.44-.49-.52-.77-.46-1.53-.87-3.07-1.3-4.6-.36-.7-.61-1.43-.68-2.2-1.2-3.58-2.42-7.15-3.6-10.73-.18-.55-.59-1.07-.47-2.02,2.73,2.93,4.79,5.85,6.88,8.75.26.36.52.73.78,1.09,1.88,2.13,3.37,4.44,4.97,6.7.91,1.28,1.99,2.37,3.55,3.12h0c.16.03.31.08.47.13.23.05.46.11.69.16,4.45.44,7.31-1.06,8.81-4.52,3.38-7.79,5.92-15.77,8.11-23.82.08-.29,0-.63.52-.83,1.26,4.94,2.71,9.82,3.67,14.78.58,2.44,1.16,4.88,1.74,7.31.4,1.8.96,3.59,1.18,5.41.36,2.98,2.18,4.84,5.73,5.61.7.01,1.4.02,2.1.03,2.02-.22,3.57-1.06,4.93-2.28,3.54-3.19,7.15-6.33,10.73-9.49.4-.35.78-.71,1.45-1.3-.62,3.51-1.15,6.69-1.74,9.85" />
      </g>
    </svg>
  );
}

export default function PrizeAnnouncementModal({ open, onClose, availablePoints = 0 }) {
  const navigate = useNavigate();

  const handleGoToPrizes = () => {
    onClose();
    navigate('/prizes');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden gap-0 bg-card border-2 border-secondary/50 text-card-foreground [&>button]:hidden"
      >
        {/* X personalizado */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ─────────── HEADER ─────────── */}
        <div className="px-6 pt-7 pb-3 text-center bg-gradient-to-b from-secondary/10 to-transparent">
          <m.div
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            className="flex justify-center mb-3"
          >
            <div className="w-14 h-14 rounded-2xl bg-zinc-950 shadow-md flex items-center justify-center p-2 ring-1 ring-secondary/30">
              <ChessKingCrown size={40} />
            </div>
          </m.div>

          <DialogTitle className="font-display text-2xl tracking-wide text-foreground leading-tight">
            Tienes puntos para canjear
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
            Canjéalos antes de que se acaben.
          </DialogDescription>
        </div>

        {/* ─────────── NÚMERO GRANDE ─────────── */}
        <div className="px-6 py-4 text-center border-y border-border bg-background">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Disponibles
          </p>
          <div className="flex items-baseline justify-center gap-1">
            <span className="font-display text-5xl text-secondary leading-none tabular-nums">
              {availablePoints.toLocaleString('es-PA')}
            </span>
            <span className="font-display text-xl text-secondary/80 leading-none ml-0.5">pts</span>
          </div>
        </div>

        {/* ─────────── AFIRMACIÓN CLAVE ─────────── */}
        <div className="px-6 py-4">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
            </div>
            <p className="text-sm leading-snug">
              <strong className="text-foreground">Canjear no afecta tu posición en el Ranking.</strong>
              {' '}
              <span className="text-muted-foreground">Tus puntos siguen contando.</span>
            </p>
          </div>
        </div>

        {/* ─────────── BOTONES ─────────── */}
        <div className="px-5 pb-5 pt-1 flex flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11 font-semibold"
            onClick={onClose}
          >
            Más tarde
          </Button>
          <Button
            type="button"
            className="flex-1 h-11 gap-2 font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/90"
            onClick={handleGoToPrizes}
          >
            <Gift className="w-4 h-4" />
            Canjear ahora
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}