import { NextRequest, NextResponse } from 'next/server';
import {
  CHATGPT_CONNECTOR_PLUGIN_ID,
  CLAUDE_CONNECTOR_PLUGIN_ID,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  mcpResource,
  requestOrigin,
} from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '600',
};
function error(status: number, code: string, description: string) {
  return NextResponse.json({ error: code, error_description: description }, { status, headers });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await request.json().catch(() => ({} as Record<string, unknown>))
    : Object.fromEntries(await request.formData());
  const basicAuthorization = request.headers.get('authorization');
  let basicClientId = '';
  if (basicAuthorization?.startsWith('Basic ')) {
    try { basicClientId = Buffer.from(basicAuthorization.slice(6), 'base64').toString('utf8').split(':')[0] || ''; } catch { basicClientId = ''; }
  }
  const value = (key: string) => String((body as Record<string, unknown>)[key] || '');
  const grantType = value('grant_type');
  const clientId = value('client_id') || basicClientId;
  const resource = value('resource') || mcpResource(requestOrigin(request));
  const origin = requestOrigin(request);
  const allowedResources = [
    mcpResource(origin),
    mcpResource(origin, CHATGPT_CONNECTOR_PLUGIN_ID),
    mcpResource(origin, CLAUDE_CONNECTOR_PLUGIN_ID),
  ];
  if (!allowedResources.includes(resource)) return error(400, 'invalid_target', 'The requested resource is not available.');
  try {
    const pair = grantType === 'authorization_code'
      ? await exchangeAuthorizationCode({
          clientId,
          code: value('code'),
          redirectUri: value('redirect_uri'),
          verifier: value('code_verifier'),
          resource,
        })
      : grantType === 'refresh_token'
        ? await exchangeRefreshToken({ clientId, refreshToken: value('refresh_token'), resource })
        : null;
    if (!pair) return error(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
    return NextResponse.json(
      {
        access_token: pair.accessToken,
        token_type: 'Bearer',
        expires_in: pair.expiresIn,
        refresh_token: pair.refreshToken,
        scope: pair.scopes.join(' '),
      },
      { headers },
    );
  } catch (tokenError) {
    const code = tokenError instanceof Error ? tokenError.message : 'server_error';
    if (code === 'invalid_client') return error(401, 'invalid_client', 'The OAuth client is invalid or disabled.');
    if (code === 'invalid_grant') return error(400, 'invalid_grant', 'The authorization grant is invalid, expired, used, or does not match PKCE.');
    console.error('[grok-connector token]', tokenError);
    return error(500, 'server_error', 'The token could not be issued.');
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers });
}
