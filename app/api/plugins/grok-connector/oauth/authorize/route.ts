import { NextRequest, NextResponse } from 'next/server';
import {
  CHATGPT_CONNECTOR_PLUGIN_ID,
  CLAUDE_CONNECTOR_PLUGIN_ID,
  consumeLinkCodeAndIssueAuthorization,
  getOAuthClient,
  mcpResource,
  requestOrigin,
  scopesForResource,
} from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

type AuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string;
  scope: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

function cspOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

function html(body: string, status = 200, formActionOrigins: string[] = []) {
  const formAction = Array.from(new Set(formActionOrigins.map(cspOrigin).filter(Boolean))).join(' ');
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${formAction ? ` ${formAction}` : ''}; base-uri 'none'; frame-ancestors 'none'`,
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function renderPage(input: AuthorizationRequest, clientName: string, message?: string) {
  const allowsWrite = scopesForResource(input.resource).some((scope) => scope === 'whatspro:write')
    && input.scope.split(/\s+/).includes('whatspro:write');
  const eyebrow = allowsWrite ? 'WhatsPro · MCP con acciones' : 'WhatsPro · MCP de solo lectura';
  const description = allowsWrite
    ? 'Esta conexión permite consultar WhatsPro y ejecutar las acciones de CRM, agendas, membresías, Tareas OS, documentos y mensajes programados que solicites al asistente.'
    : 'Esta conexión permite consultar datos de WhatsPro sin crear, editar ni eliminar información.';
  const button = allowsWrite ? 'Autorizar lectura y acciones' : 'Autorizar acceso de lectura';
  const hidden = Object.entries(input)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vincular asistente con WhatsPro</title><style>
  :root{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#f7f7f7}.shell{width:min(92vw,540px);border:1px solid #3a3a3a;background:#181818;padding:32px}.eyebrow{font:700 12px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#7ee787}h1{font-size:28px;margin:12px 0}p{color:#b8b8b8;line-height:1.55}.notice{border-left:3px solid #7ee787;padding:10px 14px;background:#202820;margin:20px 0}.error{border-color:#ff7b72;background:#2b1c1c;color:#ffdcd9}label{display:block;font-weight:700;margin:24px 0 8px}input[type=text]{width:100%;box-sizing:border-box;border:1px solid #555;background:#0f0f0f;color:#fff;padding:14px;font:700 20px ui-monospace,monospace;letter-spacing:.15em;text-transform:uppercase}button{width:100%;margin-top:16px;padding:14px;border:0;background:#7ee787;color:#071108;font-weight:800;cursor:pointer}.meta{font:12px ui-monospace,monospace;color:#888;margin-top:20px}</style></head><body><main class="shell"><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>Autorizar ${escapeHtml(clientName)}</h1><p>${escapeHtml(description)}</p><div class="notice${message ? ' error' : ''}">${escapeHtml(message || 'Abre el conector correspondiente en WhatsPro, genera un código temporal e ingrésalo aquí.')}</div><form method="post">${hidden}<label for="linkCode">Código de vinculación</label><input id="linkCode" name="linkCode" type="text" minlength="8" maxlength="11" autocomplete="one-time-code" required autofocus><button type="submit">${escapeHtml(button)}</button></form><div class="meta">Permisos: ${escapeHtml(input.scope)} · Puedes revocar la conexión desde WhatsPro.</div></main></body></html>`;
}

async function validate(input: AuthorizationRequest, responseType: string, method: string) {
  if (responseType !== 'code' || method !== 'S256' || !input.codeChallenge || input.codeChallenge.length < 43) return null;
  const requestedScopes = input.scope.split(/\s+/).filter(Boolean);
  const allowedScopes = scopesForResource(input.resource);
  if (!requestedScopes.includes('whatspro:read') || requestedScopes.some((scope) => !allowedScopes.includes(scope))) return null;
  const client = await getOAuthClient(input.clientId);
  if (!client || !client.redirectUris.includes(input.redirectUri)) return null;
  return client;
}

function isAllowedResource(resource: string, origin: string) {
  return [
    mcpResource(origin),
    mcpResource(origin, CHATGPT_CONNECTOR_PLUGIN_ID),
    mcpResource(origin, CLAUDE_CONNECTOR_PLUGIN_ID),
  ].includes(resource);
}

function queryInput(request: NextRequest): AuthorizationRequest & { responseType: string; method: string } {
  const params = request.nextUrl.searchParams;
  const resource = params.get('resource') || mcpResource(requestOrigin(request));
  return {
    clientId: params.get('client_id') || '',
    redirectUri: params.get('redirect_uri') || '',
    state: params.get('state') || '',
    codeChallenge: params.get('code_challenge') || '',
    resource,
    scope: params.get('scope') || scopesForResource(resource).join(' '),
    responseType: params.get('response_type') || '',
    method: params.get('code_challenge_method') || '',
  };
}

export async function GET(request: NextRequest) {
  const { responseType, method, ...input } = queryInput(request);
  const client = await validate(input, responseType, method);
  if (!client || !isAllowedResource(input.resource, requestOrigin(request))) return html('<h1>Solicitud OAuth inválida</h1><p>Regresa a tu asistente e intenta conectar nuevamente.</p>', 400);
  return html(renderPage(input, client.clientName), 200, [requestOrigin(request), input.redirectUri]);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const input: AuthorizationRequest = {
    clientId: String(form.get('clientId') || ''),
    redirectUri: String(form.get('redirectUri') || ''),
    state: String(form.get('state') || ''),
    codeChallenge: String(form.get('codeChallenge') || ''),
    resource: String(form.get('resource') || ''),
    scope: String(form.get('scope') || ''),
  };
  const client = await validate(input, 'code', 'S256');
  if (!client || !isAllowedResource(input.resource, requestOrigin(request))) return html('<h1>Solicitud OAuth inválida</h1>', 400);
  try {
    const code = await consumeLinkCodeAndIssueAuthorization({
      code: String(form.get('linkCode') || ''),
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      resource: input.resource,
      scopes: input.scope.split(/\s+/).filter(Boolean),
    });
    const redirect = new URL(input.redirectUri);
    redirect.searchParams.set('code', code);
    if (input.state) redirect.searchParams.set('state', input.state);
    // OAuth authorization responses must switch the user agent back to GET.
    // NextResponse.redirect defaults to 307, which preserves POST and makes
    // Grok resubmit the already-consumed one-time link code at its callback.
    return NextResponse.redirect(redirect, { status: 302 });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_link_code') {
      return html(
        renderPage(input, client.clientName, 'El código no es válido, ya fue usado o venció. Genera uno nuevo en WhatsPro.'),
        200,
        [requestOrigin(request), input.redirectUri],
      );
    }
    console.error('[grok-connector authorize]', error);
    return html(
      renderPage(input, client.clientName, 'No se pudo autorizar la conexión. Intenta nuevamente.'),
      500,
      [requestOrigin(request), input.redirectUri],
    );
  }
}
