import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { hasPermission } from '@/lib/permissions';
import { getAppMakerApp } from '@/lib/plugins/app-maker/server/storage';
import { resolveAppMakerView } from '@/lib/plugins/app-maker/server/resolver';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getPluginRequestContext('miniAppsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { slug } = await params;
  const record = await getAppMakerApp(ctx.team.id, slug);
  if (!record || record.status === 'archived') return NextResponse.json({ error: 'App no encontrada.' }, { status: 404 });

  const url = new URL(request.url);
  const draft = url.searchParams.get('draft') === '1';
  if (draft && !hasPermission(ctx.membership.role, ctx.membership.permissions, 'miniAppsWrite')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!draft && record.status !== 'published' && !record.publishedDefinition) {
    return NextResponse.json({ error: 'La app todavía no fue publicada.' }, { status: 404 });
  }
  try {
    const result = await resolveAppMakerView({
      teamId: ctx.team.id,
      userId: ctx.user.id,
      role: ctx.membership.role,
      permissions: ctx.membership.permissions,
      record,
      viewSlug: url.searchParams.get('view') ?? undefined,
      draft,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[app-maker/resolve]', error);
    return NextResponse.json({ error: 'No se pudo resolver la app.' }, { status: 500 });
  }
}
