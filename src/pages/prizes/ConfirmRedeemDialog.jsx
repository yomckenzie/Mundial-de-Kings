import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Gift, CheckCircle2, Ruler } from 'lucide-react';

export default function ConfirmRedeemDialog({
  prize, open, cedulaInput, cedulaError, selectedSize, setSelectedSize,
  pending, onCedulaChange, onConfirm, onClose
}) {
  const hasSizes = prize?.sizes && typeof prize.sizes === 'object' && Object.keys(prize.sizes).length > 0;
  const availableSizes = hasSizes
    ? Object.entries(prize.sizes).filter(([_, stock]) => Number(stock) > 0)
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5" />
            Confirmar canje
          </DialogTitle>
          <DialogDescription className="sr-only">Selecciona la talla y confirma tu identidad para canjear el premio.</DialogDescription>
        </DialogHeader>
        {prize && (
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Premio:</span> <strong>{prize.name}</strong></p>
              <p><span className="text-muted-foreground">Puntos a canjear:</span> <strong>{prize.points_cost} pts</strong></p>
            </div>

            {/* Selector de talla */}
            {hasSizes && availableSizes.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Ruler className="w-4 h-4" />
                  Selecciona tu talla
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(prize.sizes).map(([size, stock]) => {
                    const inStock = Number(stock) > 0;
                    return (
                      <button
                        key={size}
                        type="button"
                        disabled={!inStock}
                        onClick={() => setSelectedSize(size)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                          selectedSize === size
                            ? 'border-foreground bg-foreground text-background'
                            : inStock
                              ? 'border-border hover:border-muted-foreground bg-transparent'
                              : 'border-border/30 text-muted-foreground/40 cursor-not-allowed opacity-40'
                        }`}
                      >
                        {size}
                        <span className="ml-1.5 text-xs opacity-70">
                          ({stock})
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!selectedSize && (
                  <p className="text-xs text-muted-foreground">Selecciona una talla para continuar</p>
                )}
              </div>
            )}

            {/* Si hay tallas pero todas están agotadas */}
            {hasSizes && availableSizes.length === 0 && (
              <div className="text-sm text-destructive text-center py-2">
                No hay tallas disponibles para este premio.
              </div>
            )}

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
            <Button
              className="w-full gap-2"
              onClick={onConfirm}
              disabled={pending || (hasSizes && availableSizes.length > 0 && !selectedSize)}
            >
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