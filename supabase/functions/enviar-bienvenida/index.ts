// Supabase Edge Function: enviar-bienvenida
// Disparada por un Database Webhook sobre INSERT en la tabla `users`.
// Intenta enviar el email primero con Resend; si falla (status no-200),
// hace fallback automático a Brevo.
//
// Secrets requeridos (configurar con `supabase secrets set ...`):
//   - MI_RESEND_API_KEY   (string)  API key de Resend
//   - MI_BREVO_API_KEY    (string)  API key de Brevo
//   - REMITENTE_NOMBRE    (string)  Nombre del remitente, ej: "ChessKing"
//   - REMITENTE_EMAIL     (string)  Email remitente (debe estar verificado
//                                    en ambos proveedores), ej: "no-reply@chessking.la"
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

    // Intento 1: Resend
    console.log(`[bienvenida] Intentando Resend → ${record.email}`);
    const r1 = await enviarConResend(record.email, html);
    if (r1.ok) {
      console.log(`[bienvenida] Resend OK: ${r1.detalle}`);
      return new Response(
        JSON.stringify({ success: true, provider: "resend", email: record.email }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    console.warn(`[bienvenida] Resend falló: ${r1.detalle} → fallback Brevo`);

    // Intento 2: Brevo
    const r2 = await enviarConBrevo(record.email, html);
    if (r2.ok) {
      console.log(`[bienvenida] Brevo OK (fallback): ${r2.detalle}`);
      return new Response(
        JSON.stringify({ success: true, provider: "brevo", email: record.email, resend_error: r1.detalle }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error(`[bienvenida] Ambos proveedores fallaron. Resend: ${r1.detalle} | Brevo: ${r2.detalle}`);

    return new Response(
      JSON.stringify({ success: false, resend: r1.detalle, brevo: r2.detalle }),
      { status: 502, headers: { "Content-Type": "application/json" } }
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
