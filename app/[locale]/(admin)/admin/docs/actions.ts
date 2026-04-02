'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { docsArticleTags, docsArticles, docsCategories, docsTags } from '@/lib/db/schema';

const docsCategorySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'El slug es requerido.')
    .max(140)
    .transform((value) => value.toLowerCase())
    .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), 'Slug inválido.'),
  name: z.string().trim().min(1, 'El nombre es requerido.').max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  icon: z.string().trim().max(80).optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  isPublished: z.boolean().default(false),
});

const docsTagSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'El slug es requerido.')
    .max(140)
    .transform((value) => value.toLowerCase())
    .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), 'Slug inválido.'),
  name: z.string().trim().min(1, 'El nombre es requerido.').max(120),
});

const docsAudienceSchema = z.enum(['technical', 'non_technical', 'mixed']);

const docsArticleSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'El slug es requerido.')
    .max(180)
    .transform((value) => value.toLowerCase())
    .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), 'Slug inválido.'),
  title: z.string().trim().min(1, 'El título es requerido.').max(255),
  excerpt: z.string().trim().max(4000).optional().nullable(),
  contentMd: z.string().max(200000).optional().nullable(),
  contentJson: z.any().optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  audience: docsAudienceSchema.default('mixed'),
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

const recordIdSchema = z.number().int().positive();

const articleTagLinkSchema = z.object({
  articleId: z.number().int().positive(),
  tagId: z.number().int().positive(),
});

async function verifyAdmin() {
  const user = await getUser();

  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function revalidateDocsPaths(slug?: string) {
  revalidatePath('/docs');
  if (slug) {
    revalidatePath(`/docs/${slug}`);
  }

  revalidatePath('/admin/docs');
  revalidatePath('/admin/docs/categories');
  revalidatePath('/admin/docs/tags');
  revalidatePath('/admin/docs/articles');
}

function normalizeNullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function createDocsCategory(payload: z.infer<typeof docsCategorySchema>) {
  await verifyAdmin();
  const validated = docsCategorySchema.parse(payload);

  const [created] = await db
    .insert(docsCategories)
    .values({
      slug: validated.slug,
      name: validated.name,
      description: normalizeNullableText(validated.description),
      icon: normalizeNullableText(validated.icon),
      sortOrder: validated.sortOrder,
      isPublished: validated.isPublished,
      updatedAt: new Date(),
    })
    .returning();

  revalidateDocsPaths();
  return created;
}

export async function updateDocsCategory(id: number, payload: z.infer<typeof docsCategorySchema>) {
  await verifyAdmin();
  const validatedId = recordIdSchema.parse(id);
  const validated = docsCategorySchema.parse(payload);

  const [updated] = await db
    .update(docsCategories)
    .set({
      slug: validated.slug,
      name: validated.name,
      description: normalizeNullableText(validated.description),
      icon: normalizeNullableText(validated.icon),
      sortOrder: validated.sortOrder,
      isPublished: validated.isPublished,
      updatedAt: new Date(),
    })
    .where(eq(docsCategories.id, validatedId))
    .returning();

  revalidateDocsPaths();
  return updated ?? null;
}

export async function deleteDocsCategory(id: number) {
  await verifyAdmin();
  const validatedId = recordIdSchema.parse(id);

  const [deleted] = await db
    .delete(docsCategories)
    .where(eq(docsCategories.id, validatedId))
    .returning();

  revalidateDocsPaths();
  return deleted ?? null;
}

export async function createDocsTag(payload: z.infer<typeof docsTagSchema>) {
  await verifyAdmin();
  const validated = docsTagSchema.parse(payload);

  const [created] = await db
    .insert(docsTags)
    .values({
      slug: validated.slug,
      name: validated.name,
    })
    .returning();

  revalidateDocsPaths();
  return created;
}

export async function updateDocsTag(id: number, payload: z.infer<typeof docsTagSchema>) {
  await verifyAdmin();
  const validatedId = recordIdSchema.parse(id);
  const validated = docsTagSchema.parse(payload);

  const [updated] = await db
    .update(docsTags)
    .set({
      slug: validated.slug,
      name: validated.name,
    })
    .where(eq(docsTags.id, validatedId))
    .returning();

  revalidateDocsPaths();
  return updated ?? null;
}

export async function deleteDocsTag(id: number) {
  await verifyAdmin();
  const validatedId = recordIdSchema.parse(id);

  const [deleted] = await db
    .delete(docsTags)
    .where(eq(docsTags.id, validatedId))
    .returning();

  revalidateDocsPaths();
  return deleted ?? null;
}

export async function createDocsArticle(payload: z.infer<typeof docsArticleSchema>) {
  await verifyAdmin();
  const validated = docsArticleSchema.parse(payload);

  const [created] = await db
    .insert(docsArticles)
    .values({
      slug: validated.slug,
      title: validated.title,
      excerpt: normalizeNullableText(validated.excerpt),
      contentMd: normalizeNullableText(validated.contentMd),
      contentJson: validated.contentJson ?? null,
      categoryId: validated.categoryId ?? null,
      audience: validated.audience,
      isPublished: validated.isPublished,
      isFeatured: validated.isFeatured,
      sortOrder: validated.sortOrder,
      updatedAt: new Date(),
    })
    .returning();

  revalidateDocsPaths(created?.slug);
  return created;
}

export async function updateDocsArticle(id: number, payload: z.infer<typeof docsArticleSchema>) {
  await verifyAdmin();
  const validatedId = recordIdSchema.parse(id);
  const validated = docsArticleSchema.parse(payload);

  const [updated] = await db
    .update(docsArticles)
    .set({
      slug: validated.slug,
      title: validated.title,
      excerpt: normalizeNullableText(validated.excerpt),
      contentMd: normalizeNullableText(validated.contentMd),
      contentJson: validated.contentJson ?? null,
      categoryId: validated.categoryId ?? null,
      audience: validated.audience,
      isPublished: validated.isPublished,
      isFeatured: validated.isFeatured,
      sortOrder: validated.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(docsArticles.id, validatedId))
    .returning();

  revalidateDocsPaths(updated?.slug);
  return updated ?? null;
}

export async function deleteDocsArticle(id: number) {
  await verifyAdmin();
  const validatedId = recordIdSchema.parse(id);

  const [deleted] = await db
    .delete(docsArticles)
    .where(eq(docsArticles.id, validatedId))
    .returning();

  revalidateDocsPaths(deleted?.slug);
  return deleted ?? null;
}

export async function attachTagToDocsArticle(payload: z.infer<typeof articleTagLinkSchema>) {
  await verifyAdmin();
  const validated = articleTagLinkSchema.parse(payload);

  await db
    .insert(docsArticleTags)
    .values({
      articleId: validated.articleId,
      tagId: validated.tagId,
    })
    .onConflictDoNothing();

  const article = await db.query.docsArticles.findFirst({
    where: eq(docsArticles.id, validated.articleId),
    columns: {
      slug: true,
    },
  });

  revalidateDocsPaths(article?.slug);
}

export async function detachTagFromDocsArticle(payload: z.infer<typeof articleTagLinkSchema>) {
  await verifyAdmin();
  const validated = articleTagLinkSchema.parse(payload);

  await db
    .delete(docsArticleTags)
    .where(
      and(
        eq(docsArticleTags.articleId, validated.articleId),
        eq(docsArticleTags.tagId, validated.tagId),
      ),
    );

  const article = await db.query.docsArticles.findFirst({
    where: eq(docsArticles.id, validated.articleId),
    columns: {
      slug: true,
    },
  });

  revalidateDocsPaths(article?.slug);
}
