import { Check } from 'lucide-react';

/**
 * Celda individual del carrusel del ImagePickerDialog: muestra la imagen
 * del sistema con overlay, botón de selección y metadata.
 */
export function ImagePickerItem({ img, onSelect }) {
  return (
    <div className="relative h-full shrink-0">
      <button
        type="button"
        onClick={() => onSelect(img.publicUrl, img.name)}
        className="group relative block w-full h-full p-0 border-0 cursor-pointer"
        title={img.name}
      >
        <img
          src={img.publicUrl}
          alt={img.name}
          loading="eager"
          decoding="sync"
          draggable={false}
          className="block w-full h-full object-contain pointer-events-none group-hover:scale-[1.02] transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-90" />
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center shadow-2xl">
            <Check className="w-5 h-5" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
          <p className="text-sm font-semibold truncate text-white">{img.name}</p>
          <div className="flex items-center justify-between text-[11px] text-white/80">
            {img.metadata?.size && (
              <span>{(img.metadata.size / 1024).toFixed(0)} KB</span>
            )}
            {img.created_at && (
              <span>{new Date(img.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}