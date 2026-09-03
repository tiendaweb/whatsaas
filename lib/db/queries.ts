import { desc, and, eq, isNull, count, not } from 'drizzle-orm';
import { db } from './drizzle';
import { activityLogs, teamMembers, teams, users, plans, contacts, evolutionInstances, resellerPlanPrices } from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export async function getPublishedPlans() {
  return await db.select().from(plans).where(not(plans.isHidden)).orderBy(plans.amount);
}

/**
 * Planes tal y como los ve el visitante de un dominio: en el de la plataforma, los
 * precios de la plataforma; en el de un reseller, SUS precios de venta.
 *
 * Devuelve exactamente el mismo shape que getPublishedPlans() (con retail_amount
 * pisando `amount`), así que pricing-client.tsx no necesita enterarse de nada.
 */
export async function getPublishedPlansForTenant(resellerId?: number | null) {
  if (resellerId == null) {
    return getPublishedPlans();
  }

  const rows = await db
    .select({
      plan: plans,
      retailAmount: resellerPlanPrices.retailAmount,
      currency: resellerPlanPrices.currency,
      externalPriceRef: resellerPlanPrices.externalPriceRef,
    })
    .from(plans)
    .innerJoin(
      resellerPlanPrices,
      and(
        eq(resellerPlanPrices.planId, plans.id),
        eq(resellerPlanPrices.resellerId, resellerId),
        eq(resellerPlanPrices.isPublished, true),
      ),
    )
    .where(not(plans.isHidden))
    .orderBy(resellerPlanPrices.retailAmount);

  return rows.map(({ plan, retailAmount, currency, externalPriceRef }) => ({
    ...plan,
    amount: retailAmount,
    currency,
    // El priceId debe ser el de la cuenta del reseller. Si no lo ha sincronizado,
    // se deja vacío a propósito: el checkout debe fallar, nunca caer al price de la
    // plataforma (cobraría en la cuenta equivocada).
    stripePriceId: externalPriceRef ?? '',
  }));
}

export async function getTeamByStripeCustomerId(
  customerId: string,
  resellerId?: number | null,
) {
  const result = await db
    .select()
    .from(teams)
    .where(
      resellerId === undefined
        ? eq(teams.stripeCustomerId, customerId)
        : and(
            eq(teams.stripeCustomerId, customerId),
            resellerId == null ? isNull(teams.resellerId) : eq(teams.resellerId, resellerId),
          ),
    )
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(teams)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(teams.id, teamId));
}

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: teamMembers.teamId
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getTeamMemberCount(teamId: number) {
  const [result] = await db
    .select({ count: count() })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));
  return result.count;
}

export async function getContactCount(teamId: number) {
  const [result] = await db
    .select({ count: count() })
    .from(contacts)
    .where(eq(contacts.teamId, teamId));
  return result.count;
}

export async function getInstanceCount(teamId: number) {
  const [result] = await db
    .select({ count: count() })
    .from(evolutionInstances)
    .where(eq(evolutionInstances.teamId, teamId));
  return result.count;
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getFreePlan() {
  const result = await db
    .select()
    .from(plans)
    .where(and(eq(plans.amount, 0), not(plans.isHidden)))
    .limit(1);

  return result[0] || null;
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }


  const result = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
    with: {
      team: {
        with: {
          teamMembers: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },
          evolutionInstances: true
        }
      }
    }
  });

  return result?.team || null;
}

export async function getUserMembership() {
  const user = await getUser();
  if (!user) return null;

  const membership = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
    columns: {
      role: true,
      permissions: true,
    }
  });

  return membership || null;
}
