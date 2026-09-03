import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamSales } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

const saleItemSchema = z.object({
  articleId: z.number().int().nullable().default(null),
  name: z.string(),
  sku: z.string().default(''),
  quantity: z.number().min(0.001),
  unitPrice: z.number().int().min(0),
  total: z.number().int().min(0),
});

const updateSchema = z.object({
  contactId: z.number().int().optional().nullable(),
  saleNumber: z.string().max(50).optional(),
  status: z.enum(['draft', 'confirmed', 'paid', 'cancelled', 'refunded']).optional(),
  currency: z.string().length(3).optional(),
  items: z.array(saleItemSchema).optional(),
  subtotal: z.number().int().min(0).optional(),
  discountAmount: z.number().int().min(0).optional(),
  taxAmount: z.number().int().min(0).optional(),
  total: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
});

function parseDate(v: string | null | undefined) {
  if (v === undefined) return undefined;
  if (!v) return null;
  return new Date(v);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('salesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const saleId = parseInt(id, 10);
  if (isNaN(saleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const vals: Record<string, unknown> = { updatedBy: ctx.user.id, updatedAt: new Date() };

  if ('contactId' in d) vals.contactId = d.contactId ?? null;
  if (d.saleNumber !== undefined) vals.saleNumber = d.saleNumber;
  if (d.status !== undefined) {
    vals.status = d.status;
    if (d.status === 'paid' && !d.paidAt) vals.paidAt = new Date();
  }
  if (d.currency !== undefined) vals.currency = d.currency;
  if (d.items !== undefined) vals.items = d.items;
  if (d.subtotal !== undefined) vals.subtotal = d.subtotal;
  if (d.discountAmount !== undefined) vals.discountAmount = d.discountAmount;
  if (d.taxAmount !== undefined) vals.taxAmount = d.taxAmount;
  if (d.total !== undefined) vals.total = d.total;
  if (d.notes !== undefined) vals.notes = d.notes;
  const dueDate = parseDate(d.dueDate);
  if (dueDate !== undefined) vals.dueDate = dueDate;
  const paidAt = parseDate(d.paidAt);
  if (paidAt !== undefined) vals.paidAt = paidAt;

  const [updated] = await db
    .update(teamSales)
    .set(vals)
    .where(and(eq(teamSales.id, saleId), eq(teamSales.teamId, ctx.team.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('salesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const saleId = parseInt(id, 10);
  if (isNaN(saleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [deleted] = await db
    .delete(teamSales)
    .where(and(eq(teamSales.id, saleId), eq(teamSales.teamId, ctx.team.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
