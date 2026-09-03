import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { miniAppInstalls } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

// ─── DELETE: uninstall app ────────────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { slug } = await params;

  await db
    .delete(miniAppInstalls)
    .where(
      and(
        eq(miniAppInstalls.teamId, ctx.team.id),
        eq(miniAppInstalls.appSlug, slug),
      )
    );

  return NextResponse.json({ ok: true });
}
