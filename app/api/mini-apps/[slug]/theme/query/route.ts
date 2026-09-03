import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { bwSystemBindingSchema } from '@/lib/plugins/mini-apps/apps/business-woman-planner/theme/shared/schema';
import { resolveBwSystemBinding } from '@/lib/plugins/mini-apps/apps/business-woman-planner/theme/server/system-query';

export const dynamic = 'force-dynamic';

const THEME_ENABLED_SLUGS = new Set(['business-woman-planner']);

/**
 * Resuelve UN binding `kind: "system"` del tema custom contra datos reales de
 * WhatsPro (vía el motor de Radar Engine, `executeRadarQuery`). Los bindings
 * `local` NUNCA llegan acá — se resuelven en el cliente contra los datos que
 * `useMiniAppData` ya cargó. Nunca revienta con 500 por un binding roto: un
 * error queda como `{ok:false, message}` para que el bloque se pinte con su
 * propio estado de error, sin tirar abajo el resto de la vista.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getPluginRequestContext('miniAppsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { slug } = await params;
  if (!THEME_ENABLED_SLUGS.has(slug)) return NextResponse.json({ error: `"${slug}" no tiene motor de temas todavía.` }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = bwSystemBindingSchema.safeParse(body?.binding);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Binding inválido.', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await resolveBwSystemBinding(ctx.team.id, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo resolver el binding.' }, { status: 200 });
  }
}
