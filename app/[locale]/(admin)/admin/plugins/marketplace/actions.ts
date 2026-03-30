'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { marketplaceItemPrices, marketplaceItems } from '@/lib/db/schema';
import { generateStructuredObjectForTeam } from '@/lib/plugins/ai-chat/server/structured-output';

const MARKETPLACE_ALLOWED_STATUSES = ['draft', 'active', 'archived'] as const;
const MARKETPLACE_DEFAULT_CATEGORIES = ['general', 'automation', 'analytics', 'support', 'sales', 'marketing'];

const aiPriceSchema = z.object({
  billingType: z.enum(['one_time', 'monthly', 'yearly']).default('monthly'),
  amount: z.number().int().min(0).max(10_000_000),
  currency: z.string().min(3).max(3).default('usd'),
  enabled: z.boolean().default(true),
});

const aiMarketplaceItemSchema = z.object({
  title: z.string().min(3).max(180),
  subtitle: z.string().max(255).optional().nullable(),
  category: z.string().min(1).max(80),
  description: z.string().min(20).max(5000),
  tags: z.array(z.string().min(1).max(32)).min(1).max(10),
  iconUrl: z.string().url().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  interfaceBlocks: z.array(z.record(z.string(), z.unknown())).default([]),
  customFields: z.array(z.record(z.string(), z.unknown())).default([]),
  prices: z.array(aiPriceSchema).min(1).max(3),
  status: z.enum(MARKETPLACE_ALLOWED_STATUSES).default('draft'),
});

const generateOneInputSchema = z.object({
  teamId: z.number().int().positive(),
  prompt: z.string().min(10).max(1200),
  publish: z.boolean().optional().default(false),
});

const batchInputSchema = z.object({
  teamId: z.number().int().positive(),
  prompts: z.array(z.string().min(8).max(1000)).min(1).max(8),
  publish: z.boolean().optional().default(false),
});

const improveInputSchema = z.object({
  teamId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  instruction: z.string().min(10).max(1500),
  publish: z.boolean().optional().default(false),
});

const saveDraftSchema = z.object({
  draft: aiMarketplaceItemSchema,
  publish: z.boolean().optional().default(false),
  itemId: z.number().int().positive().optional(),
});

async function assertAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  return user;
}

function normalizeStringList(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function normalizeCategory(category: string) {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, '_');
  return normalized || 'general';
}

function normalizeDraftItem(item: z.infer<typeof aiMarketplaceItemSchema>, forceDraft: boolean) {
  const category = normalizeCategory(item.category);
  const knownCategory = MARKETPLACE_DEFAULT_CATEGORIES.includes(category) ? category : 'general';

  const normalizedPrices = item.prices
    .filter((price) => Number.isFinite(price.amount) && price.amount >= 0)
    .map((price) => ({
      ...price,
      amount: Math.max(0, Math.round(price.amount)),
      currency: price.currency.toLowerCase(),
      billingType: price.billingType,
    }));

  if (normalizedPrices.length === 0) {
    normalizedPrices.push({ billingType: 'monthly', amount: 0, currency: 'usd', enabled: true });
  }

  return {
    title: item.title.trim(),
    subtitle: item.subtitle?.trim() || null,
    category: knownCategory,
    description: item.description.trim(),
    tags: normalizeStringList(item.tags),
    iconUrl: item.iconUrl?.trim() || null,
    imageUrl: item.imageUrl?.trim() || null,
    interfaceBlocks: item.interfaceBlocks,
    customFields: item.customFields,
    prices: normalizedPrices,
    status: forceDraft ? 'draft' : item.status,
  };
}

function buildSystemPrompt() {
  return [
    'Eres un asistente senior de producto para un marketplace B2B SaaS.',
    'Debes crear items listos para vender en panel admin.',
    'Si faltan datos, completa de forma razonable y conservadora.',
    `Usa categorías preferidas: ${MARKETPLACE_DEFAULT_CATEGORIES.join(', ')}.`,
    'Los precios se expresan en centavos enteros (ejemplo 9900 = 99.00).',
  ].join('\n');
}

async function generateItemFromPrompt(teamId: number, prompt: string) {
  const response = await generateStructuredObjectForTeam({
    teamId,
    schema: aiMarketplaceItemSchema,
    systemPrompt: buildSystemPrompt(),
    userPrompt: [
      'Genera un item de marketplace completo.',
      `Prompt del admin: ${prompt}`,
      'Devuelve title, subtitle, category, description, tags, iconUrl, imageUrl, interfaceBlocks, customFields, prices y status.',
    ].join('\n\n'),
  });

  return {
    ...response,
    data: normalizeDraftItem(response.data, true),
  };
}

function computeDiffSummary(previous: Record<string, unknown> | null, next: Record<string, unknown>) {
  if (!previous) return ['Nuevo item (sin versión previa).'];

  const changed = Object.keys(next).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  return changed.length > 0 ? changed.map((key) => `Campo modificado: ${key}`) : ['Sin cambios detectados.'];
}

export async function generateMarketplaceItemWithAI(input: z.infer<typeof generateOneInputSchema>) {
  await assertAdmin();
  const validated = generateOneInputSchema.parse(input);

  const generated = await generateItemFromPrompt(validated.teamId, validated.prompt);

  return {
    ok: true as const,
    draftMode: !validated.publish,
    provider: generated.provider,
    model: generated.model,
    item: generated.data,
    diff: computeDiffSummary(null, generated.data as unknown as Record<string, unknown>),
  };
}

export async function generateMarketplaceItemsBatchWithAI(input: z.infer<typeof batchInputSchema>) {
  await assertAdmin();
  const validated = batchInputSchema.parse(input);

  const results = await Promise.all(
    validated.prompts.map(async (prompt) => {
      const generated = await generateItemFromPrompt(validated.teamId, prompt);
      return {
        prompt,
        provider: generated.provider,
        model: generated.model,
        item: generated.data,
      };
    }),
  );

  return {
    ok: true as const,
    draftMode: !validated.publish,
    results,
  };
}

export async function improveMarketplaceItemWithAI(input: z.infer<typeof improveInputSchema>) {
  await assertAdmin();
  const validated = improveInputSchema.parse(input);

  const existing = await db.query.marketplaceItems.findFirst({
    where: eq(marketplaceItems.id, validated.itemId),
  });

  if (!existing) {
    throw new Error('No existe el item a mejorar.');
  }

  const prices = await db.query.marketplaceItemPrices.findMany({
    where: and(eq(marketplaceItemPrices.itemId, validated.itemId), eq(marketplaceItemPrices.enabled, true)),
  });

  const generated = await generateStructuredObjectForTeam({
    teamId: validated.teamId,
    schema: aiMarketplaceItemSchema,
    systemPrompt: buildSystemPrompt(),
    userPrompt: [
      'Mejora este item existente manteniendo consistencia comercial y técnica.',
      `Item actual: ${JSON.stringify({ ...existing, prices })}`,
      `Instrucción del admin: ${validated.instruction}`,
      'Conserva estructura y mejora copy, categoría, etiquetas y pricing cuando aplique.',
    ].join('\n\n'),
  });

  const normalized = normalizeDraftItem(generated.data, true);

  return {
    ok: true as const,
    draftMode: !validated.publish,
    provider: generated.provider,
    model: generated.model,
    item: normalized,
    previous: {
      ...existing,
      prices,
    },
    diff: computeDiffSummary(
      {
        ...existing,
        prices,
      } as unknown as Record<string, unknown>,
      normalized as unknown as Record<string, unknown>,
    ),
  };
}

export async function saveMarketplaceAIDraft(input: z.infer<typeof saveDraftSchema>) {
  await assertAdmin();
  const validated = saveDraftSchema.parse(input);
  const normalized = normalizeDraftItem(validated.draft, !validated.publish);

  if (validated.itemId) {
    await db
      .update(marketplaceItems)
      .set({
        title: normalized.title,
        subtitle: normalized.subtitle,
        category: normalized.category,
        description: normalized.description,
        tags: normalized.tags,
        iconUrl: normalized.iconUrl,
        imageUrl: normalized.imageUrl,
        interfaceBlocks: normalized.interfaceBlocks,
        customFields: normalized.customFields,
        status: normalized.status,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceItems.id, validated.itemId));

    await db.delete(marketplaceItemPrices).where(eq(marketplaceItemPrices.itemId, validated.itemId));

    if (normalized.prices.length > 0) {
      await db.insert(marketplaceItemPrices).values(
        normalized.prices.map((price) => ({
          itemId: validated.itemId!,
          billingType: price.billingType,
          amount: price.amount,
          currency: price.currency,
          enabled: price.enabled,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }

    revalidatePath('/admin/plugins');
    return { ok: true as const, itemId: validated.itemId, mode: 'updated' as const };
  }

  const [created] = await db
    .insert(marketplaceItems)
    .values({
      title: normalized.title,
      subtitle: normalized.subtitle,
      category: normalized.category,
      description: normalized.description,
      tags: normalized.tags,
      iconUrl: normalized.iconUrl,
      imageUrl: normalized.imageUrl,
      interfaceBlocks: normalized.interfaceBlocks,
      customFields: normalized.customFields,
      status: normalized.status,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: marketplaceItems.id });

  if (normalized.prices.length > 0) {
    await db.insert(marketplaceItemPrices).values(
      normalized.prices.map((price) => ({
        itemId: created.id,
        billingType: price.billingType,
        amount: price.amount,
        currency: price.currency,
        enabled: price.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  }

  revalidatePath('/admin/plugins');
  return { ok: true as const, itemId: created.id, mode: 'created' as const };
}
