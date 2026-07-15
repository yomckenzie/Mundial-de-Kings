import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mockear localStorage antes de importar el módulo
const lsStore = {};
const lsMock = {
  getItem: (k) => lsStore[k] ?? null,
  setItem: (k, v) => { lsStore[k] = String(v); },
  removeItem: (k) => { delete lsStore[k]; },
};
globalThis.localStorage = lsMock;

const { trackAndInterpolateMinute } = await import('./sportscore.js');

describe('trackAndInterpolateMinute — minutero en vivo', () => {
  beforeEach(() => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('minuto numérico simple → "67\'"', () => {
    expect(trackAndInterpolateMinute('m1', '67')).toBe("67'");
  });

  it('minuto 90+ → "90+" (sin apóstrofe)', () => {
    expect(trackAndInterpolateMinute('m1', '90+')).toBe('90+');
  });

  it('minuto 90+2 → "90+2"', () => {
    expect(trackAndInterpolateMinute('m1', '90+2')).toBe('90+2');
  });

  it('HT → "HT"', () => {
    expect(trackAndInterpolateMinute('m1', 'HT')).toBe('HT');
  });

  it('Half-time → "HT"', () => {
    expect(trackAndInterpolateMinute('m1', 'Half-time')).toBe('HT');
  });

  it('null liveMinute y sin tracking previo → null', () => {
    expect(trackAndInterpolateMinute('m1', null)).toBe(null);
  });

  it('FT → "Finalizado" y limpia localStorage', () => {
    lsStore['chessking_match_minute_m1'] = JSON.stringify({ phase: 'ET', lastSeenAt: Date.now(), lastSeenMinute: 95 });
    expect(trackAndInterpolateMinute('m1', 'FT')).toBe('Finalizado');
    expect(lsStore['chessking_match_minute_m1']).toBeUndefined();
  });
});

describe('trackAndInterpolateMinute — interpolación ET', () => {
  beforeEach(() => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
  });

  it('ET fijo entre polls → avanza el minutero con el tiempo', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    // 1er poll: llega "ET" + lastIncidentMinute=92 → guardamos 92
    expect(trackAndInterpolateMinute('m1', 'ET', 92)).toBe("92'");

    // Avanzamos 3 minutos sin nuevo poll
    vi.setSystemTime(start + 3 * 60_000);
    // 2do poll: sigue "ET" + sin incident → debe avanzar 95'
    expect(trackAndInterpolateMinute('m1', 'ET', null)).toBe("95'");

    // Avanzamos 5 minutos más
    vi.setSystemTime(start + 8 * 60_000);
    // 3er poll: sigue "ET" → debe avanzar 100'
    expect(trackAndInterpolateMinute('m1', 'ET', null)).toBe("100'");
  });

  it('ET sin lastIncidentMinute arranca desde 90', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());
    expect(trackAndInterpolateMinute('m1', 'ET', null)).toBe("90'");

    vi.advanceTimersByTime(5 * 60_000);
    expect(trackAndInterpolateMinute('m1', 'ET', null)).toBe("95'");
  });

  it('cambio de fase ET → 1H resetea tracking', () => {
    // Esto no debería pasar en la realidad pero asegura robustez
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    trackAndInterpolateMinute('m1', 'ET', 95);
    expect(lsStore['chessking_match_minute_m1']).toBeDefined();

    trackAndInterpolateMinute('m1', '46');
    const stored = JSON.parse(lsStore['chessking_match_minute_m1']);
    expect(stored.phase).toBe(null);
    expect(stored.lastSeenMinute).toBe(46);
  });
});

describe('trackAndInterpolateMinute — interpolación HT/PEN', () => {
  beforeEach(() => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
  });

  it('HT persiste como HT entre polls (no avanza)', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);
    trackAndInterpolateMinute('m1', 'HT');
    vi.advanceTimersByTime(10 * 60_000);
    expect(trackAndInterpolateMinute('m1', 'HT')).toBe('HT');
  });

  it('PEN persiste como PEN entre polls (no avanza)', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);
    trackAndInterpolateMinute('m1', 'PEN');
    vi.advanceTimersByTime(10 * 60_000);
    expect(trackAndInterpolateMinute('m1', 'PEN')).toBe('PEN');
  });
});

describe('trackAndInterpolateMinute — anclaje a incidentes', () => {
  beforeEach(() => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
  });

  it('lastIncidentMinute sobrescribe el minuto de fase fija', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());

    // Caso típico: SportScore devuelve "ET" fijo, pero el último incident está en 113'.
    // Sin anclaje, mostraría "90'", lo cual está mal.
    // Con anclaje, debe mostrar "113'".
    expect(trackAndInterpolateMinute('m1', 'ET', 113)).toBe("113'");
  });

  it('lastIncidentMinute no sobrescribe si es menor que el minuto de fase', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());

    // Si el incident está en 88 y la fase es ET (90), el minutero debe ser 90,
    // no 88 (porque el incident ocurrió antes del ET).
    expect(trackAndInterpolateMinute('m1', 'ET', 88)).toBe("90'");
  });
});