import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, contacts, messageAudioInsights, teamChatExclusions, teamCommercialSignals } from '@/lib/db/schema';
import { maskJid } from '@/lib/desktop/command-center/types';

/**
 * Chats ignorados: los que no son conversaciones con clientes.
 *
 * Marcar uno acá lo saca de TODO a la vez —listas comerciales, radar de
 * respuestas, prefiltro del clasificador y cola de audios—, porque los cuatro
 * consumen la misma condición (`condicionDeChatMarcado` en `lib/chats/internos`).
 * Antes esto vivía en dos variables de entorno: sacar el chat de la familia del
 * radar exigía editar el `.env` y desplegar, así que nadie lo hacía y esos
 * chats seguían gastando cuota de IA.
 *
 * Marcar **no borra el análisis**: la fila de `team_commercial_analysis` queda
 * intacta y las listas simplemente no la muestran, así desmarcar devuelve el
 * chat a donde estaba. Lo que sí se limpia es lo que es una cola de trabajo
 * pendiente —audios encolados y señales sin atender—, porque eso es trabajo
 * que ya se decidió no hacer.
 */

export const EXCLUSION_KINDS = ['personal', 'equipo', 'otros'] as const;
export type ExclusionKind = (typeof EXCLUSION_KINDS)[number];

export const EXCLUSION_LABELS: Record<ExclusionKind, string> = {
  personal: 'Personal',
  equipo: 'Equipo',
  otros: 'Otros',
};

export const isExclusionKind = (v: unknown): v is ExclusionKind =>
  typeof v === 'string' && (EXCLUSION_KINDS as readonly string[]).includes(v);

export type ExcludedChatRow = {
  chatId: number;
  contactId: number | null;
  name: string;
  phoneMasked: string;
  kind: ExclusionKind;
  reason: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/exclusions] audit', error);
  }
}

/** Los chats ignorados del equipo, opcionalmente de un solo grupo. */
export async function listExclusions(teamId: number, opts: { kind?: ExclusionKind; limit?: number } = {}): Promise<ExcludedChatRow[]> {
  const conditions = [eq(teamChatExclusions.teamId, teamId)];
  if (opts.kind) conditions.push(eq(teamChatExclusions.kind, opts.kind));
  const rows = await db
    .select({
      chatId: teamChatExclusions.chatId,
      kind: teamChatExclusions.kind,
      reason: teamChatExclusions.reason,
      createdAt: teamChatExclusions.createdAt,
      chatName: chats.name,
      pushName: chats.pushName,
      remoteJid: chats.remoteJid,
      lastMessageAt: chats.lastCustomerInteraction,
      contactId: contacts.id,
      contactName: contacts.name,
    })
    .from(teamChatExclusions)
    .innerJoin(chats, eq(chats.id, teamChatExclusions.chatId))
    .leftJoin(contacts, and(eq(contacts.chatId, chats.id), eq(contacts.teamId, teamId)))
    .where(and(...conditions))
    .orderBy(desc(teamChatExclusions.createdAt))
    .limit(Math.min(Math.max(1, opts.limit ?? 300), 1000));

  return rows.map((r) => ({
    chatId: r.chatId,
    contactId: r.contactId,
    name: r.contactName || r.chatName || r.pushName || maskJid(r.remoteJid),
    phoneMasked: maskJid(r.remoteJid),
    kind: isExclusionKind(r.kind) ? r.kind : 'otros',
    reason: r.reason,
    lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function countExclusionsByKind(teamId: number): Promise<Record<ExclusionKind, number>> {
  const rows = await db
    .select({ kind: teamChatExclusions.kind, n: sql<number>`count(*)::int` })
    .from(teamChatExclusions)
    .where(eq(teamChatExclusions.teamId, teamId))
    .groupBy(teamChatExclusions.kind);
  const counts: Record<ExclusionKind, number> = { personal: 0, equipo: 0, otros: 0 };
  for (const row of rows) if (isExclusionKind(row.kind)) counts[row.kind] = row.n;
  return counts;
}

/**
 * Marca chats como ignorados y limpia el trabajo pendiente que tenían.
 *
 * Devuelve qué se limpió para poder decirlo en la interfaz: "3 chats
 * ignorados · 128 audios sacados de la cola" es la confirmación de que el
 * marcado sirvió para algo.
 */
export async function excludeChats(
  teamId: number,
  userId: number | null,
  chatIds: number[],
  kind: ExclusionKind,
  reason: string | null = null,
): Promise<{ excluded: number; audiosRemoved: number; signalsRemoved: number }> {
  const ids = Array.from(new Set(chatIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (!ids.length) return { excluded: 0, audiosRemoved: 0, signalsRemoved: 0 };

  // Un chat de otro equipo no se marca: la fila colgaría de un chat ajeno.
  const propios = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.teamId, teamId), inArray(chats.id, ids)));
  const validos = propios.map((c) => c.id);
  if (!validos.length) return { excluded: 0, audiosRemoved: 0, signalsRemoved: 0 };

  await db
    .insert(teamChatExclusions)
    .values(validos.map((chatId) => ({ teamId, chatId, kind, reason, createdBy: userId })))
    .onConflictDoUpdate({
      target: [teamChatExclusions.teamId, teamChatExclusions.chatId],
      set: { kind, reason, createdBy: userId, createdAt: new Date() },
    });

  // Trabajo pendiente que ya no hay que hacer. Lo transcripto no se toca.
  const audios = await db
    .delete(messageAudioInsights)
    .where(and(eq(messageAudioInsights.teamId, teamId), inArray(messageAudioInsights.chatId, validos), inArray(messageAudioInsights.status, ['queued', 'pending'])))
    .returning({ id: messageAudioInsights.id });
  const signals = await db
    .delete(teamCommercialSignals)
    .where(and(eq(teamCommercialSignals.teamId, teamId), inArray(teamCommercialSignals.chatId, validos), inArray(teamCommercialSignals.status, ['new', 'seen'])))
    .returning({ id: teamCommercialSignals.id });

  await audit(teamId, userId, 'SALES_OPS_CHATS_EXCLUDED', { kind, chatIds: validos, audios: audios.length, signals: signals.length });
  return { excluded: validos.length, audiosRemoved: audios.length, signalsRemoved: signals.length };
}

/** Devuelve chats al circuito comercial. El análisis que tenían sigue estando. */
export async function includeChats(teamId: number, userId: number | null, chatIds: number[]): Promise<number> {
  const ids = Array.from(new Set(chatIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (!ids.length) return 0;
  const rows = await db
    .delete(teamChatExclusions)
    .where(and(eq(teamChatExclusions.teamId, teamId), inArray(teamChatExclusions.chatId, ids)))
    .returning({ id: teamChatExclusions.id });
  await audit(teamId, userId, 'SALES_OPS_CHATS_INCLUDED', { chatIds: ids, count: rows.length });
  return rows.length;
}

/** ¿Este chat está ignorado? Lo usan el clasificador y las tools antes de gastar IA. */
export async function isChatExcluded(teamId: number, chatId: number): Promise<ExclusionKind | null> {
  const row = await db.query.teamChatExclusions.findFirst({
    where: and(eq(teamChatExclusions.teamId, teamId), eq(teamChatExclusions.chatId, chatId)),
    columns: { kind: true },
  });
  if (!row) return null;
  return isExclusionKind(row.kind) ? row.kind : 'otros';
}
