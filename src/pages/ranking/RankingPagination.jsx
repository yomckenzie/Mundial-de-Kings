import { m } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } }
};

/**
 * Paginación del ranking. Muestra hasta 5 botones de página con ventana
 * alrededor del actual y flechas Anterior/Siguiente.
 */
export function RankingPagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <m.div
      className="flex items-center justify-center gap-3"
      variants={itemVariants}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        className="gap-1.5 px-4"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Anterior</span>
      </Button>
      <div className="flex items-center gap-1">
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let pageNum;
          if (totalPages <= 5) {
            pageNum = i;
          } else if (page < 3) {
            pageNum = i;
          } else if (page > totalPages - 3) {
            pageNum = totalPages - 5 + i;
          } else {
            pageNum = page - 2 + i;
          }
          return (
            <Button
              key={pageNum}
              variant={page === pageNum ? 'default' : 'ghost'}
              size="sm"
              className={`w-9 h-9 p-0 text-sm font-bold transition-all ${
                page === pageNum
                  ? 'bg-foreground text-background hover:bg-foreground/80 shadow-lg shadow-foreground/20 scale-110'
                  : ''
              }`}
              onClick={() => onPageChange(pageNum)}
            >
              {pageNum + 1}
            </Button>
          );
        })}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
        className="gap-1.5 px-4"
      >
        <span className="hidden sm:inline">Siguiente</span>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </m.div>
  );
}