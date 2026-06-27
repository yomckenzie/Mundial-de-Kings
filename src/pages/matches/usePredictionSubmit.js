import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { EMPTY_FORM } from '@/lib/matchCardHelpers';

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
    });
  };

  return {
    predictionsState,
    handlePredict,
    handleSubmit,
    submitPrediction,
  };
}