import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/drizzle';
import { teamTaskMedia } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { assertEntity, listInheritedMedia, type TaskEntityType } from '@/lib/plugins/tasks/server/task-os';
import { resolveMediaUrl } from '@/lib/media-url';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const TYPES = new Set(['workspace', 'project', 'task']);

export async function GET(req: Request) {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(req.url);
  const ownerType = String(url.searchParams.get('ownerType') ?? '') as TaskEntityType;
  const ownerId = Number(url.searchParams.get('ownerId'));
  const inherited = url.searchParams.get('inherited') !== 'false';
  if (!TYPES.has(ownerType) || !ownerId) return NextResponse.json({ error: 'ownerType and ownerId required' }, { status: 400 });

  const ok = await assertEntity(ctx.team.id, ownerType, ownerId);
  if (!ok) return NextResponse.json({ error: 'Owner not found' }, { status: 404 });

  if (inherited) {
    return NextResponse.json(await listInheritedMedia({ teamId: ctx.team.id, ownerType, ownerId }));
  }

  const rows = await db.query.teamTaskMedia.findMany({
    where: and(eq(teamTaskMedia.teamId, ctx.team.id), eq(teamTaskMedia.ownerType, ownerType), eq(teamTaskMedia.ownerId, ownerId)),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return NextResponse.json(rows.map((row) => ({ ...row, url: resolveMediaUrl(row.url) ?? row.url })));
}

export async function POST(req: Request) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const formData = await req.formData();
  const ownerType = String(formData.get('ownerType') ?? '') as TaskEntityType;
  const ownerId = Number(formData.get('ownerId'));
  const file = formData.get('file') as File | null;
  if (!TYPES.has(ownerType) || !ownerId || !file) return NextResponse.json({ error: 'ownerType, ownerId and file required' }, { status: 400 });

  const ok = await assertEntity(ctx.team.id, ownerType, ownerId);
  if (!ok) return NextResponse.json({ error: 'Owner not found' }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split('.').pop() || 'dat';
  const filename = `${uuidv4()}.${extension}`;
  const relativeDirPath = path.join('uploads', 'tasks', String(ctx.team.id));
  const absoluteDirPath = path.join(process.cwd(), 'public', relativeDirPath);
  const absoluteFilePath = path.join(absoluteDirPath, filename);

  await fs.mkdir(absoluteDirPath, { recursive: true });
  await fs.writeFile(absoluteFilePath, buffer);

  const url = `${relativeDirPath.replaceAll(path.sep, '/')}/${filename}`;
  const [media] = await db.insert(teamTaskMedia).values({
    teamId: ctx.team.id,
    ownerType,
    ownerId,
    url,
    fileName: file.name,
    mimeType: file.type || null,
    size: file.size,
    source: 'upload',
    createdBy: ctx.user.id,
  }).returning();

  return NextResponse.json(media, { status: 201 });
}
