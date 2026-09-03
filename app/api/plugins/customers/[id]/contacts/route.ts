import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, teamCustomerContacts, teamCustomers } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

async function validate(teamId: number, customerId: number, contactId: number) {
  return Promise.all([db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.teamId, teamId), eq(teamCustomers.id, customerId)) }), db.query.contacts.findFirst({ where: and(eq(contacts.teamId, teamId), eq(contacts.id, contactId)) })]);
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersWrite'); if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const customerId = Number((await params).id); const contactId = Number((await request.json()).contactId); const [customer, contact] = await validate(ctx.team.id, customerId, contactId);
  if (!customer || !contact) return NextResponse.json({ error: 'Cliente o contacto inválido' }, { status: 404 });
  const [link] = await db.insert(teamCustomerContacts).values({ teamId: ctx.team.id, customerId, contactId }).onConflictDoNothing().returning(); return NextResponse.json(link || { ok: true }, { status: 201 });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersWrite'); if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const customerId = Number((await params).id); const contactId = Number(new URL(request.url).searchParams.get('contactId'));
  await db.delete(teamCustomerContacts).where(and(eq(teamCustomerContacts.teamId, ctx.team.id), eq(teamCustomerContacts.customerId, customerId), eq(teamCustomerContacts.contactId, contactId))); return NextResponse.json({ ok: true });
}
