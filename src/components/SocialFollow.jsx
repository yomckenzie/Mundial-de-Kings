import React from 'react';
import { Instagram, Music2 } from 'lucide-react';

const SOCIAL = [
  { title: 'Instagram', url: 'https://www.instagram.com/chesskingla', icon: Instagram },
  { title: 'Canal de Instagram', url: 'https://www.instagram.com/channel/AbYBljKVsKt5wlV2', icon: Instagram },
  { title: 'TikTok', url: 'https://www.tiktok.com/@chesskingla', icon: Music2 },
];

export default function SocialFollow() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 my-8">
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-base text-foreground mb-8">
          Recuerda seguirnos en instagram y tiktok y unirte a nuestro canal para participar
        </p>
        <div className="flex justify-center gap-8 mb-6">
          {SOCIAL.map((s, i) => (
            <div key={i} className="flex flex-col items-center">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition mb-2">
                <s.icon className="w-10 h-10 text-foreground" />
              </a>
              <p className="text-xs text-muted-foreground">{s.title}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Revisaremos que cumplas las condiciones para canjear premios
        </p>
      </div>
    </div>
  );
}