import { Dialog, DialogContent } from '@/components/ui/dialog';

export default function PreviewImageDialog({ prize, open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-1 bg-black/95 border-0">
        {prize && (
          <div className="relative">
            <img
              src={prize.image_url}
              alt={prize.name}
              className="w-full max-h-[75vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12 rounded-b-lg">
              <p className="text-white font-semibold text-lg">{prize.name}</p>
              <p className="text-white/70 text-sm">{prize.points_cost} pts · {prize.units_available} {prize.units_available === 1 ? 'disponible' : 'disponibles'}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
