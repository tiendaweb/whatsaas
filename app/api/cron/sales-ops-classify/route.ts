import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamPlugins } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { cuotaAutomatica } from '@/lib/gemini/key-bank';
import { getAIProviderForTeam } from '@/lib/plugins/ai-chat/service';
import { classifyChat, listPendingChats, type PendingSource } from '@/lib/plugins/sales-ops/server/classifier';
import { SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
/** Cada chat son 1-2 llamadas a la IA; 20 chats pueden tardar minutos. */
export const maxDuration = 300;

/**
 * Drena la cola de clasificación (doc 07 P1 → P2) con el motor del servidor.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" ".../sales-ops-classify?limit=20&team=2&source=prefiltro"
 *
 * Si el equipo no tiene IA (ni proveedor ni banco con cuota) responde 200 con
 * `skipped` y el motivo: un cron que falla por falta de IA sólo hace ruido.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/sales-ops-classify] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), 100) : 20;
  const teamParam = Number(url.searchParams.get('team'));
  const sourceParam = (url.searchParams.get('source') ?? 'prefiltro') as PendingSource;
  const source: PendingSource = ['prefiltro', 'stale', 'all'].includes(sourceParam) ? sourceParam : 'prefiltro';

  const inicio = Date.now();
  const teams = Number.isInteger(teamParam) && teamParam > 0
    ? [teamParam]
    : (await db.select({ teamId: teamPlugins.teamId }).from(teamPlugins).where(and(eq(teamPlugins.pluginId, SALES_OPS_PLUGIN_ID), eq(teamPlugins.enabled, true)))).map((r) => r.teamId);

  const report: Array<Record<string, unknown>> = [];
  let remaining = limit;
  for (const teamId of teams) {
    if (remaining <= 0) break;
    // ¿Hay IA? Proveedor del equipo o banco con cuota. Sin IA, se salta sin fallar.
    let aiReady = false;
    let motivo = '';
    try {
      aiReady = !!(await getAIProviderForTeam(teamId));
    } catch (error) {
      motivo = `proveedor: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (!aiReady) {
      try {
        // El cron respeta la reserva del banco: lo que queda por debajo es para pedidos a mano.
        const banco = await cuotaAutomatica(teamId);
        aiReady = banco.disponibleAutomatico > 0;
        if (!aiReady) motivo = motivo || `banco: ${banco.restanteHoy} pedidos restantes hoy, ${banco.reserva} reservados para lo manual (${banco.reservaPct}%)`;
      } catch (error) {
        motivo = motivo || `banco: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (!aiReady) {
      report.push({ teamId, skipped: true, reason: motivo || 'El equipo no tiene IA configurada.' });
      continue;
    }

    const pending = await listPendingChats(teamId, { source, limit: remaining });
    let classified = 0;
    let failed = 0;
    let withoutAi = 0;
    const errors: string[] = [];
    for (const chat of pending) {
      if (remaining <= 0) break;
      remaining -= 1;
      try {
        const result = await classifyChat(teamId, chat.chatId, { engine: 'server', userId: null });
        if (result.aiUsed) classified += 1;
        else {
          withoutAi += 1;
          if (result.aiError) errors.push(`chat ${chat.chatId}: ${result.aiError}`);
          // Si la IA no responde para nadie, no seguir quemando la cola.
          if (withoutAi >= 3 && classified === 0) break;
        }
      } catch (error) {
        failed += 1;
        errors.push(`chat ${chat.chatId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    report.push({ teamId, pending: pending.length, classified, withoutAi, failed, errors: errors.slice(0, 5) });
  }

  const seconds = Math.round((Date.now() - inicio) / 1000);
  const skipped = report.every((r) => r.skipped);
  console.log(`[cron/sales-ops-classify] ${JSON.stringify(report)} ${seconds}s`);
  return NextResponse.json({ success: true, skipped, source, limit, seconds, teams: report });
}
