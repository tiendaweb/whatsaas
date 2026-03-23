import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { relationExists } from "@/lib/db/relation-exists";

function isRelationMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeCode = "code" in error ? error.code : undefined;
  const maybeMessage = "message" in error ? error.message : undefined;

  return (
    maybeCode === "42P01" ||
    (typeof maybeMessage === "string" &&
      maybeMessage.toLowerCase().includes("relation") &&
      maybeMessage.toLowerCase().includes("does not exist"))
  );
}

function logLandingStorageWarning(scope: string, error: unknown) {
  console.warn({
    scope: "landing.storage",
    action: scope,
    message: "landing tables are missing, using backward-compatible fallback",
    errorCode:
      typeof error === "object" && error && "code" in error
        ? error.code
        : undefined,
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

let landingTablesBootstrapped = false;

export async function ensureLandingTables() {
  if (landingTablesBootstrapped) return;

  const [hasLandingContent, hasLandingPages] = await Promise.all([
    relationExists("landing_content"),
    relationExists("landing_pages"),
  ]);

  if (!hasLandingContent) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS landing_content (
        id serial PRIMARY KEY,
        home_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
        faq_items jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);
  }

  if (!hasLandingPages) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS landing_pages (
        id serial PRIMARY KEY,
        name varchar(120) NOT NULL,
        slug varchar(140) NOT NULL UNIQUE,
        content_mode varchar(20) NOT NULL DEFAULT 'builder',
        content text NOT NULL DEFAULT '',
        external_prompt text NOT NULL DEFAULT '',
        sections jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);
  }

  await db.execute(sql`
    ALTER TABLE landing_pages
    ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);

  await db.execute(sql`
    ALTER TABLE landing_pages
    ADD COLUMN IF NOT EXISTS content_mode varchar(20) NOT NULL DEFAULT 'builder';
  `);

  await db.execute(sql`
    ALTER TABLE landing_pages
    ADD COLUMN IF NOT EXISTS external_prompt text NOT NULL DEFAULT '';
  `);

  landingTablesBootstrapped = true;
}

export async function withLandingStorageFallback<T>(
  scope: string,
  action: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  try {
    await ensureLandingTables();
    return await action();
  } catch (error) {
    if (!isRelationMissingError(error)) {
      throw error;
    }

    logLandingStorageWarning(scope, error);
    return await fallback();
  }
}
