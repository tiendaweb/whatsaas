import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { miniAppInstalls } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { KNOWN_SLUGS } from '@/lib/plugins/mini-apps/catalog';

export const dynamic = 'force-dynamic';

// ─── GET: list installed apps for team ───────────────────────────────────────

export async function GET() {
  const ctx = await getPluginRequestContext('miniAppsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const rows = await db
    .select({
      slug: miniAppInstalls.appSlug,
      installedAt: miniAppInstalls.installedAt,
    })
    .from(miniAppInstalls)
    .where(eq(miniAppInstalls.teamId, ctx.team.id));

  return NextResponse.json(rows);
}

// ─── POST: install app ────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const { slug } = body as { slug: string };

  if (!slug || !KNOWN_SLUGS.includes(slug)) {
    return NextResponse.json({ error: 'Unknown app slug' }, { status: 400 });
  }

  await db
    .insert(miniAppInstalls)
    .values({
      teamId: ctx.team.id,
      appSlug: slug,
      installedBy: ctx.user.id,
    })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true }, { status: 201 });
}
