import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { APP_MAKER_TEMPLATE_REGISTRY } from '@/lib/plugins/app-maker/shared/registries';
import { canAccessApplication } from '@/lib/plugins/app-maker/server/resolver';
import { listAppMakerApps, saveAppMakerApp } from '@/lib/plugins/app-maker/server/storage';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('miniAppsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get('archived') === '1';
  const publishedOnly = url.searchParams.get('published') === '1';
  const records = await listAppMakerApps(ctx.team.id, { includeArchived });
  const apps = records
    .filter((app) => !publishedOnly || app.status === 'published')
    .filter((app) => canAccessApplication(
      publishedOnly ? (app.publishedDefinition ?? app.definition) : app.definition,
      { userId: ctx.user.id, role: ctx.membership.role },
    ))
    .map((app) => ({
      slug: app.slug,
      name: app.name,
      description: (app.publishedDefinition ?? app.definition).description ?? '',
      icon: (app.publishedDefinition ?? app.definition).icon,
      category: (app.publishedDefinition ?? app.definition).category,
      accent: (app.publishedDefinition ?? app.definition).theme.accent,
      status: app.status,
      version: app.version,
      publishedVersion: app.publishedVersion,
      updatedAt: app.updatedAt,
    }));
  return NextResponse.json({ apps });
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  try {
    const body = await request.json() as {
      definition?: unknown;
      templateKey?: string;
      slug?: string;
      name?: string;
      status?: 'draft' | 'preview' | 'published';
    };
    let definition = body.definition;
    if (!definition && body.templateKey) {
      const template = APP_MAKER_TEMPLATE_REGISTRY.find((item) => item.key === body.templateKey);
      if (!template) return NextResponse.json({ error: 'Plantilla no encontrada.' }, { status: 404 });
      definition = structuredClone(template.definition);
      if (body.slug) (definition as Record<string, unknown>).slug = body.slug;
      if (body.name) (definition as Record<string, unknown>).name = body.name;
    }
    if (!definition) return NextResponse.json({ error: 'definition o templateKey es requerido.' }, { status: 400 });

    const result = await saveAppMakerApp({
      teamId: ctx.team.id,
      userId: ctx.user.id,
      definition,
      status: body.status ?? 'draft',
      summary: body.templateKey ? `Creada desde ${body.templateKey}` : 'Primera versión',
    });
    if (!result.saved) return NextResponse.json({ error: 'Definición inválida.', details: result.errors }, { status: 400 });
    return NextResponse.json({ app: result.app }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    if (message === 'app_limit_reached') return NextResponse.json({ error: 'Límite de apps alcanzado.' }, { status: 409 });
    console.error('[app-maker/apps POST]', error);
    return NextResponse.json({ error: 'No se pudo crear la app.' }, { status: 500 });
  }
}
