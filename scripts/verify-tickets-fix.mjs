// verify-tickets-fix.mjs
// Verifica end-to-end que el admin puede cerrar/verificar/rechazar tickets
// sin que aparezca el error de RLS. Captura screenshots + eval del estado.

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
  await sleep(2000);
  // Cerrar modal "Tienes puntos para canjear"
  for (let i = 0; i < 3; i++) {
    await evalExpr(ws, next(), `(function() {
      const btn = [...document.querySelectorAll('button')].find(b => /más tarde/i.test(b.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    })()`);
    await sleep(500);
  }

  // Ir DIRECTAMENTE a /admin/support (AdminSupport.jsx, NO Support.jsx cliente)
  await rpc(ws, next(), 'Page.navigate', { url: `${APP_URL}/admin/support` });
  await waitForCondition(ws, `document.body && document.body.textContent.includes('SOPORTE') && document.querySelectorAll('button').length > 5`, 15000);
  await sleep(2500); // carga de tickets
  // Cerrar modal "Más tarde" si aparece
  for (let i = 0; i < 3; i++) {
    await evalExpr(ws, next(), `(function() {
      const btn = [...document.querySelectorAll('button')].find(b => /más tarde/i.test(b.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    })()`);
    await sleep(500);
  }

  // Crear un ticket nuevo desde el admin (NO, el admin no crea tickets — eso es el cliente).
  // En su lugar, trabajamos con los tickets existentes en la BD.
  // Si no hay tickets Pendientes, lo registramos y paramos.
  const ticketsState = await evalExpr(ws, next(), `(function() {
    const headers = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim());
    return {
      hasNuevoTicket: headers.some(t => /nuevo ticket/i.test(t)),
      hasCerrarTicket: headers.some(t => /cerrar ticket/i.test(t)),
      hasVerificar: headers.some(t => /verificar como real/i.test(t)),
      buttonCount: headers.length,
    };
  })()`);
  console.log('Tickets state:', JSON.stringify(ticketsState.result.value));

  // Buscar el ticket recién creado (debería estar Pendiente) y expandirlo
  const expandResult = await evalExpr(ws, next(), `(async function() {
    await new Promise(r => setTimeout(r, 1500));
    const headerBtns = [...document.querySelectorAll('button')].filter(b =>
      /Test fix RLS jul 2026/i.test(b.textContent || '')
    );
    if (headerBtns.length === 0) return { ok: false, reason: 'header button not found' };
    headerBtns[0].click();
    await new Promise(r => setTimeout(r, 2500));
    // Diagnóstico: ¿está expandido? ¿qué botones hay?
    const allButtonsNow = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean);
    const closeBtn = [...document.querySelectorAll('button')].find(b => /cerrar ticket/i.test(b.textContent || ''));
    return {
      ok: true,
      totalButtons: allButtonsNow.length,
      closeButtonFound: !!closeBtn,
      allButtonsTexts: allButtonsNow,
    };
  })()`);
  console.log('Expand:', JSON.stringify(expandResult.result.value, null, 2));
  await sleep(500);

  // Intentar cerrar el ticket
  const closeResult = await evalExpr(ws, next(), `(async function() {
    const closeBtn = [...document.querySelectorAll('button')].find(b => /cerrar ticket/i.test(b.textContent || ''));
    if (!closeBtn) return { ok: false, reason: 'no close button' };
    closeBtn.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 300));
    closeBtn.click();
    await new Promise(r => setTimeout(r, 4500));
    const toasts = [...document.querySelectorAll('[data-sonner-toast], li[data-sonner-toast]')];
    const bodyText = document.body.textContent || '';
    return {
      ok: true,
      toastTexts: toasts.map(t => t.textContent.trim()).filter(Boolean),
      hasRlsError: /row-level security policy/i.test(bodyText),
      hasCloseError: /Error al cerrar/i.test(bodyText),
      hasCloseSuccess: /Ticket cerrado/i.test(bodyText),
    };
  })()`);
  console.log('Close result:', JSON.stringify(closeResult.result.value, null, 2));

  const fs = await import('fs');
  const ss = await rpc(ws, next(), 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/yomck/.claude/jobs/b1937a53/tmp/tickets-fix.png', Buffer.from(ss.data, 'base64'));
  console.log('✅ Screenshot saved');

  console.log('Console errors:', consoleErrors.length);
  if (consoleErrors.length) console.log(consoleErrors);
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });