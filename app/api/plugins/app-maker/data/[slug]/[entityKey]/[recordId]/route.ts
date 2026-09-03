import { NextResponse } from 'next/server';
import {
  deleteAppMakerEntityRecord,
  getAppMakerEntityRecord,
  updateAppMakerEntityRecord,
} from '@/lib/plugins/app-maker/server/data-model';
import { runAppMakerWorkflows } from '@/lib/plugins/app-maker/server/connectors';
import { appMakerDataError, getAppMakerDataRequestContext } from '@/lib/plugins/app-maker/server/request';

export const dynamic = 'force-dynamic';

function recordId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error('invalid_record_id');
  return id;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; entityKey: string; recordId: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsRead' });
  if (!access.ok) return access.response;
  try {
    const includes = new URL(request.url).searchParams.get('include')?.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 10);
    const record = await getAppMakerEntityRecord({ app: access.app, definition: access.definition, entityKey: route.entityKey, recordId: recordId(route.recordId), includes, context: access.dataContext });
    if (!record) return NextResponse.json({ error: 'record_not_found' }, { status: 404 });
    return NextResponse.json({ record });
  } catch (error) {
    return appMakerDataError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; entityKey: string; recordId: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsWrite' });
  if (!access.ok) return access.response;
  try {
    const id = recordId(route.recordId);
    const previous = await getAppMakerEntityRecord({ app: access.app, definition: access.definition, entityKey: route.entityKey, recordId: id, context: access.dataContext });
    const body = await request.json() as { values?: Record<string, unknown>; expectedVersion?: number };
    const record = await updateAppMakerEntityRecord({ app: access.app, definition: access.definition, entityKey: route.entityKey, recordId: id, values: body.values ?? {}, expectedVersion: body.expectedVersion, context: access.dataContext });
    const workflows = await runAppMakerWorkflows({ trigger: 'record-updated', entityKey: route.entityKey, app: access.app, definition: access.definition, context: access.dataContext, row: record, previous: previous ?? undefined });
    return NextResponse.json({ record, workflows });
  } catch (error) {
    return appMakerDataError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; entityKey: string; recordId: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsWrite' });
  if (!access.ok) return access.response;
  try {
    const id = recordId(route.recordId);
    const previous = await getAppMakerEntityRecord({ app: access.app, definition: access.definition, entityKey: route.entityKey, recordId: id, context: access.dataContext });
    await deleteAppMakerEntityRecord({ app: access.app, definition: access.definition, entityKey: route.entityKey, recordId: id, context: access.dataContext });
    const workflows = await runAppMakerWorkflows({ trigger: 'record-deleted', entityKey: route.entityKey, app: access.app, definition: access.definition, context: access.dataContext, previous: previous ?? undefined });
    return NextResponse.json({ deleted: true, workflows });
  } catch (error) {
    return appMakerDataError(error);
  }
}
