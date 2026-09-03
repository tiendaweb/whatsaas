
import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { tags } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const tagColors = ['gray', 'green', 'blue', 'violet', 'amber', 'rose', 'teal'] as const;
const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.enum(tagColors).default('gray'),
});
const tagUpdateSchema = tagInputSchema.extend({ id: z.number().int().positive() });


export async function GET() {
  try {
    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamTags = await db.query.tags.findMany({
      where: eq(tags.teamId, team.id),
      orderBy: (tags, { asc }) => [asc(tags.name)],
    });

    return NextResponse.json(teamTags);

  } catch (error: any) {
    console.error('Error fetching tags:', error.message);
    return NextResponse.json({ error: 'Internal Server Error.' }, { status: 500 });
  }
}


export async function POST(request: NextRequest) {
  try {
    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = tagInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid tag', details: parsed.error.flatten() }, { status: 400 });

    const [newTag] = await db.insert(tags)
      .values({
        teamId: team.id,
        name: parsed.data.name,
        color: parsed.data.color,
      })
      .returning();

    return NextResponse.json(newTag, { status: 201 });

  } catch (error: any) {
    
    if (error.code === '23505') { 
        return NextResponse.json({ error: 'A tag with that name already exists.' }, { status: 409 });
    }
    console.error('Error creating tag:', error.message);
    return NextResponse.json({ error: 'Internal Server Error.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parsed = tagUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid tag', details: parsed.error.flatten() }, { status: 400 });

    const [updated] = await db.update(tags)
      .set({ name: parsed.data.name, color: parsed.data.color })
      .where(and(eq(tags.id, parsed.data.id), eq(tags.teamId, team.id)))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.code === '23505') return NextResponse.json({ error: 'A tag with that name already exists.' }, { status: 409 });
    console.error('Error updating tag:', error.message);
    return NextResponse.json({ error: 'Internal Server Error.' }, { status: 500 });
  }
}
