import { NextResponse } from 'next/server';
import { QueueError } from '@/lib/plugins/sales-ops/server/queue';

/** Traduce los errores de la cola a HTTP. Un conflicto por el índice único devuelve 409 con `blockedChats`. */
export function queueErrorResponse(error: unknown) {
  if (error instanceof QueueError) {
    const status = error.code === 'not_found' ? 404 : error.code === 'forbidden' ? 403 : error.code === 'conflict' ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code, ...(error.details ?? {}) }, { status });
  }
  console.error('[sales-ops/queue] error', error);
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
}
