import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, teamCommercialActions, teamCommercialAnalysis, teamPromptRuns } from '@/lib/db/schema';
import type { Gate } from '../shared/taxonomy';
import type { Situacion } from '../shared/situacion';
import { situacionExpr, vigentesSnoozes } from './queries';

/**
 * Lo que el Command Center sabe de un contacto, en chico.
 *
 * El panel derecho del chat necesita dos cosas del Command Center: el símbolo
 * de cómo está clasificado (gate y situación, los mismos que se ven en las
 * listas) y qué trabajo hay encolado para ese contacto. Lo tenía sólo la ficha
 * del Command Center, a través de `getAnalysisDetail`, que además trae los
 * últimos mil mensajes, las versiones del análisis y el expediente entero: eso
 * no se puede pedir cada vez que alguien abre un chat.
 *
 * Esto es la mitad chica: tres consultas cortas por chat, todas con índice.
 */

/** Cuántas filas de trabajo encolado se listan. Con más, el panel deja de ser un panel. */
const TOPE = 6;

export type TrabajoEnCola = {
  /** Pedidos escritos a una IA (indicaciones y skills) todavía sin cerrar. */
  runs: Array<{ id: number; title: string; status: string; connector: string | null; createdAt: string }>;
  /** Filas de un lote comercial esperando aprobación o salida. */
  acciones: Array<{ id: number; kind: string; status: string; batchLabel: string; scheduledFor: string | null }>;
};

export type PanelChatSnapshot = {
  chatId: number;
  /** `false` = el Command Center todavía no miró este chat. */
  analizado: boolean;
  gate: Gate | null;
  situacion: Situacion;
  temperature: string | null;
  intent: string | null;
  intentScore: number | null;
  priorityScore: number | null;
  confidence: number | null;
  potentialValueUsd: number | null;
  /** Lo cotizado, en UNIDADES (no centavos), como lo guarda el análisis. */
  quotedPrice: number | null;
  quotedCurrency: string | null;
  followupsTotal: number | null;
  source: string | null;
  need: string | null;
  recommendedAction: string | null;
  analyzedAt: string | null;
  /** Hay una corrección de CRM propuesta esperando. */
  crmFixPendiente: boolean;
  cola: TrabajoEnCola;
};

/** Estados de una corrida que todavía no terminaron. */
const RUNS_ABIERTAS = ['queued', 'in_progress', 'blocked', 'failed'];
/** Estados de una fila de lote que todavía no salieron. */
const ACCIONES_ABIERTAS = ['proposed', 'pending_approval', 'approved', 'executing'];

export async function getPanelChatSnapshot(teamId: number, chatId: number): Promise<PanelChatSnapshot> {
  const snoozes = await vigentesSnoozes(teamId);
  const snoozeIds = snoozes.map((s) => s.chatId);

  const [analisis, runs, acciones] = await Promise.all([
    db
      .select({
        gate: teamCommercialAnalysis.currentGate,
        situacion: situacionExpr(teamId, snoozeIds),
        temperature: teamCommercialAnalysis.temperature,
        intent: teamCommercialAnalysis.intent,
        intentScore: teamCommercialAnalysis.intentScore,
        priorityScore: teamCommercialAnalysis.priorityScore,
        confidence: teamCommercialAnalysis.confidence,
        potentialValueUsd: teamCommercialAnalysis.potentialValueUsd,
        quotedPrice: teamCommercialAnalysis.quotedPrice,
        quotedCurrency: teamCommercialAnalysis.quotedCurrency,
        followupsTotal: teamCommercialAnalysis.followupsTotal,
        source: teamCommercialAnalysis.source,
        need: teamCommercialAnalysis.need,
        recommendedAction: teamCommercialAnalysis.recommendedAction,
        analyzedAt: teamCommercialAnalysis.analyzedAt,
        crmFix: sql<boolean>`${teamCommercialAnalysis.crmFix} is not null`,
      })
      .from(teamCommercialAnalysis)
      /**
       * El join a `chats` NO es decorativo: `situacionExpr` cruza los mensajes
       * programados por el `remote_jid` del chat. Sin él la consulta pasa el
       * build y falla recién al ejecutarse, con "missing FROM-clause entry for
       * table chats".
       */
      .leftJoin(chats, eq(chats.id, teamCommercialAnalysis.chatId))
      .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)))
      .limit(1),

    /**
     * Las corridas apuntan al chat por `target_id`, que es TEXTO: el campo
     * guarda distintos tipos de destino (chat, lote, equipo) y por eso no es un
     * entero. Comparar contra el número sin castear no usa el índice y, peor,
     * en Postgres es un error de tipos.
     */
    db
      .select({
        id: teamPromptRuns.id,
        // El título no es una columna: vive en `metadata.title`, que es donde
        // lo escribe y lo edita la cola de prompts. Sin él queda la clave del
        // prompt, que es lo mismo que hace el resto del Command Center.
        promptKey: teamPromptRuns.promptKey,
        metadata: teamPromptRuns.metadata,
        status: teamPromptRuns.status,
        connector: teamPromptRuns.connector,
        createdAt: teamPromptRuns.createdAt,
      })
      .from(teamPromptRuns)
      .where(
        and(
          eq(teamPromptRuns.teamId, teamId),
          eq(teamPromptRuns.targetKind, 'chat'),
          eq(teamPromptRuns.targetId, String(chatId)),
          inArray(teamPromptRuns.status, RUNS_ABIERTAS),
          /**
           * Fuera las corridas del motor (`sales-ops.*`): la clasificación y el
           * radar corren solos y cada tanto fallan. Listadas como "trabajo en
           * cola" hacían creer que alguien le había preparado algo al cliente.
           * Es el mismo recorte que hace la Cola (`engine=exclude`).
           */
          sql`${teamPromptRuns.promptKey} not like 'sales-ops.%'`,
        ),
      )
      .orderBy(desc(teamPromptRuns.createdAt))
      .limit(TOPE),

    db
      .select({
        id: teamCommercialActions.id,
        kind: teamCommercialActions.kind,
        status: teamCommercialActions.status,
        batchLabel: teamCommercialActions.batchLabel,
        scheduledFor: teamCommercialActions.scheduledFor,
      })
      .from(teamCommercialActions)
      .where(
        and(
          eq(teamCommercialActions.teamId, teamId),
          eq(teamCommercialActions.chatId, chatId),
          inArray(teamCommercialActions.status, ACCIONES_ABIERTAS),
        ),
      )
      .orderBy(desc(teamCommercialActions.createdAt))
      .limit(TOPE),
  ]);

  const a = analisis[0] ?? null;

  return {
    chatId,
    analizado: Boolean(a?.analyzedAt),
    gate: (a?.gate as Gate | null) ?? null,
    // Sin fila de análisis la situación no se puede calcular en SQL: es
    // "sin_analizar", que es exactamente lo que pasa.
    situacion: (a?.situacion as Situacion | undefined) ?? 'sin_analizar',
    temperature: a?.temperature ?? null,
    intent: a?.intent ?? null,
    intentScore: a?.intentScore ?? null,
    priorityScore: a?.priorityScore ?? null,
    confidence: a?.confidence ?? null,
    potentialValueUsd: a?.potentialValueUsd ?? null,
    quotedPrice: a?.quotedPrice ?? null,
    quotedCurrency: a?.quotedCurrency ?? null,
    followupsTotal: a?.followupsTotal ?? null,
    source: a?.source ?? null,
    need: a?.need ?? null,
    recommendedAction: a?.recommendedAction ?? null,
    analyzedAt: a?.analyzedAt ? a.analyzedAt.toISOString() : null,
    crmFixPendiente: Boolean(a?.crmFix),
    cola: {
      runs: runs.map((r) => ({
        id: r.id,
        title: typeof r.metadata?.title === 'string' && r.metadata.title.trim() ? r.metadata.title : r.promptKey,
        status: r.status,
        connector: r.connector ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      acciones: acciones.map((x) => ({
        id: x.id,
        kind: x.kind,
        status: x.status,
        batchLabel: x.batchLabel,
        scheduledFor: x.scheduledFor ? x.scheduledFor.toISOString() : null,
      })),
    },
  };
}
