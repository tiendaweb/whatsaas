import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCustomers, teamTaskMedia } from '@/lib/db/schema';
import { resolveMediaUrl } from '@/lib/media-url';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });

  const customer = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.teamId, ctx.team.id), eq(teamCustomers.id, customerId)),
    columns: { id: true },
  });
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = path.extname(file.name) || '.dat';
  const filename = `${randomUUID()}${extension}`;
  const relativeDirPath = path.join('uploads', 'customers', String(ctx.team.id), String(customerId));
  const absoluteDirPath = path.join(process.cwd(), 'public', relativeDirPath);
  const absoluteFilePath = path.join(absoluteDirPath, filename);

  await fs.mkdir(absoluteDirPath, { recursive: true });
  await fs.writeFile(absoluteFilePath, buffer);

  const url = `${relativeDirPath.replaceAll(path.sep, '/')}/${filename}`;
  const [media] = await db.insert(teamTaskMedia).values({
    teamId: ctx.team.id,
    ownerType: 'customer',
    ownerId: customerId,
    url,
    fileName: file.name,
    mimeType: file.type || null,
    size: file.size,
    source: 'upload',
    metadata: { plugin: 'customers' },
    createdBy: ctx.user.id,
  }).returning();

  return NextResponse.json({ ...media, url: resolveMediaUrl(media.url) ?? media.url }, { status: 201 });
}
