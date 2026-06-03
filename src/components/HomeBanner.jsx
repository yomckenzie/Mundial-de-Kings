import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BANNERS = [
  'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/Banner1.webp',
  'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/Banner2.webp',
  'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/Banner3.webp',
];

export default function HomeBanner() {
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % BANNERS.length);
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const goTo = (index) => {
    clearInterval(intervalRef.current);
    setCurrent(index);
  };

  const prev = () => {
    clearInterval(intervalRef.current);
    setCurrent(prev => (prev - 1 + BANNERS.length) % BANNERS.length);
  };

  const next = () => {
    clearInterval(intervalRef.current);
    setCurrent(prev => (prev + 1) % BANNERS.length);
  };

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="relative w-full rounded-xl overflow-hidden group" style={{ aspectRatio: '16/5' }}>
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
              src={BANNERS[current]}
              alt={`Banner ${current + 1}`}
              className="w-full h-full object-cover"
              // Primer banner: alta prioridad (es la imagen LCP). Resto: lazy.
              loading={current === 0 ? 'eager' : 'lazy'}
              fetchPriority={current === 0 ? 'high' : 'auto'}
              decoding="async"
            />
          </motion.div>
        </AnimatePresence>

        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        {BANNERS.length > 1 && (
          <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
            {current + 1} / {BANNERS.length}
          </div>
        )}

        {BANNERS.length > 1 && (
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

        {BANNERS.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {BANNERS.map((_, i) => (
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
    </motion.div>
  );
}