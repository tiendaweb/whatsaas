import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamDomains } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

const updateDomainSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  registrar: z.string().max(100).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  registeredAt: z.string().optional().nullable(),
  autoRenew: z.boolean().optional(),
  status: z.enum(['active', 'expiring_soon', 'expired', 'transferred']).optional(),
  contactId: z.number().int().optional().nullable(),
  notes: z.string().optional(),
  price: z.number().int().optional().nullable(),
  currency: z.string().length(3).optional(),
  tags: z.array(z.string()).optional(),
  notifyDaysBefore: z.number().int().optional(),
});

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return new Date(value);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getPluginRequestContext('domainsWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const domainId = parseInt(id, 10);
  if (isNaN(domainId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = updateDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const expiresAt = parseDate(d.expiresAt);
  const registeredAt = parseDate(d.registeredAt);

  const updateValues: Record<string, unknown> = { updatedBy: context.user.id, updatedAt: new Date() };
  if (d.name !== undefined) updateValues.name = d.name;
  if ('registrar' in d) updateValues.registrar = d.registrar ?? null;
  if ('expiresAt' in d && expiresAt !== undefined) updateValues.expiresAt = expiresAt;
  if ('registeredAt' in d && registeredAt !== undefined) updateValues.registeredAt = registeredAt;
  if (d.autoRenew !== undefined) updateValues.autoRenew = d.autoRenew;
  if (d.status !== undefined) updateValues.status = d.status;
  if ('contactId' in d) updateValues.contactId = d.contactId ?? null;
  if (d.notes !== undefined) updateValues.notes = d.notes;
  if ('price' in d) updateValues.price = d.price ?? null;
  if (d.currency !== undefined) updateValues.currency = d.currency;
  if (d.tags !== undefined) updateValues.tags = d.tags;
  if (d.notifyDaysBefore !== undefined) updateValues.notifyDaysBefore = d.notifyDaysBefore;

  const [updated] = await db
    .update(teamDomains)
    .set(updateValues)
    .where(and(eq(teamDomains.id, domainId), eq(teamDomains.teamId, context.team.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getPluginRequestContext('domainsWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const domainId = parseInt(id, 10);
  if (isNaN(domainId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [deleted] = await db
    .delete(teamDomains)
    .where(and(eq(teamDomains.id, domainId), eq(teamDomains.teamId, context.team.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
