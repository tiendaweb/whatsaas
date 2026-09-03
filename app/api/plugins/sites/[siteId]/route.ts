import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamSites } from '@/lib/db/schema';
import { getSitesRequestContext } from '@/lib/plugins/sites/server/auth';
import { getOwnedSite, updateSite } from '@/lib/plugins/sites/server/service';

export const dynamic = 'force-dynamic';

const updateSiteSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().max(80).nullable().optional(),
    slug: z.string().trim().min(1).max(63).optional(),
    subdomain: z.string().trim().max(63).nullable().optional(),
    customDomain: z.string().trim().max(253).nullable().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    published: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

function parseSiteId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const ctx = await getSitesRequestContext('sitesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const siteId = parseSiteId((await params).siteId);
  if (!siteId) return NextResponse.json({ error: 'Sitio inválido.' }, { status: 400 });
  const site = await getOwnedSite(siteId, ctx.team.id);
  return site
    ? NextResponse.json(site)
    : NextResponse.json({ error: 'El sitio no existe.' }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const ctx = await getSitesRequestContext('sitesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const siteId = parseSiteId((await params).siteId);
  if (!siteId) return NextResponse.json({ error: 'Sitio inválido.' }, { status: 400 });

  const parsed = updateSiteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Los datos del sitio no son válidos.' }, { status: 400 });

  try {
    const site = await updateSite({
      siteId,
      teamId: ctx.team.id,
      userId: ctx.user.id,
      ...parsed.data,
    });
    return site
      ? NextResponse.json(site)
      : NextResponse.json({ error: 'El sitio no existe.' }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar el sitio.';
    return NextResponse.json({ error: message }, { status: message.includes('uso') ? 409 : 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const ctx = await getSitesRequestContext('sitesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const siteId = parseSiteId((await params).siteId);
  if (!siteId) return NextResponse.json({ error: 'Sitio inválido.' }, { status: 400 });

  const [deleted] = await db
    .delete(teamSites)
    .where(and(eq(teamSites.id, siteId), eq(teamSites.teamId, ctx.team.id)))
    .returning({ id: teamSites.id });
  if (!deleted) return NextResponse.json({ error: 'El sitio no existe.' }, { status: 404 });

  await db.insert(activityLogs).values({
    teamId: ctx.team.id,
    userId: ctx.user.id,
    action: `sites.deleted:${siteId}`,
  });
  return NextResponse.json({ ok: true });
}
