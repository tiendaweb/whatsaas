import 'server-only';

import { NextResponse } from 'next/server';
import { hasPermission, type PermissionResource } from '@/lib/permissions';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { canAccessApplication } from './resolver';
import { getAppMakerApp } from './storage';

export async function getAppMakerDataRequestContext(input: {
  request: Request;
  slug: string;
  permission: PermissionResource;
}) {
  const ctx = await getPluginRequestContext(input.permission);
  if (!ctx.ok) return { ok: false as const, response: NextResponse.json({ error: ctx.message }, { status: ctx.status }) };
  const app = await getAppMakerApp(ctx.team.id, input.slug);
  if (!app || app.status === 'archived') return { ok: false as const, response: NextResponse.json({ error: 'App no encontrada.' }, { status: 404 }) };
  const draft = new URL(input.request.url).searchParams.get('draft') === '1';
  if (draft && !hasPermission(ctx.membership.role, ctx.membership.permissions, 'miniAppsWrite')) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (!draft && !app.publishedDefinition) {
    return { ok: false as const, response: NextResponse.json({ error: 'La app todavía no fue publicada.' }, { status: 404 }) };
  }
  const definition = draft ? app.definition : app.publishedDefinition!;
  if (!canAccessApplication(definition, { userId: ctx.user.id, role: ctx.membership.role })) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return {
    ok: true as const,
    ctx,
    app,
    definition,
    draft,
    dataContext: {
      teamId: ctx.team.id,
      userId: ctx.user.id,
      role: ctx.membership.role,
      permissions: ctx.membership.permissions,
    },
  };
}

export function appMakerDataError(error: unknown) {
  const message = error instanceof Error ? error.message : 'unknown';
  const status = message.includes('forbidden') ? 403
    : message.includes('not_found') ? 404
      : message.includes('version_conflict') ? 409
        : message.includes('required') || message.includes('invalid') || message.includes('field_') || message.includes('relation_') ? 400
          : 500;
  return NextResponse.json({ error: message }, { status });
}
