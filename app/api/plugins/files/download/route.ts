import AdmZip from 'adm-zip';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import {
  FILE_TYPES,
  listChatFilesForArchive,
  readArchiveFile,
} from '@/lib/plugins/files/server/files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 1_000;

const archiveSchema = z
  .object({
    mode: z.enum(['all', 'selected']),
    ids: z.array(z.string().min(1).max(255)).max(MAX_ARCHIVE_FILES).optional(),
    query: z.string().trim().max(160).optional(),
    type: z.enum(FILE_TYPES).optional(),
    chatId: z.number().int().positive().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    sort: z.enum(['newest', 'oldest', 'largest', 'smallest']).default('newest'),
  })
  .superRefine((value, context) => {
    if (value.mode === 'selected' && !value.ids?.length) {
      context.addIssue({ code: 'custom', path: ['ids'], message: 'ids are required' });
    }
  });

function safeArchiveName(value: string) {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.slice(0, 180) || 'archivo';
}

function uniqueArchiveName(value: string, usedNames: Map<string, number>) {
  const safeName = safeArchiveName(value);
  const normalized = safeName.toLocaleLowerCase();
  const current = usedNames.get(normalized) ?? 0;
  usedNames.set(normalized, current + 1);
  if (current === 0) return safeName;

  const dotIndex = safeName.lastIndexOf('.');
  if (dotIndex <= 0) return `${safeName} (${current + 1})`;
  return `${safeName.slice(0, dotIndex)} (${current + 1})${safeName.slice(dotIndex)}`;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getPluginRequestContext('filesRead');
    if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

    const activePlugins = await resolveActivePluginsForTeam(ctx.team.id, ctx.user.id);
    if (!activePlugins.some((plugin) => plugin.pluginId === 'files')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = archiveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_archive_request', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { mode, ids, from, to, ...filters } = parsed.data;
    const result = await listChatFilesForArchive({
      teamId: ctx.team.id,
      ...filters,
      ids: mode === 'selected' ? ids : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: MAX_ARCHIVE_FILES,
    });

    if (result.truncated) {
      return NextResponse.json({ error: 'archive_too_many_files' }, { status: 413 });
    }
    if (!result.items.length) {
      return NextResponse.json({ error: 'archive_empty' }, { status: 404 });
    }

    const knownTotal = result.items.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0);
    if (knownTotal > MAX_ARCHIVE_BYTES) {
      return NextResponse.json({ error: 'archive_too_large' }, { status: 413 });
    }

    const archive = new AdmZip();
    const usedNames = new Map<string, number>();
    let totalBytes = 0;
    let archivedFiles = 0;
    let skippedFiles = 0;

    for (const file of result.items) {
      const buffer = await readArchiveFile(file.sourceUrl);
      if (!buffer) {
        skippedFiles += 1;
        continue;
      }

      totalBytes += buffer.byteLength;
      if (totalBytes > MAX_ARCHIVE_BYTES) {
        return NextResponse.json({ error: 'archive_too_large' }, { status: 413 });
      }

      archive.addFile(uniqueArchiveName(file.fileName, usedNames), buffer);
      archivedFiles += 1;
    }

    if (archivedFiles === 0) {
      return NextResponse.json({ error: 'archive_files_unavailable' }, { status: 422 });
    }

    const zipBuffer = archive.toBuffer();
    const day = new Date().toISOString().slice(0, 10);
    const fileName = `archivos-${day}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(zipBuffer.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Files-Archived': String(archivedFiles),
        'X-Files-Skipped': String(skippedFiles),
      },
    });
  } catch (error) {
    console.error('[plugins/files/download POST]', error);
    return NextResponse.json({ error: 'archive_internal_error' }, { status: 500 });
  }
}
