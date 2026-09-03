import { NextResponse } from 'next/server';
import { runAppMakerWorkflows } from '@/lib/plugins/app-maker/server/connectors';
import { appMakerDataError, getAppMakerDataRequestContext } from '@/lib/plugins/app-maker/server/request';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; workflowKey: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsWrite' });
  if (!access.ok) return access.response;
  try {
    const workflow = access.definition.workflows.find((candidate) => candidate.key === route.workflowKey && candidate.trigger.type === 'manual');
    if (!workflow) return NextResponse.json({ error: 'workflow_not_found' }, { status: 404 });
    const body = await request.json().catch(() => ({})) as { row?: Record<string, unknown> };
    const results = await runAppMakerWorkflows({ trigger: 'manual', workflowKey: workflow.key, app: access.app, definition: access.definition, context: access.dataContext, row: body.row });
    return NextResponse.json({ results });
  } catch (error) {
    return appMakerDataError(error);
  }
}
