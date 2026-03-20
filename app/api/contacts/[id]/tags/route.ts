
import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { tags, contactTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';


export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tagId } = await request.json();
    const params = await context.params;
    const contactId = parseInt(params.id, 10);

    if (isNaN(contactId) || !tagId) {
      return NextResponse.json({ error: 'Contact IDs and tags are required.' }, { status: 400 });
    }

    
    const tag = await db.query.tags.findFirst({
      where: and(
        eq(tags.id, tagId),
        eq(tags.teamId, team.id)
      )
    });
    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    
    const [newLink] = await db.insert(contactTags)
      .values({
        contactId: contactId,
        tagId: tagId,
      })
      .onConflictDoNothing() 
      .returning();

    return NextResponse.json({ success: true, link: newLink, tag: tag });

  } catch (error: any) {
    console.error('Error adding tag:', error.message);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}