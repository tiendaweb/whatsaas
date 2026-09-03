import 'server-only';

import { and, count, desc, eq, gt, isNull, max, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { grokConnectorCredentials, teamOperationsAiMessages } from '@/lib/db/schema';
import { loadTaskAiWorklist } from '@/lib/plugins/tasks/server/ai-operations';

export type OperationsAiMessage = {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  source: string;
  surface: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export async function listOperationsAiMessages(teamId: number, limit = 80): Promise<OperationsAiMessage[]> {
  const rows = await db
    .select()
    .from(teamOperationsAiMessages)
    .where(eq(teamOperationsAiMessages.teamId, teamId))
    .orderBy(desc(teamOperationsAiMessages.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));
  return rows.reverse().map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    source: row.source,
    surface: row.surface,
    createdAt: row.createdAt.toISOString(),
    metadata: row.metadata ?? {},
  }));
}

/**
 * Qué mostrarle a la persona mientras espera.
 *
 * La burbuja no responde sola: si nadie le pide al conector que corra, el
 * mensaje se queda esperando para siempre y la pantalla parece rota. Por eso
 * informa cuántos hay en cola y si existe siquiera un conector vivo.
 */
export async function getOperationsAiStatus(teamId: number) {
  const [[pending], [connector]] = await Promise.all([
    db
      .select({ value: count() })
      .from(teamOperationsAiMessages)
      .where(and(
        eq(teamOperationsAiMessages.teamId, teamId),
        eq(teamOperationsAiMessages.role, 'user'),
        sql`${teamOperationsAiMessages.metadata}->>'status' = 'pending'`,
      )),
    db
      .select({ value: count(), lastUsedAt: max(grokConnectorCredentials.lastUsedAt) })
      .from(grokConnectorCredentials)
      .where(and(
        eq(grokConnectorCredentials.teamId, teamId),
        eq(grokConnectorCredentials.kind, 'access_token'),
        isNull(grokConnectorCredentials.revokedAt),
        gt(grokConnectorCredentials.expiresAt, new Date()),
      )),
  ]);

  return {
    pending: pending?.value ?? 0,
    connectorReady: (connector?.value ?? 0) > 0,
    connectorLastUsedAt: connector?.lastUsedAt ? new Date(connector.lastUsedAt).toISOString() : null,
  };
}

/**
 * La burbuja NO contesta en el momento.
 *
 * El mensaje queda encolado como `status: 'pending'` y lo responde el conector
 * (ChatGPT, Grok o Claude) DESPUÉS de recorrer la cola de prompts y terminar,
 * vía `whatspro_operations_ai_reply`. Una respuesta inmediata de la IA
 * integrada sonaría a que algo se ejecutó cuando todavía no se ejecutó nada.
 */
export async function sendOperationsAiMessage(input: {
  teamId: number;
  userId: number;
  content: string;
  surface: 'tasks' | 'command-center';
}) {
  const content = input.content.trim().slice(0, 8000);
  if (!content) throw new Error('El mensaje no puede estar vacío.');

  const worklist = await loadTaskAiWorklist(input.teamId, { limit: 50 });
  const queue = {
    prepare: worklist.filter((item) => item.state === 'ready' && item.phase === 'prepare').length,
    execute: worklist.filter((item) => item.state === 'ready' && item.phase === 'execute').length,
    blocked: worklist.filter((item) => item.state === 'needs-context').length,
  };

  const [savedUser] = await db.insert(teamOperationsAiMessages).values({
    teamId: input.teamId,
    role: 'user',
    content,
    source: 'ui',
    surface: input.surface,
    metadata: { status: 'pending', queue },
    createdBy: input.userId,
  }).returning();

  return {
    user: { ...savedUser, createdAt: savedUser.createdAt.toISOString() },
    pending: true,
    queue,
  };
}

/**
 * Marca como respondidos los mensajes que el conector acaba de contestar.
 *
 * Con `replyToMessageId` se marca sólo ese; sin él, la respuesta es el cierre
 * de la corrida y salda todo lo que estaba esperando.
 */
async function markPendingAnswered(teamId: number, answeredByMessageId: number, replyToMessageId?: number) {
  await db
    .update(teamOperationsAiMessages)
    .set({
      metadata: sql`${teamOperationsAiMessages.metadata} || ${JSON.stringify({ status: 'answered', answeredByMessageId })}::jsonb`,
    })
    .where(and(
      eq(teamOperationsAiMessages.teamId, teamId),
      eq(teamOperationsAiMessages.role, 'user'),
      sql`${teamOperationsAiMessages.metadata}->>'status' = 'pending'`,
      ...(replyToMessageId ? [eq(teamOperationsAiMessages.id, replyToMessageId)] : []),
    ));
}

export async function saveOperationsConnectorReply(input: {
  teamId: number;
  userId: number;
  content: string;
  connector: 'chatgpt' | 'grok' | 'claude' | 'other';
  replyToMessageId?: number;
}) {
  if (input.replyToMessageId) {
    const original = await db.query.teamOperationsAiMessages.findFirst({
      where: eq(teamOperationsAiMessages.id, input.replyToMessageId),
      columns: { id: true, teamId: true },
    });
    if (!original || original.teamId !== input.teamId) throw new Error('El mensaje original no pertenece a este equipo.');
  }
  const content = input.content.trim().slice(0, 4000);
  if (!content) throw new Error('La respuesta no puede estar vacía.');
  const [message] = await db.insert(teamOperationsAiMessages).values({
    teamId: input.teamId,
    role: 'assistant',
    content,
    source: input.connector,
    surface: 'connector-report',
    metadata: { replyToMessageId: input.replyToMessageId ?? null },
    createdBy: input.userId,
  }).returning();
  await markPendingAnswered(input.teamId, message.id, input.replyToMessageId);
  return message;
}
