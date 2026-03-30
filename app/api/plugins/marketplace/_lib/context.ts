import { getTeamForUser, getUser, getUserMembership } from '@/lib/db/queries';

export type MarketplaceContext = {
  team: NonNullable<Awaited<ReturnType<typeof getTeamForUser>>>;
  user: NonNullable<Awaited<ReturnType<typeof getUser>>>;
  membership: NonNullable<Awaited<ReturnType<typeof getUserMembership>>>;
};

export async function getMarketplaceContext() {
  const [team, user, membership] = await Promise.all([
    getTeamForUser(),
    getUser(),
    getUserMembership(),
  ]);

  if (!team || !user || !membership) {
    return { ok: false as const, status: 401, message: 'Unauthorized' };
  }

  return { ok: true as const, team, user, membership };
}

export async function getMarketplaceAdminContext() {
  const context = await getMarketplaceContext();
  if (!context.ok) return context;

  const isAdmin = context.membership.role === 'owner' || context.membership.role === 'admin';
  if (!isAdmin) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }

  return context;
}
