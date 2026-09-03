import { NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { miniAppRecords } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

// ─── GET: all collections snapshot for team+slug ──────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ctx = await getPluginRequestContext('miniAppsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { slug } = await params;

  const rows = await db
    .select()
    .from(miniAppRecords)
    .where(
      and(
        eq(miniAppRecords.teamId, ctx.team.id),
        eq(miniAppRecords.appSlug, slug),
      )
    )
    .orderBy(asc(miniAppRecords.createdAt));

  // Group by collection
  const grouped: Record<string, Array<{ recordId: string; data: unknown; createdAt: string }>> = {};
  for (const row of rows) {
    if (!grouped[row.collection]) grouped[row.collection] = [];
    grouped[row.collection].push({
      recordId: row.recordId,
      data: row.data,
      createdAt: row.createdAt.toISOString(),
    });
  }

  return NextResponse.json(grouped);
}

// ─── POST: upsert a record ────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { slug } = await params;
  const body = await request.json();
  const { collection, recordId, data } = body as {
    collection: string;
    recordId: string;
    data: object;
  };

  if (!collection || !recordId || data === undefined) {
    return NextResponse.json({ error: 'Missing collection, recordId or data' }, { status: 400 });
  }

  const [record] = await db
    .insert(miniAppRecords)
    .values({
      teamId: ctx.team.id,
      appSlug: slug,
      collection,
      recordId,
      data,
    })
    .onConflictDoUpdate({
      target: [
        miniAppRecords.teamId,
        miniAppRecords.appSlug,
        miniAppRecords.collection,
        miniAppRecords.recordId,
      ],
      set: {
        data: sql`excluded.data`,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json(record, { status: 200 });
}
