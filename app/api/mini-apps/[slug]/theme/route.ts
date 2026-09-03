import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { getResolvedBwTheme, setBwThemeMode } from '@/lib/plugins/mini-apps/apps/business-woman-planner/theme/server/store';
import { BW_THEME_MODES } from '@/lib/plugins/mini-apps/apps/business-woman-planner/theme/shared/schema';

export const dynamic = 'force-dynamic';

// Fase 0: el motor de temas sólo existe para business-woman-planner. El resto
// de los slugs siempre están en modo "default" (nunca tuvieron fila propia).
const THEME_ENABLED_SLUGS = new Set(['business-woman-planner']);

// ─── GET: tema resuelto para el visor (no para el conector) ──────────────────

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getPluginRequestContext('miniAppsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { slug } = await params;
  if (!THEME_ENABLED_SLUGS.has(slug)) return NextResponse.json({ mode: 'default', definition: null });

  const resolved = await getResolvedBwTheme(ctx.team.id, slug);
  return NextResponse.json(resolved);
}

// ─── PATCH: interruptor manual "volver al tema clásico" / activar custom ─────

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getPluginRequestContext('miniAppsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { slug } = await params;
  if (!THEME_ENABLED_SLUGS.has(slug)) return NextResponse.json({ error: `"${slug}" no tiene motor de temas todavía.` }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode;
  if (!BW_THEME_MODES.includes(mode)) {
    return NextResponse.json({ error: `mode debe ser uno de: ${BW_THEME_MODES.join(', ')}.` }, { status: 400 });
  }

  const theme = await setBwThemeMode({ teamId: ctx.team.id, userId: ctx.user.id, appSlug: slug, mode });
  return NextResponse.json({ mode: theme.mode });
}
