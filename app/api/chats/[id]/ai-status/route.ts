import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { aiConfigs, aiSessions, chats } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createSystemMessage } from '@/lib/db/system-messages';
import { pusherServer } from '@/lib/pusher-server';

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

    const isTeamAiEnabled = !!config?.isActive;
    const isConversationActive = session ? session.status === 'active' : true;

    return NextResponse.json({
      isActive: isTeamAiEnabled && isConversationActive,
      teamEnabled: isTeamAiEnabled,
      conversationStatus: session?.status || 'active',
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

    if (existingSession) {
        await db.update(aiSessions)
            .set({ status, updatedAt: new Date() })
            .where(eq(aiSessions.id, existingSession.id));
    } else {
        await db.insert(aiSessions).values({
            chatId,
            status,
            history: []
        });
    }

    const userName = user.name || user.email;
    const logText = status === 'active'
        ? `@@syslog_user_activated_ai|name=${userName}`
        : `@@syslog_user_deactivated_ai|name=${userName}`;
    await createSystemMessage(team.id, chatId, logText);

    await pusherServer.trigger(`team-${team.id}`, 'chat-status-update', {
        chatId,
        type: 'ai',
        status,
    });

    return NextResponse.json({
        success: true,
        status,
        isActive: !!teamConfig?.isActive && status === 'active',
        teamEnabled: !!teamConfig?.isActive,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
