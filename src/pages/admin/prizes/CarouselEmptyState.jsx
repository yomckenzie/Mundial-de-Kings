import { Plus, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ImagePickerDialog from './ImagePickerDialog';

/**
 * Placeholder que se muestra cuando el carrusel no tiene imágenes.
 * Permite subir una imagen nueva o elegir una del sistema.
 */
export function CarouselEmptyState({ uploading, disabled, onUploadClick, onSystemPick }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/30 border-2 border-dashed border-border">
      <Plus className="w-12 h-12 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">Aún no has agregado imágenes</p>
      <div className="flex gap-1.5 mt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onUploadClick}
          disabled={uploading || disabled}
          className="h-8 text-xs gap-1"
        >
          <Upload className="w-3.5 h-3.5" /> Subir imagen
        </Button>
        <ImagePickerDialog
          onSelect={onSystemPick}
          trigger={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-8 text-xs gap-1"
            >
              <ImageIcon className="w-3.5 h-3.5" /> Del sistema
            </Button>
          }
        />
      </div>
      {uploading && <p className="text-[10px] text-muted-foreground">Subiendo...</p>}
    </div>
  );
}