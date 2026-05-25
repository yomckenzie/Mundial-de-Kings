import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TrafficNote() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart2 className="w-4 h-4" />
          Tráfico y Origen de Visitas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Para ver métricas detalladas de tráfico — visitantes únicos, páginas más vistas, 
          dispositivos, países y fuentes (redes sociales, búsqueda orgánica, directo) — 
          conecta <strong>Google Analytics</strong> o <strong>Plausible Analytics</strong> a tu aplicación.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Google Analytics
            </Button>
          </a>
          <a href="https://plausible.io" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Plausible Analytics
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}