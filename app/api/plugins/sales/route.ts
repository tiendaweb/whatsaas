import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, teamSales } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const saleItemSchema = z.object({
  articleId: z.number().int().nullable().default(null),
  name: z.string(),
  sku: z.string().default(''),
  quantity: z.number().min(0.001),
  unitPrice: z.number().int().min(0),
  total: z.number().int().min(0),
});

const saleSchema = z.object({
  contactId: z.number().int().optional().nullable(),
  saleNumber: z.string().max(50).optional(),
  status: z.enum(['draft', 'confirmed', 'paid', 'cancelled', 'refunded']).default('draft'),
  currency: z.string().length(3).default('USD'),
  items: z.array(saleItemSchema).default([]),
  subtotal: z.number().int().min(0).default(0),
  discountAmount: z.number().int().min(0).default(0),
  taxAmount: z.number().int().min(0).default(0),
  total: z.number().int().min(0).default(0),
  notes: z.string().default(''),
  dueDate: z.string().datetime().optional().nullable(),
});

function parseDate(v: string | null | undefined) {
  if (!v) return null;
  return new Date(v);
}

async function nextSaleNumber(teamId: number): Promise<string> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(teamSales)
    .where(eq(teamSales.teamId, teamId));
  const n = (result[0]?.count ?? 0) + 1;
  return `V-${String(n).padStart(4, '0')}`;
}

export async function GET() {
  const ctx = await getPluginRequestContext('salesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const sales = await db
    .select({
      id: teamSales.id,
      teamId: teamSales.teamId,
      contactId: teamSales.contactId,
      contactName: contacts.name,
      contactPhone: chats.remoteJid,
      saleNumber: teamSales.saleNumber,
      status: teamSales.status,
      currency: teamSales.currency,
      items: teamSales.items,
      subtotal: teamSales.subtotal,
      discountAmount: teamSales.discountAmount,
      taxAmount: teamSales.taxAmount,
      total: teamSales.total,
      notes: teamSales.notes,
      paidAt: teamSales.paidAt,
      dueDate: teamSales.dueDate,
      createdAt: teamSales.createdAt,
      updatedAt: teamSales.updatedAt,
    })
    .from(teamSales)
    .leftJoin(contacts, eq(teamSales.contactId, contacts.id))
    .leftJoin(chats, eq(contacts.chatId, chats.id))
    .where(eq(teamSales.teamId, ctx.team.id))
    .orderBy(desc(teamSales.createdAt));

  return NextResponse.json(sales);
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('salesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const saleNumber = d.saleNumber?.trim() || await nextSaleNumber(ctx.team.id);

  const [created] = await db
    .insert(teamSales)
    .values({
      teamId: ctx.team.id,
      contactId: d.contactId ?? null,
      saleNumber,
      status: d.status,
      currency: d.currency,
      items: d.items,
      subtotal: d.subtotal,
      discountAmount: d.discountAmount,
      taxAmount: d.taxAmount,
      total: d.total,
      notes: d.notes,
      dueDate: parseDate(d.dueDate),
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
