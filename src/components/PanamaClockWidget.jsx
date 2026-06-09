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

// Obtiene los componentes de fecha/hora en la zona horaria de Panamá (UTC-5),
// independientemente de la zona horaria del dispositivo. Usa Intl.DateTimeFormat
// con timeZone: 'America/Panama' (Panamá no usa horario de verano).
function getPanamaParts() {
  const formatter = new Intl.DateTimeFormat('es-PA', {
    timeZone: 'America/Panama',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value;
  // En formato 12h, Intl separa el "AM"/"PM" como dayPeriod en algunos locales
  // o lo concatena. Lo extraemos explícitamente para mayor control.
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || '';
  let hours = parseInt(get('hour'), 10) || 0;
  // Si la hora es 0 en formato 12h, mostrarla como 12 (medianoche)
  if (hours === 0) hours = 12;
  return {
    hours,
    minutes: parseInt(get('minute'), 10) || 0,
    seconds: parseInt(get('second'), 10) || 0,
    day: parseInt(get('day'), 10) || 1,
    month: parseInt(get('month'), 10) || 1,
    year: parseInt(get('year'), 10) || 2026,
    weekday: get('weekday') || '',
    dayPeriod,
  };
}

function getInitialTime() {
  const p = getPanamaParts();
  return {
    time: `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)} ${p.dayPeriod}`,
    date: `${p.weekday} ${p.day} ${MONTH_NAMES[p.month - 1]} ${p.year}`,
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
      const p = getPanamaParts();

      setTime(`${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)} ${p.dayPeriod}`);
      setDate(`${p.weekday} ${p.day} ${MONTH_NAMES[p.month - 1]} ${p.year}`);

      const parts = diffParts(FIRST_MATCH_UTC, Date.now());
      setCountdown(parts);
      setStarted(parts.diff === 0);
    };
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 sm:gap-3 bg-primary text-primary-foreground px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-mono">
      <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="font-bold text-sm sm:text-base tracking-wider">{time}</span>
        <span className="text-[10px] sm:text-xs text-primary-foreground/70 hidden xs:inline sm:inline">{date} · Panamá</span>
      </div>

      <div className="w-px h-5 sm:h-7 bg-primary-foreground/30" />

      <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
      <div className="flex flex-col leading-tight">
        {started ? (
          <span className="font-bold text-sm sm:text-base tracking-wider animate-pulse">¡EN VIVO!</span>
        ) : (
          <span className="font-bold text-sm sm:text-base tracking-wider">
            -{countdown.days}d {pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}
          </span>
        )}
        <span className="text-[10px] sm:text-xs text-primary-foreground/70 hidden sm:inline">
          {started ? 'desde el 11 jun' : 'al 11 jun · México vs Sudáfrica'}
        </span>
      </div>
    </div>
  );
}
