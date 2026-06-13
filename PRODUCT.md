# Product

## Register

product

## Users

Aficionados al fútbol (público general, mayormente en **Panamá**) que siguen el
Mundial de Kings y quieren competir prediciendo marcadores. La gran mayoría entra
**desde el celular**, de forma rápida y recurrente (antes de cada partido y para
revisar su puesto). Rango de edad amplio, incluyendo personas mayores → la
legibilidad y el contraste no son negociables. Segundo perfil: el **admin**, que
gestiona partidos, publica resultados, evalúa pronósticos y administra premios
desde un panel.

## Product Purpose

Gamificar el seguimiento del torneo: el usuario pronostica el marcador exacto de
cada partido, gana **100 puntos por acierto**, sube en el **ranking** (general y por
semana) y canjea puntos por **premios**. Existe un sistema de **referidos**. El éxito
se mide por participación recurrente (pronósticos enviados por partido) y por que el
usuario entienda al instante su puntaje y su posición. El estado de los partidos
(próximo → abierto → en vivo → finalizado) se automatiza para que la info esté
siempre al día.

## Brand Personality

**Deportivo y energético, pero limpio y serio.** Transmite la emoción de la
competencia mundialista sin caer en el ruido. Identidad ya establecida y a
mantener: **negro y blanco con el amarillo de la corona** como acento de marca; la
personalidad se expresa por tipografía fuerte (display condensada en mayúsculas),
jerarquía clara y detalles cuidados — **no** por agregar colores nuevos. Voz directa
y motivadora en español de Panamá.

## Anti-references

- **Casas de apuestas chillonas** (verdes/rojos saturados, banners agresivos, urgencia falsa).
- **SaaS genérico corporativo** (dashboard azul/gris sin alma, plantilla intercambiable).
- **Recargado / multicolor** (muchos acentos compitiendo, saturación).
- **Infantil** (no es un juego para niños; evitar lo caricaturesco).

## Design Principles

1. **Móvil primero, legible siempre.** Se juega en el celular: contraste alto,
   tamaños cómodos y nada que se desborde del recuadro. La claridad gana a la
   decoración.
2. **El pronóstico es el héroe.** Predecir un marcador y ver el resultado/veredicto
   debe ser la acción más obvia y rápida de cada tarjeta, con cero fricción.
3. **Energía contenida.** Deportivo y vivo, pero ordenado. El amarillo de marca
   acentúa (CTA, "en vivo", aciertos); nunca satura.
4. **Confianza, no apuestas.** Transparente con puntos, posiciones y premios; lejos
   del look agresivo de las casas de apuestas.
5. **Identidad propia.** Mantener negro/blanco + corona amarilla. La distinción
   viene de la tipografía y el detalle, no de paletas nuevas.

## Accessibility & Inclusion

- Apuntar a **WCAG AA**: cuerpo de texto ≥ 4.5:1, evitar gris claro sobre fondos
  tintados. Pensado para lectura cómoda en celular, incluyendo usuarios mayores.
- **Modo oscuro sólido** (ya existe vía toggle): debe verse impecable, con el mismo
  nivel de contraste que el claro.
- Respetar `prefers-reduced-motion` en las animaciones (framer-motion).
