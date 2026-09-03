import 'server-only';

import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import {
  branding,
  plans,
  resellerDomains,
  resellerPlanPrices,
  resellerWallets,
  resellers,
  teams,
  walletTransactions,
  paymentProviderSettings,
} from '@/lib/db/schema';

export async function getResellerForUser(userId: number) {
  return db.query.resellers.findFirst({
    where: eq(resellers.ownerUserId, userId),
  });
}

/**
 * Resuelve el reseller del usuario de la sesión. Es la única fuente de la que las
 * server actions del panel pueden sacar el resellerId: nunca se acepta uno que
 * venga del FormData, o un reseller podría editar la marca de otro.
 */
export async function requireReseller() {
  const user = await getUser();
  if (!user) return null;

  const reseller = await getResellerForUser(user.id);
  if (!reseller) return null;

  // Un admin de plataforma que además tenga reseller propio también entra.
  if (user.role !== 'reseller' && user.role !== 'admin') return null;

  return { user, reseller };
}

export async function getResellerBranding(resellerId: number) {
  return db.query.branding.findFirst({
    where: eq(branding.resellerId, resellerId),
  });
}

export async function getResellerDomains(resellerId: number) {
  return db
    .select()
    .from(resellerDomains)
    .where(eq(resellerDomains.resellerId, resellerId))
    .orderBy(desc(resellerDomains.isPrimary), resellerDomains.hostname);
}

export async function getResellerWallet(resellerId: number) {
  return db.query.resellerWallets.findFirst({
    where: eq(resellerWallets.resellerId, resellerId),
  });
}

export async function getWalletTransactions(resellerId: number, limit = 50) {
  return db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.resellerId, resellerId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit);
}

/** Los equipos que pertenecen a este reseller, con su plan. */
export async function getResellerCustomers(resellerId: number) {
  return db
    .select({
      team: teams,
      planName: plans.name,
      planAmount: plans.amount,
    })
    .from(teams)
    .leftJoin(plans, eq(teams.planId, plans.id))
    .where(eq(teams.resellerId, resellerId))
    .orderBy(desc(teams.createdAt));
}

export async function getResellerStats(resellerId: number) {
  const [customers] = await db
    .select({ total: count() })
    .from(teams)
    .where(eq(teams.resellerId, resellerId));

  const [active] = await db
    .select({ total: count() })
    .from(teams)
    .where(
      and(
        eq(teams.resellerId, resellerId),
        eq(teams.subscriptionStatus, 'active'),
      ),
    );

  return {
    totalCustomers: customers?.total ?? 0,
    activeCustomers: active?.total ?? 0,
  };
}

/** Listado para el admin de plataforma: reseller + saldo + nº de clientes. */
export async function listResellersForAdmin() {
  return db
    .select({
      reseller: resellers,
      ownerEmail: sql<string>`(
        SELECT email FROM users WHERE users.id = ${resellers.ownerUserId}
        LIMIT 1
      )`,
      ownerRole: sql<string>`(
        SELECT role FROM users WHERE users.id = ${resellers.ownerUserId}
        LIMIT 1
      )`,
      balance: resellerWallets.balance,
      creditLimit: resellerWallets.creditLimit,
      customers: sql<number>`(
        SELECT COUNT(*) FROM ${teams} WHERE ${teams.resellerId} = ${resellers.id}
      )`.mapWith(Number),
      primaryHost: sql<string | null>`(
        SELECT hostname FROM ${resellerDomains}
        WHERE ${resellerDomains.resellerId} = ${resellers.id} AND is_primary
        LIMIT 1
      )`,
      activeDomains: sql<number>`(
        SELECT COUNT(*) FROM ${resellerDomains}
        WHERE ${resellerDomains.resellerId} = ${resellers.id}
          AND status = 'active' AND verified_at IS NOT NULL
      )`.mapWith(Number),
      publishedPlans: sql<number>`(
        SELECT COUNT(*) FROM ${resellerPlanPrices}
        WHERE ${resellerPlanPrices.resellerId} = ${resellers.id} AND is_published
      )`.mapWith(Number),
      enabledProviders: sql<number>`(
        SELECT COUNT(*) FROM ${paymentProviderSettings}
        WHERE ${paymentProviderSettings.resellerId} = ${resellers.id} AND enabled
      )`.mapWith(Number),
    })
    .from(resellers)
    .leftJoin(resellerWallets, eq(resellerWallets.resellerId, resellers.id))
    .orderBy(desc(resellers.createdAt));
}
