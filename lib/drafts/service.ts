import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  contacts,
  departments,
  messageDraftCategories,
  messageDraftTagLinks,
  messageDraftTags,
  messageDrafts,
  teamMembers,
  users,
} from '@/lib/db/schema';
import type { DraftWritePayload } from './payload';

/**
 * Escritura de borradores de mensaje, compartida entre `/api/drafts` y el
 * conector MCP. Las routes siguen siendo dueñas de la sesión, del bootstrap de
 * tablas (`ensureDraftStorage`) y del parseo del body (`parseDraftWritePayload`);
 * acá viven la validación de referencias y la transacción.
 */
export class DraftError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const draftRelations = {
  category: true,
  contact: { columns: { id: true, name: true } },
  assignedUser: { columns: { id: true, name: true, email: true } },
  department: { columns: { id: true, name: true } },
  tagLinks: { with: { tag: true } },
} as const;

export function normalizeDraft(draft: any) {
  if (!draft) return null;
  const tags = (draft.tagLinks ?? []).map((tagLink: any) => tagLink.tag);

  return {
    id: draft.id,
    teamId: draft.teamId,
    title: draft.title,
    content: draft.content,
    draftType: draft.draftType,
    aiMetadata: draft.aiMetadata ?? null,
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

export type NormalizedDraft = NonNullable<ReturnType<typeof normalizeDraft>>;

/** Todas las referencias tienen que ser del mismo equipo: un id ajeno es 400, no un FK error. */
export async function validateDraftReferences(params: {
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
    if (!category) throw new DraftError('Invalid category for this team.');
  }

  if (contactId) {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)),
      columns: { id: true },
    });
    if (!contact) throw new DraftError('Invalid contact for this team.');
  }

  if (departmentId) {
    const department = await db.query.departments.findFirst({
      where: and(eq(departments.id, departmentId), eq(departments.teamId, teamId)),
      columns: { id: true },
    });
    if (!department) throw new DraftError('Invalid department for this team.');
  }

  if (assignedUserId) {
    const member = await db
      .select({ id: teamMembers.userId })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, assignedUserId)))
      .limit(1);
    if (member.length === 0) throw new DraftError('Invalid assigned user for this team.');
  }

  if (tagIds.length > 0) {
    const teamTags = await db
      .select({ id: messageDraftTags.id })
      .from(messageDraftTags)
      .where(and(eq(messageDraftTags.teamId, teamId), inArray(messageDraftTags.id, tagIds)));
    const teamTagIds = new Set(teamTags.map((tag) => tag.id));
    const invalidTag = tagIds.find((tagId) => !teamTagIds.has(tagId));
    if (invalidTag) throw new DraftError(`Invalid tag (${invalidTag}) for this team.`);
  }
}

export async function getDraft(teamId: number, draftId: number) {
  const draft = await db.query.messageDrafts.findFirst({
    where: and(eq(messageDrafts.id, draftId), eq(messageDrafts.teamId, teamId)),
    with: draftRelations,
  });
  return normalizeDraft(draft);
}

export async function createDraft(teamId: number, userId: number, input: DraftWritePayload) {
  const { title, content, draftType, aiMetadata, categoryId, assignedUserId, departmentId, contactId, tagIds, stages } = input;
  await validateDraftReferences({ teamId, categoryId, contactId, assignedUserId, departmentId, tagIds });

  const createdDraftId = await db.transaction(async (tx) => {
    const [draft] = await tx
      .insert(messageDrafts)
      .values({
        teamId,
        title,
        content,
        draftType,
        aiMetadata,
        categoryId,
        assignedUserId,
        departmentId,
        contactId,
        stages,
        createdBy: userId,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .returning({ id: messageDrafts.id });

    if (tagIds.length > 0) {
      await tx.insert(messageDraftTagLinks).values(tagIds.map((tagId) => ({ draftId: draft.id, tagId })));
    }

    return draft.id;
  });

  const created = await getDraft(teamId, createdDraftId);
  if (!created) throw new DraftError('Draft was created but could not be loaded.', 500);
  return created;
}

/**
 * Reemplazo completo (semántica PUT): el payload ya viene entero y las etiquetas
 * se reescriben. `isArchived` se pasa aparte porque no forma parte del contrato
 * de `parseDraftWritePayload`.
 */
export async function updateDraft(
  teamId: number,
  userId: number,
  draftId: number,
  input: DraftWritePayload & { isArchived?: boolean },
) {
  const { title, content, draftType, aiMetadata, categoryId, assignedUserId, departmentId, contactId, tagIds, stages } = input;
  await validateDraftReferences({ teamId, categoryId, contactId, assignedUserId, departmentId, tagIds });

  const updated = await db.transaction(async (tx) => {
    const [draft] = await tx
      .update(messageDrafts)
      .set({
        title,
        content,
        draftType,
        aiMetadata,
        categoryId,
        assignedUserId,
        departmentId,
        contactId,
        stages,
        isArchived: Boolean(input.isArchived),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(messageDrafts.id, draftId), eq(messageDrafts.teamId, teamId)))
      .returning({ id: messageDrafts.id });

    if (!draft) return null;

    await tx.delete(messageDraftTagLinks).where(eq(messageDraftTagLinks.draftId, draft.id));
    if (tagIds.length > 0) {
      await tx.insert(messageDraftTagLinks).values(tagIds.map((tagId) => ({ draftId: draft.id, tagId })));
    }

    return draft.id;
  });

  if (!updated) throw new DraftError('Draft not found', 404);

  const draft = await getDraft(teamId, updated);
  if (!draft) throw new DraftError('Draft was updated but could not be loaded.', 500);
  return draft;
}

export async function deleteDraft(teamId: number, draftId: number) {
  const [deleted] = await db
    .delete(messageDrafts)
    .where(and(eq(messageDrafts.id, draftId), eq(messageDrafts.teamId, teamId)))
    .returning({ id: messageDrafts.id });

  if (!deleted) throw new DraftError('Draft not found', 404);
  return deleted;
}
