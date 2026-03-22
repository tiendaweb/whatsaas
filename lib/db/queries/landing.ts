import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landingContent, landingPages } from '@/lib/db/schema';
import { defaultLandingContent } from '@/lib/landing/default-content';
import type { LandingContentRecord } from '@/lib/landing/types';

function mergeLandingContent(record?: {
  homeSections: LandingContentRecord['homeSections'];
  faqItems: LandingContentRecord['faqItems'];
} | null): LandingContentRecord {
  return {
    homeSections:
      record?.homeSections && record.homeSections.length > 0
        ? record.homeSections
        : defaultLandingContent.homeSections,
    faqItems:
      record?.faqItems && record.faqItems.length > 0
        ? record.faqItems
        : defaultLandingContent.faqItems,
  };
}

export async function getLandingContent(): Promise<LandingContentRecord> {
  const record = await db.query.landingContent.findFirst();
  return mergeLandingContent(record);
}


export async function getLandingPages() {
  return await db.select().from(landingPages).orderBy(asc(landingPages.createdAt));
}

export async function getLandingPageBySlug(slug: string) {
  const [page] = await db
    .select()
    .from(landingPages)
    .where(eq(landingPages.slug, slug))
    .limit(1);

  return page ?? null;
}
