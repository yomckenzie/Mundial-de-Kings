// snapshot-dashboard.mjs
// Toma screenshot del dashboard de admin para verificar el widget StockAlertsCard

const { WebSocket } = globalThis;
const CDP_HTTP = 'http://localhost:9222';
const APP_URL = 'http://localhost:5173';
const ADMIN_EMAIL = 'admin@chessking.com';
const ADMIN_PASSWORD = 'Shic123';

function rpc(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const evalExpr = (ws, id, expression) => rpc(ws, id, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCondition(ws, expr, timeoutMs = 15000, intervalMs = 400) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { result, exceptionDetails } = await evalExpr(ws, 900, expr);
      if (!exceptionDetails && result?.value === true) return true;
    } catch {}
    await sleep(intervalMs);
  }
  return false;
}

async function main() {
  const newTab = await fetch(`${CDP_HTTP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(newTab.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 1;
  const next = () => id++;
  const consoleErrors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.text || JSON.stringify(msg.params.exceptionDetails));
    }
  });

  await rpc(ws, next(), 'Page.enable');
  await rpc(ws, next(), 'Runtime.enable');

  await rpc(ws, next(), 'Page.navigate', { url: `${APP_URL}/login` });
  await waitForCondition(ws, `!!document.querySelector('input[type="email"]')`, 15000);
  await evalExpr(ws, next(), `(async () => {
    const e = document.querySelector('input[type="email"]');
    const p = document.querySelector('input[type="password"]');
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(e, ${JSON.stringify(ADMIN_EMAIL)}); e.dispatchEvent(new Event('input', { bubbles: true }));
    s.call(p, ${JSON.stringify(ADMIN_PASSWORD)}); p.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('button[type="submit"]').click();
  })()`);
  await waitForCondition(ws, `!window.location.pathname.startsWith('/login')`, 15000);
  await sleep(2000);
  // Cerrar modal "Tienes puntos para canjear" si aparece
  await evalExpr(ws, next(), `(function() {
    const btn = [...document.querySelectorAll('button')].find(b => /más tarde/i.test(b.textContent || ''));
    if (btn) btn.click();
  })()`);
  await sleep(800);
  await rpc(ws, next(), 'Page.navigate', { url: `${APP_URL}/admin` });
  // El dashboard hace 6 queries (users, matches, predictions, redemptions,
  // referrals, prizes). Esperar específicamente al widget antes de capturar.
  const widgetReady = await waitForCondition(
    ws,
    `document.body && document.body.innerText.includes('Stock de premios')`,
    30000,
    700
  );
  console.log('Widget ready:', widgetReady);
  // Cerrar modal otra vez si reaparece (no bloquea, pero por si acaso)
  await evalExpr(ws, next(), `(function() {
    const btn = [...document.querySelectorAll('button')].find(b => /más tarde/i.test(b.textContent || ''));
    if (btn) btn.click();
  })()`);
  await sleep(800);

  // Verificar que el widget StockAlertsCard existe y tiene datos
  const widget = await evalExpr(ws, next(), `(function() {
    const all = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,div')].map(e => e.textContent.trim()).filter(Boolean);
    const hasStockTitle = all.some(t => /stock de premios/i.test(t));
    const counters = [...document.querySelectorAll('p.text-2xl')].map(e => e.textContent.trim());
    return { hasStockTitle, counters, bodyHasStock: document.body.innerText.includes('Stock de premios') };
  })()`);
  console.log('Widget:', JSON.stringify(widget.result.value, null, 2));

  const fs = await import('fs');
  // Screenshot del dashboard completo
  let ss = await rpc(ws, next(), 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/yomck/.claude/jobs/b1937a53/tmp/dashboard-top.png', Buffer.from(ss.data, 'base64'));
  console.log('✅ Dashboard top screenshot');

  // Scroll abajo para ver el widget de stock
  await evalExpr(ws, next(), `(function() {
    const el = [...document.querySelectorAll('*')].find(e => /stock de premios/i.test(e.textContent || ''));
    el?.scrollIntoView({ block: 'center' });
  })()`);
  await sleep(800);
  ss = await rpc(ws, next(), 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/yomck/.claude/jobs/b1937a53/tmp/dashboard-stock.png', Buffer.from(ss.data, 'base64'));
  console.log('✅ Stock widget screenshot');

  console.log('Console errors:', consoleErrors.length);
  if (consoleErrors.length) console.log(consoleErrors);
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });