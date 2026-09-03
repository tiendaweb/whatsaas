import { NextResponse } from 'next/server';
import { getTeamForUser } from '@/lib/db/queries';
import { formatMessageForFrontend } from '@/lib/db/messages';
import { MessagingError, sendTeamTemplateMessage } from '@/lib/messaging/send';

export async function POST(request: Request) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { recipientJid, templateId, instanceId, variables } = body;

    if (!recipientJid || !templateId || !instanceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await sendTeamTemplateMessage(team.id, {
      recipientJid,
      templateId: parseInt(templateId),
      instanceId: parseInt(instanceId),
      variables: variables ?? null,
      origin: 'user',
    });

    return NextResponse.json(formatMessageForFrontend(result.message));
  } catch (error: any) {
    if (error instanceof MessagingError) {
      const status = error.code === 'template_rejected' ? 400
        : error.code === 'template_not_found' ? 404
          : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
