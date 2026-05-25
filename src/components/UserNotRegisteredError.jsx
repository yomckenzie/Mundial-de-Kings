import React from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const UserNotRegisteredError = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted/50 p-4">
      <div className="max-w-md w-full p-8 bg-card rounded-2xl shadow-xl border border-border">
        <div className="text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Acceso Restringido</h1>
            <p className="text-muted-foreground">
              No estás registrado para usar esta aplicación. Contacta al administrador para solicitar acceso.
            </p>
          </div>
          
          <div className="p-4 bg-muted/50 rounded-xl text-sm text-muted-foreground text-left space-y-2">
            <p className="font-medium text-foreground">Posibles soluciones:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Verifica que hayas iniciado sesión con la cuenta correcta</li>
              <li>Contacta al administrador de la aplicación</li>
              <li>Intenta cerrar sesión y volver a iniciar</li>
            </ul>
          </div>

          <Link to="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Volver al inicio
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
