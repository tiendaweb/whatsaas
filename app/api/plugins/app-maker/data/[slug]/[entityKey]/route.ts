import { NextResponse } from 'next/server';
import {
  createAppMakerEntityRecord,
  listAppMakerEntityRecords,
} from '@/lib/plugins/app-maker/server/data-model';
import { runAppMakerWorkflows } from '@/lib/plugins/app-maker/server/connectors';
import { appMakerDataError, getAppMakerDataRequestContext } from '@/lib/plugins/app-maker/server/request';
import type { AppDataSourceDefinition } from '@/lib/plugins/app-maker/shared/contract';

export const dynamic = 'force-dynamic';

function querySource(url: URL): Pick<AppDataSourceDefinition, 'filters' | 'search' | 'pageSize' | 'fields' | 'sort' | 'include'> {
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? 25) || 25));
  const fields = url.searchParams.get('fields')?.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 24);
  const include = url.searchParams.get('include')?.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 10);
  const sort = url.searchParams.getAll('sort').slice(0, 5).map((item) => {
    const [field, direction] = item.split(':');
    return { field, direction: direction === 'desc' ? 'desc' as const : 'asc' as const };
  }).filter((item) => item.field);
  const filters = url.searchParams.getAll('filter').slice(0, 12).map((item) => {
    const [field, operator = 'eq', ...rest] = item.split(':');
    return { field, operator: operator as NonNullable<AppDataSourceDefinition['filters']>[number]['operator'], value: rest.join(':') };
  }).filter((item) => item.field);
  return { pageSize, search: url.searchParams.get('q')?.slice(0, 200), fields, include, sort, filters };
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; entityKey: string }> }) {
  const { slug, entityKey } = await params;
  const access = await getAppMakerDataRequestContext({ request, slug, permission: 'miniAppsRead' });
  if (!access.ok) return access.response;
  try {
    const url = new URL(request.url);
    const result = await listAppMakerEntityRecords({
      app: access.app,
      definition: access.definition,
      entityKey,
      source: querySource(url),
      page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1),
      context: access.dataContext,
    });
    return NextResponse.json(result);
  } catch (error) {
    return appMakerDataError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; entityKey: string }> }) {
  const { slug, entityKey } = await params;
  const access = await getAppMakerDataRequestContext({ request, slug, permission: 'miniAppsWrite' });
  if (!access.ok) return access.response;
  try {
    const body = await request.json() as { values?: Record<string, unknown> };
    const record = await createAppMakerEntityRecord({
      app: access.app,
      definition: access.definition,
      entityKey,
      values: body.values ?? {},
      context: access.dataContext,
    });
    const workflows = await runAppMakerWorkflows({ trigger: 'record-created', entityKey, app: access.app, definition: access.definition, context: access.dataContext, row: record });
    return NextResponse.json({ record, workflows }, { status: 201 });
  } catch (error) {
    return appMakerDataError(error);
  }
}
