import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { miniAppRecords } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

// ─── POST: replace entire collection ─────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { slug } = await params;
  const body = await request.json();
  const { collection, records } = body as {
    collection: string;
    records: Array<{ recordId: string; data: object }>;
  };

  if (!collection) {
    return NextResponse.json({ error: 'Missing collection' }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    // Delete all existing records for this team+slug+collection
    await tx
      .delete(miniAppRecords)
      .where(
        and(
          eq(miniAppRecords.teamId, ctx.team.id),
          eq(miniAppRecords.appSlug, slug),
          eq(miniAppRecords.collection, collection),
        )
      );

    // Insert new records if any
    if (records && records.length > 0) {
      await tx.insert(miniAppRecords).values(
        records.map((r) => ({
          teamId: ctx.team.id,
          appSlug: slug,
          collection,
          recordId: r.recordId,
          data: r.data,
        }))
      );
    }
  });

  return NextResponse.json({ ok: true });
}
