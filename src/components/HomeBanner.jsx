import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Upload, X, Link, ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

export default function HomeBanner() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [banners, setBanners] = useState([]);
  const [settingRecord, setSettingRecord] = useState(null);
  const [current, setCurrent] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef(null);
  const intervalRef = useRef(null);

  // Load banners from DB on mount
  const loadBanners = useCallback(() => {
    api.entities.AppSettings.list().then(records => {
      const rec = records.find(r => r.key === 'home_banners');
      if (rec) {
        setSettingRecord(rec);
        try {
          const parsed = JSON.parse(rec.value);
          if (Array.isArray(parsed) && parsed.length > 0) setBanners(parsed);
        } catch {}
      }
    });
  }, []);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  // Escuchar sincronización desde el servidor compartido
  useEffect(() => {
    const handleSync = () => loadBanners();
    window.addEventListener('db-synced', handleSync);
    return () => window.removeEventListener('db-synced', handleSync);
  }, [loadBanners]);

  // Save banners to DB
  const saveBanners = async (updated) => {
    const value = JSON.stringify(updated);
    if (settingRecord) {
      await api.entities.AppSettings.update(settingRecord.id, { key: 'home_banners', value });
    } else {
      const created = await api.entities.AppSettings.create({ key: 'home_banners', value });
      setSettingRecord(created);
    }
  };

  // Auto-slide
  useEffect(() => {
    if (banners.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [banners.length]);

  const goTo = (index) => {
    clearInterval(intervalRef.current);
    setCurrent(index);
  };

  const prev = () => {
    clearInterval(intervalRef.current);
    setCurrent(prev => (prev - 1 + banners.length) % banners.length);
  };

  const next = () => {
    clearInterval(intervalRef.current);
    setCurrent(prev => (prev + 1) % banners.length);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (banners.length >= 3) {
      toast.error('Máximo 3 banners permitidos');
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      const updated = [...banners, file_url];
      setBanners(updated);
      await saveBanners(updated);
      toast.success('Banner subido correctamente');
    } catch (err) {
      toast.error('Error al subir el banner: ' + (err.message || 'Error desconocido'));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (banners.length >= 3) {
      toast.error('Máximo 3 banners permitidos');
      return;
    }
    const updated = [...banners, url];
    setBanners(updated);
    await saveBanners(updated);
    setUrlInput('');
    setShowUrlInput(false);
    toast.success('Banner agregado desde URL');
  };

  const removeBanner = async (index) => {
    const updated = banners.filter((_, i) => i !== index);
    if (current >= updated.length) setCurrent(Math.max(0, updated.length - 1));
    setBanners(updated);
    await saveBanners(updated);
    toast.success('Banner eliminado');
  };

  // No banners and not admin → show nothing
  if (banners.length === 0 && !isAdmin) return null;

  // Admin view with no banners
  if (banners.length === 0 && isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full"
      >
        <div className="w-full rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 bg-muted/30 p-8" style={{ aspectRatio: '16/5' }}>
          <ImageIcon className="w-10 h-10 text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">Sin banners aún. Agrega hasta 3 imágenes.</p>
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current.click()} disabled={uploading}>
              <Upload className="w-4 h-4 mr-1" />
              {uploading ? 'Subiendo...' : 'Subir imagen'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowUrlInput(!showUrlInput)}>
              <Link className="w-4 h-4 mr-1" />
              Pegar URL
            </Button>
          </div>
          {showUrlInput && (
            <motion.div
              className="flex items-center gap-2 w-full max-w-sm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
            >
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://ejemplo.com/banner.jpg"
                onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
              />
              <Button size="sm" onClick={handleAddUrl}>Agregar</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="relative w-full rounded-xl overflow-hidden group" style={{ aspectRatio: '16/5' }}>
        {/* Slides */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <img
              src={banners[current]}
              alt={`Banner ${current + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.style.background = 'linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--accent)))';
              }}
            />
          </motion.div>
        </AnimatePresence>

        {/* Gradient overlay for better readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        {/* Counter badge */}
        {banners.length > 1 && (
          <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
            {current + 1} / {banners.length}
          </div>
        )}

        {/* Arrows */}
        {banners.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Dots */}
        {banners.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === current
                    ? 'bg-white w-5'
                    : 'bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <motion.div
          className="mt-3 space-y-2"
          initial={false}
        >
          {/* Toggle edit mode */}
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant={isEditing ? 'default' : 'outline'}
              onClick={() => {
                setIsEditing(!isEditing);
                setShowUrlInput(false);
              }}
              className="transition-all"
            >
              {isEditing ? 'Listo' : 'Editar Banners'}
            </Button>
          </div>

          {/* Editing tools */}
          <AnimatePresence>
            {isEditing && (
              <motion.div
                className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {/* Current banners list */}
                <div className="grid grid-cols-3 gap-2">
                  {banners.map((url, i) => (
                    <div key={i} className="relative group/item rounded-lg overflow-hidden">
                      <img
                        src={url}
                        alt={`Banner ${i + 1}`}
                        className="w-full h-16 object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentElement.style.background = 'hsl(var(--muted))';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover/item:bg-black/40 transition-all flex items-center justify-center">
                        <button
                          onClick={() => removeBanner(i)}
                          className="opacity-0 group-hover/item:opacity-100 bg-destructive text-white rounded-full p-1.5 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                        #{i + 1}
                      </div>
                    </div>
                  ))}

                  {/* Add button */}
                  {banners.length < 3 && (
                    <div className="relative flex items-center justify-center h-16 rounded-lg border-2 border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                      <div className="flex items-center gap-1">
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                        <button
                          onClick={() => fileInputRef.current.click()}
                          disabled={uploading}
                          className="p-1 hover:text-foreground transition-colors"
                          title="Subir imagen"
                        >
                          <Upload className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <span className="text-muted-foreground text-xs">|</span>
                        <button
                          onClick={() => setShowUrlInput(!showUrlInput)}
                          className="p-1 hover:text-foreground transition-colors"
                          title="Pegar URL"
                        >
                          <Link className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* URL input */}
                {showUrlInput && banners.length < 3 && (
                  <motion.div
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://ejemplo.com/banner.jpg"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                      className="h-9 text-sm"
                    />
                    <Button size="sm" onClick={handleAddUrl}>Agregar</Button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  );
}
