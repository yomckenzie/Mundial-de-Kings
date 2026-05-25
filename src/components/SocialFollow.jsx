import React, { useState, useEffect, useCallback } from 'react';
import { Instagram, Music2, Pencil, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';

const SETTING_KEYS = [
  'social_header',
  'instagram1_url', 'instagram1_title',
  'instagram2_url', 'instagram2_title',
  'tiktok_url', 'tiktok_title',
];

const DEFAULTS = {
  social_header: 'Recuerda seguirnos en instagram y tiktok y unirte a nuestro canal para participar',
  instagram1_url: 'https://instagram.com',
  instagram1_title: 'Instagram 1',
  instagram2_url: 'https://instagram.com',
  instagram2_title: 'Instagram 2',
  tiktok_url: 'https://tiktok.com',
  tiktok_title: 'TikTok',
};

export default function SocialFollow() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [settings, setSettings] = useState(DEFAULTS);
  const [settingRecords, setSettingRecords] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [draft, setDraft] = useState(DEFAULTS);

  const loadSettings = useCallback(() => {
    api.entities.AppSettings.list().then((records) => {
      const map = {};
      const vals = { ...DEFAULTS };
      records.forEach((r) => {
        map[r.key] = r;
        if (r.key in vals) vals[r.key] = r.value;
      });
      setSettingRecords(map);
      setSettings(vals);
      setDraft(vals);
    });
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Escuchar sincronización desde el servidor compartido
  useEffect(() => {
    const handleSync = () => loadSettings();
    window.addEventListener('db-synced', handleSync);
    return () => window.removeEventListener('db-synced', handleSync);
  }, [loadSettings]);

  const saveSetting = async (key, value) => {
    if (settingRecords[key]) {
      await api.entities.AppSettings.update(settingRecords[key].id, { key, value });
      setSettingRecords((prev) => ({ ...prev, [key]: { ...prev[key], value } }));
    } else {
      const created = await api.entities.AppSettings.create({ key, value });
      setSettingRecords((prev) => ({ ...prev, [key]: created }));
    }
  };

  const handleSaveLinks = async () => {
    const keys = ['instagram1_url', 'instagram1_title', 'instagram2_url', 'instagram2_title', 'tiktok_url', 'tiktok_title'];
    await Promise.all(keys.map((k) => saveSetting(k, draft[k])));
    setSettings((prev) => ({ ...prev, ...draft }));
    setIsEditing(false);
  };

  const handleSaveHeader = async () => {
    await saveSetting('social_header', draft.social_header);
    setSettings((prev) => ({ ...prev, social_header: draft.social_header }));
    setEditingHeader(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-8 my-8">
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-8 flex items-start justify-center gap-2">
          {editingHeader ? (
            <div className="flex items-center gap-2 w-full max-w-md">
              <Input
                value={draft.social_header}
                onChange={(e) => setDraft((prev) => ({ ...prev, social_header: e.target.value }))}
                className="text-center"
              />
              <button onClick={handleSaveHeader} className="text-muted-foreground hover:text-foreground transition shrink-0">
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-base text-foreground">{settings.social_header}</p>
              {isAdmin && (
                <button onClick={() => setEditingHeader(true)} className="text-muted-foreground hover:text-foreground transition shrink-0 mt-1">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>

        {isAdmin && isEditing ? (
          <div className="space-y-4 mb-6">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Título Instagram 1</label>
              <Input value={draft.instagram1_title} onChange={(e) => setDraft((p) => ({ ...p, instagram1_title: e.target.value }))} placeholder="Título" />
              <label className="text-xs text-muted-foreground">URL Instagram 1</label>
              <Input value={draft.instagram1_url} onChange={(e) => setDraft((p) => ({ ...p, instagram1_url: e.target.value }))} placeholder="https://instagram.com/..." />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Título Instagram 2</label>
              <Input value={draft.instagram2_title} onChange={(e) => setDraft((p) => ({ ...p, instagram2_title: e.target.value }))} placeholder="Título" />
              <label className="text-xs text-muted-foreground">URL Instagram 2</label>
              <Input value={draft.instagram2_url} onChange={(e) => setDraft((p) => ({ ...p, instagram2_url: e.target.value }))} placeholder="https://instagram.com/..." />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Título TikTok</label>
              <Input value={draft.tiktok_title} onChange={(e) => setDraft((p) => ({ ...p, tiktok_title: e.target.value }))} placeholder="Título" />
              <label className="text-xs text-muted-foreground">URL TikTok</label>
              <Input value={draft.tiktok_url} onChange={(e) => setDraft((p) => ({ ...p, tiktok_url: e.target.value }))} placeholder="https://tiktok.com/..." />
            </div>
            <Button onClick={handleSaveLinks} className="w-full">Guardar</Button>
          </div>
        ) : (
          <>
            <div className="flex justify-center gap-8 mb-6">
              <div className="flex flex-col items-center">
                <a href={settings.instagram1_url} target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition mb-2">
                  <Instagram className="w-10 h-10 text-foreground" />
                </a>
                <p className="text-xs text-muted-foreground">{settings.instagram1_title}</p>
              </div>
              <div className="flex flex-col items-center">
                <a href={settings.instagram2_url} target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition mb-2">
                  <Instagram className="w-10 h-10 text-foreground" />
                </a>
                <p className="text-xs text-muted-foreground">{settings.instagram2_title}</p>
              </div>
              <div className="flex flex-col items-center">
                <a href={settings.tiktok_url} target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition mb-2">
                  <Music2 className="w-10 h-10 text-foreground" />
                </a>
                <p className="text-xs text-muted-foreground">{settings.tiktok_title}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Revisaremos que cumplas las condiciones para canjear premios
            </p>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => { setDraft(settings); setIsEditing(true); }}>
                Editar URLs y Títulos
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}