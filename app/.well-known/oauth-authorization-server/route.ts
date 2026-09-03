import { NextRequest, NextResponse } from 'next/server';
import { APP_MAKER_SCOPES, GROK_READ_SCOPE, GROK_WRITE_SCOPE, requestOrigin } from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/plugins/grok-connector/oauth/authorize`,
      token_endpoint: `${origin}/api/plugins/grok-connector/oauth/token`,
      registration_endpoint: `${origin}/api/plugins/grok-connector/oauth/register`,
      revocation_endpoint: `${origin}/api/plugins/grok-connector/oauth/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [GROK_READ_SCOPE, GROK_WRITE_SCOPE, ...APP_MAKER_SCOPES],
    },
    { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
  );
}
