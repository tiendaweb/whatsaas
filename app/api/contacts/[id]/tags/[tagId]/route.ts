
import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { contactTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';


export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string, tagId: string }> }) {
  try {
    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const contactId = parseInt(params.id, 10);
    const tagId = parseInt(params.tagId, 10);

    if (isNaN(contactId) || isNaN(tagId)) {
      return NextResponse.json({ error: 'Invalid contact and tag IDs' }, { status: 400 });
    }
    
    await db.delete(contactTags)
      .where(and(
        eq(contactTags.contactId, contactId),
        eq(contactTags.tagId, tagId)
      ));

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error removing tag:', error.message);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}