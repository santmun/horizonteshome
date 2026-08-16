/**
 * POST /api/aplicar — recibe la solicitud del wizard y la manda por correo.
 *
 * Secretos que necesita el proyecto de Pages:
 *   MAILERSEND_API_KEY   (obligatorio)
 *   APPLY_TO             (opcional, default contacto@innovandohorizontes.com)
 *   APPLY_FROM           (opcional, default santi@horizontessia.com)
 *
 * El remitente vive en el dominio secundario a propósito: el dominio principal
 * no manda correo automático.
 */

interface Env {
  MAILERSEND_API_KEY: string;
  APPLY_TO?: string;
  APPLY_FROM?: string;
}

const DESTINO_DEFAULT = 'contacto@innovandohorizontes.com';
const REMITENTE_DEFAULT = 'santi@horizontessia.com';
const MAX_BYTES = 24_000;
const MAX_LARGO_CAMPO = 4_000;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** "inmobiliaria=¿Cómo se llama...|ciudad=¿En qué ciudad..." → Map */
function parseEtiquetas(raw: unknown): Map<string, string> {
  const mapa = new Map<string, string>();
  if (typeof raw !== 'string') return mapa;
  for (const par of raw.split('|')) {
    const i = par.indexOf('=');
    if (i > 0) mapa.set(par.slice(0, i).trim(), par.slice(i + 1).trim().slice(0, 200));
  }
  return mapa;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Tamaño
  const crudo = await request.text();
  if (crudo.length > MAX_BYTES) return json({ error: 'payload demasiado grande' }, 413);

  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return json({ error: 'json inválido' }, 400);
  }

  // Trampa para bots: si viene llena, fingimos éxito y no mandamos nada.
  if (typeof datos.empresa_web === 'string' && datos.empresa_web.trim()) {
    return json({ ok: true });
  }

  const campo = (k: string) =>
    typeof datos[k] === 'string' ? (datos[k] as string).trim().slice(0, MAX_LARGO_CAMPO) : '';

  const email = campo('email');
  const nombre = campo('nombre');
  const inmobiliaria = campo('inmobiliaria');

  if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'correo inválido' }, 400);
  }
  if (!nombre || !inmobiliaria) return json({ error: 'faltan datos' }, 400);

  const etiquetas = parseEtiquetas(datos.etiquetas);
  const omitir = new Set(['etiquetas', 'empresa_web', 'acepto']);

  const filas = Object.entries(datos)
    .filter(([k, v]) => !omitir.has(k) && typeof v === 'string' && v.trim())
    .map(([k, v]) => ({
      etiqueta: etiquetas.get(k) || k,
      valor: (v as string).trim().slice(0, MAX_LARGO_CAMPO),
    }));

  const meta = [
    { etiqueta: 'Recibida', valor: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) },
    { etiqueta: 'País (Cloudflare)', valor: request.headers.get('cf-ipcountry') || 'desconocido' },
    { etiqueta: 'Origen', valor: request.headers.get('referer') || 'directo' },
  ];

  const tabla = (items: { etiqueta: string; valor: string }[]) =>
    items
      .map(
        (f) => `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #eef2f7;color:#64748b;font-size:13px;width:42%;vertical-align:top">${esc(f.etiqueta)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #eef2f7;color:#0b1220;font-size:14px;font-weight:500">${esc(f.valor).replace(/\n/g, '<br>')}</td>
        </tr>`
      )
      .join('');

  const html = `<!doctype html>
<html><body style="margin:0;background:#f7f9fc;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:28px 16px">
    <p style="margin:0 0 6px;color:#3f6fd8;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Nueva solicitud · HorizontesHome</p>
    <h1 style="margin:0 0 4px;font-size:22px;color:#0b1220">${esc(inmobiliaria)}</h1>
    <p style="margin:0 0 22px;color:#33415c;font-size:14px">
      ${esc(nombre)} · <a href="mailto:${esc(email)}" style="color:#2b4fa8">${esc(email)}</a>
      ${campo('whatsapp') ? ` · <a href="https://wa.me/${encodeURIComponent(campo('whatsapp').replace(/[^\d]/g, ''))}" style="color:#2b4fa8">${esc(campo('whatsapp'))}</a>` : ''}
    </p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">${tabla(filas)}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">${tabla(meta)}</table>
  </div>
</body></html>`;

  const texto = [
    `Nueva solicitud — HorizontesHome`,
    `${inmobiliaria} · ${nombre} · ${email}`,
    '',
    ...filas.map((f) => `${f.etiqueta}: ${f.valor}`),
    '',
    ...meta.map((f) => `${f.etiqueta}: ${f.valor}`),
  ].join('\n');

  if (!env.MAILERSEND_API_KEY) {
    console.error('Falta MAILERSEND_API_KEY. Solicitud recibida sin enviar:', texto);
    return json({ error: 'correo no configurado' }, 500);
  }

  const destino = env.APPLY_TO || DESTINO_DEFAULT;
  const remitente = env.APPLY_FROM || REMITENTE_DEFAULT;

  const res = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MAILERSEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: remitente, name: 'HorizontesHome · Solicitudes' },
      to: [{ email: destino }],
      reply_to: { email, name: nombre },
      subject: `Solicitud: ${inmobiliaria} (${campo('ciudad') || 'sin ciudad'})`,
      html,
      text: texto,
    }),
  });

  if (!res.ok) {
    console.error('MailerSend falló', res.status, await res.text().catch(() => ''), texto);
    return json({ error: 'no se pudo enviar' }, 502);
  }

  return json({ ok: true });
};

const soloPost = () =>
  new Response('Método no permitido', { status: 405, headers: { Allow: 'POST' } });

export const onRequestGet: PagesFunction<Env> = soloPost;
export const onRequestPut: PagesFunction<Env> = soloPost;
export const onRequestDelete: PagesFunction<Env> = soloPost;
