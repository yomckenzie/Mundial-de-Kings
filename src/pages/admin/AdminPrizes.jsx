import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Gift, X, Ruler, Image as ImageIcon, Check, Loader2, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const INITIAL = { name: '', description: '', image_url: '', points_cost: '', status: 'active', original_stock: '' };
const DEFAULT_SIZE = 'M';

export default function AdminPrizes() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(INITIAL);
  // sizes: array de { size, stock } para edición en el formulario
  const [sizeRows, setSizeRows] = useState([{ size: '', stock: '' }]);
  const [editId, setEditId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: prizes = [], isLoading } = useQuery({
    queryKey: ['admin-prizes'],
    queryFn: () => api.entities.Prize.list('-created_date'),
  });

  const savePrize = useMutation({
    mutationFn: async (data) => {
      const sizesObj = {};
      let allEmpty = true;
      sizeRows.forEach(row => {
        const size = row.size.trim().toUpperCase();
        if (size) {
          sizesObj[size] = Number(row.stock) || 0;
          allEmpty = false;
        }
      });

      // Calcular stock original
      let totalStock;
      if (!allEmpty) {
        totalStock = Object.values(sizesObj).reduce((sum, s) => sum + s, 0);
      } else {
        totalStock = Number(data.original_stock) || 0;
      }

      const payload = {
        name: data.name,
        description: data.description,
        image_url: data.image_url,
        points_cost: Number(data.points_cost),
        status: data.status,
        // Guardar como original_stock/original_sizes para stock dinámico
        original_sizes: allEmpty ? null : sizesObj,
        original_stock: totalStock,
      };
      // No incluimos sizes ni units_available en el payload —
      // el stock disponible se calcula dinámicamente desde original_stock - canjes_activos.

      if (editId) {
        return api.entities.Prize.update(editId, payload);
      }
      return api.entities.Prize.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prizes'] });
      setForm(INITIAL);
      setSizeRows([{ size: '', stock: '' }]);
      setEditId(null);
      setDialogOpen(false);
      toast.success(editId ? 'Premio actualizado' : 'Premio creado');
    },
    onError: (err) => {
      toast.error('Error al guardar: ' + (err.message || 'Error'));
    },
  });

  const deletePrize = useMutation({
    mutationFn: (id) => api.entities.Prize.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prizes'] });
      toast.success('Premio eliminado');
    },
    onError: (err) => {
      toast.error('Error al eliminar: ' + (err.message || 'Error'));
    },
  });

  const openEdit = (prize) => {
    // Usar original_sizes si existe, sino legacy sizes, sino null
    const sourceSizes = prize.original_sizes || prize.sizes || null;
    const sourceStock = prize.original_stock || prize.units_available || 0;

    setForm({
      name: prize.name,
      description: prize.description || '',
      image_url: prize.image_url || '',
      points_cost: String(prize.points_cost),
      status: prize.status,
      original_stock: String(sourceStock),
    });

    // Cargar tallas desde original_sizes o sizes
    if (sourceSizes && typeof sourceSizes === 'object' && Object.keys(sourceSizes).length > 0) {
      const rows = Object.entries(sourceSizes).map(([size, stock]) => ({
        size,
        stock: String(stock),
      }));
      setSizeRows(rows);
    } else {
      // Sin tallas: fila vacía
      setSizeRows([{ size: '', stock: '' }]);
    }

    setEditId(prize.id);
    setDialogOpen(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5MB');
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, image_url: file_url }));
      setUploading(false);
      toast.success('Imagen subida');
    } catch (err) {
      setUploading(false);
      toast.error(err.message || 'Error al subir la imagen. Verifica que el bucket "banners" exista en Supabase.');
      // Limpiar el input file para poder reintentar con el mismo archivo
      e.target.value = '';
    }
  };

  const addSizeRow = () => {
    setSizeRows(prev => [...prev, { size: '', stock: '' }]);
  };

  const removeSizeRow = (index) => {
    setSizeRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateSizeRow = (index, field, value) => {
    setSizeRows(prev => prev.map((row, i) =>
      i === index ? { ...row, [field]: value } : row
    ));
  };

  const clearForm = () => {
    setForm(INITIAL);
    setSizeRows([{ size: '', stock: '' }]);
    setEditId(null);
  };

  const hasAnySizeData = sizeRows.some(r => r.size.trim() !== '');
  const computedTotal = hasAnySizeData
    ? sizeRows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0)
    : (Number(form.original_stock) || 0);

  // Calcular total de unidades para mostrar en lista
  const computeTotalUnits = (prize) => {
    if (prize.sizes && typeof prize.sizes === 'object') {
      return Object.values(prize.sizes).reduce((sum, s) => sum + (Number(s) || 0), 0);
    }
    return prize.units_available || 0;
  };

  if (isLoading) return <p className="text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) clearForm(); }}>
        <DialogTrigger asChild>
          <Button className="gap-2"><Plus className="w-4 h-4" /> Crear Premio</Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Premio' : 'Nuevo Premio'}</DialogTitle>
            <DialogDescription className="sr-only">Formulario para crear o editar un premio del catálogo.</DialogDescription>
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
              <Label>Imagen (máx 5MB)</Label>
              <div className="flex gap-2">
                <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="flex-1" />
                <ImagePickerDialog
                  onSelect={(url) => setForm(prev => ({ ...prev, image_url: url }))}
                />
              </div>
              {uploading && <p className="text-xs text-muted-foreground mt-1">Subiendo imagen...</p>}
              {form.image_url && (
                <div className="mt-3 relative group rounded-lg overflow-hidden border border-border bg-muted/30">
                  <img src={form.image_url} alt="Vista previa" loading="lazy" decoding="async" className="w-full h-48 object-contain" />
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, image_url: '' }))}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs hover:bg-black/80 cursor-pointer"
                    aria-label="Eliminar imagen"
                  >
                    ✕
                  </button>
                </div>
              )}
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

            {/* ─── Tallas y Stock ─── */}
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
                Define las tallas disponibles y su stock. Si el premio no tiene tallas, usa el campo "Unidades totales" de abajo.
              </p>

              {sizeRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Talla (S, M, L, XL...)"
                    value={row.size}
                    onChange={(e) => updateSizeRow(i, 'size', e.target.value)}
                    className="flex-1 h-9 text-sm"
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Stock"
                    value={row.stock}
                    onChange={(e) => updateSizeRow(i, 'stock', e.target.value)}
                    className="w-20 h-9 text-sm text-center"
                  />
                  {sizeRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSizeRow(i)}
                      className="w-7 h-7 rounded-md hover:bg-destructive/10 text-destructive flex items-center justify-center shrink-0 transition-colors"
                      aria-label="Eliminar talla"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <div className="text-xs text-muted-foreground text-right pt-1 border-t border-border/50">
                Total: {computedTotal} unidades
              </div>
            </div>

            {/* Stock directo (cuando NO hay tallas) */}
            {!hasAnySizeData && (
              <div>
                <Label>Unidades totales (stock original)</Label>
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

            <Button className="w-full" onClick={() => savePrize.mutate(form)} disabled={savePrize.isPending}>
              {savePrize.isPending ? 'Guardando...' : (editId ? 'Actualizar premio' : 'Crear premio')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {prizes.map(p => {
          const totalUnits = computeTotalUnits(p);
          const hasSizes = p.sizes && typeof p.sizes === 'object' && Object.keys(p.sizes).length > 0;
          return (
            <Card key={p.id}>
              <CardContent className="p-3 flex items-center gap-3">
                {p.image_url ? (
                  <button
                    type="button"
                    aria-label={`Abrir imagen de ${p.name}`}
                    className="w-14 h-14 rounded overflow-hidden cursor-pointer p-0 border-0 shrink-0"
                    onClick={() => window.open(p.image_url, '_blank')}
                  >
                    <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover hover:scale-110 transition-transform duration-200" />
                  </button>
                ) : (
                  <div className="w-14 h-14 rounded bg-muted flex items-center justify-center shrink-0">
                    <Gift className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{p.name}</p>
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                      {p.status === 'active' ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.points_cost} pts · {totalUnits} unidades</p>
                  {hasSizes && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(p.sizes).map(([size, stock]) => (
                        <Badge key={size} variant="outline" className="text-[10px] px-1.5 py-0">
                          {size}: {stock}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar "${p.name}" definitivamente?`)) {
                        deletePrize.mutate(p.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ImagePickerDialog — galería de imágenes ya subidas al bucket 'banners'
 * Permite elegir una existente sin tener que volver a subir el archivo.
 */
function ImagePickerDialog({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  const loadImages = async () => {
    setLoading(true);
    try {
      const list = await api.integrations.Core.ListFiles({ bucket: 'banners' });
      // Ordenar por nombre (estable) o por fecha si está disponible
      const sorted = [...(list || [])].sort((a, b) => {
        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return db - da; // más recientes primero
      });
      setImages(sorted);
      setPage(1);
    } catch {
      toast.error('Error al cargar las imágenes del sistema');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (o) => {
    setOpen(o);
    if (o) loadImages();
    if (!o) { setSearch(''); setPage(1); }
  };

  const handleSelect = (url, name) => {
    onSelect(url);
    setOpen(false);
    toast.success(`Imagen "${name}" seleccionada`);
  };

  // Filtrar por búsqueda
  const filtered = search.trim()
    ? images.filter(img => (img.name || '').toLowerCase().includes(search.toLowerCase()))
    : images;

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0">
          <ImageIcon className="w-4 h-4" />
          Sistema
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Imágenes del sistema
          </DialogTitle>
          <DialogDescription>
            Selecciona una imagen ya subida al sistema. También puedes subir una nueva usando el botón "Subir archivo".
          </DialogDescription>
        </DialogHeader>

        {/* Barra de búsqueda + acciones */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={loadImages} disabled={loading} className="gap-1.5 h-9 text-xs shrink-0">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>

        {/* Contador */}
        {!loading && (
          <p className="text-xs text-muted-foreground mb-2">
            {filtered.length === images.length
              ? `${images.length} imagen${images.length === 1 ? '' : 'es'} en total`
              : `${filtered.length} de ${images.length} imagen${images.length === 1 ? '' : 'es'}`}
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[55vh] overflow-y-auto p-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <ImageIcon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">No hay imágenes en el sistema.</p>
            <p className="text-xs text-muted-foreground/60">Sube una imagen usando el botón "Subir archivo" del formulario.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Sin resultados para "{search}"</p>
            <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Limpiar búsqueda</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[55vh] overflow-y-auto p-1">
              {pageItems.map((img) => (
                <button
                  key={img.id || img.name}
                  type="button"
                  onClick={() => handleSelect(img.publicUrl, img.name)}
                  className="group relative aspect-[4/3] rounded-lg overflow-hidden border-2 border-border bg-muted hover:border-foreground transition-all cursor-pointer p-0"
                  title={img.name}
                >
                  <img
                    src={img.publicUrl}
                    alt={img.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full bg-white/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                      <Check className="w-5 h-5 text-foreground" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-2 pt-6">
                    <p className="text-[11px] text-white truncate font-medium leading-tight">{img.name}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  Página {safePage} de {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="h-8 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="h-8 text-xs"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}