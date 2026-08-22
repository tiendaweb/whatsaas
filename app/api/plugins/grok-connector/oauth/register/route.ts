import { NextRequest, NextResponse } from 'next/server';
import { registerOAuthClient } from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '600',
};

const registrationBuckets = new Map<string, { startedAt: number; count: number }>();

function allowRegistration(request: NextRequest) {
  const key = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
  const now = Date.now();
  let bucket = registrationBuckets.get(key);
  if (!bucket || now - bucket.startedAt > 10 * 60_000) bucket = { startedAt: now, count: 0 };
  bucket.count += 1;
  registrationBuckets.set(key, bucket);
  return bucket.count <= 20;
}

function oauthError(status: number, error: string, description: string) {
  return NextResponse.json({ error, error_description: description }, { status, headers: { 'Cache-Control': 'no-store', ...corsHeaders } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  if (!allowRegistration(request)) return oauthError(429, 'temporarily_unavailable', 'Too many client registration attempts. Try again later.');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return oauthError(400, 'invalid_client_metadata', 'A JSON registration document is required.');
  }
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((value): value is string => typeof value === 'string') : [];
  if (!redirectUris.length || redirectUris.length > 10) return oauthError(400, 'invalid_redirect_uri', 'Provide between one and ten redirect URIs.');
  for (const redirectUri of redirectUris) {
    try {
      const parsed = new URL(redirectUri);
      if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') throw new Error('insecure');
      if (parsed.hash) throw new Error('fragment');
    } catch {
      return oauthError(400, 'invalid_redirect_uri', 'Every redirect URI must be an absolute HTTPS URL without a fragment.');
    }
  }
  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types.filter((value): value is string => typeof value === 'string') : ['authorization_code', 'refresh_token'];
  const responseTypes = Array.isArray(body.response_types) ? body.response_types.filter((value): value is string => typeof value === 'string') : ['code'];
  if (!grantTypes.includes('authorization_code') || !responseTypes.includes('code')) {
    return oauthError(400, 'invalid_client_metadata', 'This server requires the authorization_code grant and code response type.');
  }
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') {
    return oauthError(400, 'invalid_client_metadata', 'Only public clients with token_endpoint_auth_method=none are supported.');
  }
  try {
    const client = await registerOAuthClient({
      clientName: typeof body.client_name === 'string' ? body.client_name.slice(0, 160) : 'AI Connector',
      redirectUris,
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
    });
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store', ...corsHeaders } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'connector_unavailable') {
      return oauthError(403, 'access_denied', 'The AI connector is not currently enabled.');
    }
    console.error('[grok-connector register]', error);
    return oauthError(500, 'server_error', 'The client could not be registered.');
  }
}
