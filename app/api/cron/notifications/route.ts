import { NextRequest, NextResponse } from 'next/server';
import { avisarMensajesSinLeer } from '@/lib/notifications/mensajes';
import { generarRecordatorios } from '@/lib/notifications/recordatorios';
import { despacharPendientes } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Corre cada minuto: recordatorios de agenda, avisos de chats sin leer y despacho de la cola. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const recordatorios = await generarRecordatorios();
    const mensajes = await avisarMensajesSinLeer();
    const cola = await despacharPendientes(200);
    return NextResponse.json({ ok: true, recordatorios, mensajes, cola });
  } catch (error) {
    console.error('[cron/notifications]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
