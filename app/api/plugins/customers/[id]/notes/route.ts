import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamCustomers } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const customerId = Number((await params).id);
  const parsed = z.object({ text: z.string().trim().min(1).max(5000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const customer = await db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.teamId, ctx.team.id), eq(teamCustomers.id, customerId)) });
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  const notes = customer.notes ? `${customer.notes}\n\n${parsed.data.text}` : parsed.data.text;
  const [updated] = await db.update(teamCustomers).set({ notes, updatedBy: ctx.user.id, updatedAt: new Date() }).where(eq(teamCustomers.id, customerId)).returning({ notes: teamCustomers.notes });
  return NextResponse.json(updated, { status: 201 });
}
