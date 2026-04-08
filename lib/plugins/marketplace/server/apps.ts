import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { marketplaceItems } from "@/lib/db/schema";

export async function getAllApps(filters?: { category?: string; status?: string; isDefault?: boolean }) {
  const conditions = [];

  if (filters?.category) {
    conditions.push(eq(marketplaceItems.category, filters.category));
  }

  if (filters?.status) {
    conditions.push(eq(marketplaceItems.status, filters.status));
  }

  if (filters?.isDefault !== undefined) {
    conditions.push(eq(marketplaceItems.isDefault, filters.isDefault));
  }

  const apps = await db.query.marketplaceItems.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: (items) => items.createdAt,
  });

  return apps;
}

export async function getAppById(id: number) {
  const app = await db.query.marketplaceItems.findFirst({
    where: eq(marketplaceItems.id, id),
  });

  return app;
}

export async function getAppsByCategory(category: string) {
  const apps = await db.query.marketplaceItems.findMany({
    where: and(
      eq(marketplaceItems.category, category),
      eq(marketplaceItems.status, "active")
    ),
  });

  return apps;
}

export async function getDefaultApps() {
  const apps = await db.query.marketplaceItems.findMany({
    where: and(
      eq(marketplaceItems.isDefault, true),
      eq(marketplaceItems.status, "active")
    ),
  });

  return apps;
}

export async function createApp(data: {
  title: string;
  subtitle?: string;
  description?: string;
  category: string;
  isDefault?: boolean;
  isFunctional?: boolean;
  appType?: string;
  iconUrl?: string;
  imageUrl?: string;
  features?: Array<{ id: string; name: string; description: string; enabled?: boolean }>;
  tags?: string[];
}) {
  const app = await db
    .insert(marketplaceItems)
    .values({
      title: data.title,
      subtitle: data.subtitle,
      description: data.description,
      category: data.category,
      isDefault: data.isDefault || false,
      isFunctional: data.isFunctional || false,
      appType: data.appType || "installable",
      iconUrl: data.iconUrl,
      imageUrl: data.imageUrl,
      features: data.features || [],
      tags: data.tags || [],
      status: "active",
    })
    .returning();

  return app[0];
}

export async function updateApp(
  id: number,
  data: Partial<{
    title: string;
    subtitle: string;
    description: string;
    category: string;
    isDefault: boolean;
    isFunctional: boolean;
    appType: string;
    iconUrl: string;
    imageUrl: string;
    features: Array<{ id: string; name: string; description: string; enabled?: boolean }>;
    tags: string[];
    status: string;
  }>
) {
  const app = await db
    .update(marketplaceItems)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceItems.id, id))
    .returning();

  return app[0];
}

export async function deleteApp(id: number) {
  await db.delete(marketplaceItems).where(eq(marketplaceItems.id, id));
}
