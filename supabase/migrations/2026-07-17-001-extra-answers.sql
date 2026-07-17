-- Puntos Extra — Semifinal y Final
-- Almacena las respuestas extra del usuario y los flags de acierto.
-- El trigger `recalc_v2_points()` NO toca estas columnas; las maneja `evaluateMatchPredictions.js`.

-- predictions.extra_answers: array de { id, value, other }
--   id    = question id (ej: 'mbappe', 'primergol')
--   value = opción elegida cerrada ('Sí', 'Mbappé', 'Otro', etc.)
--   other = texto libre si value === 'Otro'
-- predictions.extra_answers_correct: object { [questionId]: true|false|null }
--   null = el admin aún no cargó la respuesta correcta de esa pregunta
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS extra_answers JSONB,
  ADD COLUMN IF NOT EXISTS extra_answers_correct JSONB;

-- matches.correct_extra_answers: object con respuestas correctas cargadas por el admin.
-- Para preguntas cerradas la key es el question id → string opción correcta.
-- Para preguntas con "Otro", si el admin eligió "Otro" + escribió texto,
-- también se persiste en `${q.id}_other` el texto correcto.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS correct_extra_answers JSONB;

-- Comentario documentando el shape para que sea fácil de consultar en el SQL editor.
COMMENT ON COLUMN predictions.extra_answers IS '[{"id":"mbappe","value":"Sí","other":null}, ...]';
COMMENT ON COLUMN predictions.extra_answers_correct IS '{"mbappe": true, "primergol": false, "primert": null}';
COMMENT ON COLUMN matches.correct_extra_answers IS '{"mbappe":"Sí","primergol":"Kylian Mbappé","primergol_other":null}';