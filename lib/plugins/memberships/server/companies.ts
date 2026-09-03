import 'server-only';

import { and, asc, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  teamCustomers,
  teamCustomerStores,
  teamMembershipCompanies,
  teamMembershipPlans,
  teamMembershipSubscriptions,
} from '@/lib/db/schema';

/**
 * Empresas de membresías (a quién le vendés planes), sin sesión.
 *
 * Extraído de las rutas de /api/plugins/memberships/companies para que la
 * pantalla y el conector usen la misma regla. Acá NO se chequean permisos.
 */

export class MembershipCompanyError extends Error {}

export const membershipCompanySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  logoUrl: z.string().max(2000).optional().nullable(),
  website: z.string().max(2000).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  phone: z.string().max(80).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).default(''),
  status: z.enum(['active', 'archived']).default('active'),
  position: z.number().int().optional(),
});
export type MembershipCompanyInput = z.infer<typeof membershipCompanySchema>;

export const membershipCompanyUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  logoUrl: z.string().max(2000).optional().nullable(),
  website: z.string().max(2000).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  phone: z.string().max(80).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['active', 'archived']).optional(),
  position: z.number().int().optional(),
});
export type MembershipCompanyUpdateInput = z.infer<typeof membershipCompanyUpdateSchema>;

export async function getMembershipCompany(teamId: number, companyId: number) {
  return db.query.teamMembershipCompanies.findFirst({
    where: and(eq(teamMembershipCompanies.id, companyId), eq(teamMembershipCompanies.teamId, teamId)),
  });
}

/**
 * Lista las empresas. La que viene de aapp.space trae además los KPIs de la
 * integración (clientes, membresías activas y tiendas sincronizadas).
 */
export async function listMembershipCompanies(teamId: number) {
  const companies = await db
    .select()
    .from(teamMembershipCompanies)
    .where(eq(teamMembershipCompanies.teamId, teamId))
    .orderBy(asc(teamMembershipCompanies.position), asc(teamMembershipCompanies.name));

  if (!companies.some((company) => company.externalSource === 'aapp_space')) {
    return companies.map((company) => ({ ...company, kpis: undefined }));
  }

  const [[customerCount], [membershipCount], [storeCount]] = await Promise.all([
    db.select({ value: count() }).from(teamCustomers).where(and(eq(teamCustomers.teamId, teamId), eq(teamCustomers.source, 'aapp_space'))),
    db.select({ value: count() }).from(teamMembershipSubscriptions).where(and(eq(teamMembershipSubscriptions.teamId, teamId), eq(teamMembershipSubscriptions.externalSource, 'aapp_space'), eq(teamMembershipSubscriptions.status, 'active'))),
    db.select({ value: count() }).from(teamCustomerStores).where(eq(teamCustomerStores.teamId, teamId)),
  ]);
  const kpis = { customers: Number(customerCount.value), activeMemberships: Number(membershipCount.value), stores: Number(storeCount.value) };
  return companies.map((company) => ({ ...company, kpis: company.externalSource === 'aapp_space' ? kpis : undefined }));
}

export async function createMembershipCompany(teamId: number, userId: number, d: MembershipCompanyInput) {
  const [created] = await db
    .insert(teamMembershipCompanies)
    .values({
      teamId,
      name: d.name,
      description: d.description,
      logoUrl: d.logoUrl || null,
      website: d.website || null,
      email: d.email || null,
      phone: d.phone || null,
      address: d.address || null,
      notes: d.notes,
      status: d.status,
      position: d.position ?? 0,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  return created;
}

/** Devuelve null si la empresa no es del equipo. */
export async function updateMembershipCompany(teamId: number, userId: number, companyId: number, d: MembershipCompanyUpdateInput) {
  const [updated] = await db
    .update(teamMembershipCompanies)
    .set({
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.logoUrl !== undefined ? { logoUrl: d.logoUrl || null } : {}),
      ...(d.website !== undefined ? { website: d.website || null } : {}),
      ...(d.email !== undefined ? { email: d.email || null } : {}),
      ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
      ...(d.address !== undefined ? { address: d.address || null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.position !== undefined ? { position: d.position } : {}),
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(teamMembershipCompanies.id, companyId), eq(teamMembershipCompanies.teamId, teamId)))
    .returning();
  return updated ?? null;
}

/** Cuántos planes y suscripciones quedarían huérfanos (FK en set null) al borrar. */
export async function membershipCompanyDependents(teamId: number, companyId: number) {
  const [[plans], [subscriptions]] = await Promise.all([
    db.select({ value: count() }).from(teamMembershipPlans).where(and(eq(teamMembershipPlans.teamId, teamId), eq(teamMembershipPlans.companyId, companyId))),
    db.select({ value: count() }).from(teamMembershipSubscriptions).where(and(eq(teamMembershipSubscriptions.teamId, teamId), eq(teamMembershipSubscriptions.companyId, companyId))),
  ]);
  return { plans: Number(plans.value), subscriptions: Number(subscriptions.value) };
}

/** Devuelve false si la empresa no es del equipo. Los planes y suscripciones quedan sin empresa (FK set null). */
export async function deleteMembershipCompany(teamId: number, _userId: number, companyId: number) {
  const [deleted] = await db
    .delete(teamMembershipCompanies)
    .where(and(eq(teamMembershipCompanies.id, companyId), eq(teamMembershipCompanies.teamId, teamId)))
    .returning({ id: teamMembershipCompanies.id });
  return Boolean(deleted);
}
