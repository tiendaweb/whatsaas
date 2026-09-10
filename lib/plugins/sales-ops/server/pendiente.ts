import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  messageAudioInsights,
  teamCommercialActions,
  teamCommercialAnalysis,
  teamCommercialSignals,
  teamPromptRuns,
  teamTaskItems,
  teamTaskRelations,
} from '@/lib/db/schema';
import { WORK_KIND_META, WORK_STATUS_META, type WorkKind, type WorkStatus } from '@/lib/plugins/tasks/shared/produccion';
import { SIGNAL_LABELS } from '../shared/taxonomy';

/**
 * Qué hay para hacer con UN contacto, en un solo lugar.
 *
 * El conector no entra por la cola: entra por el expediente. En 21 días pidió
 * `whatspro_sales_dossier` 1.691 veces y `whatspro_work_queue` nueve. Federar
 * las colas fue correcto de diseño y no cambió nada de comportamiento, porque
 * el trabajo vivía en una lista que nadie consultaba. Acá el trabajo viaja
 * dentro de lo que ya se pide: quien lee el expediente de un contacto ve, sin
 * una llamada más, qué quedó abierto sobre él y con qué herramienta se cierra.
 *
 * Es sólo lectura y no propone nada: describe lo que ya existe.
 */

export type PendienteItem = {
  tipo: 'accion' | 'senal' | 'corrida' | 'audio' | 'crm_fix' | 'produccion';
  /** Una línea que se lee sin abrir nada. */
  que: string;
  /** Desde cuándo espera (ISO). */
  desde: string | null;
  /** Herramientas con las que se resuelve, en orden. */
  tools: string[];
  /** Datos que hacen falta para invocarlas. */
  ref: Record<string, unknown>;
  /** true = ya lo decidió una persona y se puede ejecutar; false = necesita que alguien diga que sí. */
  aprobado: boolean;
};

export type PendienteContacto = {
  chatId: number;
  total: number;
  /** Lo que está esperando una decisión humana. */
  esperaDecision: number;
  items: PendienteItem[];
};

const VIVAS = ['proposed', 'pending_approval', 'approved'] as const;

/** Fecha a ISO, tolerante a null y a strings que ya vienen formateados. */
function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function pendienteDelContacto(
  teamId: number,
  chatId: number,
  opts: { contactId?: number | null } = {},
): Promise<PendienteContacto> {
  const [acciones, senales, corridas, audios, analisis] = await Promise.all([
    db
      .select({
        id: teamCommercialActions.id,
        kind: teamCommercialActions.kind,
        status: teamCommercialActions.status,
        batchId: teamCommercialActions.batchId,
        batchLabel: teamCommercialActions.batchLabel,
        payload: teamCommercialActions.payload,
        createdAt: teamCommercialActions.createdAt,
        approvedAt: teamCommercialActions.approvedAt,
      })
      .from(teamCommercialActions)
      .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.chatId, chatId), inArray(teamCommercialActions.status, [...VIVAS])))
      .orderBy(desc(teamCommercialActions.createdAt))
      .limit(20),
    db
      .select({
        id: teamCommercialSignals.id,
        kind: teamCommercialSignals.kind,
        excerpt: teamCommercialSignals.excerpt,
        createdAt: teamCommercialSignals.createdAt,
      })
      .from(teamCommercialSignals)
      .where(and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.chatId, chatId), inArray(teamCommercialSignals.status, ['new', 'seen'])))
      .orderBy(desc(teamCommercialSignals.createdAt))
      .limit(20),
    db
      .select({
        id: teamPromptRuns.id,
        promptKey: teamPromptRuns.promptKey,
        status: teamPromptRuns.status,
        summary: teamPromptRuns.summary,
        metadata: teamPromptRuns.metadata,
        createdAt: teamPromptRuns.createdAt,
      })
      .from(teamPromptRuns)
      .where(
        and(
          eq(teamPromptRuns.teamId, teamId),
          eq(teamPromptRuns.targetKind, 'chat'),
          eq(teamPromptRuns.targetId, String(chatId)),
          inArray(teamPromptRuns.status, ['queued', 'blocked', 'in_progress']),
        ),
      )
      .orderBy(desc(teamPromptRuns.createdAt))
      .limit(10),
    db
      .select({ pendientes: sql<number>`count(*)::int` })
      .from(messageAudioInsights)
      .where(and(eq(messageAudioInsights.teamId, teamId), eq(messageAudioInsights.chatId, chatId), inArray(messageAudioInsights.status, ['queued', 'failed']))),
    db
      .select({ crmFix: teamCommercialAnalysis.crmFix, updatedAt: teamCommercialAnalysis.updatedAt })
      .from(teamCommercialAnalysis)
      .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)))
      .limit(1),
  ]);

  const items: PendienteItem[] = [];

  for (const a of acciones) {
    const aprobado = a.status === 'approved';
    const texto = typeof (a.payload as Record<string, unknown> | null)?.text === 'string' ? String((a.payload as Record<string, unknown>).text) : null;
    items.push({
      tipo: 'accion',
      que: aprobado
        ? `Fila aprobada sin ejecutar (${a.kind}) del lote «${a.batchLabel}».`
        : `Fila propuesta sin decidir (${a.kind}) del lote «${a.batchLabel}»${texto ? `: «${texto.slice(0, 100)}»` : ''}.`,
      desde: iso(a.approvedAt ?? a.createdAt),
      tools: aprobado
        ? ['whatspro_chat_send_message', 'whatspro_sales_queue_result']
        : ['whatspro_sales_queue_get', 'whatspro_sales_queue_approve', 'whatspro_sales_queue_reject'],
      ref: { action_id: a.id, batch_id: a.batchId, kind: a.kind, idempotency_key: `sales-ops:${a.id}` },
      aprobado,
    });
  }

  if (senales.length) {
    const tipos = [...new Set(senales.map((s) => SIGNAL_LABELS[s.kind as keyof typeof SIGNAL_LABELS] ?? s.kind))];
    items.push({
      tipo: 'senal',
      que: `${senales.length} respuesta${senales.length === 1 ? '' : 's'} del cliente sin atender (${tipos.slice(0, 3).join(', ')}). Última: «${(senales[0].excerpt ?? '').slice(0, 100)}».`,
      desde: iso(senales[0].createdAt),
      tools: ['whatspro_sales_signals_list', 'whatspro_sales_signal_mark'],
      ref: { signal_ids: senales.map((s) => s.id) },
      aprobado: false,
    });
  }

  for (const c of corridas) {
    const aprobado = c.status === 'queued' && Boolean((c.metadata as Record<string, unknown> | null)?.approvedAt);
    items.push({
      tipo: 'corrida',
      que:
        c.status === 'blocked'
          ? `Un pedido quedó trabado esperando una decisión humana: ${c.summary?.slice(0, 120) ?? 'sin detalle'}.`
          : `Pedido ${aprobado ? 'aprobado' : 'sin aprobar'} en la cola (${c.promptKey}).`,
      desde: iso(c.createdAt),
      tools: ['whatspro_sales_prompt_get', 'whatspro_sales_prompt_result'],
      ref: { run_id: c.id, prompt_key: c.promptKey, status: c.status },
      aprobado,
    });
  }

  const audiosPendientes = audios[0]?.pendientes ?? 0;
  if (audiosPendientes > 0) {
    items.push({
      tipo: 'audio',
      que: `${audiosPendientes} audio${audiosPendientes === 1 ? '' : 's'} de este chat sin ficha: lo que dicen no está en el expediente.`,
      desde: null,
      tools: ['whatspro_pending_audios', 'whatspro_transcribe_media', 'whatspro_audio_insight_write'],
      ref: { chat_id: chatId },
      aprobado: true,
    });
  }

  const crmFix = analisis[0]?.crmFix ?? null;
  if (crmFix) {
    const partes = [
      crmFix.stage ? `etapa → ${crmFix.stage}` : null,
      crmFix.addTags?.length ? `+${crmFix.addTags.join(', ')}` : null,
      crmFix.removeTags?.length ? `−${crmFix.removeTags.join(', ')}` : null,
      crmFix.fields && Object.keys(crmFix.fields).length ? `campos: ${Object.keys(crmFix.fields).join(', ')}` : null,
    ].filter(Boolean);
    items.push({
      tipo: 'crm_fix',
      que: `El CRM contradice el chat y hay una corrección propuesta sin aplicar (${partes.join(' · ') || 'sin detalle'}).`,
      desde: iso(analisis[0]?.updatedAt),
      tools: ['whatspro_crm_fix_list', 'whatspro_crm_fix_apply'],
      ref: { chat_id: chatId },
      aprobado: false,
    });
  }

  // Producción abierta del contacto: lo que se le prometió y todavía no salió.
  if (opts.contactId) {
    const pedidos = await db
      .select({
        id: teamTaskItems.id,
        title: teamTaskItems.title,
        workKind: teamTaskItems.workKind,
        workStatus: teamTaskItems.workStatus,
        updatedAt: teamTaskItems.updatedAt,
      })
      .from(teamTaskItems)
      .innerJoin(
        teamTaskRelations,
        and(
          eq(teamTaskRelations.teamId, teamId),
          eq(teamTaskRelations.sourceType, 'task'),
          eq(teamTaskRelations.sourceId, teamTaskItems.id),
          eq(teamTaskRelations.targetType, 'contact'),
          eq(teamTaskRelations.targetId, opts.contactId),
        ),
      )
      .where(
        and(
          eq(teamTaskItems.teamId, teamId),
          sql`${teamTaskItems.workKind} IS NOT NULL`,
          inArray(teamTaskItems.workStatus, ['pedido', 'aceptado', 'en_curso', 'espera_cliente', 'cambios', 'qa']),
        ),
      )
      .orderBy(desc(teamTaskItems.updatedAt))
      .limit(5);
    for (const p of pedidos) {
      const kind = WORK_KIND_META[p.workKind as WorkKind];
      const estado = WORK_STATUS_META[p.workStatus as WorkStatus];
      items.push({
        tipo: 'produccion',
        que: `Producción abierta: «${p.title}» (${kind?.label ?? p.workKind}) en ${estado?.label ?? p.workStatus}.`,
        desde: iso(p.updatedAt),
        tools: ['whatspro_production_get', 'whatspro_production_update'],
        ref: { task_id: p.id, work_status: p.workStatus },
        aprobado: true,
      });
    }
  }

  return {
    chatId,
    total: items.length,
    esperaDecision: items.filter((i) => !i.aprobado).length,
    items,
  };
}
