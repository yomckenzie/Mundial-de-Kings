import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function PanamaClockWidget() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const panamaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Panama' }));

      const hh = String(panamaTime.getHours()).padStart(2, '0');
      const mm = String(panamaTime.getMinutes()).padStart(2, '0');
      const ss = String(panamaTime.getSeconds()).padStart(2, '0');
      setTime(`${hh}:${mm}:${ss}`);

      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      setDate(`${dayNames[panamaTime.getDay()]} ${panamaTime.getDate()} ${monthNames[panamaTime.getMonth()]} ${panamaTime.getFullYear()}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-mono">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="font-bold text-base tracking-wider">{time}</span>
        <span className="text-xs text-primary-foreground/70">{date} · Panamá</span>
      </div>
    </div>
  );
}