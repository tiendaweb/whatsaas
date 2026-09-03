import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import {
  getAppMakerApp,
  listAppMakerVersions,
  saveAppMakerApp,
  setAppMakerStatus,
} from '@/lib/plugins/app-maker/server/storage';
import { appStatusSchema } from '@/lib/plugins/app-maker/shared/contract';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getPluginRequestContext('miniAppsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { slug } = await params;
  const app = await getAppMakerApp(ctx.team.id, slug);
  if (!app) return NextResponse.json({ error: 'App no encontrada.' }, { status: 404 });
  const versions = await listAppMakerVersions(ctx.team.id, slug);
  return NextResponse.json({ app, versions });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { slug } = await params;
  const current = await getAppMakerApp(ctx.team.id, slug);
  if (!current) return NextResponse.json({ error: 'App no encontrada.' }, { status: 404 });

  try {
    const body = await request.json() as {
      definition?: unknown;
      expectedVersion?: number;
      status?: string;
      summary?: string;
    };
    if (body.definition) {
      const result = await saveAppMakerApp({
        teamId: ctx.team.id,
        userId: ctx.user.id,
        definition: body.definition,
        expectedVersion: body.expectedVersion,
        status: body.status === 'preview' ? 'preview' : body.status === 'published' ? 'published' : 'draft',
        summary: body.summary ?? 'Edición declarativa',
      });
      if (!result.saved) return NextResponse.json({ error: 'Definición inválida.', details: result.errors }, { status: 400 });
      return NextResponse.json({ app: result.app });
    }

    const status = appStatusSchema.safeParse(body.status);
    if (!status.success) return NextResponse.json({ error: 'status o definition es requerido.' }, { status: 400 });
    const app = await setAppMakerStatus({ teamId: ctx.team.id, userId: ctx.user.id, slug, status: status.data });
    return NextResponse.json({ app });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    if (message.startsWith('version_conflict:')) {
      return NextResponse.json({ error: 'La app cambió en otra sesión.', currentVersion: Number(message.split(':')[1]) }, { status: 409 });
    }
    console.error('[app-maker/apps/:slug PATCH]', error);
    return NextResponse.json({ error: 'No se pudo guardar la app.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { slug } = await params;
  const app = await setAppMakerStatus({ teamId: ctx.team.id, userId: ctx.user.id, slug, status: 'archived' });
  if (!app) return NextResponse.json({ error: 'App no encontrada.' }, { status: 404 });
  return NextResponse.json({ app });
}

