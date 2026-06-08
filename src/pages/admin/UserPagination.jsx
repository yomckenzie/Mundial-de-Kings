import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function UserPagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
