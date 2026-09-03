import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { miniAppRecords } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

// ─── DELETE: delete one record ────────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; collection: string; recordId: string }> }
) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { slug, collection, recordId } = await params;

  await db
    .delete(miniAppRecords)
    .where(
      and(
        eq(miniAppRecords.teamId, ctx.team.id),
        eq(miniAppRecords.appSlug, slug),
        eq(miniAppRecords.collection, collection),
        eq(miniAppRecords.recordId, recordId),
      )
    );

  return NextResponse.json({ ok: true });
}
