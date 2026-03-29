import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { ensureDraftStorage } from '@/lib/drafts/bootstrap';
import { messageDraftCategories } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.categories.GET');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json([]);

    const categories = await db.query.messageDraftCategories.findMany({
      where: eq(messageDraftCategories.teamId, context.teamId),
      orderBy: [asc(messageDraftCategories.order), asc(messageDraftCategories.name)],
    });

    return NextResponse.json(categories);
  } catch (error: any) {
    console.error('Error fetching draft categories:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.categories.POST');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const name = String(body?.name ?? '').trim();
    const color = body?.color ? String(body.color).trim() : 'gray';
    const order = Number.isFinite(Number(body?.order)) ? Number(body.order) : 0;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const [category] = await db
      .insert(messageDraftCategories)
      .values({
        teamId: context.teamId,
        name,
        color,
        order,
      })
      .returning();

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Category already exists for this team.' }, { status: 409 });
    }

    console.error('Error creating draft category:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.categories.DELETE');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const categoryId = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(messageDraftCategories)
      .where(and(eq(messageDraftCategories.id, categoryId), eq(messageDraftCategories.teamId, context.teamId)))
      .returning({ id: messageDraftCategories.id });

    if (!deleted) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting draft category:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
