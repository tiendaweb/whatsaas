import { NextResponse, NextRequest } from 'next/server';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { closeChat } from '@/lib/chats/close';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    const user = await getUser();
    if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const chatId = parseInt(id);
    if (Number.isNaN(chatId)) return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });

    try {
      await closeChat(team.id, user.id, chatId);
    } catch (error) {
      if (error instanceof Error && error.message === 'Chat not found.') {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error closing chat:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
