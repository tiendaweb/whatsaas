import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { campaigns, campaignLeads, wabaTemplates } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { InstanceOwnershipError, assertTeamInstance } from '@/lib/instances/ownership';

export async function POST(request: Request) {
  try {
    const { error } = await checkRoutePermission('campaigns');
    if (error) return error;

    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, instanceId, scheduledAt, templateId, leads, createContacts } = await request.json();

    // La instancia y la plantilla venían del body sin comprobar de quién eran.
    // Como `process` después manda con el `metaToken` de esa instancia, un id
    // ajeno convertía la campaña en un envío masivo con las credenciales de
    // otro equipo.
    let ownedInstanceId: number;
    try {
      ownedInstanceId = (await assertTeamInstance(team.id, parseInt(instanceId))).id;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof InstanceOwnershipError ? error.message : 'Instancia inválida.' },
        { status: 400 },
      );
    }

    let ownedTemplateId: number | null = null;
    if (templateId) {
      const [template] = await db
        .select({ id: wabaTemplates.id })
        .from(wabaTemplates)
        .where(and(eq(wabaTemplates.id, parseInt(templateId)), eq(wabaTemplates.teamId, team.id)))
        .limit(1);
      if (!template) {
        return NextResponse.json({ error: 'La plantilla no existe o no es de este equipo.' }, { status: 400 });
      }
      ownedTemplateId = template.id;
    }

    const hasSchedule = scheduledAt ? true : false;
    const [newCampaign] = await db.insert(campaigns).values({
      teamId: team.id,
      instanceId: ownedInstanceId,
      name,
      scheduledAt: hasSchedule ? new Date(scheduledAt) : null,
      templateId: ownedTemplateId,
      status: hasSchedule ? 'SCHEDULED' : 'DRAFT',
      totalLeads: leads.length,
      createContacts: createContacts || false
    }).returning();

    if (leads && leads.length > 0) {
      const leadsData = leads.map((lead: any) => ({
        campaignId: newCampaign.id,
        phone: lead.phone,
        variables: lead.variables || {},
        status: 'PENDING'
      }));
      
      
      await db.insert(campaignLeads).values(leadsData);
    }

    return NextResponse.json(newCampaign);

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}