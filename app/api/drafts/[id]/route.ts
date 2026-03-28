import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { messageDrafts, messageDraftTagLinks } from '@/lib/db/schema';

function parseId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === 'null') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDraft(draft: any) {
  const tags = (draft.tagLinks ?? []).map((tagLink: any) => tagLink.tag);

  return {
    id: draft.id,
    teamId: draft.teamId,
    title: draft.title,
    content: draft.content,
    categoryId: draft.categoryId,
    contactId: draft.contactId,
    assignedUserId: draft.assignedUserId,
    departmentId: draft.departmentId,
    stages: draft.stages,
    isArchived: draft.isArchived,
    createdBy: draft.createdBy,
    updatedBy: draft.updatedBy,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    category: draft.category,
    contact: draft.contact,
    assignedUser: draft.assignedUser,
    department: draft.department,
    tags,
    relationships: {
      tagIds: tags.map((tag: any) => tag.id),
      categoryId: draft.category?.id ?? null,
      contactId: draft.contact?.id ?? null,
      assignedUserId: draft.assignedUser?.id ?? null,
      departmentId: draft.department?.id ?? null,
    },
  };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const draftId = parseId((await params).id);
    if (!draftId) return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 });

    const draft = await db.query.messageDrafts.findFirst({
      where: and(eq(messageDrafts.id, draftId), eq(messageDrafts.teamId, context.teamId)),
      with: {
        category: true,
        contact: { columns: { id: true, name: true } },
        assignedUser: { columns: { id: true, name: true, email: true } },
        department: { columns: { id: true, name: true } },
        tagLinks: { with: { tag: true } },
      },
    });

    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    return NextResponse.json(normalizeDraft(draft));
  } catch (error: any) {
    console.error('Error getting draft:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const draftId = parseId((await params).id);
    if (!draftId) return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 });

    const body = await request.json();
    const title = String(body?.title ?? '').trim();
    const content = String(body?.content ?? '').trim();
    if (!title || !content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
    }

    const categoryId = parseOptionalInt(body?.categoryId);
    const assignedUserId = parseOptionalInt(body?.assignedUserId);
    const departmentId = parseOptionalInt(body?.departmentId);
    const contactId = parseOptionalInt(body?.contactId);
    const isArchived = Boolean(body?.isArchived);

    const stages = Array.isArray(body?.stages) ? body.stages : undefined;

    const tagIds: number[] = Array.isArray(body?.tagIds)
      ? Array.from(
          new Set(
            body.tagIds
              .map((tagId: unknown) => Number(tagId))
              .filter((tagId: number) => Number.isInteger(tagId) && tagId > 0),
          ),
        )
      : [];

    const updated = await db.transaction(async (tx) => {
      const [draft] = await tx
        .update(messageDrafts)
        .set({
          title,
          content,
          categoryId,
          assignedUserId,
          departmentId,
          contactId,
          stages,
          isArchived,
          updatedBy: context.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(messageDrafts.id, draftId), eq(messageDrafts.teamId, context.teamId)))
        .returning({ id: messageDrafts.id });

      if (!draft) return null;

      await tx.delete(messageDraftTagLinks).where(eq(messageDraftTagLinks.draftId, draft.id));
      if (tagIds.length > 0) {
        await tx.insert(messageDraftTagLinks).values(
          tagIds.map((tagId) => ({
            draftId: draft.id,
            tagId,
          })),
        );
      }

      return draft.id;
    });

    if (!updated) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    const draft = await db.query.messageDrafts.findFirst({
      where: and(eq(messageDrafts.id, updated), eq(messageDrafts.teamId, context.teamId)),
      with: {
        category: true,
        contact: { columns: { id: true, name: true } },
        assignedUser: { columns: { id: true, name: true, email: true } },
        department: { columns: { id: true, name: true } },
        tagLinks: { with: { tag: true } },
      },
    });

    return NextResponse.json(normalizeDraft(draft));
  } catch (error: any) {
    console.error('Error updating draft:', error?.message || error);

    if (error?.code === '23503') {
      return NextResponse.json({ error: 'Invalid related reference.' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const draftId = parseId((await params).id);
    if (!draftId) return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 });

    const [deleted] = await db
      .delete(messageDrafts)
      .where(and(eq(messageDrafts.id, draftId), eq(messageDrafts.teamId, context.teamId)))
      .returning({ id: messageDrafts.id });

    if (!deleted) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting draft:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
