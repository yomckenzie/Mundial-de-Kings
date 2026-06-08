import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, Download, UserPlus } from 'lucide-react';

export default function UserSearchBar({ search, showFilters, hasActiveFilters, onSearchChange, onToggleFilters, onExport, onCustomReferrer }) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          name="user-search"
          placeholder="Buscar por nombre, cédula, correo o Instagram..."
          className="pl-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <Button size="sm" variant={showFilters ? 'default' : 'outline'} onClick={onToggleFilters} className="gap-1.5">
        <Filter className="w-4 h-4" />
        Filtros
        {hasActiveFilters && <span className="bg-secondary text-secondary-foreground rounded-full text-xs w-4 h-4 flex items-center justify-center">!</span>}
      </Button>
      <Button size="sm" variant="outline" onClick={onExport} className="gap-1.5">
        <Download className="w-4 h-4" />
        CSV
      </Button>
      <Button size="sm" variant="default" onClick={onCustomReferrer} className="gap-1.5">
        <UserPlus className="w-4 h-4" />
        Referidor
      </Button>
    </div>
  );
}
