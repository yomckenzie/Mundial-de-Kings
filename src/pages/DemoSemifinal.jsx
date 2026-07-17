import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import TeamFlag from '@/components/TeamFlag';
import { Trophy, ChevronDown, Send, Sparkles, Check } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────
// PROTOTIPO LOCAL — "Pronósticos extra" para semifinal y final.
// Nueva forma de ganar puntos: además de los 3 picks normales (ganador,
// método y marcador), en semifinal y final se habilita una sección de
// PUNTOS EXTRAS con preguntas tipo quiniela, cada una +5 pts.
//
// La Semifinal y la Final se muestran como bloques SEPARADOS, cada uno
// con su partido, sus picks y sus preguntas propias.
//
// Es una maqueta visual: NO persiste en Supabase ni evalúa resultados.
// Solo estado local + resumen al enviar. Ruta: /demo-semifinal
// ─────────────────────────────────────────────────────────────────────

const POINTS_PER_PROP = 5;

// Cada partido lleva su matchup + sus 7 preguntas extra (+5 pts c/u).
const MATCHES = [
  {
    round: 'Semifinal',
    team1: { name: 'Inglaterra', flag: '🏴' },
    team2: { name: 'Francia', flag: '🇫🇷' },
    date: 'Sábado 18 de julio · 1:00 PM',
    venue: 'Lincoln Financial Field, Philadelphia, PA',
    props: [
      { id: 'mbappe',    q: '¿Anotará Kylian Mbappé al menos un gol en tiempo regular?', options: ['Sí', 'No'] },
      { id: 'belling',   q: '¿Anotará Jude Bellingham en cualquier momento?',            options: ['Sí', 'No'] },
      { id: 'ambos',     q: '¿Ambos equipos anotarán en los 90m?',                       options: ['Sí', 'No'] },
      { id: 'primert',   q: "¿Se anotará algún gol en el primer tiempo? (45' m)",                options: ['Sí', 'No'] },
      { id: 'amarillas', q: '¿Quién recibirá más tarjetas amarillas?',                   options: ['Francia', 'Inglaterra', 'Empate'] },
      { id: 'corners',   q: '¿Qué equipo cobrará más saques de esquina?',                options: ['Francia', 'Inglaterra', 'Empate'] },
      { id: 'primergol', q: '¿Quién marcará el primer gol del partido?',                 options: ['Kylian Mbappé', 'Jude Bellingham', 'Harry Kane', 'Antoine Griezmann', 'Ninguno'] },
    ],
  },
  {
    round: 'Final',
    team1: { name: 'Argentina', flag: '🇦🇷' },
    team2: { name: 'España', flag: '🇪🇸' },
    date: 'Domingo 19 de julio · 3:00 PM',
    venue: 'MetLife Stadium, East Rutherford, NJ',
    props: [
      { id: 'messi',     q: '¿Anotará Lionel Messi al menos un gol en tiempo regular?', options: ['Sí', 'No'] },
      { id: 'yamal',     q: '¿Anotará Lamine Yamal en cualquier momento?',             options: ['Sí', 'No'] },
      { id: 'ambos',     q: '¿Ambos equipos anotarán en los 90m?',                     options: ['Sí', 'No'] },
      { id: 'primert',   q: "¿Se anotará algún gol en el primer tiempo? (45' m)",              options: ['Sí', 'No'] },
      { id: 'amarillas', q: '¿Quién recibirá más tarjetas amarillas?',                 options: ['Argentina', 'España', 'Empate'] },
      { id: 'corners',   q: '¿Qué equipo cobrará más saques de esquina?',              options: ['Argentina', 'España', 'Empate'] },
      { id: 'primergol', q: '¿Quién marcará el primer gol del partido?',               options: ['Lionel Messi', 'Lamine Yamal', 'Julián Álvarez', 'Nico Williams', 'Ninguno'] },
    ],
  },
];

// Pill amarilla "+N pts" reutilizada en toda la maqueta.
function PointsPill({ children }) {
  return (
    <span className="inline-flex items-center text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/50 rounded-full px-1.5 py-0.5 tabular-nums shrink-0 whitespace-nowrap">
      {children}
    </span>
  );
}

// Grupo de botones-opción (un solo seleccionado).
// Responsive: en móvil, las filas de 3 columnas (cols=3) se apilan a 1 columna
// para que cada botón tenga ancho cómodo sin recortar texto.
function OptionRow({ options, value, onSelect, cols }) {
  // Las clases de Tailwind son estáticas para que el JIT las detecte.
  const gridColsClass =
    cols === 1 ? 'grid-cols-1' :
    cols === 2 ? 'grid-cols-2' :
    cols === 3 ? 'grid-cols-1 sm:grid-cols-3' :
    /* 4+     */ 'grid-cols-2';
  return (
    <div className={`grid gap-1.5 ${gridColsClass}`}>
      {options.map(opt => (
        <Button
          key={opt}
          size="sm"
          variant={value === opt ? 'default' : 'outline'}
          className="h-8 text-[11px] sm:text-xs px-2 min-w-0 whitespace-nowrap"
          onClick={() => onSelect(value === opt ? null : opt)}
        >
          {opt}
        </Button>
      ))}
    </div>
  );
}

// Una tarjeta de pregunta extra.
function PropCard({ index, prop, value, onSelect }) {
  const cols = prop.options.length >= 4 ? 2 : prop.options.length;
  return (
    <div className="bg-card border border-border/60 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-snug">
          <span className="text-muted-foreground">{index}. </span>{prop.q}
        </p>
        <PointsPill>+{POINTS_PER_PROP} pts</PointsPill>
      </div>
      <OptionRow options={prop.options} value={value} onSelect={onSelect} cols={cols} />
    </div>
  );
}

// ── Bloque completo de un partido (semifinal o final), con estado propio ──
function MatchPredictionBlock({ match }) {
  const [advOpen, setAdvOpen] = useState(true);
  const [answers, setAnswers] = useState({}); // { propId: option }
  const [winner, setWinner] = useState(null);
  const [method, setMethod] = useState(null);
  const [score, setScore] = useState({ t1: '', t2: '' });

  const answeredCount = Object.values(answers).filter(Boolean).length;
  const extraPoints = answeredCount * POINTS_PER_PROP;
  const maxExtra = match.props.length * POINTS_PER_PROP;

  const setAnswer = (id, opt) => setAnswers(a => ({ ...a, [id]: opt }));

  const summary = useMemo(() => {
    const picks = [];
    if (winner) picks.push(`Ganador: ${winner === 'team1' ? match.team1.name : match.team2.name}`);
    if (method) picks.push(`Método: ${method}`);
    if (score.t1 !== '' && score.t2 !== '') picks.push(`Marcador: ${score.t1}-${score.t2}`);
    match.props.forEach((p, i) => {
      const v = answers[p.id];
      if (!v) return;
      picks.push(`${i + 1}. ${v}`);
    });
    return picks;
  }, [winner, method, score, answers, match]);

  const handleSubmit = () => {
    if (summary.length === 0) {
      toast.error('Selecciona al menos un pronóstico');
      return;
    }
    toast.success(`${match.round} enviada · +${extraPoints} pts extra posibles`, {
      description: summary.join(' · '),
      duration: 6000,
    });
  };

  return (
    <section className="space-y-3">
      {/* Rótulo del partido */}
      <div className="flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-amber-500" />
        <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wide leading-none">{match.round}</h2>
      </div>

      {/* Panel del partido */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-3 items-center gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <TeamFlag team={match.team1.name} size="lg" />
              <span className="font-bold text-sm text-center">{match.team1.name}</span>
            </div>
            <div className="flex justify-center">
              <span className="px-3 py-1.5 rounded-xl bg-muted/50 text-muted-foreground font-bold text-sm">VS</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <TeamFlag team={match.team2.name} size="lg" />
              <span className="font-bold text-sm text-center">{match.team2.name}</span>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3">{match.date}</p>
          <p className="text-center text-[11px] text-muted-foreground/80">{match.venue}</p>
        </CardContent>
      </Card>

      {/* Pronóstico principal — misma lógica que la MatchCard real (V2) */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pronóstico principal</p>

          {/* Paso 1: ¿Quién gana? */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">¿Quién gana?</p><PointsPill>+50 pts</PointsPill>
            </div>
            <OptionRow
              options={[match.team1.name, match.team2.name]}
              value={winner === 'team1' ? match.team1.name : winner === 'team2' ? match.team2.name : null}
              onSelect={(opt) => setWinner(opt === match.team1.name ? 'team1' : opt === match.team2.name ? 'team2' : null)}
              cols={2}
            />
            <p className="text-[10px] text-amber-700/90 dark:text-amber-400/80 leading-snug text-center px-1 italic">
              Si no aciertas el ganador, no sumas ningún puntaje
            </p>
          </div>

          {/* Paso 2: ¿Cómo gana? */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">¿Cómo gana?</p><PointsPill>+50 pts</PointsPill>
            </div>
            <OptionRow options={['90 min', 'T. extra', 'Penales']} value={method} onSelect={setMethod} cols={3} />
            <div className="text-[10px] text-muted-foreground/80 leading-tight text-center px-1 space-y-0.5">
              <div>90 min = 90 + tiempo de adición</div>
              <div>T. extra = 30 min adicionales</div>
              <div>Penales = definición desde los 11m</div>
            </div>
          </div>

          {/* Paso 3: Marcador — se despliega según el método elegido */}
          {(method === '90 min' || method === 'T. extra') && (
            <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">Marcador final</p><PointsPill>+100 pts</PointsPill>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <Input type="number" min="0" inputMode="numeric" className="w-11 h-9 text-center text-sm font-bold"
                  placeholder="0" value={score.t1} onChange={e => setScore(s => ({ ...s, t1: e.target.value }))} />
                <span className="text-sm font-bold">-</span>
                <Input type="number" min="0" inputMode="numeric" className="w-11 h-9 text-center text-sm font-bold"
                  placeholder="0" value={score.t2} onChange={e => setScore(s => ({ ...s, t2: e.target.value }))} />
              </div>
            </m.div>
          )}
          {method === 'Penales' && (
            <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">Penales</p><PointsPill>+100 pts</PointsPill>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <Input type="number" min="0" inputMode="numeric" className="w-11 h-9 text-center text-sm font-bold"
                  placeholder="0" value={score.t1} onChange={e => setScore(s => ({ ...s, t1: e.target.value }))} />
                <span className="text-sm font-bold">-</span>
                <Input type="number" min="0" inputMode="numeric" className="w-11 h-9 text-center text-sm font-bold"
                  placeholder="0" value={score.t2} onChange={e => setScore(s => ({ ...s, t2: e.target.value }))} />
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-tight text-center px-1">
                Suma los goles de <strong>90 min + ET + penales</strong>
              </p>
            </m.div>
          )}
          {!method && (
            <p className="text-[10px] text-muted-foreground/70 text-center italic px-1">
              Elige cómo gana para pronosticar el marcador
            </p>
          )}

          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium text-center">
            Hasta <strong>200 pts</strong> si aciertas los 3 picks
          </div>
        </CardContent>
      </Card>

      {/* OPCIONES AVANZADAS — pronósticos extra */}
      <Card className="border-amber-300/50 dark:border-amber-800/40">
        <CardContent className="p-4">
          <button
            onClick={() => setAdvOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span className="font-display text-lg uppercase tracking-wide">Puntos extras</span>
              <Badge className="border-0 bg-amber-500 text-black text-[10px]">Solo {match.round}</Badge>
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${advOpen ? 'rotate-180' : ''}`} />
          </button>

          {advOpen && (
            <m.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
              className="mt-3 space-y-2"
            >
              <p className="text-[11px] text-muted-foreground">
                Pronósticos extra para sumar más. Cada acierto vale <strong>+{POINTS_PER_PROP} pts</strong> · máximo <strong>+{maxExtra} pts</strong>.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {match.props.map((p, i) => (
                  <PropCard
                    key={p.id}
                    index={i + 1}
                    prop={p}
                    value={answers[p.id]}
                    onSelect={(opt) => setAnswer(p.id, opt)}
                  />
                ))}
              </div>
            </m.div>
          )}
        </CardContent>
      </Card>

      {/* Resumen de picks de puntos extras — visible al responder */}
      {answeredCount > 0 && (
        <Card className="border-emerald-300/50 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-950/20">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                Tus picks · puntos extra
              </p>
              <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                {answeredCount}/{match.props.length} · <span className="text-emerald-700 dark:text-emerald-400 font-medium">+{extraPoints} pts</span>
              </span>
            </div>
            <ul className="space-y-1">
              {match.props.map((p, i) => {
                const v = answers[p.id];
                return (
                  <li key={p.id} className="text-xs flex items-baseline gap-2 leading-snug">
                    <span className="text-muted-foreground/70 tabular-nums w-4 text-right shrink-0">{i + 1}.</span>
                    <span
                      className={`flex-1 min-w-0 truncate ${v ? 'text-muted-foreground/90' : 'text-muted-foreground/40 italic'}`}
                      title={p.q}
                    >
                      {p.q}
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${v ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground/40'}`}>
                      {v ? `→ ${v}` : '→ —'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Contador + Enviar (por partido) */}
      <Card className="shadow-sm">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground leading-tight">Extra respondidos</p>
            <p className="text-sm font-bold tabular-nums">
              {answeredCount}/{match.props.length} · <span className="text-amber-600 dark:text-amber-400">+{extraPoints} pts</span>
            </p>
          </div>
          <Button onClick={handleSubmit} className="gap-1.5 h-10 px-4 font-semibold">
            <Send className="w-4 h-4" />
            Enviar {match.round.toLowerCase()}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

export default function DemoSemifinal() {
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 space-y-8">
      {/* Aviso de maqueta */}
      <div className="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-300/50 dark:border-amber-800/40 rounded-lg px-3 py-2">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        <span>Prototipo local · no guarda datos ni evalúa resultados.</span>
      </div>

      {/* Encabezado general */}
      <div className="text-center">
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide leading-none">
          Pronósticos · Semifinal y Final
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Nueva forma de ganar: pronósticos extra en las fases decisivas.</p>
      </div>

      {/* Un bloque separado por partido */}
      {MATCHES.map(match => (
        <MatchPredictionBlock key={match.round} match={match} />
      ))}
    </div>
  );
}
