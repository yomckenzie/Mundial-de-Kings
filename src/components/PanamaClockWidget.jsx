import React, { useState, useEffect } from 'react';
import { Clock, Trophy } from 'lucide-react';

const FIRST_MATCH_UTC = Date.UTC(2026, 5, 11, 19, 0, 0); // 11 jun 2026 14:00 Panamá = 19:00 UTC
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];


function diffParts(targetMs, nowMs) {
  const diff = Math.max(0, targetMs - nowMs);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { diff, days, hours, minutes, seconds };
}

const pad = (n) => {
  if (n == null || isNaN(n)) return '00';
  return String(Math.floor(n)).padStart(2, '0');
};

// Panama is UTC-5 year-round (no DST)
function getPanamaDate() {
  const now = Date.now();
  const panamaMs = now - 5 * 60 * 60 * 1000; // UTC → UTC-5
  return new Date(panamaMs);
}

function getInitialTime() {
  const panamaTime = getPanamaDate();
  return {
    time: `${pad(panamaTime.getHours())}:${pad(panamaTime.getMinutes())}:${pad(panamaTime.getSeconds())}`,
    date: `${DAY_NAMES[panamaTime.getDay()]} ${panamaTime.getDate()} ${MONTH_NAMES[panamaTime.getMonth()]} ${panamaTime.getFullYear()}`,
  };
}

function getInitialCountdown() {
  return diffParts(FIRST_MATCH_UTC, Date.now());
}

export default function PanamaClockWidget() {
  const [time, setTime] = useState(() => getInitialTime().time);
  const [date, setDate] = useState(() => getInitialTime().date);
  const [countdown, setCountdown] = useState(() => getInitialCountdown());
  const [started, setStarted] = useState(() => getInitialCountdown().diff === 0);

  useEffect(() => {
    const update = () => {
      const panamaTime = getPanamaDate();

      setTime(`${pad(panamaTime.getHours())}:${pad(panamaTime.getMinutes())}:${pad(panamaTime.getSeconds())}`);
      setDate(`${DAY_NAMES[panamaTime.getDay()]} ${panamaTime.getDate()} ${MONTH_NAMES[panamaTime.getMonth()]} ${panamaTime.getFullYear()}`);

      const parts = diffParts(FIRST_MATCH_UTC, Date.now());
      setCountdown(parts);
      setStarted(parts.diff === 0);
    };
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-mono">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="font-bold text-base tracking-wider">{time}</span>
        <span className="text-xs text-primary-foreground/70">{date} · Panamá</span>
      </div>

      <div className="w-px h-7 bg-primary-foreground/30" />

      <Trophy className="w-4 h-4 shrink-0" />
      <div className="flex flex-col leading-tight">
        {started ? (
          <span className="font-bold text-base tracking-wider animate-pulse">¡MUNDIAL EN VIVO!</span>
        ) : (
          <span className="font-bold text-base tracking-wider">
            -{countdown.days}d {pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}
          </span>
        )}
        <span className="text-xs text-primary-foreground/70">
          {started ? 'desde el 11 jun' : 'al 11 jun · México vs Sudáfrica'}
        </span>
      </div>
    </div>
  );
}
