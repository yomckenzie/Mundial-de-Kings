import { Badge } from '@/components/ui/badge';
import { Clock, Check, X, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { getQuestionsForMatch, POINTS_PER_EXTRA } from '@/lib/extraQuestions';

const statusLabels = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  delivered: 'Entregado',
};

const statusColors = {
  pending: 'bg-secondary text-secondary-foreground',
  approved: 'bg-primary text-primary-foreground',
  delivered: 'bg-accent text-accent-foreground',
};

// Constantes de puntos v2 (deben coincidir con evaluateMatchPredictions.js)
const POINTS_WINNER = 50;
const POINTS_METHOD = 50;
const POINTS_SCORE = 100;

// Deriva el ganador real del partido (espejo de deriveWinner en evaluateMatchPredictions.js).
function deriveRealWinner(match) {
  if (!match || match.result_team1 == null || match.result_team2 == null) return null;
  if (match.result_team1 > match.result_team2) return '1';
  if (match.result_team1 < match.result_team2) return '2';
  // Empate en 90+ET: si fue a penales, decide el ganador por penales.
  if (match.result_method === 'pen' && match.penalty_score_team1 != null && match.penalty_score_team2 != null) {
    if (match.penalty_score_team1 > match.penalty_score_team2) return '1';
    if (match.penalty_score_team1 < match.penalty_score_team2) return '2';
  }
  return 'X';
}

function realMethodLabel(match) {
  if (!match?.result_method) return null;
  if (match.result_method === '90') return '90 min';
  if (match.result_method === 'et') return 'T. extra';
  if (match.result_method === 'pen') return 'Penales';
  return null;
}

function winnerTeamName(match, w) {
  if (!match) return '—';
  if (w === '1') return match.team1 || 'Local';
  if (w === '2') return match.team2 || 'Visitante';
  if (w === 'X') return 'Empate';
  return '—';
}

function PickPill({ icon, label, pts, correct }) {
  // pts: número (50/100) si el pick acertó, 0 si falló, null si no es evaluable
  let tag, color;
  if (pts != null && pts > 0) {
    tag = `+${pts}`;
    color = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  } else {
    // pts === 0 (falló) o pts === null (no evaluable: pred sin
    // winner/method, o score 90/ET cuando el partido fue a pen). En
    // ambos casos el usuario NO ganó puntos, así que mostramos 0 en rojo
    // como si hubiera perdido — sin distinguir pendiente vs perdido.
    tag = '0';
    color = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  }
  // FIX (bug ux-ambiguo-14jul-ext): el icono 🏆 sobre el equipo elegido
  // sugería premio antes de saber si acertó. Usamos ✅ solo cuando winner
  // = true; para el resto un icono neutro (👤) que comunica "lo que el
  // usuario eligió" sin connotación de premio.
  const finalIcon = icon === '🏆' && correct !== true ? '👤' : icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      <span>{finalIcon}</span>
      <span>{label}</span>
      <span className="font-bold tabular-nums">{tag}</span>
    </span>
  );
}

export function PredictionsHistory({ predictions, matchMap }) {
  if (predictions.length === 0) {
    return <p className="text-sm text-muted-foreground py-2 text-center">Sin pronósticos</p>;
  }
  return predictions.map(pred => {
    const match = matchMap[pred.match_id];
    const isV2 = pred.pred_score_team1 != null || pred.pred_score_team2 != null;

    // Picks (lo que el usuario eligió)
    const winnerLabel = pred.pred_winner === '1' ? (match?.team1 || 'Local')
      : pred.pred_winner === '2' ? (match?.team2 || 'Visitante')
      : pred.pred_winner === 'X' ? 'Empate' : null;
    const methodLabel = pred.pred_method === '90' ? '90 min'
      : pred.pred_method === 'et' ? 'T. extra'
      : pred.pred_method === 'pen' ? 'Penales' : null;
    const score = isV2
      ? `${pred.pred_score_team1}-${pred.pred_score_team2}`
      : (pred.pred_team1 != null ? `${pred.pred_team1}-${pred.pred_team2}` : null);

    // Flags correct_ del pronóstico (null si no aplica o no evaluable)
    const winnerFlag = pred.winner_correct;
    const methodFlag = pred.method_correct;
    const scoreFlag = pred.score_correct;

    const hasAnyPick = winnerLabel || methodLabel || score;

    // Resultado real (solo si el partido está finalizado)
    const hasResult = match?.status === 'finished'
      && match?.result_team1 != null
      && match?.result_team2 != null;
    const realWinner = hasResult ? deriveRealWinner(match) : null;
    const realMethodText = hasResult ? realMethodLabel(match) : null;

    // Puntos extra — solo aplica si el partido tiene preguntas configuradas
    // (semifinal/final) y el usuario envió extras.
    const questions = match ? getQuestionsForMatch(match) : null;
    const userExtras = Array.isArray(pred.extra_answers) ? pred.extra_answers : [];
    const extrasEval = (pred.extra_answers_correct && typeof pred.extra_answers_correct === 'object')
      ? pred.extra_answers_correct
      : null;
    const extrasCorrectCount = extrasEval
      ? Object.values(extrasEval).filter(v => v === true).length
      : 0;
    const extrasTotal = questions?.length ?? 0;

    return (
      <div key={pred.id} className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-muted/30 text-sm">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium truncate">{match ? `${match.team1} vs ${match.team2}` : 'Partido desconocido'}</p>

          {/* Pronóstico del usuario con mini-desglose de puntos */}
          {hasAnyPick ? (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              {isV2 ? (
                <>
                  {winnerLabel && (
                    <PickPill icon="🏆" label={winnerLabel} pts={winnerFlag === true ? POINTS_WINNER : (winnerFlag === false ? 0 : null)} correct={winnerFlag === true} />
                  )}
                  {/* FIX (bug pick-gate-15jul): ganador es GATE. Si el usuario
                      no acertó el ganador, método y marcador NO suman puntos
                      aunque coincidan por casualidad. Mostramos pts=null para
                      no sugerir premio en el perfil/dashboard del usuario. */}
                  {methodLabel && (
                    <PickPill
                      icon="⏱"
                      label={methodLabel}
                      pts={winnerFlag === false
                        ? null
                        : (methodFlag === true ? POINTS_METHOD : (methodFlag === false ? 0 : null))}
                      correct={winnerFlag === true && methodFlag === true}
                    />
                  )}
                  {score && (
                    <PickPill
                      icon="⚽"
                      label={score}
                      pts={winnerFlag === false
                        ? null
                        : (scoreFlag === true ? POINTS_SCORE : (scoreFlag === false ? 0 : null))}
                      correct={winnerFlag === true && scoreFlag === true}
                    />
                  )}
                </>
              ) : (
                score && (
                  <PickPill icon="⚽" label={score} pts={scoreFlag === true ? 100 : (scoreFlag === false ? 0 : null)} correct={scoreFlag === true} />
                )
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">Pronóstico: —</p>
          )}

          {/* Real: Ganador · Método · Marcador real */}
          {hasResult && (
            <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1.5">
              <span>Real:</span>
              <span className="font-medium text-foreground">{realWinner === '1' ? match.team1 : realWinner === '2' ? match.team2 : 'Empate'}</span>
              <span>·</span>
              <span>{realMethodText || 'Sin método publicado'}</span>
              <span>·</span>
              <span className="tabular-nums font-medium text-foreground">{match.result_team1}-{match.result_team2}</span>
            </p>
          )}

          {/* Puntos extra — semifinal/final. Lista cada pregunta con el pick
              del usuario y el resultado (✓/✗/⏳). Si el admin aún no cargó
              respuestas correctas, mostramos el pick sin evaluación. */}
          {questions && userExtras.length > 0 && (
            <details className="mt-1.5 group">
              <summary className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1 cursor-pointer select-none">
                <Trophy className="w-3 h-3" />
                Puntos extra · {extrasEval
                  ? `${extrasCorrectCount}/${extrasTotal} · +${extrasCorrectCount * POINTS_PER_EXTRA} pts`
                  : `${userExtras.length}/${extrasTotal} respondidas`}
              </summary>
              <ul className="mt-1 space-y-0.5 pl-2 border-l-2 border-amber-300/50">
                {questions.map((q, idx) => {
                  const userAns = userExtras.find(a => a.id === q.id);
                  const value = userAns?.value ?? null;
                  const flag = extrasEval?.[q.id]; // true | false | null | undefined
                  let StatusIcon = null;
                  let statusColor = 'text-muted-foreground/60';
                  if (flag === true) { StatusIcon = Check; statusColor = 'text-emerald-600 dark:text-emerald-400'; }
                  else if (flag === false) { StatusIcon = X; statusColor = 'text-red-600 dark:text-red-400'; }
                  // flag === null o undefined → pendiente, no icon
                  return (
                    <li key={q.id} className="text-[10px] flex items-baseline gap-1.5 leading-tight">
                      <span className="text-muted-foreground/70 tabular-nums w-3 text-right shrink-0">{idx + 1}.</span>
                      <span className="flex-1 min-w-0 truncate text-muted-foreground/90">
                        {value ? <><strong className="text-foreground">{value}</strong> · {q.q}</> : <em className="italic">— sin responder —</em>}
                      </span>
                      {StatusIcon ? (
                        <span className={`shrink-0 ${statusColor}`}>
                          <StatusIcon className="w-3 h-3" />
                        </span>
                      ) : (
                        <span className="shrink-0 text-muted-foreground/40 text-[9px]">⏳</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>

        {/* Total sumado (badge) */}
        <div className="shrink-0 ml-2 flex flex-col items-end gap-0.5">
          {pred.scored ? (
            pred.is_correct || (pred.points_earned || 0) > 0 ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-bold">
                +{pred.points_earned || 0}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">0</Badge>
            )
          ) : (
            <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />
          )}
          {pred.scored && (
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">pts</span>
          )}
        </div>
      </div>
    );
  });
}

export function BonusesHistory({ bonuses }) {
  if (bonuses.length === 0) {
    return <p className="text-sm text-muted-foreground py-2 text-center">Sin bonos</p>;
  }
  return bonuses.map(b => (
    <div key={b.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm">
      <div>
        <p className="text-xs font-medium">{b.reason || 'Bono'}</p>
        <p className="text-xs text-muted-foreground">
          {b.type === 'welcome' ? 'Bienvenida' : 'Otorgado por admin'}
          {b.created_date && ` · ${format(new Date(b.created_date), 'd MMM yyyy', { locale: es })}`}
        </p>
      </div>
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-bold">+{b.amount ?? b.points}</Badge>
    </div>
  ));
}

export function RedemptionsHistory({ redemptions, totalSpent }) {
  if (redemptions.length === 0) {
    return <p className="text-sm text-muted-foreground py-2 text-center">Sin canjes</p>;
  }
  return (
    <>
      {redemptions.map(r => (
        <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm">
          <div>
            <p className="text-xs font-medium">{r.prize_name}</p>
            <p className="text-xs text-muted-foreground">
              {r.created_date && format(new Date(r.created_date), 'd MMM yyyy', { locale: es })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">-{r.points_spent} pts</span>
            <Badge className={`${statusColors[r.status]} border-0 text-[10px]`}>{statusLabels[r.status]}</Badge>
          </div>
        </div>
      ))}
      {totalSpent > 0 && (
        <p className="text-xs text-muted-foreground text-right pt-1">Total gastado: <strong className="text-foreground">{totalSpent} pts</strong></p>
      )}
    </>
  );
}

export function CommissionsHistory({ commissions, matchMap, allUsers }) {
  if (commissions.length === 0) {
    return <p className="text-sm text-muted-foreground py-2 text-center">Sin comisiones</p>;
  }
  return (
    <>
      {commissions.map(c => {
        const fromUser = allUsers.find(u => u.email === c.from_email);
        return (
          <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm">
            <div>
              <p className="text-xs font-medium">{fromUser?.full_name || c.from_email}</p>
              <p className="text-xs text-muted-foreground">
                {c.match_id && matchMap[c.match_id]
                  ? `Acierto: ${matchMap[c.match_id].team1} vs ${matchMap[c.match_id].team2}`
                  : 'Registro de referido'}
                {c.created_date && ` · ${format(new Date(c.created_date), 'd MMM yyyy', { locale: es })}`}
              </p>
            </div>
            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0 text-xs font-bold">+{c.points_earned}</Badge>
          </div>
        );
      })}
    </>
  );
}
