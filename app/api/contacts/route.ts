
import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { ActivityType, chats, contacts, contactTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logActivity } from '@/lib/db/activity';
import { enforceLimit } from '@/lib/limits';

export async function POST(request: NextRequest) {
  let safeContext: {
    teamId: number | null;
    chatId: number | null;
    assignedUserId: number | null;
    funnelStageId: number | null;
    tagIds: number[];
  } = {
    teamId: null,
    chatId: null,
    assignedUserId: null,
    funnelStageId: null,
    tagIds: []
  };

  try {
    const { error } = await checkRoutePermission('contacts');
    if (error) return error;

    const team = await getTeamForUser();
    const user = await getUser();
    if (!team || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    safeContext.teamId = team.id;
    try {
      await enforceLimit(team.id, 'contacts');
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 403 });
    }

    const body = await request.json();
    const {
      jid,
      name,
      assignedUserId,
      funnelStageId,
      notes,
      tagIds,
      customData
    } = body;

    const parsedAssignedUserId = assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== '' && assignedUserId !== 'null'
      ? Number(assignedUserId)
      : null;
    const parsedFunnelStageId = funnelStageId !== undefined && funnelStageId !== null && funnelStageId !== '' && funnelStageId !== 'null'
      ? Number(funnelStageId)
      : null;
    const parsedTagIds = Array.isArray(tagIds)
      ? tagIds.map((tagId: unknown) => Number(tagId)).filter((tagId: number) => Number.isInteger(tagId) && tagId > 0)
      : [];
    safeContext.assignedUserId = parsedAssignedUserId;
    safeContext.funnelStageId = parsedFunnelStageId;
    safeContext.tagIds = parsedTagIds;

    if (parsedAssignedUserId !== null && !Number.isInteger(parsedAssignedUserId)) {
      return NextResponse.json({ error: 'assignedUserId must be a valid integer' }, { status: 400 });
    }
    if (parsedFunnelStageId !== null && !Number.isInteger(parsedFunnelStageId)) {
      return NextResponse.json({ error: 'funnelStageId must be a valid integer' }, { status: 400 });
    }

    if (!jid || !name) {
      return NextResponse.json({ error: 'jid and name are required' }, { status: 400 });
    }

    
    const chat = await db.query.chats.findFirst({
        where: and(
            eq(chats.teamId, team.id),
            eq(chats.remoteJid, jid)
        ),
        columns: { id: true }
    });

    if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }
    safeContext.chatId = chat.id;

    
    let newContact: any;

    await db.transaction(async (tx) => {
        
        const [insertedContact] = await tx.insert(contacts)
            .values({
                teamId: team.id,
                chatId: chat.id,
                name: name,
                assignedUserId: parsedAssignedUserId,
                funnelStageId: parsedFunnelStageId,
                notes: notes || null,
                customData: customData || {},
                updatedAt: new Date()
            })
            .returning();
        
        newContact = insertedContact;
        await logActivity(team.id, user.id, ActivityType.CREATE_CONTACT);
        
        if (parsedTagIds.length > 0) {
            const tagsToInsert = parsedTagIds.map((tagId: number) => ({
                contactId: newContact.id,
                tagId: tagId,
            }));
            await tx.insert(contactTags).values(tagsToInsert);
        }
    });

    
    const finalContact = await db.query.contacts.findFirst({
        where: eq(contacts.id, newContact.id),
        with: {
            assignedUser: { columns: { id: true, name: true, email: true } },
            funnelStage: true,
            contactTags: { with: { tag: true } }
        }
    });

    const formattedContact = {
      ...finalContact,
      tags: finalContact?.contactTags.map(ct => ct.tag) || []
    };
    delete (formattedContact as any).contactTags;

    return NextResponse.json(formattedContact, { status: 201 });

  } catch (error: any) {
    const pgErrorCode = error?.code;
    const pgErrorDetail = error?.detail;
    const pgErrorMessage = error?.message;

    console.error('Error creating contact', {
      code: pgErrorCode,
      detail: pgErrorDetail,
      message: pgErrorMessage,
      context: safeContext
    });

    if (pgErrorCode === '23505') {
      return NextResponse.json({ error: 'This contact has already been saved' }, { status: 409 });
    }
    if (pgErrorCode === '23503') {
      return NextResponse.json({ error: 'Invalid related reference. Please verify assigned user, stage or tags.' }, { status: 400 });
    }
    if (pgErrorCode === '42703') {
      return NextResponse.json({ error: 'Internal configuration error. Please contact your administrator.' }, { status: 500 });
    }

    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
