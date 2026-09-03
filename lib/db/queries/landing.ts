import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { landingContent, landingPages } from "@/lib/db/schema";
import { defaultLandingContent } from "@/lib/landing/default-content";
import { normalizeLandingPageSections } from "@/lib/landing/page-sections";
import { withLandingStorageFallback } from "@/lib/landing/storage";
import type { LandingContentRecord } from "@/lib/landing/types";

function mergeLandingContent(
  record?: {
    homeSections: LandingContentRecord["homeSections"];
    faqItems: LandingContentRecord["faqItems"];
  } | null,
): LandingContentRecord {
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

function normalizeLandingPageRecord<
  T extends {
    name: string;
    content: string;
    contentMode?: import("@/lib/landing/types").LandingPageContentMode | null;
    externalPrompt?: string | null;
    sections?: Parameters<typeof normalizeLandingPageSections>[0];
  },
>(page: T) {
  return {
    ...page,
    contentMode: page.contentMode ?? "builder",
    externalPrompt: page.externalPrompt ?? "",
    sections: normalizeLandingPageSections(
      page.sections,
      page.name,
      page.content,
    ),
  };
}

/**
 * Cada tenant tiene sus propias landings. `resellerId` null = las de la plataforma;
 * sin este filtro, el dominio principal mostraría la landing de cualquier reseller.
 */
function landingPageScope(resellerId?: number | null) {
  return resellerId == null
    ? isNull(landingPages.resellerId)
    : eq(landingPages.resellerId, resellerId);
}

export async function getLandingContent(
  resellerId?: number | null,
): Promise<LandingContentRecord> {
  return withLandingStorageFallback(
    "getLandingContent",
    async () => {
      const record = await db.query.landingContent.findFirst({
        where:
          resellerId == null
            ? isNull(landingContent.resellerId)
            : eq(landingContent.resellerId, resellerId),
      });

      // Un reseller sin contenido propio cae al de la plataforma en vez de
      // quedarse con una landing vacía.
      if (!record && resellerId != null) {
        const platformRecord = await db.query.landingContent.findFirst({
          where: isNull(landingContent.resellerId),
        });
        return mergeLandingContent(platformRecord);
      }

      return mergeLandingContent(record);
    },
    () => mergeLandingContent(),
  );
}

export async function getLandingPages(resellerId?: number | null) {
  return withLandingStorageFallback(
    "getLandingPages",
    async () => {
      const pages = await db
        .select()
        .from(landingPages)
        .where(landingPageScope(resellerId))
        .orderBy(asc(landingPages.createdAt));
      return pages.map(normalizeLandingPageRecord);
    },
    () => [],
  );
}

export async function getLandingPageById(id: number, resellerId?: number | null) {
  return withLandingStorageFallback(
    "getLandingPageById",
    async () => {
      const [page] = await db
        .select()
        .from(landingPages)
        .where(and(eq(landingPages.id, id), landingPageScope(resellerId)))
        .limit(1);

      return page ? normalizeLandingPageRecord(page) : null;
    },
    () => null,
  );
}

export async function getLandingPageBySlug(
  slug: string,
  resellerId?: number | null,
) {
  return withLandingStorageFallback(
    "getLandingPageBySlug",
    async () => {
      const [page] = await db
        .select()
        .from(landingPages)
        .where(and(eq(landingPages.slug, slug), landingPageScope(resellerId)))
        .limit(1);

      return page ? normalizeLandingPageRecord(page) : null;
    },
    () => null,
  );
}
