import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { executeAppMakerAction } from '@/lib/plugins/app-maker/server/connectors';
import { getAppMakerApp } from '@/lib/plugins/app-maker/server/storage';
import { canAccessApplication } from '@/lib/plugins/app-maker/server/resolver';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; actionKey: string }> }) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { slug, actionKey } = await params;
  const app = await getAppMakerApp(ctx.team.id, slug);
  if (!app || app.status === 'archived') return NextResponse.json({ error: 'App no encontrada.' }, { status: 404 });
  const draft = new URL(request.url).searchParams.get('draft') === '1';
  if (!draft && !app.publishedDefinition) {
    return NextResponse.json({ error: 'La app todavía no fue publicada.' }, { status: 404 });
  }
  const definition = draft ? app.definition : app.publishedDefinition!;
  if (!canAccessApplication(definition, { userId: ctx.user.id, role: ctx.membership.role })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const action = definition.actions.find((candidate) => candidate.key === actionKey);
  if (!action) return NextResponse.json({ error: 'Acción no encontrada.' }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({})) as {
      values?: Record<string, unknown>;
      context?: {
        row?: Record<string, unknown>;
        selected?: Record<string, unknown>;
        route?: Record<string, unknown>;
        dataSource?: Record<string, unknown>;
      };
    };
    const result = await executeAppMakerAction({
      action,
      values: body.values ?? {},
      app,
      definition,
      bindingContext: {
        row: body.context?.row,
        selected: body.context?.selected,
        route: body.context?.route,
        dataSource: body.context?.dataSource,
      },
      context: {
        teamId: ctx.team.id,
        userId: ctx.user.id,
        role: ctx.membership.role,
        permissions: ctx.membership.permissions,
      },
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo ejecutar la acción.';
    const status = message.startsWith('Permission denied') ? 403 : message.includes('not found') ? 404 : 400;
    console.error(`[app-maker/action ${action.operation}]`, error);
    return NextResponse.json({ error: message }, { status });
  }
}
