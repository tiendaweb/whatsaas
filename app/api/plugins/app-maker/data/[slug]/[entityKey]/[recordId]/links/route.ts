import { NextResponse } from 'next/server';
import { linkAppMakerRecords, unlinkAppMakerRecords } from '@/lib/plugins/app-maker/server/data-model';
import { appMakerDataError, getAppMakerDataRequestContext } from '@/lib/plugins/app-maker/server/request';

export const dynamic = 'force-dynamic';

function parseRecordId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error('invalid_record_id');
  return id;
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; entityKey: string; recordId: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsWrite' });
  if (!access.ok) return access.response;
  try {
    const body = await request.json() as { relationKey?: string; targetRecordId?: string | number; metadata?: Record<string, unknown> };
    if (!body.relationKey || body.targetRecordId === undefined) throw new Error('relation_target_required');
    const link = await linkAppMakerRecords({ app: access.app, definition: access.definition, relationKey: body.relationKey, sourceRecordId: parseRecordId(route.recordId), targetRecordId: String(body.targetRecordId), metadata: body.metadata, context: access.dataContext });
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return appMakerDataError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; entityKey: string; recordId: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsWrite' });
  if (!access.ok) return access.response;
  try {
    const body = await request.json() as { relationKey?: string; targetRecordId?: string | number };
    if (!body.relationKey || body.targetRecordId === undefined) throw new Error('relation_target_required');
    const unlinked = await unlinkAppMakerRecords({ app: access.app, definition: access.definition, relationKey: body.relationKey, sourceRecordId: parseRecordId(route.recordId), targetRecordId: String(body.targetRecordId), context: access.dataContext });
    return NextResponse.json({ unlinked });
  } catch (error) {
    return appMakerDataError(error);
  }
}
