import { QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';

// Inicializar la base de datos al arrancar la aplicación
// Esto asegura que los datos (incluyendo premios semilla) estén
// cargados desde localStorage antes de que cualquier query se ejecute.
db._init();

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});