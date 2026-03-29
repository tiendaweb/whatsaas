import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq } from 'drizzle-orm';
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
      orderBy: [asc(messageDraftCategories.position), asc(messageDraftCategories.name)],
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
    let position = Number.isFinite(Number(body?.position)) ? Number(body.position) : -1;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (position < 0) {
      const [lastCategory] = await db
        .select({ position: messageDraftCategories.position })
        .from(messageDraftCategories)
        .where(eq(messageDraftCategories.teamId, context.teamId))
        .orderBy(desc(messageDraftCategories.position))
        .limit(1);

      position = (lastCategory?.position ?? -1) + 1;
    }

    const [category] = await db
      .insert(messageDraftCategories)
      .values({
        teamId: context.teamId,
        name,
        color,
        position,
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

export async function PATCH(request: NextRequest) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.categories.PATCH');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const action = String(body?.action ?? '').trim();

    if (action === 'rename') {
      const categoryId = Number(body?.id);
      const name = String(body?.name ?? '').trim();

      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
      }

      if (!name) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
      }

      const [updated] = await db
        .update(messageDraftCategories)
        .set({ name })
        .where(and(eq(messageDraftCategories.id, categoryId), eq(messageDraftCategories.teamId, context.teamId)))
        .returning();

      if (!updated) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      return NextResponse.json(updated);
    }

    if (action === 'reorder') {
      const items = Array.isArray(body?.items) ? body.items : [];
      if (items.length === 0) {
        return NextResponse.json({ error: 'items are required' }, { status: 400 });
      }

      for (const item of items) {
        const categoryId = Number(item?.id);
        const position = Number(item?.position);

        if (!Number.isInteger(categoryId) || categoryId <= 0 || !Number.isInteger(position) || position < 0) {
          return NextResponse.json({ error: 'Invalid reorder payload' }, { status: 400 });
        }

        await db
          .update(messageDraftCategories)
          .set({ position })
          .where(and(eq(messageDraftCategories.id, categoryId), eq(messageDraftCategories.teamId, context.teamId)));
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Category already exists for this team.' }, { status: 409 });
    }

    console.error('Error updating draft category:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
