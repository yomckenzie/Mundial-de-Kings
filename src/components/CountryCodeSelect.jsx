import React, { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_CODES, DEFAULT_DIAL_CODE } from '@/lib/countryCodes';
import { Search } from 'lucide-react';

export default function CountryCodeSelect({ value, onChange, id = 'phone-country' }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRY_CODES;
    return COUNTRY_CODES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.includes(q) ||
      c.iso.toLowerCase().includes(q)
    );
  }, [search]);

  const current = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];

  return (
    <Select
      value={value || DEFAULT_DIAL_CODE}
      onValueChange={(v) => { onChange(v); setSearch(''); }}
    >
      <SelectTrigger id={id} className="w-[88px] sm:w-[110px] shrink-0 px-1.5 sm:px-2 [&>span]:line-clamp-1" aria-label="Código de país">
        <SelectValue>
          <span className="flex items-center gap-1">
            <span aria-hidden="true">{current.flag}</span>
            <span className="font-mono">{current.code}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <div className="sticky top-0 z-10 bg-popover px-2 py-1.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar país…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md border border-input bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Buscar país"
            />
          </div>
        </div>
        {filtered.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">Sin resultados</div>
        )}
        {filtered.map((c) => (
          <SelectItem key={`${c.iso}-${c.code}`} value={c.code}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true">{c.flag}</span>
              <span>{c.name}</span>
              <span className="ml-auto font-mono text-muted-foreground">{c.code}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
