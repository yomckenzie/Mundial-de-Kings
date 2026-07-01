// verify-edit-prize.mjs
// Verifica el fix del bug #28: al editar un premio, el form debe mostrar
// los datos del premio (no EMPTY_FORM).
//
// Flujo:
//   1. Abre pestaña nueva en localhost:5173 (donde corre mi dev server
//      con el fix aplicado: src/pages/admin/AdminPrizes.jsx línea 139).
//   2. Login como admin@chessking.com.
//   3. Va a /admin/prizes.
//   4. Click en "Editar" del primer premio.
//   5. Lee el valor del input[name=name].
//   6. Pasa si el input tiene un valor NO vacío.
//
// Salida: JSON { passed, prizeName, error }.
//
// Node 24 trae WebSocket nativo (globalThis.WebSocket).

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

function evalExpr(ws, id, expression) {
  return rpc(ws, id, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForCondition(ws, expr, timeoutMs = 15000, intervalMs = 400) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const { result, exceptionDetails } = await evalExpr(ws, 900, expr);
      if (!exceptionDetails && result?.value === true) return true;
      if (exceptionDetails) lastError = exceptionDetails.text || JSON.stringify(exceptionDetails);
    } catch (e) {
      lastError = e.message;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timeout esperando: ${expr}\nÚltimo error: ${lastError}`);
}

async function main() {
  // 1. Crear pestaña nueva vía REST (PUT, no GET en CDP moderno)
  const newTab = await fetch(`${CDP_HTTP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(newTab.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  let msgId = 1;
  const next = () => msgId++;

  await rpc(ws, next(), 'Page.enable');
  await rpc(ws, next(), 'Runtime.enable');
  await rpc(ws, next(), 'DOM.enable');
  await rpc(ws, next(), 'Network.enable');

  // Capturar errores de consola
  const consoleErrors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.text || JSON.stringify(msg.params.exceptionDetails)));
    }
  });

  try {
    // 2. Ir al login
    console.log('→ Navegando a /login...');
    await rpc(ws, next(), 'Page.navigate', { url: `${APP_URL}/login` });
    await waitForCondition(
      ws,
      `!!document.querySelector('input[type="email"], input[name="email"]')`,
      15000
    );

    // 3. Login admin
    console.log('→ Login admin...');
    await evalExpr(
      ws,
      next(),
      `(async () => {
        const emailInput = document.querySelector('input[type="email"], input[name="email"]');
        const pwdInput = document.querySelector('input[type="password"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(emailInput, ${JSON.stringify(ADMIN_EMAIL)});
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(pwdInput, ${JSON.stringify(ADMIN_PASSWORD)});
        pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
        const submitBtn = document.querySelector('button[type="submit"]') ||
                          [...document.querySelectorAll('button')].find(b => /iniciar|entrar|login/i.test(b.textContent));
        if (submitBtn) submitBtn.click();
        return 'submitted';
      })()`
    );

    // 4. Esperar a que redirija fuera de /login
    await waitForCondition(
      ws,
      `!window.location.pathname.startsWith('/login')`,
      15000
    );
    console.log('→ Login OK, ruta actual:', await evalExpr(ws, next(), 'window.location.pathname').then((r) => r.result.value));

    // 5. Navegar a /admin/prizes
    console.log('→ Navegando a /admin/prizes...');
    await rpc(ws, next(), 'Page.navigate', { url: `${APP_URL}/admin/prizes` });

    // 6. Esperar a que cargue la lista de premios Y que React Query haya
    //    terminado de hidratar (los inputs del edit dependen de los datos).
    await waitForCondition(
      ws,
      `(function() {
        const text = document.body.innerText;
        if (text.includes('Cargando')) return false;
        if (!text.includes('premios en el catálogo')) return false;
        // Esperar a que existan botones de Editar premio (= datos cargados)
        return !!document.querySelector('button[title^="Editar premio"]');
      })()`,
      15000
    );
    await sleep(600);

    // 7. Verificar que hay premios
    const prizeCount = await evalExpr(
      ws,
      next(),
      `document.querySelectorAll('button').length`
    );
    console.log('→ Botones en la página:', prizeCount.result.value);

    // 8. Buscar un botón "Editar" (title attribute "Editar premio...")
    console.log('→ Buscando botón Editar...');
    const editClicked = await evalExpr(
      ws,
      next(),
      `(async () => {
        // Debug: dump todos los titles
        const titles = [...document.querySelectorAll('button[title]')].map(b => b.title).slice(0, 30);
        const editBtn = document.querySelector('button[title^="Editar premio"]');
        if (!editBtn) {
          return { ok: false, reason: 'no edit button found', titles };
        }
        editBtn.click();
        return { ok: true, title: editBtn.title };
      })()`
    );

    if (!editClicked.result.value?.ok) {
      throw new Error('No se encontró botón Editar: ' + JSON.stringify(editClicked.result.value));
    }

    // 9. Esperar a que el dialog VISIBLE renderice inputs (Radix hace fade-in,
    //    puede dejar un dialog fantasma con aria-hidden=true en el DOM).
    await waitForCondition(
      ws,
      `(function() {
        const dialogs = [...document.querySelectorAll('[role="dialog"]')];
        return dialogs.some(d =>
          d.getAttribute('aria-hidden') !== 'true' &&
          d.querySelectorAll('input,textarea').length > 0
        );
      })()`,
      8000
    );
    await sleep(400);

    // 10. Leer el valor del input de nombre (buscar el dialog VISIBLE, no el
    //     oculto por la animación de Radix).
    const nameValue = await evalExpr(
      ws,
      next(),
      `(function() {
        const dialogs = [...document.querySelectorAll('[role="dialog"]')];
        // Encontrar el dialog visible (no aria-hidden, con inputs)
        const visibleDialog = dialogs.find(d =>
          d.getAttribute('aria-hidden') !== 'true' &&
          d.querySelectorAll('input').length > 0
        ) || dialogs.find(d => d.querySelectorAll('input').length > 0) || dialogs[0];
        if (!visibleDialog) return { ok: false, reason: 'no dialog', dialogCount: 0 };
        const html = visibleDialog.outerHTML.slice(0, 1500);
        const inputs = [...visibleDialog.querySelectorAll('input')];
        const allInputs = inputs.map(i => ({
          name: i.name,
          placeholder: i.placeholder,
          ariaLabel: i.getAttribute('aria-label'),
          value: i.value,
          type: i.type,
          id: i.id,
        }));
        return {
          ok: true,
          dialogCount: dialogs.length,
          dialogId: visibleDialog.id,
          dialogAriaHidden: visibleDialog.getAttribute('aria-hidden'),
          html,
          allInputs,
        };
      })()`
    );

    const result = nameValue.result.value;
    console.log('→ Dialog count:', result.dialogCount);
    console.log('→ Labels:', JSON.stringify(result.labels, null, 2));
    console.log('→ Inputs:', JSON.stringify(result.allInputs, null, 2));
    console.log('→ HTML head:', result.html.slice(0, 1500));

    const firstInput = result.allInputs.find(i => i.value && i.value.trim() !== '');
    if (!firstInput) {
      throw new Error('FALLO: ningún input tiene valor — el fix no funcionó');
    }

    console.log('✅ PASSED — input con valor:', firstInput.value);
    console.log('Console errors:', consoleErrors.length, consoleErrors.slice(0, 3));

    ws.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ FAILED:', err.message);
    console.error('Console errors:', consoleErrors);
    // Capturar screenshot del fallo
    try {
      const ss = await rpc(ws, next(), 'Page.captureScreenshot', { format: 'png' });
      const fs = await import('fs');
      fs.writeFileSync('C:/Users/yomck/.claude/jobs/b1937a53/tmp/edit-prize-fail.png', Buffer.from(ss.data, 'base64'));
      console.error('Screenshot guardado en edit-prize-fail.png');
    } catch {}
    ws.close();
    process.exit(1);
  }
}

main();