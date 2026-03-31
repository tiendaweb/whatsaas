import { db } from '@/lib/db/drizzle';
import { marketplaceItems, marketplaceOrders, teams, users } from '@/lib/db/schema';
import { eq, and, desc, asc, like, sql } from 'drizzle-orm';

export async function getMarketplaceItems(filters?: {
  category?: string;
  search?: string;
  activeOnly?: boolean;
}) {
  const conditions = [];

  if (filters?.activeOnly !== false) {
    conditions.push(eq(marketplaceItems.isActive, true));
  }
  if (filters?.category) {
    conditions.push(eq(marketplaceItems.category, filters.category));
  }
  if (filters?.search) {
    conditions.push(
      sql`(${marketplaceItems.title} ILIKE ${'%' + filters.search + '%'} OR ${marketplaceItems.subtitle} ILIKE ${'%' + filters.search + '%'})`,
    );
  }

  return db
    .select()
    .from(marketplaceItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(marketplaceItems.order), asc(marketplaceItems.title));
}

export async function getMarketplaceItemById(id: number) {
  return db.query.marketplaceItems.findFirst({
    where: eq(marketplaceItems.id, id),
  });
}

export async function getMarketplaceCategories() {
  const rows = await db
    .selectDistinct({ category: marketplaceItems.category })
    .from(marketplaceItems)
    .where(eq(marketplaceItems.isActive, true))
    .orderBy(asc(marketplaceItems.category));

  return rows.map((r: { category: string }) => r.category);
}

export async function createMarketplaceItem(
  data: Omit<typeof marketplaceItems.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>,
) {
  const [item] = await db
    .insert(marketplaceItems)
    .values({ ...data, createdAt: new Date(), updatedAt: new Date() })
    .returning();
  return item;
}

export async function updateMarketplaceItem(
  id: number,
  data: Partial<Omit<typeof marketplaceItems.$inferInsert, 'id' | 'createdAt'>>,
) {
  const [item] = await db
    .update(marketplaceItems)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(marketplaceItems.id, id))
    .returning();
  return item;
}

export async function deleteMarketplaceItem(id: number) {
  await db.delete(marketplaceItems).where(eq(marketplaceItems.id, id));
}

export async function getMarketplaceOrders(filters?: { status?: string; teamId?: number }) {
  const conditions = [];

  if (filters?.status) {
    conditions.push(eq(marketplaceOrders.status, filters.status));
  }
  if (filters?.teamId) {
    conditions.push(eq(marketplaceOrders.teamId, filters.teamId));
  }

  const rows = await db
    .select({
      order: marketplaceOrders,
      item: marketplaceItems,
      team: { id: teams.id, name: teams.name },
      requestedByUser: { id: users.id, name: users.name, email: users.email },
    })
    .from(marketplaceOrders)
    .innerJoin(marketplaceItems, eq(marketplaceOrders.marketplaceItemId, marketplaceItems.id))
    .innerJoin(teams, eq(marketplaceOrders.teamId, teams.id))
    .innerJoin(users, eq(marketplaceOrders.requestedBy, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(marketplaceOrders.createdAt));

  return rows;
}

export async function getMarketplaceOrdersByTeam(teamId: number) {
  return db
    .select({
      order: marketplaceOrders,
      item: { id: marketplaceItems.id, title: marketplaceItems.title, iconUrl: marketplaceItems.iconUrl },
    })
    .from(marketplaceOrders)
    .innerJoin(marketplaceItems, eq(marketplaceOrders.marketplaceItemId, marketplaceItems.id))
    .where(eq(marketplaceOrders.teamId, teamId))
    .orderBy(desc(marketplaceOrders.createdAt));
}

export async function createMarketplaceOrder(data: {
  teamId: number;
  marketplaceItemId: number;
  requestedBy: number;
  pricingType: string;
  amount?: string | null;
  notes?: string | null;
}) {
  const [order] = await db
    .insert(marketplaceOrders)
    .values({
      ...data,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return order;
}

export async function updateMarketplaceOrderStatus(
  id: number,
  status: string,
  reviewedBy: number,
  adminNotes?: string | null,
) {
  const [order] = await db
    .update(marketplaceOrders)
    .set({
      status,
      reviewedBy,
      adminNotes,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(marketplaceOrders.id, id))
    .returning();
  return order;
}
