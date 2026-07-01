import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import PrizeFormDialog from './prizes/PrizeFormDialog';
import PrizeCard from './prizes/PrizeCard';

/**
 * Orchestrator del CRUD de premios. La UI vive en subcomponentes:
 *   - prizes/PrizeFormDialog.jsx  → diálogo crear/editar
 *   - prizes/PrizeCard.jsx        → tarjeta por premio en la lista
 *   - prizes/ImagePickerDialog.jsx → galería de imágenes del bucket 'banners'
 */
export default function AdminPrizes() {
  const queryClient = useQueryClient();

  // Estado del diálogo: 'closed' | { mode: 'create' } | { mode: 'edit', prize }
  // Centralizado aquí para que un único PrizeFormDialog atienda ambos modos.
  const [dialogState, setDialogState] = useState({ mode: 'closed' });

  const { data: prizes = [], isLoading } = useQuery({
    queryKey: ['admin-prizes'],
    queryFn: () => api.entities.Prize.list('-created_date'),
  });

  const createPrize = useMutation({
    mutationFn: (payload) => api.entities.Prize.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prizes'] });
      queryClient.invalidateQueries({ queryKey: ['prizes-public'] });
      toast.success('Premio creado');
      setDialogState({ mode: 'closed' });
    },
    onError: (err) => {
      const msg = String(err?.message || err || 'Error');
      // Mensaje específico si es RLS (permisos)
      if (/row-level security|permission denied|violates row-level/i.test(msg)) {
        toast.error(
          'Permisos insuficientes: tu cuenta admin no tiene rol en Supabase. ' +
          'Ejecuta esto en el SQL editor de Supabase:\n' +
          'UPDATE auth.users SET raw_app_meta_data = \'{"role":"admin"}\'::jsonb ' +
          'WHERE email = \'admin@chessking.com\';',
          { duration: 12000 }
        );
      } else {
        toast.error('Error al guardar: ' + msg);
      }
    },
  });

  const updatePrize = useMutation({
    mutationFn: ({ id, payload }) => api.entities.Prize.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prizes'] });
      queryClient.invalidateQueries({ queryKey: ['prizes-public'] });
      toast.success('Premio actualizado');
      setDialogState({ mode: 'closed' });
    },
    onError: (err) => {
      const msg = String(err?.message || err || 'Error');
      if (/row-level security|permission denied|violates row-level/i.test(msg)) {
        toast.error(
          'Permisos insuficientes: ejecuta en Supabase SQL editor: ' +
          'UPDATE auth.users SET raw_app_meta_data = \'{"role":"admin"}\'::jsonb ' +
          'WHERE email = \'admin@chessking.com\';',
          { duration: 12000 }
        );
      } else {
        toast.error('Error al actualizar: ' + msg);
      }
    },
  });

  const deletePrize = useMutation({
    mutationFn: (id) => api.entities.Prize.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prizes'] });
      queryClient.invalidateQueries({ queryKey: ['prizes-public'] });
      toast.success('Premio eliminado');
    },
    onError: (err) => {
      const msg = String(err?.message || err || 'Error');
      if (/row-level security|permission denied|violates row-level/i.test(msg)) {
        toast.error(
          'Permisos insuficientes: ejecuta en Supabase SQL editor: ' +
          'UPDATE auth.users SET raw_app_meta_data = \'{"role":"admin"}\'::jsonb ' +
          'WHERE email = \'admin@chessking.com\';',
          { duration: 12000 }
        );
      } else {
        toast.error('Error al eliminar: ' + msg);
      }
    },
  });

  const handleSubmit = (payload, id) => {
    if (id) {
      updatePrize.mutate({ id, payload });
    } else {
      createPrize.mutate(payload);
    }
  };

  if (isLoading) return <p className="text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {prizes.length} premio{prizes.length === 1 ? '' : 's'} en el catálogo
        </p>
        <Button
          className="gap-2"
          onClick={() => setDialogState({ mode: 'create' })}
        >
          <Plus className="w-4 h-4" /> Crear Premio
        </Button>
      </div>

      <div className="space-y-2">
        {prizes.map(p => (
          <PrizeCard
            key={p.id}
            prize={p}
            onDelete={(id) => deletePrize.mutate(id)}
            onEdit={(prize) => setDialogState({ mode: 'edit', prize })}
          />
        ))}
      </div>

      <PrizeFormDialog
        // FIX jul 2026: key forzada por id (o 'new' en creación) para que React
        // re-monte el componente cuando se cambia entre premios. Sin esto, el
        // useState(() => buildInitialForm(initialData)) se evalúa UNA sola vez
        // en el primer mount y el form muestra los datos del primer premio
        // abierto (o EMPTY_FORM si fue 'Crear'), no los del premio actual.
        key={dialogState.mode === 'edit' ? dialogState.prize?.id : 'new'}
        open={dialogState.mode !== 'closed'}
        onOpenChange={(o) => { if (!o) setDialogState({ mode: 'closed' }); }}
        initialData={dialogState.mode === 'edit' ? dialogState.prize : null}
        onSubmit={handleSubmit}
        isPending={createPrize.isPending || updatePrize.isPending}
      />
    </div>
  );
}
