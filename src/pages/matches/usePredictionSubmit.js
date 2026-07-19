import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { EMPTY_FORM } from '@/lib/matchCardHelpers';
import { getQuestionsForMatch } from '@/lib/extraQuestions';

// v2 (metodología 3 picks con marcador exacto) se activa a partir del 28 jun
// 2026 (16avos en adelante). Antes de eso los partidos usan el formato
// legacy (1 solo pick: marcador exacto, 100 pts si aciertas).
export const V2_ACTIVATION_DATE = '2026-06-28';
export const isV2Match = (m) => {
  return !!m?.match_date && m.match_date >= V2_ACTIVATION_DATE;
};

/**
 * Hook que encapsula el estado del formulario de predicción y la lógica de
 * envío (v1 legacy vs v2 con 3 picks). Devuelve:
 *   - predictionsState:  { [matchId]: formData }
 *   - handlePredict:     (matchId, field, value) → actualiza un campo
 *   - handleSubmit:      (data) → valida + dispara la mutación
 *   - submitPrediction:  useMutation result (isPending, etc.)
 *   - submitExtrasOnly:  useMutation que actualiza SOLO los `extra_answers`
 *                        de una predicción existente. Para usuarios que
 *                        mandaron su pick principal antes del fix (botón
 *                        estaba arriba) y se quedaron sin extras.
 */
export function usePredictionSubmit({ user, matches }) {
  const queryClient = useQueryClient();
  const [predictionsState, setPredictionsState] = useState({});

  const submitPrediction = useMutation({
    mutationFn: (data) => api.entities.Prediction.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-predictions', user?.email] });
      setPredictionsState(prev => {
        // Limpiar estado local para que muestre la predicción guardada
        const next = { ...prev };
        delete next[Object.keys(prev).find(k => prev[k]?.submitted)];
        return next;
      });
      toast.success('¡Pronóstico enviado! 🏆');
    },
    onError: (err) => toast.error(err?.message || 'Error al enviar pronóstico'),
  });

  // Actualiza SOLO los extras de una predicción ya guardada. El pick principal
  // (winner/method/score) queda intacto. Se llama cuando el usuario ya mandó
  // su pronóstico antes de que el botón estuviera al final y se quedó sin
  // responder las preguntas extra. Solo aplica a partidos semifinal/final
  // (donde hay preguntas) y antes de que arranque el partido.
  const submitExtrasOnly = useMutation({
    mutationFn: ({ predictionId, extraAnswers }) =>
      api.entities.Prediction.update(predictionId, { extra_answers: extraAnswers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-predictions', user?.email] });
      setPredictionsState(prev => {
        const next = { ...prev };
        // Limpiar el flag de "extras en progreso" para este partido
        for (const k of Object.keys(next)) {
          if (next[k]?.extrasSubmitting) {
            delete next[k];
          }
        }
        return next;
      });
      toast.success('¡Puntos extra enviados! 🏆');
    },
    onError: (err) => toast.error(err?.message || 'Error al enviar puntos extra'),
  });

  // Merge con EMPTY_FORM para que el primer cambio no sobrescriba los demás campos.
  const handlePredict = (matchId, field, value) => {
    setPredictionsState(prev => ({
      ...prev,
      [matchId]: { ...EMPTY_FORM, ...(prev[matchId] || {}), [field]: value },
    }));
  };

  // Branch v1/v2 por fecha del partido:
  //   match_date >= '2026-06-28' → payload v2 (3 picks: ganador/método/marcador)
  //   match_date <  '2026-06-28' → payload v1 legacy (sólo marcador: pred_team1/pred_team2)
  const handleSubmit = (data) => {
    const match = matches.find(m => m.id === data.match_id);
    const form = predictionsState[data.match_id] || {};
    const v2 = isV2Match(match);

    // Serializar preguntas "Puntos extras" desde el form si el partido aplica.
    // Solo se incluyen las que el usuario respondió (value != null).
    // Shape: [{ id, value, other }] — `other` solo aplica si value === 'Otro'.
    const extraQuestions = getQuestionsForMatch(match);
    const extraAnswers = extraQuestions && extraQuestions.length > 0
      ? extraQuestions
          .map(q => ({
            id: q.id,
            value: form[`extra_${q.id}`] ?? null,
            other: form[`extra_other_${q.id}`] ?? null,
          }))
          .filter(a => a.value != null)
      : null;

    if (!v2) {
      // ─── LEGACY v1 (pre-28 jun): sólo marcador, 100 pts si aciertas ───
      const t1 = form.team1 ?? predictionsState[data.match_id]?.team1;
      const t2 = form.team2 ?? predictionsState[data.match_id]?.team2;
      if (t1 === '' || t1 === undefined || t2 === '' || t2 === undefined) {
        toast.error('Completa el marcador (0-0 cuenta como predicción)');
        return;
      }
      submitPrediction.mutate({
        match_id: data.match_id,
        user_email: data.user_email,
        pred_team1: Number(t1),
        pred_team2: Number(t2),
        extra_answers: extraAnswers, // null en partidos v1 sin preguntas extra
      });
      return;
    }

    // ─── v2 (>= 28 jun): 3 picks independientes ───
    if (!form.pred_winner) {
      toast.error('Elige quién gana');
      return;
    }
    if (!form.pred_method) {
      toast.error('Elige cómo gana');
      return;
    }
    if (form.pred_method === '90' || form.pred_method === 'et') {
      if (form.pred_score_team1 === '' || form.pred_score_team2 === '') {
        toast.error('Completa el marcador exacto (0-0 cuenta como predicción)');
        return;
      }
    }
    if (form.pred_method === 'pen') {
      if (form.pred_score_team1 === '' || form.pred_score_team2 === '') {
        toast.error('Completa el marcador final (suma 90 + ET + penales, 0-0 cuenta como predicción)');
        return;
      }
    }
    submitPrediction.mutate({
      match_id: data.match_id,
      user_email: data.user_email,
      // Mapear 'team1'/'team2' → '1'/'2' para compatibilidad con deriveWinner/scoreV2
      pred_winner: form.pred_winner === 'team1' ? '1' : '2',
      pred_method: form.pred_method,
      pred_score_team1: form.pred_score_team1 === '' ? null : Number(form.pred_score_team1),
      pred_score_team2: form.pred_score_team2 === '' ? null : Number(form.pred_score_team2),
      // v2 pen simplificado: un solo input suma 90+ET+pens. pred_pen_* quedan null.
      pred_pen_team1: null,
      pred_pen_team2: null,
      // Puntos extras: array de {id, value, other} o null si el partido no aplica.
      extra_answers: extraAnswers,
    });
  };

  // Envío solo de los puntos extra de una predicción existente. NO toca el
  // pick principal (winner/method/score) — solo actualiza `extra_answers` en
  // la fila correspondiente. Usado cuando el usuario ya mandó su pronóstico
  // antes del fix (botón estaba arriba) y se quedó sin responder las
  // preguntas extra. Solo aplica a partidos semifinal/final con preguntas
  // y antes de que el partido empiece (status != live/finished).
  const handleSubmitExtrasOnly = (data) => {
    const { predictionId, matchId, match } = data;
    const form = predictionsState[matchId] || {};

    const extraQuestions = getQuestionsForMatch(match);
    if (!extraQuestions || extraQuestions.length === 0) {
      toast.error('Este partido no tiene puntos extra.');
      return;
    }

    const extraAnswers = extraQuestions
      .map(q => ({
        id: q.id,
        value: form[`extra_${q.id}`] ?? null,
        other: form[`extra_other_${q.id}`] ?? null,
      }))
      .filter(a => a.value != null);

    if (extraAnswers.length === 0) {
      toast.error('Responde al menos una pregunta de puntos extra.');
      return;
    }

    submitExtrasOnly.mutate({ predictionId, extraAnswers });
    // Limpiar el flag local de "extrasSubmitting" (lo usa el UI)
    if (typeof window !== 'undefined') {
      setPredictionsState(prev => {
        const next = { ...prev };
        if (next[matchId]) delete next[matchId].extrasSubmitting;
        return next;
      });
    }
  };

  return {
    predictionsState,
    handlePredict,
    handleSubmit,
    handleSubmitExtrasOnly,
    submitPrediction,
    submitExtrasOnly,
  };
}