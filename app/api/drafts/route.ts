import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import {
  messageDrafts,
  messageDraftTagLinks,
} from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

function parseOptionalInt(value: string | null): number | null {
  if (!value || value === 'null' || value === 'undefined' || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseTagIds(searchParams: URLSearchParams): number[] {
  const fromMulti = searchParams
    .getAll('tagIds')
    .flatMap((value) => value.split(','))
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return Array.from(new Set(fromMulti));
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
      departmentId: parseOptionalInt(stage?.departmentId ? String(stage.departmentId) : null),
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

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json([], { status: 200 });

    const q = request.nextUrl.searchParams.get('q')?.trim();
    const categoryId = parseOptionalInt(request.nextUrl.searchParams.get('categoryId'));
    const assignedUserId = parseOptionalInt(request.nextUrl.searchParams.get('assignedUserId'));
    const departmentId = parseOptionalInt(request.nextUrl.searchParams.get('departmentId'));
    const contactId = parseOptionalInt(request.nextUrl.searchParams.get('contactId'));
    const tagIds = parseTagIds(request.nextUrl.searchParams);

    const conditions = [eq(messageDrafts.teamId, context.teamId), eq(messageDrafts.isArchived, false)];

    if (q) {
      conditions.push(
        or(ilike(messageDrafts.title, `%${q}%`), ilike(messageDrafts.content, `%${q}%`))!,
      );
    }
    if (categoryId) conditions.push(eq(messageDrafts.categoryId, categoryId));
    if (assignedUserId) conditions.push(eq(messageDrafts.assignedUserId, assignedUserId));
    if (departmentId) conditions.push(eq(messageDrafts.departmentId, departmentId));
    if (contactId) conditions.push(eq(messageDrafts.contactId, contactId));

    if (tagIds.length > 0) {
      const taggedDraftRows = await db
        .selectDistinct({ draftId: messageDraftTagLinks.draftId })
        .from(messageDraftTagLinks)
        .innerJoin(messageDrafts, eq(messageDraftTagLinks.draftId, messageDrafts.id))
        .where(
          and(
            eq(messageDrafts.teamId, context.teamId),
            inArray(messageDraftTagLinks.tagId, tagIds),
          ),
        );

      const draftIds = taggedDraftRows.map((row) => row.draftId);
      if (draftIds.length === 0) return NextResponse.json([]);
      conditions.push(inArray(messageDrafts.id, draftIds));
    }

    const teamDrafts = await db.query.messageDrafts.findMany({
      where: and(...conditions),
      orderBy: [desc(messageDrafts.updatedAt)],
      with: {
        category: true,
        contact: { columns: { id: true, name: true } },
        assignedUser: { columns: { id: true, name: true, email: true } },
        department: { columns: { id: true, name: true } },
        tagLinks: {
          with: {
            tag: true,
          },
        },
      },
    });

    return NextResponse.json(teamDrafts.map(normalizeDraft));
  } catch (error: any) {
    console.error('Error fetching drafts:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const title = String(body?.title ?? '').trim();
    const content = String(body?.content ?? '').trim();

    if (!title || !content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
    }

    const categoryId = parseOptionalInt(body?.categoryId ? String(body.categoryId) : null);
    const advancedMode = Boolean(body?.advancedMode);
    const assignedUserId = advancedMode ? parseOptionalInt(body?.assignedUserId ? String(body.assignedUserId) : null) : null;
    const departmentId = advancedMode ? parseOptionalInt(body?.departmentId ? String(body.departmentId) : null) : null;
    const contactId = advancedMode ? parseOptionalInt(body?.contactId ? String(body.contactId) : null) : null;
    const tagIds: number[] = Array.isArray(body?.tagIds)
      ? Array.from(
          new Set(
            body.tagIds
              .map((tagId: unknown) => Number(tagId))
              .filter((tagId: number) => Number.isInteger(tagId) && tagId > 0),
          ),
        )
      : [];

    const stages = advancedMode ? parseWorkflow(body?.stages) ?? { stages: [], tasks: [] } : null;

    const createdDraftId = await db.transaction(async (tx) => {
      const [draft] = await tx
        .insert(messageDrafts)
        .values({
          teamId: context.teamId,
          title,
          content,
          categoryId,
          assignedUserId,
          departmentId,
          contactId,
          stages,
          createdBy: context.userId,
          updatedBy: context.userId,
          updatedAt: new Date(),
        })
        .returning({ id: messageDrafts.id });

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

    const createdDraft = await db.query.messageDrafts.findFirst({
      where: and(eq(messageDrafts.id, createdDraftId), eq(messageDrafts.teamId, context.teamId)),
      with: {
        category: true,
        contact: { columns: { id: true, name: true } },
        assignedUser: { columns: { id: true, name: true, email: true } },
        department: { columns: { id: true, name: true } },
        tagLinks: { with: { tag: true } },
      },
    });

    return NextResponse.json(normalizeDraft(createdDraft), { status: 201 });
  } catch (error: any) {
    console.error('Error creating draft:', error?.message || error);

    if (error?.code === '23503') {
      return NextResponse.json({ error: 'Invalid related reference.' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
