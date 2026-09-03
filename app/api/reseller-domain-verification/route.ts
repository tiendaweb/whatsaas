import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { resellerDomains } from '@/lib/db/schema';
import { normalizeHost } from '@/lib/tenant/resolve';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const hostname = normalizeHost(
    request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
  );
  if (!hostname) {
    return NextResponse.json({ error: 'Missing host.' }, { status: 400 });
  }

  const domain = await db.query.resellerDomains.findFirst({
    where: eq(resellerDomains.hostname, hostname),
  });
  if (!domain?.verificationToken) {
    return NextResponse.json({ error: 'Unknown domain.' }, { status: 404 });
  }

  return NextResponse.json(
    { token: domain.verificationToken },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
