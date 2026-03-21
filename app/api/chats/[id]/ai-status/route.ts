import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { aiConfigs, aiSessions, chats } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createSystemMessage } from '@/lib/db/system-messages';
import { pusherServer } from '@/lib/pusher-server';
import { getEffectiveAIState, shouldPersistAISession } from '@/lib/ai/session-state';

async function getChatForTeam(teamId: number, chatId: number) {
  return db.query.chats.findFirst({
    where: and(
      eq(chats.id, chatId),
      eq(chats.teamId, teamId)
    ),
    columns: { id: true },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const chatId = parseInt(id);

    if (Number.isNaN(chatId)) {
      return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });
    }

    const chat = await getChatForTeam(team.id, chatId);
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

    const [config, session] = await Promise.all([
      db.query.aiConfigs.findFirst({
        where: eq(aiConfigs.teamId, team.id),
        columns: { isActive: true },
      }),
      db.query.aiSessions.findFirst({
        where: eq(aiSessions.chatId, chatId),
        columns: { status: true },
      }),
    ]);

    // Regla de negocio: sin sesión no implica un estado persistido del chat,
    // sino que el chat hereda el estado global del equipo.
    const aiState = getEffectiveAIState(!!config?.isActive, session?.status);

    return NextResponse.json({
      isActive: aiState.isActive,
      teamEnabled: aiState.teamEnabled,
      conversationStatus: aiState.conversationStatus,
      effectiveStatus: aiState.effectiveStatus,
      inheritsTeamStatus: aiState.inheritsTeamStatus,
      hasSession: aiState.hasSession,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    const user = await getUser();
    if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const chatId = parseInt(id);
    const { status } = await request.json(); // 'active' or 'paused'

    if (Number.isNaN(chatId)) {
        return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });
    }

    if (status !== 'active' && status !== 'paused') {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const chat = await getChatForTeam(team.id, chatId);
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

    const [teamConfig, existingSession] = await Promise.all([
        db.query.aiConfigs.findFirst({
            where: eq(aiConfigs.teamId, team.id),
            columns: { isActive: true },
        }),
        db.query.aiSessions.findFirst({
            where: eq(aiSessions.chatId, chatId)
        }),
    ]);

    const previousState = getEffectiveAIState(!!teamConfig?.isActive, existingSession?.status);
    let nextConversationStatus = existingSession?.status ?? null;

    if (existingSession) {
      if (existingSession.status !== status) {
        await db.update(aiSessions)
          .set({ status, updatedAt: new Date() })
          .where(eq(aiSessions.id, existingSession.id));
      }

      nextConversationStatus = status;
    } else if (shouldPersistAISession(status, false)) {
      await db.insert(aiSessions).values({
        chatId,
        status,
        history: []
      });

      nextConversationStatus = status;
    }

    const nextState = getEffectiveAIState(!!teamConfig?.isActive, nextConversationStatus);
    const hasStateChanged =
      previousState.conversationStatus !== nextState.conversationStatus ||
      previousState.effectiveStatus !== nextState.effectiveStatus;

    if (hasStateChanged) {
      const userName = user.name || user.email;
      const logText = nextState.effectiveStatus === 'active'
        ? `@@syslog_user_activated_ai|name=${userName}`
        : `@@syslog_user_deactivated_ai|name=${userName}`;
      await createSystemMessage(team.id, chatId, logText);

      await pusherServer.trigger(`team-${team.id}`, 'chat-status-update', {
        chatId,
        type: 'ai',
        status: nextState.effectiveStatus,
      });
    }

    return NextResponse.json({
      success: true,
      requestedStatus: status,
      status: nextState.effectiveStatus,
      isActive: nextState.isActive,
      teamEnabled: nextState.teamEnabled,
      conversationStatus: nextState.conversationStatus,
      effectiveStatus: nextState.effectiveStatus,
      inheritsTeamStatus: nextState.inheritsTeamStatus,
      hasSession: nextState.hasSession,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
