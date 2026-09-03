import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import {
  createMembershipCompany,
  listMembershipCompanies,
  membershipCompanySchema,
} from '@/lib/plugins/memberships/server/companies';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const ctx = await getPluginRequestContext('membershipsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await listMembershipCompanies(ctx.team.id));
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = membershipCompanySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const created = await createMembershipCompany(ctx.team.id, ctx.user.id, parsed.data);
  return NextResponse.json(created, { status: 201 });
}
