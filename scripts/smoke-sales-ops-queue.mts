/**
 * Smoke de la cola del Command Center Comercial contra la base real (equipo 2).
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-sales-ops-queue.mts
 *
 * Propone un lote "SMOKE" con 3 chats, lo lista, lo aprueba con el owner 23,
 * intenta aprobar un segundo lote con el mismo chat (debe fallar por el índice
 * parcial), marca un resultado y borra TODO lo que creó en un `finally`.
 * Si no hay filas en team_commercial_analysis inserta 3 mínimas y las borra.
 */
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  chats,
  teamCommercialActions,
  teamCommercialAnalysis,
  teamCommercialExperimentMembers,
  teamCommercialExperiments,
} from '@/lib/db/schema';
import { approveBatch, getBatch, listBatches, markResult, proposeBatch, QueueError, rejectBatch, expireStale } from '@/lib/plugins/sales-ops/server/queue';
import { listExperiments } from '@/lib/plugins/sales-ops/server/experiments';

const TEAM = 2;
const USER = 23;
const LABEL = 'SMOKE';

async function main() {
  const createdBatches: string[] = [];
  const insertedAnalysis: number[] = [];
  const createdExperiments: number[] = [];
  const chatIds: number[] = [];

  try {
    // 1. Chats de prueba: tres con análisis si los hay; si no, tres chats del equipo con análisis mínimo.
    const existing = await db
      .select({ chatId: teamCommercialAnalysis.chatId })
      .from(teamCommercialAnalysis)
      .where(and(eq(teamCommercialAnalysis.teamId, TEAM), eq(teamCommercialAnalysis.automationActive, false), eq(teamCommercialAnalysis.isExistingCustomer, false)))
      .limit(3);
    if (existing.length === 3) {
      chatIds.push(...existing.map((r) => r.chatId));
      console.log('analysis existentes:', chatIds);
    } else {
      const some = await db.select({ id: chats.id }).from(chats).where(eq(chats.teamId, TEAM)).orderBy(chats.id).limit(3);
      const rows = await db
        .insert(teamCommercialAnalysis)
        .values(
          some.map((c, i) => ({
            teamId: TEAM,
            chatId: c.id,
            currentGate: ['G4', 'G9', 'G1'][i],
            status: 'en_proceso',
            need: ['tienda_online', 'tienda_profesional', 'indefinida'][i],
            quotedPrice: i === 1 ? 20000000 : null,
            quotedCurrency: i === 1 ? 'ARS' : null,
            priorityScore: 100 - i,
          })),
        )
        .returning({ id: teamCommercialAnalysis.id, chatId: teamCommercialAnalysis.chatId });
      insertedAnalysis.push(...rows.map((r) => r.id));
      chatIds.push(...rows.map((r) => r.chatId));
      console.log('analysis de prueba insertados:', chatIds);
    }

    // 2. Dry run.
    const dry = await proposeBatch(TEAM, {
      label: LABEL,
      kind: 'send_message',
      requiresRole: 'any',
      chatIds,
      payloadTemplate: { text: 'Hola {{nombre}}, ¿seguimos con tu {{plan}}? Quedó en {{precio}}.' },
      proposedBy: USER,
      dryRun: true,
    });
    console.log('dry_run incluidos:', dry.included.map((c) => `${c.chatId}:${c.name} → "${c.text}"`));
    console.log('dry_run excluidos:', dry.excluded);

    // 3. Proponer de verdad (A/B → crea experimento).
    const proposed = await proposeBatch(TEAM, {
      label: LABEL,
      kind: 'send_message',
      requiresRole: 'any',
      chatIds,
      payloadTemplate: { text: 'A: Hola {{nombre}}, ¿seguimos con tu {{plan}}?', textB: 'B: {{nombre}}, ¿te paso el precio de nuevo? {{precio}}' },
      variantSplit: true,
      proposedBy: USER,
    });
    if (!proposed.batchId) throw new Error('no se creó el lote');
    createdBatches.push(proposed.batchId);
    if (proposed.experimentId) createdExperiments.push(proposed.experimentId);
    console.log('lote propuesto:', proposed.batchId, 'experimento:', proposed.experimentId, 'filas:', proposed.included.length, 'excluidos:', proposed.excluded.length);

    // 4. Listar y leer.
    const batches = await listBatches(TEAM, { status: 'proposed' });
    const mine = batches.find((b) => b.batchId === proposed.batchId);
    console.log('listBatches →', mine);
    const detail = await getBatch(TEAM, proposed.batchId);
    console.log('getBatch filas:', detail.actions.map((a) => ({ id: a.id, chat: a.chatId, name: a.name, variant: a.variant, text: a.payload.text, warnings: a.warnings })));

    // 5. Aprobar con owner 23, excluyendo la última fila.
    const excludeId = detail.actions[detail.actions.length - 1].id;
    const approved = await approveBatch(TEAM, USER, proposed.batchId, { excludeActionIds: [excludeId] });
    console.log('approveBatch →', approved);

    // 6. Segundo lote con el mismo chat: la aprobación debe fallar por el índice parcial.
    const second = await proposeBatch(TEAM, {
      label: `${LABEL} 2`,
      kind: 'send_message',
      requiresRole: 'any',
      chatIds: [chatIds[0]],
      payloadTemplate: { text: 'Otro texto para {{nombre}}' },
      proposedBy: USER,
    });
    console.log('segundo lote propuesto:', second.batchId, 'filas:', second.included.length, 'excluidos:', second.excluded);
    if (second.batchId) {
      createdBatches.push(second.batchId);
      try {
        await approveBatch(TEAM, USER, second.batchId);
        console.log('ERROR: el segundo lote se aprobó y no debía');
      } catch (error) {
        console.log('segundo lote bloqueado como se esperaba →', error instanceof QueueError ? `${error.code}: ${error.message}` : error);
      }
    } else {
      // El prefiltro ya lo dejó afuera (envio_aprobado_pendiente). Forzamos la carrera a nivel SQL.
      const [row] = await db
        .insert(teamCommercialActions)
        .values({ teamId: TEAM, chatId: chatIds[0], batchId: 'cc-smoke-race', batchLabel: `${LABEL} race`, kind: 'send_message', payload: { text: 'x' }, status: 'proposed', requiresRole: 'any', proposedBy: String(USER) })
        .returning({ id: teamCommercialActions.id });
      createdBatches.push('cc-smoke-race');
      try {
        await approveBatch(TEAM, USER, 'cc-smoke-race');
        console.log('ERROR: la carrera se aprobó y no debía');
      } catch (error) {
        console.log('carrera bloqueada como se esperaba →', error instanceof QueueError ? `${error.code}: ${error.message}` : error);
      }
      void row;
    }

    // 7. Marcar resultado de una fila aprobada.
    const approvedRow = (await getBatch(TEAM, proposed.batchId)).actions.find((a) => a.status === 'approved')!;
    const executed = await markResult(TEAM, approvedRow.id, { status: 'executed', executedVia: 'connector', resultMessageId: 'SMOKE-MSG-1', userId: USER });
    console.log('markResult executed →', { id: executed.id, status: executed.status, executedVia: executed.executedVia, resultMessageId: executed.resultMessageId });
    const resulted = await markResult(TEAM, approvedRow.id, { status: 'resulted', result: { respondedAt: new Date().toISOString() }, userId: USER });
    console.log('markResult resulted →', { status: resulted.status, result: resulted.result });

    // 8. Experimento con embudo.
    const experiments = await listExperiments(TEAM);
    const exp = experiments.find((e) => e.id === proposed.experimentId);
    console.log('experimento →', exp && { name: exp.name, status: exp.status, funnel: exp.funnel });

    // 9. Resumen final del lote + rechazo del resto + expireStale (no debe tocar nada).
    console.log('listBatches final →', (await listBatches(TEAM)).filter((b) => b.batchLabel.startsWith(LABEL)).map((b) => ({ id: b.batchId, byStatus: b.byStatus, responded: b.responded })));
    console.log('rejectBatch →', await rejectBatch(TEAM, USER, proposed.batchId, 'fin del smoke'));
    console.log('expireStale →', await expireStale(TEAM));
  } finally {
    // Limpieza total del smoke.
    const deletedActions = createdBatches.length
      ? await db.delete(teamCommercialActions).where(and(eq(teamCommercialActions.teamId, TEAM), inArray(teamCommercialActions.batchId, createdBatches))).returning({ id: teamCommercialActions.id })
      : [];
    const strayActions = await db.delete(teamCommercialActions).where(and(eq(teamCommercialActions.teamId, TEAM), like(teamCommercialActions.batchLabel, `${LABEL}%`))).returning({ id: teamCommercialActions.id });
    const deletedMembers = createdExperiments.length
      ? await db.delete(teamCommercialExperimentMembers).where(inArray(teamCommercialExperimentMembers.experimentId, createdExperiments)).returning({ id: teamCommercialExperimentMembers.id })
      : [];
    const deletedExperiments = await db
      .delete(teamCommercialExperiments)
      .where(and(eq(teamCommercialExperiments.teamId, TEAM), like(teamCommercialExperiments.name, `${LABEL}%`)))
      .returning({ id: teamCommercialExperiments.id });
    const deletedAnalysis = insertedAnalysis.length
      ? await db.delete(teamCommercialAnalysis).where(inArray(teamCommercialAnalysis.id, insertedAnalysis)).returning({ id: teamCommercialAnalysis.id })
      : [];
    const deletedLogs = createdBatches.length
      ? await db
          .delete(activityLogs)
          .where(and(eq(activityLogs.teamId, TEAM), like(activityLogs.action, 'SALES_OPS_%'), inArray(sql`${activityLogs.metadata}->>'batchId'`, createdBatches)))
          .returning({ id: activityLogs.id })
      : [];
    console.log('limpieza →', {
      actions: deletedActions.length + strayActions.length,
      members: deletedMembers.length,
      experiments: deletedExperiments.length,
      analysis: deletedAnalysis.length,
      auditLogsDelSmoke: deletedLogs.length,
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
