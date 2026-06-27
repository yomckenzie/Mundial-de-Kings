import { m } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } }
};

/**
 * Buscador admin (Instagram o email). Insensible a mayúsculas/acentos.
 */
export function RankingSearch({ value, onChange, matchCount }) {
  return (
    <m.div variants={itemVariants}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar usuario por Instagram o email…"
          className="pl-9 pr-9"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {value.trim() && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {matchCount} coincidencia{matchCount !== 1 ? 's' : ''}
        </p>
      )}
    </m.div>
  );
}