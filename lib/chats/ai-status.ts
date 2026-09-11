import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiConfigs, aiSessions, chats, users } from '@/lib/db/schema';
import { createSystemMessage } from '@/lib/db/system-messages';
import { pusherServer } from '@/lib/pusher-server';
import { getEffectiveAIState, overrideDeSesion } from '@/lib/ai/session-state';

export type ChatAiStatus = 'active' | 'paused';

export type ChatAiState = {
  isActive: boolean;
  teamEnabled: boolean;
  conversationStatus: string | null;
  effectiveStatus: ChatAiStatus;
  inheritsTeamStatus: boolean;
  hasSession: boolean;
};

function serializeAIState(aiState: ReturnType<typeof getEffectiveAIState>): ChatAiState {
  return {
    isActive: aiState.isActive,
    teamEnabled: aiState.teamEnabled,
    conversationStatus: aiState.conversationStatus,
    effectiveStatus: aiState.effectiveStatus,
    inheritsTeamStatus: aiState.inheritsTeamStatus,
    hasSession: aiState.hasSession,
  };
}

async function ownedChat(teamId: number, chatId: number) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
    columns: { id: true },
  });
  if (!chat) throw new Error('Chat not found.');
  return chat;
}

/** Estado efectivo del agente IA en un chat: sin sesión, hereda el del equipo. */
export async function getChatAiStatus(teamId: number, chatId: number): Promise<ChatAiState> {
  await ownedChat(teamId, chatId);
  const [config, session] = await Promise.all([
    db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, teamId), columns: { isActive: true } }),
    db.query.aiSessions.findFirst({ where: eq(aiSessions.chatId, chatId), columns: { status: true, isOverride: true } }),
  ]);
  return serializeAIState(getEffectiveAIState(!!config?.isActive, overrideDeSesion(session)));
}

/**
 * Activa o pausa el agente IA en un chat concreto.
 *
 * Persiste una sesión sólo cuando hace falta (pausar un chat que no tiene
 * sesión sí la crea, porque hay que recordar la pausa; activar uno sin sesión
 * no, porque ya hereda del equipo). Si el estado efectivo cambió deja mensaje
 * de sistema y avisa por Pusher, igual que la pantalla.
 */
export async function setChatAiStatus(teamId: number, userId: number, chatId: number, enabled: boolean) {
  await ownedChat(teamId, chatId);
  const status: ChatAiStatus = enabled ? 'active' : 'paused';

  const [teamConfig, existingSession, actor] = await Promise.all([
    db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, teamId), columns: { isActive: true } }),
    db.query.aiSessions.findFirst({ where: eq(aiSessions.chatId, chatId) }),
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true, email: true } }),
  ]);

  const previousState = getEffectiveAIState(!!teamConfig?.isActive, overrideDeSesion(existingSession));
  const ahora = new Date();

  /**
   * Tocar el interruptor de un chat SIEMPRE deja override.
   *
   * Antes, activar un chat sin sesión no escribía nada —"ya hereda del
   * equipo"—, así que con el bot del equipo apagado prender la IA en un chat
   * no hacía absolutamente nada. Lo que una persona toca, manda y queda
   * escrito, con su nombre y su fecha.
   */
  if (existingSession) {
    await db
      .update(aiSessions)
      .set({ status, isOverride: true, overrideBy: userId, overrideAt: ahora, updatedAt: ahora })
      .where(eq(aiSessions.id, existingSession.id));
  } else {
    await db.insert(aiSessions).values({ chatId, status, history: [], isOverride: true, overrideBy: userId, overrideAt: ahora });
  }
  const nextConversationStatus = status;

  const nextState = getEffectiveAIState(!!teamConfig?.isActive, nextConversationStatus);
  const hasStateChanged =
    previousState.conversationStatus !== nextState.conversationStatus ||
    previousState.effectiveStatus !== nextState.effectiveStatus;

  if (hasStateChanged) {
    const userName = actor?.name || actor?.email || 'usuario';
    const logText = nextState.effectiveStatus === 'active'
      ? `@@syslog_user_activated_ai|name=${userName}`
      : `@@syslog_user_deactivated_ai|name=${userName}`;
    await createSystemMessage(teamId, chatId, logText);
    await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
      chatId,
      type: 'ai',
      status: nextState.effectiveStatus,
    });
  }

  return {
    requestedStatus: status,
    status: nextState.effectiveStatus,
    changed: hasStateChanged,
    ...serializeAIState(nextState),
  };
}
