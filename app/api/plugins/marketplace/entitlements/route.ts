import { NextResponse } from 'next/server';
import { getActiveMarketplaceEntitlements } from '@/lib/plugins/marketplace/server/entitlements';
import { getMarketplaceContext } from '../_lib/context';

export async function GET() {
  const context = await getMarketplaceContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const entitlements = await getActiveMarketplaceEntitlements(context.team.id);
  return NextResponse.json(entitlements);
}
