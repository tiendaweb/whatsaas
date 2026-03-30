import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamNotes } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

const createNoteSchema = z.object({
  title: z.string().min(1).max(180),
  content: z.string().default(''),
  tags: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
  dueDate: z.string().datetime().nullable().optional(),
});

export async function GET() {
  const context = await getPluginRequestContext('notesRead');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const notes = await db
    .select()
    .from(teamNotes)
    .where(eq(teamNotes.teamId, context.team.id))
    .orderBy(desc(teamNotes.pinned), desc(teamNotes.updatedAt));

  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const context = await getPluginRequestContext('notesWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const body = await request.json();
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(teamNotes)
    .values({
      teamId: context.team.id,
      title: parsed.data.title,
      content: parsed.data.content,
      tags: parsed.data.tags,
      pinned: parsed.data.pinned,
      status: parsed.data.status,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      createdBy: context.user.id,
      updatedBy: context.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
