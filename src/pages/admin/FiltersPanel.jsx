import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export default function FiltersPanel({ filters, onFilterChange, onReset, hasActiveFilters }) {
  const setFilter = (key, value) => {
    onFilterChange(key, value);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Registro desde</Label>
            <Input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Registro hasta</Label>
            <Input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Puntos mín.</Label>
            <Input type="number" min="0" placeholder="0" value={filters.minPoints} onChange={e => setFilter('minPoints', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Puntos máx.</Label>
            <Input type="number" min="0" placeholder="∞" value={filters.maxPoints} onChange={e => setFilter('maxPoints', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aciertos mín.</Label>
            <Input type="number" min="0" placeholder="0" value={filters.minAciertos} onChange={e => setFilter('minAciertos', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aciertos máx.</Label>
            <Input type="number" min="0" placeholder="∞" value={filters.maxAciertos} onChange={e => setFilter('maxAciertos', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Canjes mín.</Label>
            <Input type="number" min="0" placeholder="0" value={filters.minCanjes} onChange={e => setFilter('minCanjes', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Canjes máx.</Label>
            <Input type="number" min="0" placeholder="∞" value={filters.maxCanjes} onChange={e => setFilter('maxCanjes', e.target.value)} />
          </div>
        </div>
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" onClick={onReset} className="gap-1.5 text-muted-foreground">
            <X className="w-3 h-3" /> Limpiar filtros
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
