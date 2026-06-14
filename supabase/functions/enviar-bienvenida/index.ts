// Supabase Edge Function: enviar-bienvenida
// Disparada por un Database Webhook sobre INSERT en la tabla `users`.
// Hace dos cosas con cada usuario nuevo:
//   1) Envía el email de bienvenida (Resend; si falla, fallback a Brevo).
//   2) Sincroniza el contacto a una lista de Brevo (email + nombre + teléfono),
//      para poder enviarle campañas/newsletters desde el panel de Brevo.
//
// Secrets requeridos (configurar con `supabase secrets set ...`):
//   - MI_RESEND_API_KEY   (string)  API key de Resend
//   - MI_BREVO_API_KEY    (string)  API key de Brevo
//   - REMITENTE_NOMBRE    (string)  Nombre del remitente, ej: "ChessKing"
//   - REMITENTE_EMAIL     (string)  Email remitente (debe estar verificado
//                                    en ambos proveedores), ej: "no-reply@chessking.la"
//   - BREVO_LIST_ID       (number)  ID de la lista de Brevo donde se agregan los
//                                    contactos (Brevo → Contactos → Listas).
//                                    Si no se configura, el contacto igual se
//                                    crea/actualiza pero sin asignar lista.
//
// URL pública de la función (la entrega `supabase functions deploy`):
//   https://<project-ref>.supabase.co/functions/v1/enviar-bienvenida
//
// Header de seguridad recomendado en el Webhook:
//   Authorization: Bearer <SUPABASE_ANON_KEY>

// @ts-ignore — Deno runtime
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: {
    id?: string;
    email?: string;
    full_name?: string;
    role?: string;
    phone?: string;
    whatsapp?: string;
  };
}

const REMITENTE_NOMBRE = Deno.env.get("REMITENTE_NOMBRE") ?? "ChessKing";
const REMITENTE_EMAIL =
  Deno.env.get("REMITENTE_EMAIL") ?? "no-reply@chessking.la";

function plantillaHTML(nombre: string): string {
  const safe = (nombre || "Aventurero/a")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#0b0b0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f4f4f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#18181b;border:1px solid #27272a;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 0 32px;text-align:center;">
                <div style="display:inline-block;padding:8px 16px;background:#27272a;border-radius:999px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#a1a1aa;">
                  Mundial de Kings 2026
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;text-align:center;">
                <h1 style="margin:0;font-size:32px;line-height:1.2;color:#fafafa;font-weight:800;">
                  ¡Bienvenido a bordo, ${safe}! 🏆
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0 32px;text-align:center;color:#d4d4d8;font-size:16px;line-height:1.6;">
                <p style="margin:0 0 12px 0;">
                  Estamos muy felices de tenerte en <strong style="color:#fafafa;">ChessKing</strong>.
                </p>
                <p style="margin:0;">
                  Sigue los partidos del Mundial, haz tus pronósticos y compite por increíbles premios.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#27272a;border-radius:12px;">
                  <tr>
                    <td style="padding:20px;">
                      <p style="margin:0 0 12px 0;font-size:14px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.15em;">
                        Primeros pasos
                      </p>
                      <p style="margin:6px 0;color:#fafafa;">⚽️ Haz tu primer pronóstico</p>
                      <p style="margin:6px 0;color:#fafafa;">📈 Sube en el ranking</p>
                      <p style="margin:6px 0;color:#fafafa;">🎁 Canjea puntos por premios</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;text-align:center;color:#71717a;font-size:12px;">
                © ${new Date().getFullYear()} ChessKing. Todos los derechos reservados.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function enviarConResend(email: string, html: string): Promise<{ ok: boolean; detalle: string }> {
  const apiKey = Deno.env.get("MI_RESEND_API_KEY");
  if (!apiKey) return { ok: false, detalle: "MI_RESEND_API_KEY no configurada" };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${REMITENTE_NOMBRE} <${REMITENTE_EMAIL}>`,
      to: email,
      subject: "¡Bienvenido a ChessKing! 🏆",
      html,
    }),
  });

  if (resp.ok) return { ok: true, detalle: `Resend status ${resp.status}` };
  const text = await resp.text().catch(() => "");
  return { ok: false, detalle: `Resend status ${resp.status}: ${text.slice(0, 200)}` };
}

async function enviarConBrevo(email: string, html: string): Promise<{ ok: boolean; detalle: string }> {
  const apiKey = Deno.env.get("MI_BREVO_API_KEY");
  if (!apiKey) return { ok: false, detalle: "MI_BREVO_API_KEY no configurada" };

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: REMITENTE_NOMBRE, email: REMITENTE_EMAIL },
      to: [{ email }],
      subject: "¡Bienvenido a ChessKing! 🏆",
      htmlContent: html,
    }),
  });

  if (resp.ok) return { ok: true, detalle: `Brevo status ${resp.status}` };
  const text = await resp.text().catch(() => "");
  return { ok: false, detalle: `Brevo status ${resp.status}: ${text.slice(0, 200)}` };
}

// Normaliza un teléfono a formato E.164 (+<código><dígitos>) para el atributo
// SMS de Brevo. Devuelve null si no parece válido (así NO bloquea la creación
// del contacto). Asume Panamá (+507) para números locales de 7-8 dígitos.
function normalizarTelefono(raw?: string): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, "");
  if (!s.startsWith("+")) {
    if (/^\d{7,8}$/.test(s)) s = "+507" + s;       // local de Panamá
    else if (/^\d{9,15}$/.test(s)) s = "+" + s;    // ya trae código de país
    else return null;
  }
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

// Crea o actualiza (upsert) el contacto en la lista de Brevo. No bloquea el
// flujo de bienvenida: si falla, solo se loguea.
async function sincronizarContactoBrevo(record: WebhookPayload["record"]): Promise<{ ok: boolean; detalle: string }> {
  const apiKey = Deno.env.get("MI_BREVO_API_KEY");
  if (!apiKey) return { ok: false, detalle: "MI_BREVO_API_KEY no configurada" };
  if (!record.email) return { ok: false, detalle: "sin email" };

  const listIdRaw = Deno.env.get("BREVO_LIST_ID");
  const listId = listIdRaw && /^\d+$/.test(listIdRaw) ? Number(listIdRaw) : null;

  const attributes: Record<string, string> = {};
  if (record.full_name) attributes.NOMBRE = record.full_name;
  const tel = normalizarTelefono(record.phone || record.whatsapp);
  if (tel) attributes.SMS = tel;

  async function post(withSms: boolean): Promise<Response> {
    const attrs = withSms ? attributes : { ...attributes, SMS: undefined };
    if (!withSms) delete (attrs as Record<string, unknown>).SMS;
    const body: Record<string, unknown> = {
      email: record.email,
      attributes: attrs,
      updateEnabled: true, // upsert: crea o actualiza por email
    };
    if (listId) body.listIds = [listId];
    return fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "accept": "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  let resp = await post(true);
  // Si falló por el SMS (formato o duplicado), reintentar sin SMS para no
  // perder el contacto (email + nombre siempre deben sincronizarse).
  if (!resp.ok && resp.status === 400 && attributes.SMS) {
    resp = await post(false);
  }
  if (resp.ok || resp.status === 204) return { ok: true, detalle: `Brevo contacto ${resp.status}` };
  const text = await resp.text().catch(() => "");
  return { ok: false, detalle: `Brevo contacto ${resp.status}: ${text.slice(0, 200)}` };
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Método no permitido", { status: 405 });
  }

  try {
    const payload: WebhookPayload = await req.json();
    const record = payload?.record;

    if (!record) {
      return new Response(
        JSON.stringify({ error: "Payload inválido: falta record" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ignorar inserciones de admin u otros roles no "user"
    if (record.role && record.role !== "user") {
      return new Response(
        JSON.stringify({ skipped: true, reason: `role=${record.role}` }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!record.email) {
      return new Response(
        JSON.stringify({ error: "Falta email en el record" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const html = plantillaHTML(record.full_name || "");

    // 1) Email de bienvenida (Resend → fallback Brevo)
    let emailProvider: string | null = null;
    const r1 = await enviarConResend(record.email, html);
    if (r1.ok) {
      emailProvider = "resend";
    } else {
      console.warn(`[bienvenida] Resend falló: ${r1.detalle} → fallback Brevo`);
      const r2 = await enviarConBrevo(record.email, html);
      if (r2.ok) emailProvider = "brevo";
      else console.error(`[bienvenida] Email falló. Resend: ${r1.detalle} | Brevo: ${r2.detalle}`);
    }

    // 2) Sincronizar contacto a la lista de Brevo (no bloquea el email)
    const contacto = await sincronizarContactoBrevo(record);
    if (contacto.ok) console.log(`[bienvenida] Contacto Brevo OK: ${contacto.detalle}`);
    else console.warn(`[bienvenida] Sync contacto Brevo: ${contacto.detalle}`);

    const ok = emailProvider !== null || contacto.ok;
    return new Response(
      JSON.stringify({
        success: ok,
        email_provider: emailProvider,
        brevo_contact: contacto.ok,
        brevo_contact_detail: contacto.detalle,
        email: record.email,
      }),
      { status: ok ? 200 : 502, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bienvenida] Error crítico: ${msg}`);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
