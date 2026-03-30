import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { automations, chats } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { triggerAutomationManually } from '@/lib/automation/engine';
import type { AutomationCanvasNode } from '@/lib/automation/flow-schema';

async function getChatForTeam(teamId: number, chatId: number) {
  return db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
    columns: {
      id: true,
      remoteJid: true,
      instanceId: true,
    },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const chatId = Number.parseInt(id, 10);
    if (Number.isNaN(chatId)) {
      return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });
    }

    const chat = await getChatForTeam(team.id, chatId);
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    if (!chat.instanceId) return NextResponse.json({ automations: [] });

    const activeAutomations = await db.query.automations.findMany({
      where: and(
        eq(automations.teamId, team.id),
        eq(automations.instanceId, chat.instanceId),
        eq(automations.isActive, true),
      ),
      columns: {
        id: true,
        name: true,
        nodes: true,
      },
      orderBy: [asc(automations.name)],
    });

    const payload = activeAutomations.map((automation) => {
      const nodes = (automation.nodes as AutomationCanvasNode[]) || [];
      const availableStartNodes = nodes
        .filter((node) => node.type !== 'start')
        .map((node) => ({
          id: node.id,
          type: node.type,
          label: String(node.data?.label || node.data?.title || node.type),
        }));

      return {
        id: automation.id,
        name: automation.name,
        availableStartNodes,
      };
    });

    return NextResponse.json({ automations: payload });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const chatId = Number.parseInt(id, 10);
    if (Number.isNaN(chatId)) {
      return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });
    }

    const chat = await getChatForTeam(team.id, chatId);
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    if (!chat.instanceId) {
      return NextResponse.json({ error: 'Chat has no connected instance' }, { status: 400 });
    }

    const body = await request.json();
    const automationId = Number(body?.automationId);
    const startNodeId = typeof body?.startNodeId === 'string' ? body.startNodeId : 'start';

    if (Number.isNaN(automationId)) {
      return NextResponse.json({ error: 'Invalid automation id' }, { status: 400 });
    }

    const success = await triggerAutomationManually(
      team.id,
      chatId,
      chat.remoteJid,
      chat.instanceId,
      { automationId, startNodeId }
    );

    if (!success) {
      return NextResponse.json({ error: 'Unable to trigger automation' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
