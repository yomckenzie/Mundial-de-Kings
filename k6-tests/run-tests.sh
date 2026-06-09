#!/bin/bash
# ═══════════════════════════════════════════════════════════
# 🏋️  k6 Test Runner — Chess King App
# ═══════════════════════════════════════════════════════════
# Uso: bash k6-tests/run-tests.sh [test]
#
# Tests disponibles:
#   smoke    → 1 VU, 30s (verificación rápida)
#   load     → 10→50 VUs, 5min (carga normal)
#   stress   → 0→200 VUs, 11min (punto de quiebre)
#   spike    → 100 VUs súbito, 1.5min (pico de tráfico)
#   soak     → 30 VUs, 30min (resistencia)
#   all      → Ejecuta todos secuencialmente
# ═══════════════════════════════════════════════════════════

export K6_PATH="C:/Users/yomck/AppData/Local/k6"
export PATH="$K6_PATH:$PATH"

TEST=${1:-smoke}
K6=k6

# Verificar que k6 existe
if ! command -v $K6 &>/dev/null; then
    if [ -f "$K6_PATH/k6.exe" ]; then
        K6="$K6_PATH/k6.exe"
    else
        echo "❌ k6 no encontrado. Instálalo o ajústalo en K6_PATH"
        exit 1
    fi
fi

echo "════════════════════════════════════════"
echo "  🏋️  k6 Test Runner — Chess King App"
echo "  Test: $TEST"
echo "  k6: $($K6 version 2>&1 | head -1)"
echo "════════════════════════════════════════"
echo ""

case $TEST in
    smoke)
        $K6 run k6-tests/smoke-test.js
        ;;
    load)
        $K6 run k6-tests/load-test.js
        ;;
    stress)
        $K6 run k6-tests/stress-test.js
        ;;
    spike)
        $K6 run k6-tests/spike-test.js
        ;;
    soak)
        echo "⚠️  Soak test: 30 minutos. Ejecutar en segundo plano recomendado:"
        echo "   nohup $K6 run k6-tests/soak-test.js &"
        $K6 run k6-tests/soak-test.js
        ;;
    all)
        echo "▶️  Smoke test..."
        $K6 run k6-tests/smoke-test.js || exit 1
        echo ""
        echo "▶️  Load test..."
        $K6 run k6-tests/load-test.js || exit 1
        echo ""
        echo "▶️  Stress test..."
        $K6 run k6-tests/stress-test.js || exit 1
        echo ""
        echo "▶️  Spike test..."
        $K6 run k6-tests/spike-test.js || exit 1
        echo ""
        echo "✅ Todos los tests completados"
        ;;
    *)
        echo "Test desconocido: $TEST"
        echo "Usa: smoke, load, stress, spike, soak, o all"
        exit 1
        ;;
esac
