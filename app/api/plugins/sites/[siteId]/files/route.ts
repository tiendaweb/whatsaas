import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamSiteFiles } from '@/lib/db/schema';
import { getSitesRequestContext } from '@/lib/plugins/sites/server/auth';
import { mimeForPath } from '@/lib/plugins/sites/server/mime';
import { joinSitePath } from '@/lib/plugins/sites/server/paths';
import { getOwnedSite } from '@/lib/plugins/sites/server/service';

export const dynamic = 'force-dynamic';

const createNodeSchema = z.object({
  kind: z.enum(['file', 'folder']),
  name: z.string().trim().min(1).max(180),
  parentPath: z.string().max(800).default(''),
});

export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const ctx = await getSitesRequestContext('sitesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const siteId = Number((await params).siteId);
  if (!Number.isInteger(siteId)) return NextResponse.json({ error: 'Sitio inválido.' }, { status: 400 });
  if (!(await getOwnedSite(siteId, ctx.team.id))) {
    return NextResponse.json({ error: 'El sitio no existe.' }, { status: 404 });
  }

  const files = await db
    .select({
      id: teamSiteFiles.id,
      path: teamSiteFiles.path,
      kind: teamSiteFiles.kind,
      mimeType: teamSiteFiles.mimeType,
      encoding: teamSiteFiles.encoding,
      sizeBytes: teamSiteFiles.sizeBytes,
      updatedAt: teamSiteFiles.updatedAt,
    })
    .from(teamSiteFiles)
    .where(and(eq(teamSiteFiles.siteId, siteId), eq(teamSiteFiles.teamId, ctx.team.id)))
    .orderBy(asc(teamSiteFiles.path));
  return NextResponse.json(files);
}

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const ctx = await getSitesRequestContext('sitesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const siteId = Number((await params).siteId);
  if (!Number.isInteger(siteId)) return NextResponse.json({ error: 'Sitio inválido.' }, { status: 400 });
  if (!(await getOwnedSite(siteId, ctx.team.id))) {
    return NextResponse.json({ error: 'El sitio no existe.' }, { status: 404 });
  }

  const parsed = createNodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Nombre o carpeta inválida.' }, { status: 400 });

  try {
    const nodePath = joinSitePath(parsed.data.parentPath, parsed.data.name);
    const [node] = await db
      .insert(teamSiteFiles)
      .values({
        teamId: ctx.team.id,
        siteId,
        path: nodePath,
        kind: parsed.data.kind,
        mimeType: parsed.data.kind === 'file' ? mimeForPath(nodePath) : null,
        encoding: 'utf8',
        content: parsed.data.kind === 'file' ? '' : null,
        sizeBytes: 0,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      })
      .returning();
    return NextResponse.json(node, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json(
      { error: message.includes('site_path_uidx') ? 'Ya existe un archivo con ese nombre.' : message || 'No se pudo crear.' },
      { status: message.includes('site_path_uidx') ? 409 : 400 },
    );
  }
}
