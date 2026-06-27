import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gift, Loader2, ShieldCheck, Instagram, Music2 } from 'lucide-react';
import { normalizeDoc } from '@/lib/utils';

// Mismas redes que <SocialFollow/>, en versión compacta para el modal.
const SOCIAL = [
  { title: 'Instagram', url: 'https://www.instagram.com/chesskingla', icon: Instagram },
  { title: 'Canal', url: 'https://www.instagram.com/channel/AbYBljKVsKt5wlV2', icon: Instagram },
  { title: 'TikTok', url: 'https://www.tiktok.com/@chesskingla', icon: Music2 },
];

/**
 * Paso de verificación antes de canjear un premio.
 * El usuario debe confirmar su cédula/pasaporte y que coincida con el del
 * registro (validación de identidad). Solo entonces se dispara onConfirm().
 */
export default function RedemptionVerifyDialog({ open, prize, user, isPending, onConfirm, onClose }) {
  const [doc, setDoc] = useState('');
  const [error, setError] = useState('');

  const isPassport = user?.doc_type === 'pasaporte';
  const docLabel = isPassport ? 'pasaporte' : 'cédula';
  const registered = user?.cedula || '';

  // FIX (react-doctor): reset inline en render (patrón "track prev prop") en
  // vez de useEffect. El useEffect mostraba doc/error del render anterior
  // durante un frame antes de limpiarse. Usamos useRef porque `prevOpen` solo
  // se lee en este control de flujo, nunca se renderiza.
  const prevOpenRef = useRef(open);
  if (open !== prevOpenRef.current) {
    prevOpenRef.current = open;
    if (open) {
      setDoc('');
      setError('');
    }
  }

  const handleConfirm = () => {
    const value = doc.trim();
    if (!value) {
      setError(`Ingresa tu ${docLabel} para continuar`);
      return;
    }
    // Si hay documento registrado, exigir coincidencia. (Cuentas antiguas sin
    // documento en archivo: se acepta con validación básica para no bloquearlas.)
    if (registered && normalizeDoc(value) !== normalizeDoc(registered)) {
      setError(`Tu ${docLabel} no coincide con la registrada. Verifícala e inténtalo de nuevo.`);
      return;
    }
    if (!registered && value.length < 3) {
      setError(`Ingresa una ${docLabel} válida`);
      return;
    }
    setError('');
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md gap-0 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Gift className="h-5 w-5" />
            Confirmar canje
          </DialogTitle>
        </DialogHeader>

        {/* Resumen del premio */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
          <span className="text-sm text-foreground">{prize?.name}</span>
          <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">
            {prize?.points_cost} pts
          </span>
        </div>

        {/* Verificación de identidad */}
        <div className="mt-4 space-y-2">
          <label htmlFor="redeem-doc" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Confirma tu {docLabel}
          </label>
          <p className="text-xs text-muted-foreground">
            Debe coincidir con la que registraste. La usaremos para validar tu identidad al retirar el premio.
          </p>
          <Input
            id="redeem-doc"
            value={doc}
            autoComplete="off"
            inputMode={isPassport ? 'text' : 'numeric'}
            placeholder={isPassport ? 'AB123456' : '8-000-0000'}
            onChange={(e) => { setDoc(e.target.value); if (error) setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isPending) handleConfirm(); }}
            aria-invalid={!!error}
            className={error ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        {/* Recordatorio de redes */}
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4 text-center">
          <p className="text-sm text-foreground">
            Recuerda <strong className="font-semibold">seguirnos en nuestras redes</strong> para poder recibir tu premio.
          </p>
          <div className="mt-3 flex items-center justify-center gap-6">
            {SOCIAL.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <s.icon className="h-6 w-6" aria-hidden="true" />
                <span className="text-[11px]">{s.title}</span>
              </a>
            ))}
          </div>
        </div>

        <Button className="mt-5 h-12 w-full text-base" onClick={handleConfirm} disabled={isPending}>
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Canjeando...</>
          ) : (
            <>Confirmar y canjear</>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
