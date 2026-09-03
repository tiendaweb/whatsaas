import { NextResponse } from 'next/server';
import { getActiveMarketplaceEntitlements } from '@/lib/plugins/marketplace/server/entitlements';
import { getMarketplaceContext } from '../_lib/context';
import { getBranding } from '@/lib/db/queries/branding';
import { getTenant } from '@/lib/tenant/context';
import { buildBrandIdentity, renderTenantCopy } from '@/lib/branding/constants';

export async function GET() {
  const context = await getMarketplaceContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const [entitlements, branding, tenant] = await Promise.all([
    getActiveMarketplaceEntitlements(context.team.id),
    getBranding(),
    getTenant(),
  ]);
  const identity = buildBrandIdentity(branding, tenant?.hostname);
  return NextResponse.json(renderTenantCopy(entitlements, identity));
}
