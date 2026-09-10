import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMarketingContext, getMarketingWriteContext } from '@/lib/plugins/marketing/server/access';
import {
  ComentariosError,
  ESTADOS_COMENTARIO,
  listarBandeja,
  marcarComentario,
  ocultarComentario,
  responderComentario,
  sincronizarComentarios,
} from '@/lib/plugins/marketing/server/comentarios';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * La bandeja de comentarios de Facebook e Instagram.
 *
 * GET lee lo que ya está guardado (rápido, sin tocar Meta). POST hace lo que
 * necesita a la red: traer lo nuevo, responder, ocultar o marcar. Responder
 * publica de verdad, así que pide permiso de escritura.
 */
const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('sync'),
    accountId: z.number().int().positive().optional(),
    limitePublicaciones: z.number().int().min(1).max(50).optional(),
  }),
  z.object({
    action: z.literal('responder'),
    id: z.number().int().positive(),
    texto: z.string().trim().min(1).max(8000),
    /** Facebook: contesta por Messenger en vez de abajo de la publicación. */
    privado: z.boolean().optional(),
  }),
  z.object({ action: z.literal('marcar'), id: z.number().int().positive(), status: z.enum(ESTADOS_COMENTARIO as [string, ...string[]]) }),
  z.object({ action: z.literal('ocultar'), id: z.number().int().positive(), oculto: z.boolean() }),
]);

function errorResponse(error: unknown) {
  if (error instanceof ComentariosError) {
    const status = error.code === 'not_found' ? 404 : error.code === 'sin_cuentas' ? 409 : error.code === 'meta' ? 422 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, { status: 500 });
}

export async function GET(request: Request) {
  const ctx = await getMarketingContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const params = new URL(request.url).searchParams;
  const status = params.get('status') ?? 'nuevo';
  const platform = params.get('platform');
  const accountId = Number(params.get('accountId'));
  try {
    return NextResponse.json(
      await listarBandeja(ctx.team.id, {
        status: status === 'todos' || ESTADOS_COMENTARIO.includes(status as never) ? (status as never) : 'nuevo',
        platform: platform === 'facebook_page' || platform === 'instagram' ? platform : undefined,
        accountId: Number.isInteger(accountId) && accountId > 0 ? accountId : undefined,
        limit: Number(params.get('limit')) || undefined,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });

  // Sincronizar es leer; responder, ocultar y marcar cambian algo.
  const ctx = parsed.data.action === 'sync' ? await getMarketingContext() : await getMarketingWriteContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  try {
    const data = parsed.data;
    if (data.action === 'sync') {
      return NextResponse.json(
        await sincronizarComentarios(ctx.team.id, { accountId: data.accountId, limitePublicaciones: data.limitePublicaciones }),
      );
    }
    if (data.action === 'responder') {
      return NextResponse.json({ comentario: await responderComentario(ctx.team.id, ctx.user.id, data.id, data.texto, { privado: data.privado }) });
    }
    if (data.action === 'marcar') {
      await marcarComentario(ctx.team.id, ctx.user.id, data.id, data.status as never);
      return NextResponse.json({ ok: true });
    }
    await ocultarComentario(ctx.team.id, ctx.user.id, data.id, data.oculto);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
