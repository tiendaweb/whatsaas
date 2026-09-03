import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamSiteFiles, teamSites } from '@/lib/db/schema';
import { SITE_MAX_FILE_BYTES } from '@/lib/plugins/sites/server/constants';
import { getSitesRequestContext } from '@/lib/plugins/sites/server/auth';
import { mimeForPath } from '@/lib/plugins/sites/server/mime';
import { joinSitePath, siteParentPath } from '@/lib/plugins/sites/server/paths';

export const dynamic = 'force-dynamic';

const updateFileSchema = z
  .object({
    name: z.string().trim().min(1).max(180).optional(),
    parentPath: z.string().max(800).optional(),
    content: z.string().max(SITE_MAX_FILE_BYTES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

async function getNode(siteId: number, fileId: number, teamId: number) {
  return (
    (await db.query.teamSiteFiles.findFirst({
      where: and(
        eq(teamSiteFiles.id, fileId),
        eq(teamSiteFiles.siteId, siteId),
        eq(teamSiteFiles.teamId, teamId),
      ),
    })) ?? null
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string; fileId: string }> },
) {
  const ctx = await getSitesRequestContext('sitesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { siteId: rawSiteId, fileId: rawFileId } = await params;
  const siteId = Number(rawSiteId);
  const fileId = Number(rawFileId);
  if (!Number.isInteger(siteId) || !Number.isInteger(fileId)) {
    return NextResponse.json({ error: 'Archivo inválido.' }, { status: 400 });
  }
  const node = await getNode(siteId, fileId, ctx.team.id);
  if (!node) return NextResponse.json({ error: 'El archivo no existe.' }, { status: 404 });
  return NextResponse.json({
    ...node,
    content: node.kind === 'file' && node.encoding === 'utf8' ? node.content ?? '' : null,
    editable: node.kind === 'file' && node.encoding === 'utf8',
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ siteId: string; fileId: string }> },
) {
  const ctx = await getSitesRequestContext('sitesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { siteId: rawSiteId, fileId: rawFileId } = await params;
  const siteId = Number(rawSiteId);
  const fileId = Number(rawFileId);
  if (!Number.isInteger(siteId) || !Number.isInteger(fileId)) {
    return NextResponse.json({ error: 'Archivo inválido.' }, { status: 400 });
  }

  const parsed = updateFileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Cambio inválido.' }, { status: 400 });
  const node = await getNode(siteId, fileId, ctx.team.id);
  if (!node) return NextResponse.json({ error: 'El archivo no existe.' }, { status: 404 });
  if (parsed.data.content !== undefined && (node.kind !== 'file' || node.encoding !== 'utf8')) {
    return NextResponse.json({ error: 'Este archivo binario no se puede editar como texto.' }, { status: 400 });
  }

  try {
    const nextName = parsed.data.name ?? node.path.split('/').pop()!;
    const nextParent = parsed.data.parentPath ?? siteParentPath(node.path);
    const nextPath = joinSitePath(nextParent, nextName);
    if (node.kind === 'folder' && (nextParent === node.path || nextParent.startsWith(`${node.path}/`))) {
      return NextResponse.json({ error: 'No podés mover una carpeta dentro de sí misma.' }, { status: 400 });
    }

    const updated = await db.transaction(async (tx) => {
      if (nextPath !== node.path) {
        const allNodes = await tx
          .select()
          .from(teamSiteFiles)
          .where(and(eq(teamSiteFiles.siteId, siteId), eq(teamSiteFiles.teamId, ctx.team.id)));
        const moving = allNodes.filter(
          (item) => item.path === node.path || (node.kind === 'folder' && item.path.startsWith(`${node.path}/`)),
        );
        const movingIds = new Set(moving.map((item) => item.id));
        const targetPaths = new Map(
          moving.map((item) => [
            item.id,
            item.path === node.path ? nextPath : `${nextPath}${item.path.slice(node.path.length)}`,
          ]),
        );
        const occupied = new Set(allNodes.filter((item) => !movingIds.has(item.id)).map((item) => item.path));
        if ([...targetPaths.values()].some((target) => occupied.has(target))) {
          throw new Error('Ya existe un archivo en la carpeta de destino.');
        }

        for (const item of moving) {
          const targetPath = targetPaths.get(item.id)!;
          await tx
            .update(teamSiteFiles)
            .set({
              path: targetPath,
              mimeType: item.kind === 'file' ? mimeForPath(targetPath) : null,
              updatedBy: ctx.user.id,
              updatedAt: new Date(),
            })
            .where(eq(teamSiteFiles.id, item.id));
        }
      }

      const contentUpdate =
        parsed.data.content === undefined
          ? {}
          : {
              content: parsed.data.content,
              sizeBytes: Buffer.byteLength(parsed.data.content),
            };
      const [result] = await tx
        .update(teamSiteFiles)
        .set({
          ...contentUpdate,
          updatedBy: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(teamSiteFiles.id, fileId))
        .returning();
      await tx
        .update(teamSites)
        .set({ updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(and(eq(teamSites.id, siteId), eq(teamSites.teamId, ctx.team.id)));
      return result;
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo actualizar el archivo.' },
      { status: 409 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ siteId: string; fileId: string }> },
) {
  const ctx = await getSitesRequestContext('sitesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { siteId: rawSiteId, fileId: rawFileId } = await params;
  const siteId = Number(rawSiteId);
  const fileId = Number(rawFileId);
  if (!Number.isInteger(siteId) || !Number.isInteger(fileId)) {
    return NextResponse.json({ error: 'Archivo inválido.' }, { status: 400 });
  }
  const node = await getNode(siteId, fileId, ctx.team.id);
  if (!node) return NextResponse.json({ error: 'El archivo no existe.' }, { status: 404 });

  await db.transaction(async (tx) => {
    const nodes = await tx
      .select({ id: teamSiteFiles.id, path: teamSiteFiles.path })
      .from(teamSiteFiles)
      .where(and(eq(teamSiteFiles.siteId, siteId), eq(teamSiteFiles.teamId, ctx.team.id)));
    const ids = nodes
      .filter((item) => item.path === node.path || item.path.startsWith(`${node.path}/`))
      .map((item) => item.id);
    for (const id of ids) await tx.delete(teamSiteFiles).where(eq(teamSiteFiles.id, id));
    await tx
      .update(teamSites)
      .set({ updatedBy: ctx.user.id, updatedAt: new Date() })
      .where(and(eq(teamSites.id, siteId), eq(teamSites.teamId, ctx.team.id)));
  });
  return NextResponse.json({ ok: true });
}
