import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import {
  contacts,
  departments,
  messageDraftCategories,
  messageDrafts,
  messageDraftTagLinks,
  messageDraftTags,
  teamMembers,
  users,
} from '@/lib/db/schema';

function parseId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === 'null') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseWorkflow(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;

  const rawStages = Array.isArray((value as any).stages) ? (value as any).stages : [];
  const rawTasks = Array.isArray((value as any).tasks) ? (value as any).tasks : [];

  const stages = rawStages
    .map((stage: any, index: number) => ({
      id: String(stage?.id ?? `stage_${index}`),
      name: String(stage?.name ?? '').trim(),
      order: Number.isFinite(Number(stage?.order)) ? Number(stage.order) : index,
      departmentId: parseOptionalInt(stage?.departmentId),
    }))
    .filter((stage: any) => stage.name.length > 0)
    .sort((a: any, b: any) => a.order - b.order)
    .map((stage: any, index: number) => ({ ...stage, order: index }));

  const stageIds = new Set(stages.map((stage: any) => stage.id));
  const tasks = rawTasks
    .map((task: any, index: number) => ({
      id: String(task?.id ?? `task_${index}`),
      stageId: String(task?.stageId ?? ''),
      name: String(task?.name ?? '').trim(),
      order: Number.isFinite(Number(task?.order)) ? Number(task.order) : index,
      type: task?.type === 'group' || task?.type === 'subtask' ? task.type : 'task',
      parentTaskId: task?.parentTaskId ? String(task.parentTaskId) : null,
    }))
    .filter((task: any) => task.name.length > 0 && stageIds.has(task.stageId))
    .sort((a: any, b: any) => a.order - b.order)
    .map((task: any, index: number) => ({ ...task, order: index }));

  return { stages, tasks };
}

function normalizeDraft(draft: any) {
  if (!draft) return null;
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

async function validateDraftReferences(params: {
  teamId: number;
  categoryId: number | null;
  contactId: number | null;
  assignedUserId: number | null;
  departmentId: number | null;
  tagIds: number[];
}) {
  const { teamId, categoryId, contactId, assignedUserId, departmentId, tagIds } = params;

  if (categoryId) {
    const category = await db.query.messageDraftCategories.findFirst({
      where: and(eq(messageDraftCategories.id, categoryId), eq(messageDraftCategories.teamId, teamId)),
      columns: { id: true },
    });
    if (!category) return { valid: false, error: 'Invalid category for this team.' };
  }

  if (contactId) {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)),
      columns: { id: true },
    });
    if (!contact) return { valid: false, error: 'Invalid contact for this team.' };
  }

  if (departmentId) {
    const department = await db.query.departments.findFirst({
      where: and(eq(departments.id, departmentId), eq(departments.teamId, teamId)),
      columns: { id: true },
    });
    if (!department) return { valid: false, error: 'Invalid department for this team.' };
  }

  if (assignedUserId) {
    const member = await db
      .select({ id: teamMembers.userId })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, assignedUserId)))
      .limit(1);

    if (member.length === 0) {
      return { valid: false, error: 'Invalid assigned user for this team.' };
    }
  }

  if (tagIds.length > 0) {
    const teamTags = await db
      .select({ id: messageDraftTags.id })
      .from(messageDraftTags)
      .where(and(eq(messageDraftTags.teamId, teamId), inArray(messageDraftTags.id, tagIds)));
    const teamTagIds = new Set(teamTags.map((tag) => tag.id));
    const invalidTag = tagIds.find((tagId) => !teamTagIds.has(tagId));
    if (invalidTag) return { valid: false, error: `Invalid tag (${invalidTag}) for this team.` };
  }

  return { valid: true };
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
    const advancedMode = Boolean(body?.advancedMode);
    const assignedUserId = advancedMode ? parseOptionalInt(body?.assignedUserId) : null;
    const departmentId = advancedMode ? parseOptionalInt(body?.departmentId) : null;
    const contactId = advancedMode ? parseOptionalInt(body?.contactId) : null;
    const isArchived = Boolean(body?.isArchived);

    const stages = advancedMode ? parseWorkflow(body?.stages) ?? { stages: [], tasks: [] } : null;

    const tagIds: number[] = Array.isArray(body?.tagIds)
      ? Array.from(
          new Set(
            body.tagIds
              .map((tagId: unknown) => Number(tagId))
              .filter((tagId: number) => Number.isInteger(tagId) && tagId > 0),
          ),
        )
      : [];
    const refsValidation = await validateDraftReferences({
      teamId: context.teamId,
      categoryId,
      contactId,
      assignedUserId,
      departmentId,
      tagIds,
    });
    if (!refsValidation.valid) {
      return NextResponse.json({ error: refsValidation.error }, { status: 400 });
    }

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

    const normalized = normalizeDraft(draft);
    if (!normalized) {
      return NextResponse.json({ error: 'Draft was updated but could not be loaded.' }, { status: 500 });
    }

    return NextResponse.json(normalized);
  } catch (error: any) {
    console.error('Error updating draft:', error?.message || error);

    if (error?.code === '23503') {
      return NextResponse.json({ error: 'Invalid related reference.' }, { status: 400 });
    }
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Duplicated draft tag relation.' }, { status: 409 });
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
