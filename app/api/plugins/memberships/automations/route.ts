import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { automations } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Lista las automatizaciones del equipo (tabla `automations`) para elegirlas en
// las reglas de recordatorio. Se usa el id real que consume triggerAutomationManually.
export async function GET() {
  const ctx = await getPluginRequestContext('membershipsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const rows = await db
    .select({
      id: automations.id,
      name: automations.name,
      instanceId: automations.instanceId,
      isActive: automations.isActive,
    })
    .from(automations)
    .where(eq(automations.teamId, ctx.team.id))
    .orderBy(asc(automations.name));

  return NextResponse.json(rows);
}
