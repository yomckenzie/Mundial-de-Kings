# 🏋️ k6 Load Tests — Chess King App

Scripts de prueba de carga para la aplicación **Mundial de Kings**.

## Requisitos

- k6 v2.0.0+ instalado (incluido en `C:/Users/yomck/AppData/Local/k6/`)
- La **Supabase anon key** del proyecto (Settings → API en el dashboard de Supabase)
- (Opcional) URL de Railway si se prueba contra producción

## ⚠️  IMPORTANTE: Pasar la anon key

Los tests **requieren** `SUPABASE_ANON_KEY` para hacer consultas reales a Supabase.
Sin ella, los tests solo miden la entrega de archivos estáticos (poco representativo).

```bash
# Obtén tu anon key en:
# https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/settings/api

export SUPABASE_ANON_KEY='eyJ...'
```

## Cómo ejecutar

```bash
# 📋 Smoke test (1 VU, 30s) — verificación rápida
k6 run -e SUPABASE_ANON_KEY='eyJ...' k6-tests/smoke-test.js

# 🚀 Load test (10→50 VUs, 5min) — simulación de carga normal
k6 run -e SUPABASE_ANON_KEY='eyJ...' k6-tests/load-test.js

# 💥 Stress test (0→200 VUs, 11min) — encuentra el punto de quiebre
k6 run -e SUPABASE_ANON_KEY='eyJ...' k6-tests/stress-test.js

# ⚡ Spike test (100 VUs súbito, 1.5min) — simula pico de tráfico
k6 run -e SUPABASE_ANON_KEY='eyJ...' k6-tests/spike-test.js

# 🧪 Soak test (30 VUs, 30min) — detecta memory leaks
k6 run -e SUPABASE_ANON_KEY='eyJ...' k6-tests/soak-test.js
```

### Probar contra Railway (producción)

```bash
k6 run -e APP_URL='https://mundial-de-kings.up.railway.app' -e SUPABASE_ANON_KEY='eyJ...' k6-tests/smoke-test.js
```

### Usar el helper script

```bash
bash k6-tests/run-tests.sh smoke     # smoke test
bash k6-tests/run-tests.sh load      # load test
```

## Scripts disponibles

| Script | VUs | Duración | Propósito |
|--------|-----|----------|-----------|
| `smoke-test.js` | 1 | 30s | Verificación rápida |
| `load-test.js` | 10→50 | 5 min | Carga normal |
| `stress-test.js` | 0→200 | 11 min | Punto de quiebre |
| `spike-test.js` | 100 súbito | 1.5 min | Pico de tráfico |
| `soak-test.js` | 30 | 30 min | Memory leaks |

## Flujos probados

Cada script simula estos escenarios de usuario:

1. **Visitante anónimo** — navega Home → Ranking → Info → Partidos
2. **Usuario logueado** — login → ver partidos → hacer pronóstico → ver ranking → perfil
3. **Admin** — login admin → ver dashboard → gestionar partidos → ver usuarios

## ⚠️  Limitación importante

k6 **no ejecuta JavaScript del navegador**. Las pruebas miden:
- Tiempo de respuesta del servidor (archivos estáticos vía Railway/Vite)
- Latencia de la API REST de Supabase

Lo que **no** miden:
- Renderizado del SPA (React, lazy loading, re-renders)
- Rendimiento en el navegador del usuario
- Carga de imágenes/fuentes desde Supabase Storage

Para pruebas de rendimiento del frontend (SPA), usa **k6 browser**
(integración con Playwright) o herramientas como Lighthouse.
