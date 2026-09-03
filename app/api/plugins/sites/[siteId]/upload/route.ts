import AdmZip from 'adm-zip';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamSiteFiles, teamSites } from '@/lib/db/schema';
import {
  SITE_MAX_FILES,
  SITE_MAX_FILE_BYTES,
  SITE_MAX_UPLOAD_BYTES,
  TEXT_EXTENSIONS,
} from '@/lib/plugins/sites/server/constants';
import { getSitesRequestContext } from '@/lib/plugins/sites/server/auth';
import { mimeForPath } from '@/lib/plugins/sites/server/mime';
import { extensionOf, normalizeSitePath } from '@/lib/plugins/sites/server/paths';
import { getOwnedSite } from '@/lib/plugins/sites/server/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type UploadNode = {
  path: string;
  kind: 'file' | 'folder';
  mimeType: string | null;
  encoding: 'utf8' | 'base64';
  content: string | null;
  sizeBytes: number;
};

function isTextFile(filePath: string, mimeType?: string) {
  return (
    TEXT_EXTENSIONS.has(extensionOf(filePath)) ||
    Boolean(mimeType?.startsWith('text/')) ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  );
}

function bufferToNode(filePath: string, buffer: Buffer, mimeType?: string): UploadNode {
  if (buffer.byteLength > SITE_MAX_FILE_BYTES) {
    throw new Error(`${filePath} supera el límite de 10 MB por archivo.`);
  }
  const text = isTextFile(filePath, mimeType);
  return {
    path: normalizeSitePath(filePath),
    kind: 'file',
    mimeType: mimeType || mimeForPath(filePath),
    encoding: text ? 'utf8' : 'base64',
    content: text ? buffer.toString('utf8') : buffer.toString('base64'),
    sizeBytes: buffer.byteLength,
  };
}

function addParentFolders(nodes: Map<string, UploadNode>, filePath: string) {
  const parts = filePath.split('/');
  for (let index = 1; index < parts.length; index += 1) {
    const folderPath = parts.slice(0, index).join('/');
    if (!nodes.has(folderPath)) {
      nodes.set(folderPath, {
        path: folderPath,
        kind: 'folder',
        mimeType: null,
        encoding: 'utf8',
        content: null,
        sizeBytes: 0,
      });
    }
  }
}

function commonZipRoot(paths: string[]) {
  if (paths.length === 0) return '';
  const first = paths[0].split('/')[0];
  return paths.every((item) => item.includes('/') && item.split('/')[0] === first) ? `${first}/` : '';
}

function extractZip(buffer: Buffer) {
  const archive = new AdmZip(buffer);
  const entries = archive.getEntries().filter((entry) => {
    const normalized = entry.entryName.replaceAll('\\', '/');
    return !normalized.startsWith('__MACOSX/') && !normalized.endsWith('/.DS_Store');
  });
  const filePaths = entries.filter((entry) => !entry.isDirectory).map((entry) => entry.entryName.replaceAll('\\', '/'));
  const root = commonZipRoot(filePaths);
  const nodes = new Map<string, UploadNode>();
  let expandedBytes = 0;

  for (const entry of entries) {
    const rawPath = entry.entryName.replaceAll('\\', '/').replace(root, '').replace(/\/+$/, '');
    if (!rawPath) continue;
    const filePath = normalizeSitePath(rawPath);
    const unixMode = (entry.header.attr >>> 16) & 0o170000;
    if (unixMode === 0o120000) throw new Error(`El ZIP contiene un enlace simbólico no permitido: ${filePath}`);

    if (entry.isDirectory) {
      nodes.set(filePath, {
        path: filePath,
        kind: 'folder',
        mimeType: null,
        encoding: 'utf8',
        content: null,
        sizeBytes: 0,
      });
      continue;
    }

    const content = entry.getData();
    expandedBytes += content.byteLength;
    if (expandedBytes > SITE_MAX_UPLOAD_BYTES) {
      throw new Error('El contenido descomprimido supera el límite de 40 MB.');
    }
    addParentFolders(nodes, filePath);
    nodes.set(filePath, bufferToNode(filePath, content));
  }
  return nodes;
}

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const ctx = await getSitesRequestContext('sitesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const siteId = Number((await params).siteId);
  if (!Number.isInteger(siteId)) return NextResponse.json({ error: 'Sitio inválido.' }, { status: 400 });
  if (!(await getOwnedSite(siteId, ctx.team.id))) {
    return NextResponse.json({ error: 'El sitio no existe.' }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);
    const rawPaths = formData.get('paths');
    const paths = typeof rawPaths === 'string' ? (JSON.parse(rawPaths) as unknown) : [];
    if (!Array.isArray(paths) || paths.some((item) => typeof item !== 'string')) {
      return NextResponse.json({ error: 'Las rutas de carga no son válidas.' }, { status: 400 });
    }
    if (files.length === 0) return NextResponse.json({ error: 'Seleccioná al menos un archivo.' }, { status: 400 });

    const inputBytes = files.reduce((total, file) => total + file.size, 0);
    if (inputBytes > SITE_MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'La carga supera el límite total de 40 MB.' }, { status: 413 });
    }

    const nodes = new Map<string, UploadNode>();
    for (const [index, file] of files.entries()) {
      const requestedPath = typeof paths[index] === 'string' ? paths[index] : file.name;
      const filePath = normalizeSitePath(requestedPath);
      const buffer = Buffer.from(await file.arrayBuffer());
      if (extensionOf(filePath) === 'zip') {
        for (const [zipPath, node] of extractZip(buffer)) nodes.set(zipPath, node);
      } else {
        addParentFolders(nodes, filePath);
        nodes.set(filePath, bufferToNode(filePath, buffer, file.type));
      }
    }

    const existingCount = await db
      .select({ path: teamSiteFiles.path })
      .from(teamSiteFiles)
      .where(and(eq(teamSiteFiles.siteId, siteId), eq(teamSiteFiles.teamId, ctx.team.id)));
    const existingPaths = new Set(existingCount.map((item) => item.path));
    const additionalCount = [...nodes.keys()].filter((item) => !existingPaths.has(item)).length;
    if (existingPaths.size + additionalCount > SITE_MAX_FILES) {
      return NextResponse.json({ error: `El sitio no puede superar ${SITE_MAX_FILES} archivos y carpetas.` }, { status: 413 });
    }

    await db.transaction(async (tx) => {
      for (const node of nodes.values()) {
        await tx
          .insert(teamSiteFiles)
          .values({
            teamId: ctx.team.id,
            siteId,
            ...node,
            createdBy: ctx.user.id,
            updatedBy: ctx.user.id,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [teamSiteFiles.siteId, teamSiteFiles.path],
            set: {
              kind: node.kind,
              mimeType: node.mimeType,
              encoding: node.encoding,
              content: node.content,
              sizeBytes: node.sizeBytes,
              updatedBy: ctx.user.id,
              updatedAt: new Date(),
            },
          });
      }
      await tx
        .update(teamSites)
        .set({ updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(and(eq(teamSites.id, siteId), eq(teamSites.teamId, ctx.team.id)));
    });

    return NextResponse.json({
      ok: true,
      imported: [...nodes.values()].filter((node) => node.kind === 'file').length,
    });
  } catch (error) {
    console.error('[sites upload]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo procesar la carga.' },
      { status: 400 },
    );
  }
}
