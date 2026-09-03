import { NextResponse, NextRequest } from 'next/server';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { getChatAiStatus, setChatAiStatus } from '@/lib/chats/ai-status';

function notFound(error: unknown) {
  return error instanceof Error && error.message === 'Chat not found.';
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

    try {
      return NextResponse.json(await getChatAiStatus(team.id, chatId));
    } catch (error) {
      if (notFound(error)) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      throw error;
    }
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

    try {
      const result = await setChatAiStatus(team.id, user.id, chatId, status === 'active');
      return NextResponse.json({ success: true, ...result });
    } catch (error) {
      if (notFound(error)) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      throw error;
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
