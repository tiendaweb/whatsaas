import { NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { socialAccounts } from '@/lib/db/schema';
import { sincronizarComentarios } from '@/lib/plugins/marketing/server/comentarios';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Trae los comentarios nuevos de Facebook e Instagram, solo.
 *
 * El punto de todo esto es no tener que entrar a las redes a mirar: si nadie
 * corre este cron, la bandeja sólo se llena cuando alguien aprieta «Buscar
 * nuevos», que es exactamente el trabajo que se quería sacar de encima.
 *
 * Recorre los equipos que tienen alguna cuenta conectada; un equipo con el
 * token vencido no frena a los demás (cada uno se maneja adentro de
 * `sincronizarComentarios`, que además marca la cuenta como vencida).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/social-comments] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const equipos = await db
    .selectDistinct({ teamId: socialAccounts.teamId })
    .from(socialAccounts)
    .where(inArray(socialAccounts.platform, ['facebook_page', 'instagram']));

  const resumen: Array<{ teamId: number; nuevos: number; errores: number }> = [];
  for (const { teamId } of equipos) {
    try {
      // Cinco publicaciones por vuelta: los comentarios llegan sobre lo último
      // que se publicó, y mirar el año entero cada diez minutos gastaría la
      // cuota de la Graph sin traer nada.
      const r = await sincronizarComentarios(teamId, { limitePublicaciones: 5 });
      resumen.push({ teamId, nuevos: r.nuevos, errores: r.errores.length });
    } catch (error) {
      console.error(`[cron/social-comments] equipo ${teamId}:`, error instanceof Error ? error.message : error);
      resumen.push({ teamId, nuevos: 0, errores: 1 });
    }
  }

  return NextResponse.json({ equipos: equipos.length, resumen });
}
