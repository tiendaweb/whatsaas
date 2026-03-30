import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMarketplaceEntitlements } from '@/lib/db/schema';

type TransactionExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EntitlementsExecutor = typeof db | TransactionExecutor;

export async function activateMarketplaceEntitlement(params: {
  teamId: number;
  itemId: number;
  sourceOrderId: number;
  changedBy: number;
  executor?: EntitlementsExecutor;
}) {
  const now = new Date();
  const executor = params.executor ?? db;

  const metadata = {
    lastAction: 'approved',
    changedBy: params.changedBy,
    changedAt: now.toISOString(),
  };

  await executor
    .insert(teamMarketplaceEntitlements)
    .values({
      teamId: params.teamId,
      itemId: params.itemId,
      status: 'active',
      sourceOrderId: params.sourceOrderId,
      startsAt: now,
      endsAt: null,
      metadata,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [teamMarketplaceEntitlements.teamId, teamMarketplaceEntitlements.itemId],
      set: {
        status: 'active',
        sourceOrderId: params.sourceOrderId,
        startsAt: now,
        endsAt: null,
        metadata,
        updatedAt: now,
      },
    });
}

export async function revokeMarketplaceEntitlement(params: {
  teamId: number;
  itemId: number;
  sourceOrderId: number;
  changedBy: number;
  executor?: EntitlementsExecutor;
}) {
  const now = new Date();
  const executor = params.executor ?? db;

  await executor
    .insert(teamMarketplaceEntitlements)
    .values({
      teamId: params.teamId,
      itemId: params.itemId,
      status: 'revoked',
      sourceOrderId: params.sourceOrderId,
      startsAt: now,
      endsAt: now,
      metadata: {
        lastAction: 'rejected',
        changedBy: params.changedBy,
        changedAt: now.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [teamMarketplaceEntitlements.teamId, teamMarketplaceEntitlements.itemId],
      set: {
        status: 'revoked',
        sourceOrderId: params.sourceOrderId,
        endsAt: now,
        metadata: {
          lastAction: 'rejected',
          changedBy: params.changedBy,
          changedAt: now.toISOString(),
        },
        updatedAt: now,
      },
    });
}

export async function getActiveMarketplaceEntitlements(teamId: number) {
  return db.query.teamMarketplaceEntitlements.findMany({
    where: and(
      eq(teamMarketplaceEntitlements.teamId, teamId),
      eq(teamMarketplaceEntitlements.status, 'active'),
      or(isNull(teamMarketplaceEntitlements.endsAt), gt(teamMarketplaceEntitlements.endsAt, new Date())),
    ),
    with: {
      item: true,
      sourceOrder: true,
    },
  });
}
