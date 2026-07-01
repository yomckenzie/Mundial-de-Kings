// verify-prizes-ux.mjs (v2)
// Todos los premios en BD tienen original_sizes, así que el caso "sin tallas"
// se prueba eliminando TODAS las tallas de un premio y verificando la
// transición a modo "Unidades totales".
//
// Tests:
//   1. Editar premio CON tallas (Chancletas) → "Tallas y stock" visible, NO "Unidades totales"
//   2. Borrar UNA talla específica → solo esa se elimina, otras se mantienen
//   3. Borrar TODAS las tallas → aparece "Unidades totales" (transición de modo)
//   4. En modo "Unidades totales", guardar → original_stock se preserva (no se pisa a 0)
//   5. "Agregar talla" desde modo sin tallas → vuelve a modo tallas

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

const evalExpr = (ws, id, expression) =>
  rpc(ws, id, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCondition(ws, expr, timeoutMs = 15000, intervalMs = 400) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const { result, exceptionDetails } = await evalExpr(ws, 900, expr);
      if (!exceptionDetails && result?.value === true) return true;
      if (exceptionDetails) lastError = exceptionDetails.text;
    } catch (e) { lastError = e.message; }
    await sleep(intervalMs);
  }
  throw new Error(`Timeout esperando: ${expr}\nÚltimo error: ${lastError}`);
}

async function loginAndNavigate(ws, next, path) {
  await rpc(ws, next(), 'Page.navigate', { url: `${APP_URL}/login` });
  await waitForCondition(ws, `!!document.querySelector('input[type="email"], input[name="email"]')`, 15000);
  await evalExpr(ws, next(), `(async () => {
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
  })()`);
  await waitForCondition(ws, `!window.location.pathname.startsWith('/login')`, 15000);
  await rpc(ws, next(), 'Page.navigate', { url: `${APP_URL}${path}` });
  await waitForCondition(ws, `document.body.innerText.includes('premios en el catálogo') || document.body.innerText.includes('Cargando')`, 15000);
  await waitForCondition(ws, `!!document.querySelector('button[title^="Editar premio"]')`, 15000);
  await sleep(500);
}

function findDialogExpr() {
  return `(function() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    return dialogs.find(d => d.getAttribute('aria-hidden') !== 'true' && d.querySelectorAll('input').length > 0)
        || dialogs.find(d => d.querySelectorAll('input').length > 0) || dialogs[0];
  })()`;
}

async function clickEditByTitle(ws, next, prizeTitle) {
  const expr = `(function() {
    const cards = [...document.querySelectorAll('[class*="card"], div.p-3')];
    const target = cards.find(c => c.textContent.includes(${JSON.stringify(prizeTitle)}));
    if (!target) return { ok: false, reason: 'card not found for ' + ${JSON.stringify(prizeTitle)} };
    const editBtn = target.querySelector('button[title^="Editar premio"]');
    if (!editBtn) return { ok: false, reason: 'edit btn not found' };
    editBtn.click();
    return { ok: true };
  })()`;
  const r = await evalExpr(ws, next(), expr);
  if (!r.result.value?.ok) throw new Error('clickEditByTitle: ' + JSON.stringify(r.result.value));
  await waitForCondition(ws, `(function() { const d = ${findDialogExpr()}; return d && d.querySelectorAll('input,textarea').length > 0; })()`, 8000);
  await sleep(400);
}

async function getFormState(ws, next) {
  const expr = `(function() {
    const d = ${findDialogExpr()};
    if (!d) return null;
    const text = d.innerText;
    const labels = [...d.querySelectorAll('label')].map(l => l.textContent.trim());
    const inputs = [...d.querySelectorAll('input')].map(i => ({
      placeholder: i.placeholder,
      value: i.value,
      type: i.type,
    }));
    const hasUnidadesTotalesLabel = labels.some(l => l === 'Unidades totales') && !text.includes('Tallas y stock');
    const hasTallasLabel = text.includes('Tallas y stock');
    const hasUsarTallasBtn = [...d.querySelectorAll('button')].some(b => /usar tallas/i.test(b.textContent));
    return { labels, inputs, hasUnidadesTotalesLabel, hasTallasLabel, hasUsarTallasBtn };
  })()`;
  const r = await evalExpr(ws, next(), expr);
  return r.result.value;
}

async function closeDialog(ws, next) {
  await evalExpr(ws, next(), `(function() {
    const d = ${findDialogExpr()};
    if (d) d.querySelector('button[aria-label="Cerrar"]')?.click();
  })()`);
  await sleep(500);
}

async function main() {
  const newTab = await fetch(`${CDP_HTTP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(newTab.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  let msgId = 1;
  const next = () => msgId++;
  const consoleErrors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.text || JSON.stringify(msg.params.exceptionDetails));
    }
  });

  await rpc(ws, next(), 'Page.enable');
  await rpc(ws, next(), 'Runtime.enable');
  await rpc(ws, next(), 'Network.enable');

  const results = [];
  const screenshotOnFail = async (label) => {
    try {
      const ss = await rpc(ws, next(), 'Page.captureScreenshot', { format: 'png' });
      const fs = await import('fs');
      fs.writeFileSync(`C:/Users/yomck/.claude/jobs/b1937a53/tmp/${label}.png`, Buffer.from(ss.data, 'base64'));
    } catch {}
  };

  try {
    await loginAndNavigate(ws, next, '/admin/prizes');

    // ─── Test 1: Premio CON tallas ───
    console.log('\n=== Test 1: Chancletas (CON tallas) ===');
    await clickEditByTitle(ws, next, 'Chancletas Cheesking');
    let state = await getFormState(ws, next);
    const tallaInputs1 = state.inputs.filter(i => i.placeholder?.startsWith('Talla'));
    if (!state.hasTallasLabel) throw new Error('FAIL T1: "Tallas y stock" no visible');
    if (state.hasUnidadesTotalesLabel) throw new Error('FAIL T1: "Unidades totales" visible cuando NO debería');
    if (tallaInputs1.length !== 6) throw new Error(`FAIL T1: esperadas 6 tallas, hay ${tallaInputs1.length}`);
    console.log(`✅ Test 1 PASSED — 6 tallas visibles, sin sección "Unidades totales"`);
    results.push({ test: 1, status: 'pass', tallas: 6 });

    // ─── Test 2: Borrar UNA talla ───
    console.log('\n=== Test 2: Borrar TALLA 41 ===');
    await evalExpr(ws, next(), `(function() {
      const d = ${findDialogExpr()};
      const rows = [...d.querySelectorAll('div.flex.items-center.gap-2')];
      const targetRow = rows.find(r => {
        const sizeInput = r.querySelector('input[placeholder^="Talla"]');
        return sizeInput && sizeInput.value === 'TALLA 41';
      });
      targetRow?.querySelector('button[aria-label="Eliminar talla"]')?.click();
      return !!targetRow;
    })()`);
    await sleep(400);
    state = await getFormState(ws, next);
    const tallasRestantes = state.inputs.filter(i => i.placeholder?.startsWith('Talla')).map(i => i.value);
    if (tallasRestantes.length !== 5) throw new Error(`FAIL T2: esperadas 5, hay ${tallasRestantes.length}`);
    if (tallasRestantes.includes('TALLA 41')) throw new Error('FAIL T2: TALLA 41 sigue');
    console.log(`✅ Test 2 PASSED — TALLA 41 eliminada, quedan: ${tallasRestantes.join(', ')}`);
    results.push({ test: 2, status: 'pass', quedan: tallasRestantes });
    await closeDialog(ws, next);

    // ─── Test 3: Borrar TODAS las tallas → modo unidades totales ───
    console.log('\n=== Test 3: Borrar TODAS las tallas de Tshirt Chees King ===');
    await clickEditByTitle(ws, next, 'Tshirt Chees king');
    state = await getFormState(ws, next);
    const tallasIniciales = state.inputs.filter(i => i.placeholder?.startsWith('Talla')).length;
    console.log(`Tallas iniciales: ${tallasIniciales}`);

    // Borrar todas (bucle)
    for (let i = 0; i < tallasIniciales; i++) {
      await evalExpr(ws, next(), `(function() {
        const d = ${findDialogExpr()};
        const rows = [...d.querySelectorAll('div.flex.items-center.gap-2')];
        const targetRow = rows.find(r => r.querySelector('input[placeholder^="Talla"]'));
        targetRow?.querySelector('button[aria-label="Eliminar talla"]')?.click();
        return !!targetRow;
      })()`);
      await sleep(200);
    }
    state = await getFormState(ws, next);
    const tallasDespues = state.inputs.filter(i => i.placeholder?.startsWith('Talla')).length;
    if (tallasDespues !== 0) throw new Error(`FAIL T3: quedan ${tallasDespues} tallas`);
    if (!state.hasUnidadesTotalesLabel) throw new Error('FAIL T3: NO aparece "Unidades totales" tras borrar todas las tallas');
    if (!state.hasUsarTallasBtn) throw new Error('FAIL T3: NO aparece botón "Usar tallas" tras borrar todas las tallas');
    const unidadesInput = state.inputs.find(i => i.placeholder === 'Ej: 10');
    if (!unidadesInput) throw new Error('FAIL T3: input "Ej: 10" no encontrado');
    console.log(`✅ Test 3 PASSED — Transición correcta: sin tallas, "Unidades totales" visible con valor "${unidadesInput.value}"`);
    results.push({ test: 3, status: 'pass', unidadesValor: unidadesInput.value });

    // ─── Test 4: Guardar unidades=N preserva el valor ───
    console.log('\n=== Test 4: Cambiar unidades a 77 y guardar, luego reabrir y verificar ===');
    await evalExpr(ws, next(), `(function() {
      const d = ${findDialogExpr()};
      const unidadesInput = [...d.querySelectorAll('input[placeholder="Ej: 10"]')][0];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(unidadesInput, '77');
      unidadesInput.dispatchEvent(new Event('input', { bubbles: true }));
      const saveBtn = [...d.querySelectorAll('button')].find(b => /guardar cambios/i.test(b.textContent));
      saveBtn.click();
      return 'submitted';
    })()`);
    await sleep(3500); // esperar mutation + persist

    // Re-abrir
    await clickEditByTitle(ws, next, 'Tshirt Chees king');
    state = await getFormState(ws, next);
    const unidadesReopen = state.inputs.find(i => i.placeholder === 'Ej: 10');
    if (!unidadesReopen || unidadesReopen.value !== '77') {
      await screenshotOnFail('test4-fail');
      throw new Error(`FAIL T4: original_stock no preservado. esperado "77", encontrado "${unidadesReopen?.value}"`);
    }
    console.log(`✅ Test 4 PASSED — original_stock = 77 preservado tras guardar`);
    results.push({ test: 4, status: 'pass', stockGuardado: 77 });

    // Restaurar valor original (volver a modo tallas con las 3 tallas originales)
    console.log('\n=== Restaurar Tshirt Chees King ===');
    // Click "Usar tallas"
    await evalExpr(ws, next(), `(function() {
      const d = ${findDialogExpr()};
      const btn = [...d.querySelectorAll('button')].find(b => /usar tallas/i.test(b.textContent));
      btn?.click();
      return !!btn;
    })()`);
    await sleep(300);
    // Llenar 3 tallas
    const tallasOriginales = [['L', '1'], ['M', '1'], ['XL', '1']];
    for (const [size, stock] of tallasOriginales) {
      await evalExpr(ws, next(), `(function() {
        const d = ${findDialogExpr()};
        const rows = [...d.querySelectorAll('div.flex.items-center.gap-2')];
        const emptyRow = rows.find(r => {
          const sizeInp = r.querySelector('input[placeholder^="Talla"]');
          return sizeInp && !sizeInp.value;
        });
        if (!emptyRow) return false;
        const sizeInp = emptyRow.querySelector('input[placeholder^="Talla"]');
        const stockInp = emptyRow.querySelector('input[type="number"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(sizeInp, ${JSON.stringify(size)});
        sizeInp.dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(stockInp, ${JSON.stringify(stock)});
        stockInp.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await sleep(200);
    }
    await evalExpr(ws, next(), `(function() {
      const d = ${findDialogExpr()};
      const saveBtn = [...d.querySelectorAll('button')].find(b => /guardar cambios/i.test(b.textContent));
      saveBtn.click();
    })()`);
    await sleep(2500);

    // ─── Test 5: "Usar tallas" desde modo sin tallas → vuelve a modo tallas ───
    console.log('\n=== Test 5: "Usar tallas" desde modo sin tallas ===');
    await clickEditByTitle(ws, next, 'Pantalon bermuda'); // un premio con 1 sola talla
    state = await getFormState(ws, next);
    const tallasPantalon = state.inputs.filter(i => i.placeholder?.startsWith('Talla'));
    if (tallasPantalon.length !== 1) throw new Error(`FAIL T5 setup: esperaba 1 talla en Pantalon, hay ${tallasPantalon.length}`);

    // Borrar la única talla
    await evalExpr(ws, next(), `(function() {
      const d = ${findDialogExpr()};
      const rows = [...d.querySelectorAll('div.flex.items-center.gap-2')];
      const targetRow = rows.find(r => r.querySelector('input[placeholder^="Talla"]'));
      targetRow?.querySelector('button[aria-label="Eliminar talla"]')?.click();
    })()`);
    await sleep(400);
    state = await getFormState(ws, next);
    if (state.hasTallasLabel) throw new Error('FAIL T5: tras borrar única talla sigue "Tallas y stock"');

    // Click "Usar tallas"
    await evalExpr(ws, next(), `(function() {
      const d = ${findDialogExpr()};
      const btn = [...d.querySelectorAll('button')].find(b => /usar tallas/i.test(b.textContent));
      btn?.click();
    })()`);
    await sleep(400);
    state = await getFormState(ws, next);
    if (!state.hasTallasLabel) throw new Error('FAIL T5: tras "Usar tallas" no vuelve a modo tallas');
    const tallasNuevas = state.inputs.filter(i => i.placeholder?.startsWith('Talla'));
    if (tallasNuevas.length !== 1) throw new Error(`FAIL T5: tras "Usar tallas" esperaba 1 fila vacía, hay ${tallasNuevas.length}`);
    console.log(`✅ Test 5 PASSED — Transición sin tallas → tallas funciona con 1 fila vacía`);
    results.push({ test: 5, status: 'pass' });
    await closeDialog(ws, next);

    console.log('\n========================================');
    console.log('🎉 TODOS LOS TESTS PASARON');
    console.log('========================================');
    console.log(JSON.stringify(results, null, 2));
    console.log('Console errors:', consoleErrors.length);
    if (consoleErrors.length > 0) console.log(consoleErrors);
    ws.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ FAILED:', err.message);
    await screenshotOnFail('prizes-ux-fail');
    console.error('Console errors:', consoleErrors);
    console.error('Results hasta el fallo:', JSON.stringify(results, null, 2));
    ws.close();
    process.exit(1);
  }
}

main();