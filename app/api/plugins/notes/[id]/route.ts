import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamNotes } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

const dueDateSchema = z
  .union([z.string().date(), z.string().datetime({ offset: true }), z.string().datetime()])
  .nullable()
  .optional();

const updateSchema = z.object({
  title: z.string().min(1).max(180).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  dueDate: dueDateSchema,
});

function parseDueDate(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getPluginRequestContext('notesWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const [updated] = await db
    .update(teamNotes)
    .set({
      ...payload,
      dueDate: payload.dueDate === undefined ? undefined : parseDueDate(payload.dueDate),
      updatedBy: context.user.id,
      updatedAt: new Date(),
    })
    .where(and(eq(teamNotes.id, Number(id)), eq(teamNotes.teamId, context.team.id)))
    .returning();

  return NextResponse.json(updated ?? null);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getPluginRequestContext('notesWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  await db.delete(teamNotes).where(and(eq(teamNotes.id, Number(id)), eq(teamNotes.teamId, context.team.id)));
  return NextResponse.json({ ok: true });
}
