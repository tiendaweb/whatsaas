import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { generateTasksFromNoteCommitments } from '@/lib/plugins/notes/server/meeting-notes';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getPluginRequestContext('notesWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const note = await generateTasksFromNoteCommitments({ teamId: context.team.id, userId: context.user.id, noteId: Number(id) });
  if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json(note);
}
