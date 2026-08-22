import { NextRequest, NextResponse } from 'next/server';
import { revokeToken } from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = String(form.get('token') || '');
  if (token) await revokeToken(token);
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
