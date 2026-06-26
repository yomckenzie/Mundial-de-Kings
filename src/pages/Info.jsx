import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { BookOpen, Pencil, Save, X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const SETTING_KEY = 'info_sections';

// Versión del schema de DEFAULT_SECTIONS. Cuando cambia, loadSections()
// sincroniza el contenido de las secciones default con el código actual.
// Si un admin personaliza una sección desde el editor de Info, esa
// personalización se preserva en deployments futuros con la misma versión.
const DEFAULT_SECTIONS_VERSION = '2026-06-26';

const DEFAULT_SECTIONS = [
  {
    id: 'participate',
    title: 'Participar',
    content: `Para participar en Mundial de Kings debes:

• Seguir la cuenta de Instagram @chesskingla
• Seguir la cuenta de TikTok @chesskingla
• Unirte al canal oficial de Instagram "No Rules" de Chessking
• Crear una cuenta en la plataforma con tus datos personales

Solicitaremos tu nombre, correo electrónico, número de teléfono, usuario de Instagram y TikTok para validar que cumples con los requisitos de participación y poder enviarte actualizaciones importantes sobre el concurso.

También solicitaremos tu número de cédula con el único propósito de garantizar una sola cuenta por persona y validar la entrega de premios. La cédula presentada al reclamar el premio deberá coincidir con la registrada en la plataforma.

Tu información será manejada de forma confidencial y no será visible públicamente ni compartida con terceros, conforme a la Ley 81 de Protección de Datos Personales de Panamá.`
  },
  {
    id: 'how_to_win',
    title: 'Ganar',
    content: `Después de crear tu cuenta en la plataforma, podrás realizar pronósticos diarios de los partidos del Mundial.

• Los partidos se habilitarán 24 horas antes de cada encuentro
• Los pronósticos se cerrarán automáticamente al iniciar el partido
• Cada pronóstico se compone de 3 picks independientes, todos obligatorios:
  1. Quién gana (Local / Empate / Visitante) → +50 pts si aciertas
  2. Cómo gana (90 minutos / Tiempo extra / Penales) → +50 pts si aciertas
  3. Marcador de penales (solo si elegiste Penales) → +50 pts si aciertas

Una vez guardes tu pronóstico, este quedará registrado automáticamente en tu perfil.

Por cada pick correcto acumularás 50 puntos. Máximo 150 puntos por partido.

Los puntos podrán reflejarse hasta 24 horas después de finalizar el partido y confirmarse el resultado oficial.

En la sección "Mi Perfil" podrás ver:
• Historial de pronósticos realizados
• Desglose por pick (ganador / método / penales)
• Puntos acumulados

Ten en cuenta que debes cumplir los requisitos mencionados anteriormente, seguirnos y unirte a nuestro canal.
Revisaremos que cumplas las condiciones en caso que aciertes.`
  },
  {
    id: 'how_to_redeem',
    title: 'Canjear Premios',
    content: `Ve a la sección de Premios.

Una vez acumules los puntos necesarios, podrás canjear el producto de tu preferencia según la cantidad de puntos requeridos para cada premio.

• Selecciona el producto que deseas canjear
• Nuestro equipo revisará tu solicitud y validará que cumplas con todos los requisitos de participación
• Una vez aprobada, te contactaremos vía WhatsApp con las instrucciones para retirar tu premio

Ten en cuenta que los premios requieren preparación previa para su entrega. Los retiros se realizarán únicamente los días sábado y domingo.

Si resultas ganador un viernes, sábado o domingo, tu premio podrá retirarse el siguiente fin de semana, para darnos tiempo de prepararlo correctamente.

Cuando ganes, recibirás todas las instrucciones necesarias de forma clara y detallada.`
  },
  {
    id: 'extra_points',
    title: 'Obtener puntos Extra',
    content: `¿Quieres obtener puntos extra?

Mantente conectado a nuestras redes sociales y pendiente de todas nuestras publicaciones.
Durante el Mundial estaremos realizando dinámicas, retos y actividades especiales donde podrás ganar puntos adicionales para canjear más premios.
Síguenos, participa y aumenta tus posibilidades de ganar.`
  },
  {
    id: 'referrals',
    title: 'Sistema de Referidos',
    content: `Invita a tus amigos y gana puntos extra por cada persona que se registre con tu código.

¿Cómo funciona?

• Cada usuario tiene un código de referido único.
• Puedes encontrar tu código en tu perfil, en la pestaña "Referidos".
• Comparte tu código con tus amigos para que lo ingresen al registrarse.

¿Cuánto gano?

• +10 puntos por cada amigo que se registre con tu código.
• +5 puntos adicionales cada vez que un amigo que referiste acierte un pronóstico.

¿Dónde veo mis referidos?

• En tu perfil, en la pestaña "Referidos" puedes ver:
  - Tu código de referido
  - Cuántas personas has referido
  - Los puntos que has ganado por referidos
  - La lista de tus referidos`
  },
];

export default function Info() {
  const { user } = useOutletContext();
  const isAdmin = user?.role === 'admin';

  const [sections, setSections] = useState(() => DEFAULT_SECTIONS);
  const settingIdRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({ id: null, title: '', content: '' });
  const [saving, setSaving] = useState(false);

  const loadSections = useCallback(async () => {
    const settings = await api.entities.AppSettings.list();
    const found = settings.find(r => r.key === SETTING_KEY);
    if (found) {
      let parsed = JSON.parse(found.value);
      const existingIds = new Set(parsed.map(s => s.id));
      const defaultIds = new Set(DEFAULT_SECTIONS.map(s => s.id));

      // Migración: detectar versión del schema persistido
      // Formato nuevo: { version, sections: [...] }
      // Formato viejo: [...] (array directo)
      let persistedVersion = null;
      if (!Array.isArray(parsed) && parsed.version && Array.isArray(parsed.sections)) {
        persistedVersion = parsed.version;
        parsed = parsed.sections;
      }

      // 1. Agregar secciones nuevas (migración aditiva)
      const missing = DEFAULT_SECTIONS.filter(s => !existingIds.has(s.id));
      let changed = missing.length > 0;

      // 2. Si cambió DEFAULT_SECTIONS_VERSION, sobrescribir contenido de secciones default
      //    (preserva secciones custom agregadas por admin que no están en DEFAULT_SECTIONS)
      if (persistedVersion !== DEFAULT_SECTIONS_VERSION) {
        const defaultIdSet = new Set(DEFAULT_SECTIONS.map(s => s.id));
        parsed = parsed.map(s => {
          const fresh = DEFAULT_SECTIONS.find(d => d.id === s.id);
          if (fresh) return { ...fresh };
          return s;
        });
        // Inicializar entradas default que estuvieran vacías en parsed
        DEFAULT_SECTIONS.forEach(d => {
          if (!parsed.some(s => s.id === d.id)) parsed.push({ ...d });
        });
        changed = true;
      }

      if (changed) {
        settingIdRef.current = found.id;
        const value = JSON.stringify({
          version: DEFAULT_SECTIONS_VERSION,
          sections: parsed,
        });
        await api.entities.AppSettings.update(found.id, { value });
      } else {
        settingIdRef.current = found.id;
      }
      setSections(parsed);
    } else {
      // Primer load: persistir con la versión actual
      const created = await api.entities.AppSettings.create({
        key: SETTING_KEY,
        value: JSON.stringify({
          version: DEFAULT_SECTIONS_VERSION,
          sections: DEFAULT_SECTIONS,
        }),
      });
      settingIdRef.current = created.id;
      setSections(DEFAULT_SECTIONS);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  // Escuchar sincronización desde el servidor compartido
  useEffect(() => {
    const handleSync = () => loadSections();
    window.addEventListener('db-synced', handleSync);
    return () => window.removeEventListener('db-synced', handleSync);
  }, [loadSections]);

  const persist = async (newSections) => {
    const value = JSON.stringify(newSections);
    if (settingIdRef.current) {
      await api.entities.AppSettings.update(settingIdRef.current, { value });
    } else {
      const created = await api.entities.AppSettings.create({ key: SETTING_KEY, value });
      settingIdRef.current = created.id;
    }
  };

  const startEdit = (section) => {
    setEditing({ id: section.id, title: section.title, content: section.content });
  };

  const cancelEdit = () => {
    setEditing({ id: null, title: '', content: '' });
  };

  const saveEdit = async (id) => {
    setSaving(true);
    const updated = sections.map(s => s.id === id ? { ...s, title: editing.title, content: editing.content } : s);
    await persist(updated);
    setSections(updated);
    setEditing({ id: null, title: '', content: '' });
    setSaving(false);
    toast.success('Guardado correctamente');
  };

  const addSection = async () => {
    const newSection = {
      id: `section_${Date.now()}`,
      title: 'Nueva Sección',
      content: '',
    };
    const updated = [...sections, newSection];
    await persist(updated);
    setSections(updated);
    startEdit(newSection);
  };

  const deleteSection = async (id) => {
    const updated = sections.filter(s => s.id !== id);
    await persist(updated);
    setSections(updated);
    toast.success('Sección eliminada');
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl tracking-wide">INFORMACIÓN</h1>
        {isAdmin && (
          <Button size="sm" onClick={addSection} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Nueva sección
          </Button>
        )}
      </div>

      {sections.map((section) => (
        <Card key={section.id}>
          <CardHeader className="pb-3">
            {editing.id === section.id ? (
              <Input
                value={editing.title}
                onChange={e => setEditing(d => ({ ...d, title: e.target.value }))}
                className="text-base font-semibold"
                placeholder="Título de la sección"
              />
            ) : (
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="w-5 h-5" />
                  {section.title}
                </CardTitle>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(section)} className="gap-1.5">
                      <Pencil className="w-4 h-4" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteSection(section.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {editing.id === section.id ? (
              <div className="space-y-3">
                <Textarea
                  value={editing.content}
                  onChange={e => setEditing(d => ({ ...d, content: e.target.value }))}
                  rows={8}
                  placeholder="Escribe el contenido aquí..."
                  className="resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={cancelEdit} className="gap-1.5">
                    <X className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={() => saveEdit(section.id)} disabled={saving} className="gap-1.5">
                    <Save className="w-4 h-4" />
                    Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {section.content
                  ? section.content
                  : <span className="text-muted-foreground italic">No hay contenido aún.</span>
                }
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {sections.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No hay secciones todavía.
          {isAdmin && ' Presiona "Nueva sección" para comenzar.'}
        </div>
      )}
    </div>
  );
}