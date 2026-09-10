import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { CONTEXTOS_SESION, abrirSesionDeBloque, cerrarSesion, sesionAbierta } from '@/lib/plugins/tasks/server/work-sessions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * El bloque de 25 minutos del Command Center, registrado en el servidor.
 *
 * Los relojes vivían en `localStorage` y no dejaban rastro: una sola sesión en
 * toda la base y cero horas, con lo cual el US$/h del catálogo y cualquier
 * medida de en qué se va el día eran imposibles. Arrancar un bloque abre una
 * sesión; terminarlo o dejarlo vencer la cierra. Una sola abierta por persona:
 * abrir la comercial cierra la de producción que hubiera quedado corriendo.
 *
 * Si esto falla, el reloj de la pantalla sigue andando igual: registrar el
 * tiempo no puede ser motivo para que alguien no pueda trabajar.
 */
const schema = z.object({
  action: z.enum(['start', 'stop']),
  context: z.enum(CONTEXTOS_SESION).default('comercial'),
  kind: z.enum(['foco', 'descanso']).default('foco'),
  chatId: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json({ sesion: await sesionAbierta(ctx.team.id, ctx.user.id) });
}

export async function POST(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });

  if (parsed.data.action === 'stop') {
    return NextResponse.json(await cerrarSesion(ctx.team.id, ctx.user.id));
  }
  const sesion = await abrirSesionDeBloque(ctx.team.id, ctx.user.id, parsed.data.context, {
    kind: parsed.data.kind,
    chatId: parsed.data.chatId ?? null,
  });
  return NextResponse.json({ sesion });
}
