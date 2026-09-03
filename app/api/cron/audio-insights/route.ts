import { NextResponse } from 'next/server';
import { AUDIO_INSIGHTS_CONFIG, runAudioInsightsBatch } from '@/lib/audio-insights';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
/**
 * Un lote de 20 audios puede tardar varios minutos: son dos llamadas al
 * proveedor por audio y se hacen de a una.
 */
export const maxDuration = 300;

/**
 * Drena la cola de audios sin ficha.
 *
 * Va por cron y no colgado del webhook de Evolution a propósito: la llamada al
 * proveedor tarda segundos, y hacerla dentro del webhook demoraría el ACK en
 * cada audio que entra. El webhook sólo guarda el mensaje; acá se lo escucha.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/audio-insights] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!AUDIO_INSIGHTS_CONFIG.enabled) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const url = new URL(request.url);
  // `limit` y `team` permiten correr un backfill a mano sin tocar la config:
  //   curl -H "Authorization: Bearer $CRON_SECRET" ".../audio-insights?limit=100&team=3"
  const limitParam = Number(url.searchParams.get('limit'));
  const teamParam = Number(url.searchParams.get('team'));

  const inicio = Date.now();
  try {
    const reporte = await runAudioInsightsBatch({
      limit: Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), 200) : undefined,
      teamId: Number.isInteger(teamParam) && teamParam > 0 ? teamParam : undefined,
    });

    const segundos = Math.round((Date.now() - inicio) / 1000);
    if (reporte.procesados > 0 || reporte.encolados > 0) {
      console.log(
        `[cron/audio-insights] ${reporte.encolados} encolados, ${reporte.transcriptos} transcriptos, `
        + `${reporte.fallidos} fallidos, ${reporte.reintentables} en espera, ${segundos}s`,
      );
    }
    return NextResponse.json({ success: true, seconds: segundos, ...reporte });
  } catch (error) {
    console.error('[cron/audio-insights] error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error inesperado' },
      { status: 500 },
    );
  }
}
