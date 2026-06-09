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
import { Plus, Pencil, Trash2, Gift } from 'lucide-react';
import { toast } from 'sonner';

const INITIAL = { name: '', description: '', image_url: '', points_cost: '', units_available: '', status: 'active' };

export default function AdminPrizes() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(INITIAL);
  const [editId, setEditId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: prizes = [], isLoading } = useQuery({
    queryKey: ['admin-prizes'],
    queryFn: () => api.entities.Prize.list('-created_date'),
  });

  const savePrize = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, points_cost: Number(data.points_cost), units_available: Number(data.units_available) };
      if (editId) {
        return api.entities.Prize.update(editId, payload);
      }
      return api.entities.Prize.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prizes'] });
      setForm(INITIAL);
      setEditId(null);
      setDialogOpen(false);
      toast.success(editId ? 'Premio actualizado' : 'Premio creado');
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
    setForm({
      name: prize.name,
      description: prize.description || '',
      image_url: prize.image_url || '',
      points_cost: String(prize.points_cost),
      units_available: String(prize.units_available),
      status: prize.status,
    });
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
    const { file_url } = await api.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, image_url: file_url }));
    setUploading(false);
    toast.success('Imagen subida');
  };

  if (isLoading) return <p className="text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setForm(INITIAL); setEditId(null); } }}>
        <DialogTrigger asChild>
          <Button className="gap-2"><Plus className="w-4 h-4" /> Crear Premio</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Premio' : 'Nuevo Premio'}</DialogTitle>
            <DialogDescription className="sr-only">Formulario para crear o editar un premio del catálogo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><Label>Descripción</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} /></div>
            <div>
              <Label>Imagen (máx 5MB)</Label>
              <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
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
              <div><Label>Puntos para canjear</Label><Input type="number" min="0" value={form.points_cost} onChange={e => setForm({...form, points_cost: e.target.value})} /></div>
              <div><Label>Unidades disponibles</Label><Input type="number" min="0" value={form.units_available} onChange={e => setForm({...form, units_available: e.target.value})} /></div>
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
            <Button className="w-full" onClick={() => savePrize.mutate(form)} disabled={savePrize.isPending}>
              {editId ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {prizes.map(p => (
          <Card key={p.id}>
            <CardContent className="p-3 flex items-center gap-3">
              {p.image_url ? (
                <button
                  type="button"
                  aria-label={`Abrir imagen de ${p.name}`}
                  className="w-14 h-14 rounded overflow-hidden cursor-pointer p-0 border-0"
                  onClick={() => window.open(p.image_url, '_blank')}
                >
                  <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover hover:scale-110 transition-transform duration-200" />
                </button>
              ) : (
                <div className="w-14 h-14 rounded bg-muted flex items-center justify-center">
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
                <p className="text-sm text-muted-foreground">{p.points_cost} pts · {p.units_available} unidades</p>
              </div>
              <div className="flex gap-1">
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
        ))}
      </div>
    </div>
  );
}