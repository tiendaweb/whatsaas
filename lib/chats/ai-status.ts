import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiConfigs, aiSessions, chats, users } from '@/lib/db/schema';
import { createSystemMessage } from '@/lib/db/system-messages';
import { pusherServer } from '@/lib/pusher-server';
import { getEffectiveAIState, shouldPersistAISession } from '@/lib/ai/session-state';

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
    db.query.aiSessions.findFirst({ where: eq(aiSessions.chatId, chatId), columns: { status: true } }),
  ]);
  return serializeAIState(getEffectiveAIState(!!config?.isActive, session?.status));
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

  const previousState = getEffectiveAIState(!!teamConfig?.isActive, existingSession?.status);
  let nextConversationStatus = existingSession?.status ?? null;

  if (existingSession) {
    if (existingSession.status !== status) {
      await db.update(aiSessions).set({ status, updatedAt: new Date() }).where(eq(aiSessions.id, existingSession.id));
    }
    nextConversationStatus = status;
  } else if (shouldPersistAISession(status, false)) {
    await db.insert(aiSessions).values({ chatId, status, history: [] });
    nextConversationStatus = status;
  }

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
