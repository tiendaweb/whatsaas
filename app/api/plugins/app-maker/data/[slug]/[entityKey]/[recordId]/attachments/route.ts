import { NextResponse } from 'next/server';
import { listAppMakerAttachments, uploadAppMakerAttachment } from '@/lib/plugins/app-maker/server/attachments';
import { appMakerDataError, getAppMakerDataRequestContext } from '@/lib/plugins/app-maker/server/request';

export const dynamic = 'force-dynamic';

function parseRecordId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error('invalid_record_id');
  return id;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; entityKey: string; recordId: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsRead' });
  if (!access.ok) return access.response;
  try {
    const attachments = await listAppMakerAttachments({ app: access.app, definition: access.definition, entityKey: route.entityKey, recordId: parseRecordId(route.recordId), context: access.dataContext });
    return NextResponse.json({ attachments });
  } catch (error) {
    return appMakerDataError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; entityKey: string; recordId: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsWrite' });
  if (!access.ok) return access.response;
  try {
    const form = await request.formData();
    const file = form.get('file');
    const fieldKey = String(form.get('fieldKey') ?? '');
    if (!(file instanceof File) || !fieldKey) throw new Error('invalid_attachment');
    const attachment = await uploadAppMakerAttachment({ app: access.app, definition: access.definition, entityKey: route.entityKey, recordId: parseRecordId(route.recordId), fieldKey, file, context: access.dataContext });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return appMakerDataError(error);
  }
}
