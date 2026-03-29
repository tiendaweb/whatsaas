import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { ensureDraftStorage } from '@/lib/drafts/bootstrap';
import { messageDraftTags } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.tags.GET');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json([]);

    const tags = await db.query.messageDraftTags.findMany({
      where: eq(messageDraftTags.teamId, context.teamId),
      orderBy: [asc(messageDraftTags.name)],
    });

    return NextResponse.json(tags);
  } catch (error: any) {
    console.error('Error fetching draft tags:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.tags.POST');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const name = String(body?.name ?? '').trim();
    const color = body?.color ? String(body.color).trim() : 'gray';

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const [tag] = await db
      .insert(messageDraftTags)
      .values({
        teamId: context.teamId,
        name,
        color,
      })
      .returning();

    return NextResponse.json(tag, { status: 201 });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Tag already exists for this team.' }, { status: 409 });
    }

    console.error('Error creating draft tag:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.tags.DELETE');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tagId = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isInteger(tagId) || tagId <= 0) {
      return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(messageDraftTags)
      .where(and(eq(messageDraftTags.id, tagId), eq(messageDraftTags.teamId, context.teamId)))
      .returning({ id: messageDraftTags.id });

    if (!deleted) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting draft tag:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
