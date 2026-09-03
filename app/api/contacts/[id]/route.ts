import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { contacts, contactTags, teamCustomerContacts, teamCustomers } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await checkRoutePermission('contacts');
    if (error) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const contactId = parseInt(id, 10);
    if (Number.isNaN(contactId)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.teamId, team.id)),
      with: {
        assignedUser: { columns: { id: true, name: true, email: true } },
        assignedDepartment: { columns: { id: true, name: true } },
        funnelStage: true,
        chat: {
          columns: { remoteJid: true, profilePicUrl: true, instanceId: true },
          with: { instance: { columns: { id: true, instanceName: true } } },
        },
        contactTags: { with: { tag: true } },
      },
    });

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    const [customerLink] = await db
      .select({ customerId: teamCustomerContacts.customerId })
      .from(teamCustomerContacts)
      .where(and(
        eq(teamCustomerContacts.teamId, team.id),
        eq(teamCustomerContacts.contactId, contactId),
      ))
      .orderBy(desc(teamCustomerContacts.createdAt))
      .limit(1);
    const phoneDigits = contact.chat?.remoteJid?.split('@')[0].replace(/\D/g, '') ?? '';
    const [customerByPhone] = !customerLink && phoneDigits
      ? await db
          .select({ customerId: teamCustomers.id })
          .from(teamCustomers)
          .where(and(
            eq(teamCustomers.teamId, team.id),
            sql`regexp_replace(coalesce(${teamCustomers.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`,
          ))
          .orderBy(desc(teamCustomers.updatedAt))
          .limit(1)
      : [];

    return NextResponse.json({
      ...contact,
      tags: contact.contactTags?.map((ct) => ct.tag) ?? [],
      profilePicUrl: contact.chat?.profilePicUrl ?? null,
      phone: contact.chat?.remoteJid ? contact.chat.remoteJid.split('@')[0] : null,
      remoteJid: contact.chat?.remoteJid ?? null,
      instanceId: contact.chat?.instanceId ?? null,
      instanceName: contact.chat?.instance?.instanceName ?? null,
      customerId: customerLink?.customerId ?? customerByPhone?.customerId ?? null,
    });
  } catch (err: unknown) {
    console.error('Error fetching contact:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const contactId = parseInt(id);
    const body = await request.json();
    
    const {
      name,
      notes,
      assignedUserId,
      assignedDepartmentId,
      funnelStageId,
      tagIds,
      showTimeInStage,
      customData
    } = body;

    await db.transaction(async (tx) => {
        const updateData: any = { updatedAt: new Date() };
        
        if (name !== undefined) updateData.name = name;
        if (notes !== undefined) updateData.notes = notes;
        if (assignedUserId !== undefined) updateData.assignedUserId = assignedUserId ? parseInt(assignedUserId) : null;
        if (assignedDepartmentId !== undefined) updateData.assignedDepartmentId = assignedDepartmentId ? parseInt(assignedDepartmentId) : null;
        if (funnelStageId !== undefined) updateData.funnelStageId = funnelStageId ? parseInt(funnelStageId) : null;
        if (showTimeInStage !== undefined) updateData.showTimeInStage = showTimeInStage; 
        
        if (customData !== undefined) updateData.customData = customData;

        await tx.update(contacts)
            .set(updateData)
            .where(and(eq(contacts.id, contactId), eq(contacts.teamId, team.id)));

        if (tagIds) {
            await tx.delete(contactTags).where(eq(contactTags.contactId, contactId));
            if (tagIds.length > 0) {
                const newTags = tagIds.map((tId: number) => ({
                    contactId,
                    tagId: tId
                }));
                await tx.insert(contactTags).values(newTags);
            }
        }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Error updating contact:", error);
    return NextResponse.json({ error: 'Error updating contact' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
      const team = await getTeamForUser();
      if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const { id } = await params;
      const contactId = parseInt(id);
      const deleted = await db.delete(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.teamId, team.id)))
        .returning();
      if (!deleted.length) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      return NextResponse.json({ success: true });
    } catch (error: any) {
      return NextResponse.json({ error: 'Error deleting contact' }, { status: 500 });
    }
}
