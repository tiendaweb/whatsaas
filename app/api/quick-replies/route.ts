import { NextResponse, NextRequest } from 'next/server';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { createQuickReply, deleteQuickReply, listQuickReplies } from '@/lib/quick-replies/service';

export async function GET() {
  const team = await getTeamForUser();
  if (!team) return NextResponse.json([]);

  return NextResponse.json(await listQuickReplies(team.id));
}

export async function POST(request: NextRequest) {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { shortcut, content } = await request.json();

  try {
    const newReply = await createQuickReply(team.id, user.id, { shortcut, content });
    return NextResponse.json(newReply);
  } catch (error) {
    if (error instanceof Error && error.message === 'shortcut and content are required') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
    const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
    if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await request.json();
    await deleteQuickReply(team.id, user.id, Number(id));

    return NextResponse.json({ success: true });
}
