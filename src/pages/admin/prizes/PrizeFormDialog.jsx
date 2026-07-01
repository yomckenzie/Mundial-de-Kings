import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Ruler } from 'lucide-react';
import { toast } from 'sonner';
import ImageCarouselField from './ImageCarouselField';

// Genera un ID único para cada sizeRow. Usar crypto.randomUUID cuando está
// disponible (browsers modernos + Node 19+), fallback a timestamp+random.
const newRowId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const EMPTY_FORM = { name: '', description: '', image_urls: [], points_cost: '', status: 'active', original_stock: '' };
const EMPTY_SIZE_ROW = () => ({ id: newRowId(), size: '', stock: '' });

// Construye el estado inicial del form desde initialData (o vacío si es create).
// Mantenido fuera del componente para que sea estable entre renders.
const buildInitialForm = (initialData) => {
  if (!initialData) return EMPTY_FORM;
  const legacy = initialData.image_url;
  const list = Array.isArray(initialData.image_urls)
    ? initialData.image_urls
    : (legacy ? [legacy] : []);
  return {
    name: initialData.name || '',
    description: initialData.description || '',
    image_urls: list,
    points_cost: String(initialData.points_cost ?? ''),
    status: initialData.status || 'active',
    original_stock: String(initialData.original_stock ?? ''),
  };
};

// FIX jul 2026: NO auto-agregar una fila de talla vacía cuando el premio no
// tiene tallas. Antes devolvía [EMPTY_SIZE_ROW()] como placeholder, lo que
// confundía al admin (parecía que el premio tenía tallas) y rompía la lógica
// del campo "Unidades totales" (que se ocultaba si había filas). Ahora:
//   - premio sin tallas → []   (solo se ve "Unidades totales")
//   - premio con tallas → [rows]
//   - create mode      → []   (admin elige explícitamente)
const buildInitialSizeRows = (initialData) => {
  if (!initialData) return [];
  if (!initialData.original_sizes || typeof initialData.original_sizes !== 'object') {
    return [];
  }
  return Object.entries(initialData.original_sizes).map(([size, stock]) => ({
    id: newRowId(),
    size,
    stock: String(stock ?? 0),
  }));
};

/**
 * Diálogo controlado para crear/editar un premio.
 *
 * Modos:
 *  - 'create' (default): form vacío, al submit llama onSubmit(payload)
 *  - 'edit': form prellenado con initialData, al submit llama onSubmit(payload, initialData.id)
 *
 * El reset del form al cambiar de premio se hace con el `key` prop del padre
 * (`<PrizeFormDialog key={initialData?.id ?? 'new'} ... />`) — React remonta
 * el componente cuando cambia la key, así no necesitamos useEffect para
 * sincronizar props con state (que mostraba valores stale en un render
 * intermedio).
 */
export default function PrizeFormDialog({
  open,
  onOpenChange,
  initialData = null,
  onSubmit,
  isPending = false,
}) {
  const isEdit = !!initialData;
  const [form, setForm] = useState(() => buildInitialForm(initialData));
  const [sizeRows, setSizeRows] = useState(() => buildInitialSizeRows(initialData));

  const addSizeRow = () => setSizeRows(prev => [...prev, EMPTY_SIZE_ROW()]);
  const removeSizeRow = (id) => setSizeRows(prev => prev.filter(r => r.id !== id));
  const updateSizeRow = (id, field, value) => {
    setSizeRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const hasAnySizeData = sizeRows.some(r => r.size.trim() !== '');
  // FIX jul 2026: cuando hay tallas, mostrar el total como suma de stocks
  // (incluso si alguna fila está vacía — eso es solo UI, buildPayload las
  // filtra al guardar). Cuando NO hay tallas, mostrar el input "Unidades
  // totales".
  const computedTotal = sizeRows.length > 0
    ? sizeRows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0)
    : (Number(form.original_stock) || 0);

  const buildPayload = () => {
    const sizesObj = {};
    sizeRows.forEach(row => {
      const size = row.size.trim().toUpperCase();
      if (size) {
        sizesObj[size] = Number(row.stock) || 0;
      }
    });
    const hasTallas = Object.keys(sizesObj).length > 0;
    // FIX jul 2026: si hay tallas con datos, original_stock = suma de tallas
    // (REEMPLAZA el valor del form). Si NO hay tallas, original_stock = el
    // valor del input "Unidades totales". Antes la condición usaba "allEmpty"
    // calculado dentro de un forEach, lo que daba resultados confusos cuando
    // había filas vacías mezcladas con filas con datos.
    const totalStock = hasTallas
      ? Object.values(sizesObj).reduce((sum, s) => sum + s, 0)
      : (Number(form.original_stock) || 0);
    return {
      name: form.name,
      description: form.description,
      // Persistir el array. La primera imagen también se guarda en image_url
      // por compatibilidad con consumidores que aún leen el campo legacy.
      image_urls: form.image_urls,
      image_url: form.image_urls[0] || null,
      points_cost: Number(form.points_cost),
      status: form.status,
      // original_sizes: null si no hay tallas; el stock disponible se calcula
      // dinámicamente como original_stock - canjes_activos.
      original_sizes: hasTallas ? sizesObj : null,
      original_stock: totalStock,
    };
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.points_cost) {
      toast.error('Nombre y puntos son obligatorios');
      return;
    }
    // FIX jul 2026: validar según el modo activo. Si hay tallas (sizeRows > 0),
    // exigir al menos una con size+stock. Si NO hay tallas, exigir el input
    // original_stock. Antes validaba con `hasAnySizeData` (que era true si había
    // alguna fila con size no vacío), pero con el nuevo diseño solo hay filas
    // cuando el modo es "tallas", así que basta con `sizeRows.length > 0`.
    if (sizeRows.length > 0) {
      const anyValid = sizeRows.some(r => r.size.trim() !== '');
      if (!anyValid) {
        toast.error('Agrega al menos una talla con nombre');
        return;
      }
    } else if (!form.original_stock || Number(form.original_stock) < 0) {
      toast.error('Define las unidades totales (mayor o igual a 0)');
      return;
    }
    const payload = buildPayload();
    if (isEdit) {
      onSubmit(payload, initialData.id);
    } else {
      onSubmit(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar premio' : 'Nuevo Premio'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? 'Edita los datos del premio, incluyendo tallas y stock.' : 'Formulario para crear un premio del catálogo.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <div>
            <Label>Nombre del premio</Label>
            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Camiseta ChessKing" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} placeholder="Descripción opcional del premio..." />
          </div>
          <div>
            <Label>Imágenes del premio</Label>
            <ImageCarouselField
              imageUrls={form.image_urls}
              onChange={(urls) => setForm(prev => ({ ...prev, image_urls: urls }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Puntos para canjear</Label>
              <Input type="number" min="0" value={form.points_cost} onChange={e => setForm({...form, points_cost: e.target.value})} placeholder="100" />
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ─── Tallas y Stock (modo exclusivo con "Unidades totales") ───
              FIX jul 2026: si sizeRows.length > 0 → modo "tallas" (oculta unidades
              totales, muestra el total calculado). Si sizeRows.length === 0 → modo
              "unidades totales" (muestra el input, oculta el editor de tallas). El
              admin puede transicionar entre modos agregando la primera talla o
              eliminando todas. NO hay fila fantasma de "talla vacía" en modo
              unidades. */}
          {sizeRows.length > 0 ? (
            <div className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <Ruler className="w-4 h-4" />
                  Tallas y stock
                </Label>
                <Button type="button" variant="ghost" size="sm" onClick={addSizeRow} className="h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Agregar talla
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Define las tallas disponibles. El total se calcula como la suma de stocks.
                Para volver al modo sin tallas, elimina todas las filas.
              </p>

              {sizeRows.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    placeholder="Talla (S, M, L, XL...)"
                    value={row.size}
                    onChange={(e) => updateSizeRow(row.id, 'size', e.target.value)}
                    className="flex-1 h-9 text-sm"
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Stock"
                    value={row.stock}
                    onChange={(e) => updateSizeRow(row.id, 'stock', e.target.value)}
                    className="w-20 h-9 text-sm text-center"
                  />
                  <button
                    type="button"
                    onClick={() => removeSizeRow(row.id)}
                    className="w-7 h-7 rounded-md hover:bg-destructive/10 text-destructive flex items-center justify-center shrink-0 transition-colors"
                    aria-label="Eliminar talla"
                    title="Eliminar esta talla"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <div className="text-xs text-muted-foreground text-right pt-1 border-t border-border/50">
                Total calculado: <span className="font-semibold text-foreground">{computedTotal}</span> unidades
                <span className="ml-2 text-[10px] text-muted-foreground/70">(se guarda al guardar)</span>
              </div>
            </div>
          ) : (
            <div className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <Ruler className="w-4 h-4" />
                  Unidades totales
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addSizeRow}
                  className="h-7 text-xs gap-1"
                  title="Agregar tallas (S, M, L, XL...) a este premio"
                >
                  <Plus className="w-3 h-3" /> Usar tallas
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Este premio no tiene tallas. Define el stock total disponible.
              </p>
              <Input
                type="number"
                min="0"
                value={form.original_stock}
                onChange={e => setForm({...form, original_stock: e.target.value})}
                placeholder="Ej: 10"
              />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            El stock disponible se calcula automáticamente: stock original - canjes activos.
            No necesitas ajustar el stock manualmente.
          </p>

          <Button className="w-full" onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear premio')}
          </Button>
        </div>
        <DialogFooter className="sr-only">
          <span>Cerrar</span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
