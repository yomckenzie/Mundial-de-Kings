// snapshot-prize-form.mjs v2 — espera más tiempo para evitar loading screen

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
  const fs = await import('fs');

  await rpc(ws, next(), 'Page.enable');
  await rpc(ws, next(), 'Runtime.enable');

  // Login
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

  await rpc(ws, next(), 'Page.navigate', { url: `${APP_URL}/admin/prizes` });
  await waitForCondition(ws, `!!document.querySelector('button[title^="Editar premio"]')`, 15000);
  await sleep(1500);

  // Snapshot 1: Chancletas CON tallas
  await evalExpr(ws, next(), `(function() {
    const cards = [...document.querySelectorAll('div.p-3')];
    const target = cards.find(c => c.textContent.includes('Chancletas Cheesking'));
    target?.querySelector('button[title^="Editar premio"]')?.click();
  })()`);
  await waitForCondition(ws, `!!document.querySelector('[role="dialog"] input[placeholder^="Talla"]')`, 8000);
  await sleep(800);
  let ss = await rpc(ws, next(), 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/yomck/.claude/jobs/b1937a53/tmp/form-CON-TALLAS.png', Buffer.from(ss.data, 'base64'));
  console.log('✅ Snapshot 1: form CON TALLAS');

  // Borrar todas las tallas
  await evalExpr(ws, next(), `(function() {
    const d = document.querySelector('[role="dialog"]');
    let i = 0;
    while (i++ < 20) {
      const row = [...d.querySelectorAll('div.flex.items-center.gap-2')].find(r => r.querySelector('input[placeholder^="Talla"]'));
      if (!row) break;
      row.querySelector('button[aria-label="Eliminar talla"]')?.click();
    }
  })()`);
  await sleep(1200);

  ss = await rpc(ws, next(), 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/yomck/.claude/jobs/b1937a53/tmp/form-SIN-TALLAS.png', Buffer.from(ss.data, 'base64'));
  console.log('✅ Snapshot 2: form SIN TALLAS');

  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });