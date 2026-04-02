import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { docsArticleTags, docsArticles, docsCategories, docsTags } from '@/lib/db/schema';

type SearchDocsInput = {
  q?: string;
  category?: string;
  tag?: string;
};

export async function getDocsHomeData() {
  const [categories, featuredArticles] = await Promise.all([
    db
      .select({
        id: docsCategories.id,
        slug: docsCategories.slug,
        name: docsCategories.name,
        description: docsCategories.description,
        icon: docsCategories.icon,
        sortOrder: docsCategories.sortOrder,
        articleCount: count(docsArticles.id),
      })
      .from(docsCategories)
      .leftJoin(
        docsArticles,
        and(
          eq(docsArticles.categoryId, docsCategories.id),
          eq(docsArticles.isPublished, true),
        ),
      )
      .where(eq(docsCategories.isPublished, true))
      .groupBy(
        docsCategories.id,
        docsCategories.slug,
        docsCategories.name,
        docsCategories.description,
        docsCategories.icon,
        docsCategories.sortOrder,
      )
      .orderBy(asc(docsCategories.sortOrder), asc(docsCategories.name)),
    db
      .select({
        id: docsArticles.id,
        slug: docsArticles.slug,
        title: docsArticles.title,
        excerpt: docsArticles.excerpt,
        audience: docsArticles.audience,
        updatedAt: docsArticles.updatedAt,
        category: {
          id: docsCategories.id,
          slug: docsCategories.slug,
          name: docsCategories.name,
        },
      })
      .from(docsArticles)
      .leftJoin(docsCategories, eq(docsArticles.categoryId, docsCategories.id))
      .where(and(eq(docsArticles.isPublished, true), eq(docsArticles.isFeatured, true)))
      .orderBy(asc(docsArticles.sortOrder), desc(docsArticles.updatedAt))
      .limit(8),
  ]);

  return {
    categories,
    featuredArticles,
  };
}

export async function getDocsArticleBySlug(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) {
    return null;
  }

  const [article] = await db
    .select({
      id: docsArticles.id,
      slug: docsArticles.slug,
      title: docsArticles.title,
      excerpt: docsArticles.excerpt,
      contentMd: docsArticles.contentMd,
      contentJson: docsArticles.contentJson,
      audience: docsArticles.audience,
      isPublished: docsArticles.isPublished,
      isFeatured: docsArticles.isFeatured,
      sortOrder: docsArticles.sortOrder,
      createdAt: docsArticles.createdAt,
      updatedAt: docsArticles.updatedAt,
      category: {
        id: docsCategories.id,
        slug: docsCategories.slug,
        name: docsCategories.name,
      },
    })
    .from(docsArticles)
    .leftJoin(docsCategories, eq(docsArticles.categoryId, docsCategories.id))
    .where(and(eq(docsArticles.slug, normalizedSlug), eq(docsArticles.isPublished, true)))
    .limit(1);

  if (!article) {
    return null;
  }

  const tags = await db
    .select({
      id: docsTags.id,
      slug: docsTags.slug,
      name: docsTags.name,
    })
    .from(docsArticleTags)
    .innerJoin(docsTags, eq(docsArticleTags.tagId, docsTags.id))
    .where(eq(docsArticleTags.articleId, article.id))
    .orderBy(asc(docsTags.name));

  return {
    ...article,
    tags,
  };
}

export async function getDocsCategoriesWithArticles() {
  const categories = await db
    .select()
    .from(docsCategories)
    .where(eq(docsCategories.isPublished, true))
    .orderBy(asc(docsCategories.sortOrder), asc(docsCategories.name));

  if (categories.length === 0) {
    return [];
  }

  const articles = await db
    .select({
      id: docsArticles.id,
      slug: docsArticles.slug,
      title: docsArticles.title,
      excerpt: docsArticles.excerpt,
      audience: docsArticles.audience,
      sortOrder: docsArticles.sortOrder,
      categoryId: docsArticles.categoryId,
      updatedAt: docsArticles.updatedAt,
    })
    .from(docsArticles)
    .where(
      and(
        eq(docsArticles.isPublished, true),
        inArray(
          docsArticles.categoryId,
          categories.map((category) => category.id),
        ),
      ),
    )
    .orderBy(asc(docsArticles.sortOrder), desc(docsArticles.updatedAt));

  const groupedArticles = new Map<number, typeof articles>();
  for (const article of articles) {
    if (!article.categoryId) {
      continue;
    }
    const current = groupedArticles.get(article.categoryId) ?? [];
    current.push(article);
    groupedArticles.set(article.categoryId, current);
  }

  return categories.map((category) => ({
    ...category,
    articles: groupedArticles.get(category.id) ?? [],
  }));
}

export async function searchDocsArticles({ q, category, tag }: SearchDocsInput) {
  const qNormalized = q?.trim();
  const categoryNormalized = category?.trim().toLowerCase();
  const tagNormalized = tag?.trim().toLowerCase();

  const conditions = [eq(docsArticles.isPublished, true)];

  if (qNormalized) {
    conditions.push(
      sql`(
        ${docsArticles.title} ILIKE ${`%${qNormalized}%`}
        OR ${docsArticles.excerpt} ILIKE ${`%${qNormalized}%`}
        OR ${docsArticles.contentMd} ILIKE ${`%${qNormalized}%`}
      )`,
    );
  }

  if (categoryNormalized) {
    conditions.push(eq(docsCategories.slug, categoryNormalized));
  }

  if (tagNormalized) {
    conditions.push(eq(docsTags.slug, tagNormalized));
  }

  const articles = await db
    .select({
      id: docsArticles.id,
      slug: docsArticles.slug,
      title: docsArticles.title,
      excerpt: docsArticles.excerpt,
      audience: docsArticles.audience,
      isFeatured: docsArticles.isFeatured,
      sortOrder: docsArticles.sortOrder,
      updatedAt: docsArticles.updatedAt,
      category: {
        id: docsCategories.id,
        slug: docsCategories.slug,
        name: docsCategories.name,
      },
    })
    .from(docsArticles)
    .leftJoin(docsCategories, eq(docsArticles.categoryId, docsCategories.id))
    .leftJoin(docsArticleTags, eq(docsArticleTags.articleId, docsArticles.id))
    .leftJoin(docsTags, eq(docsTags.id, docsArticleTags.tagId))
    .where(and(...conditions))
    .groupBy(
      docsArticles.id,
      docsArticles.slug,
      docsArticles.title,
      docsArticles.excerpt,
      docsArticles.audience,
      docsArticles.isFeatured,
      docsArticles.sortOrder,
      docsArticles.updatedAt,
      docsCategories.id,
      docsCategories.slug,
      docsCategories.name,
    )
    .orderBy(asc(docsArticles.sortOrder), desc(docsArticles.updatedAt));

  return articles;
}
