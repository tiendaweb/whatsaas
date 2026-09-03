import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamCustomers } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('customersRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const url = new URL(request.url);
  const source = url.searchParams.get('source');
  const query = url.searchParams.get('q')?.trim();
  const filters = [eq(teamCustomers.teamId, ctx.team.id)];
  if (source && source !== 'all') filters.push(eq(teamCustomers.source, source));
  if (query) filters.push(or(ilike(teamCustomers.name, `%${query}%`), ilike(teamCustomers.email, `%${query}%`), ilike(teamCustomers.phone, `%${query}%`))!);
  const customers = await db.select({
    id: teamCustomers.id, name: teamCustomers.name, email: teamCustomers.email, phone: teamCustomers.phone,
    source: teamCustomers.source, profileImage: teamCustomers.profileImage, status: teamCustomers.status,
    lastSyncedAt: teamCustomers.lastSyncedAt, createdAt: teamCustomers.createdAt,
    contactsCount: sql<number>`(select count(*) from team_customer_contacts c where c.customer_id = ${teamCustomers.id})`,
    activeMemberships: sql<number>`(select count(*) from team_membership_subscriptions s where s.customer_id = ${teamCustomers.id} and s.status = 'active')`,
    nextExpiration: sql<string | null>`(select min(s.end_date) from team_membership_subscriptions s where s.customer_id = ${teamCustomers.id} and s.status = 'active' and s.end_date is not null)`,
    storesCount: sql<number>`(select count(*) from team_customer_stores st where st.customer_id = ${teamCustomers.id})`,
    // Ids de los contactos del CRM que ya pertenecen a este cliente. Lo usa el
    // selector de Tareas para NO listar esos contactos otra vez como "lead":
    // el mismo negocio aparecía dos veces, una como cliente y otra como lead.
    contactIds: sql<number[]>`coalesce((select array_agg(cc.contact_id) from team_customer_contacts cc where cc.customer_id = ${teamCustomers.id}), '{}')`,
  }).from(teamCustomers).where(and(...filters)).orderBy(desc(teamCustomers.updatedAt));
  return NextResponse.json(customers);
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('customersWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = z.object({ name: z.string().trim().min(1).max(200), email: z.string().email().optional().nullable().or(z.literal('')), phone: z.string().max(80).optional().nullable(), notes: z.string().max(10000).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [customer] = await db.insert(teamCustomers).values({ teamId: ctx.team.id, name: parsed.data.name, email: parsed.data.email || null, phone: parsed.data.phone || null, notes: parsed.data.notes || '', source: 'manual', createdBy: ctx.user.id, updatedBy: ctx.user.id }).returning();
  return NextResponse.json(customer, { status: 201 });
}
