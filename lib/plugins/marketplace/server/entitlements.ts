import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { marketplaceOrderLines, teamMarketplaceEntitlements } from '@/lib/db/schema';

type TransactionExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EntitlementsExecutor = typeof db | TransactionExecutor;

type EntitlementWindow = {
  startsAt: Date;
  endsAt: Date | null;
  billingType: string;
  durationDays: number | null;
  lineId: number | null;
  priceId: number | null;
};

async function resolveEntitlementWindow(sourceOrderId: number, executor: EntitlementsExecutor): Promise<EntitlementWindow> {
  const startsAt = new Date();

  const lines = await executor.query.marketplaceOrderLines.findMany({
    where: eq(marketplaceOrderLines.orderId, sourceOrderId),
    with: { price: true },
  });

  const lineWithPrice = lines.find((line) => Boolean(line.price)) ?? null;
  const billingType = lineWithPrice?.price?.billingType ?? 'one_time';

  if (billingType === 'monthly' || billingType === 'yearly') {
    const endsAt = new Date(startsAt);
    const durationDays = billingType === 'monthly' ? 30 : 365;
    endsAt.setDate(endsAt.getDate() + durationDays);

    return {
      startsAt,
      endsAt,
      billingType,
      durationDays,
      lineId: lineWithPrice?.id ?? null,
      priceId: lineWithPrice?.price?.id ?? null,
    };
  }

  return {
    startsAt,
    endsAt: null,
    billingType,
    durationDays: null,
    lineId: lineWithPrice?.id ?? null,
    priceId: lineWithPrice?.price?.id ?? null,
  };
}

export async function activateMarketplaceEntitlement(params: {
  teamId: number;
  itemId: number;
  sourceOrderId: number;
  changedBy: number;
  executor?: EntitlementsExecutor;
}) {
  const now = new Date();
  const executor = params.executor ?? db;
  const window = await resolveEntitlementWindow(params.sourceOrderId, executor);

  const metadata = {
    lastAction: 'approved',
    changedBy: params.changedBy,
    changedAt: now.toISOString(),
    billingType: window.billingType,
    durationDays: window.durationDays,
    sourceOrderLineId: window.lineId,
    sourcePriceId: window.priceId,
  };

  await executor
    .insert(teamMarketplaceEntitlements)
    .values({
      teamId: params.teamId,
      itemId: params.itemId,
      status: 'active',
      sourceOrderId: params.sourceOrderId,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      metadata,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [teamMarketplaceEntitlements.teamId, teamMarketplaceEntitlements.itemId],
      set: {
        status: 'active',
        sourceOrderId: params.sourceOrderId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        metadata,
        updatedAt: now,
      },
    });

  return window;
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

  return { startsAt: now, endsAt: now };
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
      sourceOrder: {
        with: {
          lines: {
            with: {
              price: true,
            },
          },
        },
      },
    },
  });
}
