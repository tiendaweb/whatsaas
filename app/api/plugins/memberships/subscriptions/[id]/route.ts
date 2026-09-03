import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { contacts, teamCustomers, teamMembershipPlans, teamMembershipSubscriptions } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { BILLING_TYPES, PAYMENT_STATUS, SUBSCRIPTION_STATUS } from '@/lib/plugins/memberships/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

const updateSchema = z.object({
  subscriptionNumber: z.string().min(1).max(50).optional(),
  planId: z.number().int().nullable().optional(),
  customerId: z.number().int().nullable().optional(),
  contactId: z.number().int().nullable().optional(),
  price: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  billingType: z.enum(BILLING_TYPES).optional(),
  status: z.enum(SUBSCRIPTION_STATUS).optional(),
  paymentStatus: z.enum(PAYMENT_STATUS).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).optional(),
});

async function getOwned(teamId: number, id: number) {
  return db.query.teamMembershipSubscriptions.findFirst({
    where: and(eq(teamMembershipSubscriptions.id, id), eq(teamMembershipSubscriptions.teamId, teamId)),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const subId = parseInt(id, 10);
  if (isNaN(subId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await getOwned(ctx.team.id, subId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;

  if (d.contactId != null) {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, d.contactId), eq(contacts.teamId, ctx.team.id)),
      columns: { id: true },
    });
    if (!contact) return NextResponse.json({ error: 'Contacto inválido' }, { status: 400 });
  }
  if (d.customerId != null) {
    const customer = await db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.id, d.customerId), eq(teamCustomers.teamId, ctx.team.id)), columns: { id: true } });
    if (!customer) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });
  }
  const nextCustomerId = d.customerId !== undefined ? d.customerId : existing.customerId;
  const nextContactId = d.contactId !== undefined ? d.contactId : existing.contactId;
  if (nextCustomerId == null && nextContactId == null) return NextResponse.json({ error: 'Selecciona un cliente o contacto' }, { status: 400 });

  // Si cambia el plan, re-snapshotamos nombre/empresa.
  const patch: Record<string, unknown> = {};
  if (d.planId !== undefined) {
    if (d.planId === null) {
      patch.planId = null;
      patch.companyId = null;
      patch.planNameSnapshot = '';
    } else {
      const plan = await db.query.teamMembershipPlans.findFirst({
        where: and(eq(teamMembershipPlans.id, d.planId), eq(teamMembershipPlans.teamId, ctx.team.id)),
      });
      if (!plan) return NextResponse.json({ error: 'Plan inválido' }, { status: 400 });
      patch.planId = plan.id;
      patch.companyId = plan.companyId;
      patch.planNameSnapshot = plan.name;
    }
  }

  const [updated] = await db
    .update(teamMembershipSubscriptions)
    .set({
      ...patch,
      ...(d.subscriptionNumber !== undefined ? { subscriptionNumber: d.subscriptionNumber } : {}),
      ...(d.contactId !== undefined ? { contactId: d.contactId } : {}),
      ...(d.customerId !== undefined ? { customerId: d.customerId } : {}),
      ...(d.price !== undefined ? { price: d.price } : {}),
      ...(d.currency !== undefined ? { currency: d.currency } : {}),
      ...(d.billingType !== undefined ? { billingType: d.billingType } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.paymentStatus !== undefined ? { paymentStatus: d.paymentStatus } : {}),
      ...(d.startDate !== undefined ? { startDate: d.startDate } : {}),
      ...(d.endDate !== undefined ? { endDate: d.endDate } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
      // Al editar reseteamos los recordatorios ya enviados si cambió el vencimiento.
      ...(d.endDate !== undefined && d.endDate !== existing.endDate ? { remindersSent: [] } : {}),
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    })
    .where(eq(teamMembershipSubscriptions.id, subId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const subId = parseInt(id, 10);
  if (isNaN(subId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await getOwned(ctx.team.id, subId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.delete(teamMembershipSubscriptions).where(eq(teamMembershipSubscriptions.id, subId));
  return NextResponse.json({ ok: true });
}
