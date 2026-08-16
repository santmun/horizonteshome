# HorizontesHome

Landing + solicitud (wizard) para vender el sistema de agentes de venta por chat a inmobiliarias.

Astro estático + Tailwind, alojado en Cloudflare Pages. El formulario lo procesa una Pages
Function que manda la solicitud por correo.

## Comandos

```bash
pnpm dev      # localhost:4321 — la landing, SIN el endpoint del formulario
pnpm build    # genera dist/
pnpm deploy   # build + wrangler pages deploy
```

Para probar el formulario de punta a punta hace falta el runtime de Cloudflare:

```bash
pnpm build && npx wrangler pages dev
```

## El correo de las solicitudes

`functions/api/aplicar.ts` recibe el POST y manda un correo con todas las respuestas.
Necesita un secreto en el proyecto de Pages:

```bash
npx wrangler pages secret put MAILERSEND_API_KEY --project-name horizonteshome
```

Opcionales (si no se ponen, usa los valores de abajo):

| Variable | Default | Para qué |
|---|---|---|
| `APPLY_TO` | `contacto@innovandohorizontes.com` | A dónde llegan las solicitudes |
| `APPLY_FROM` | `santi@horizontessia.com` | Quién las manda |

El remitente vive en el dominio secundario a propósito: `horizontesia.com` no manda correo
automático para no arriesgar su reputación de envío.

El `reply_to` del correo es el del solicitante, así que se le puede responder directo desde
la bandeja.

## Estructura

```
src/components/    una sección de la landing por archivo
src/components/Aplicar.astro   el wizard completo (definición de campos + lógica)
functions/api/aplicar.ts       el endpoint que manda el correo
```

Para cambiar las preguntas de la solicitud se edita el array `pasos` al inicio de
`Aplicar.astro`. El correo se arma solo a partir de eso: no hay que tocar la Function.

## Pendientes conocidos

- Dominio propio: hoy vive en `*.pages.dev`. Conectar `horizonteshome.com` desde el panel de
  Cloudflare Pages → Custom domains.
- Sin testimonios ni casos: las secciones están escritas para no necesitarlos. Cuando haya
  clientes reales, el lugar natural es entre `Limites` y `Proceso`.
