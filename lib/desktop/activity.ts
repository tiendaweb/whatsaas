import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, users } from '@/lib/db/schema';

export type ActivityItem = {
  id: string;
  kind: string;
  title: string;
  description: string;
  at: string | null;
  /** Índice de la serie de color, para no hardcodear hex en el componente. */
  tone: 'success' | 'info' | 'warning' | 'neutral';
};

/**
 * Traduce acciones crudas de `activity_logs` a algo legible. Lo que no está en
 * el mapa se muestra con su acción tal cual en vez de descartarse: un timeline
 * que oculta lo que no entiende es peor que uno que dice "DEAL_X".
 */
const LABELS: Record<string, { title: string; tone: ActivityItem['tone'] }> = {
  DEAL_CREATED: { title: 'Oportunidad creada', tone: 'info' },
  DEAL_CREATED_FROM_CONTACT: { title: 'Oportunidad creada desde un contacto', tone: 'info' },
  DEAL_UPDATED: { title: 'Oportunidad actualizada', tone: 'neutral' },
  DEAL_STAGE_CHANGED: { title: 'Cambio de etapa', tone: 'info' },
  DEAL_WON: { title: 'Oportunidad ganada', tone: 'success' },
  DEAL_LOST: { title: 'Oportunidad perdida', tone: 'warning' },
  DEAL_DELETED: { title: 'Oportunidad eliminada', tone: 'warning' },
  CUSTOMER_CREATED_FROM_CONTACT: { title: 'Cliente nuevo', tone: 'success' },
  CUSTOMER_LINKED_TO_CONTACT: { title: 'Contacto vinculado a un cliente', tone: 'neutral' },
};

function describe(action: string, metadata: Record<string, unknown>, actor: string | null): string {
  const parts: string[] = [];
  if (action === 'DEAL_STAGE_CHANGED' && metadata.from && metadata.to) {
    parts.push(`${String(metadata.from)} → ${String(metadata.to)}`);
  }
  if (typeof metadata.dealId === 'number') parts.push(`Oportunidad #${metadata.dealId}`);
  if (typeof metadata.customerId === 'number' && !parts.length) {
    parts.push(`Cliente #${metadata.customerId}`);
  }
  if (actor) parts.push(actor);
  return parts.join(' · ');
}

export async function listActivity(teamId: number, limit = 5): Promise<ActivityItem[]> {
  const rows = await db
    .select({ log: activityLogs, actor: users.name })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.teamId, teamId))
    .orderBy(desc(activityLogs.timestamp))
    .limit(Math.min(limit, 50));

  return rows.map((row) => {
    const label = LABELS[row.log.action];
    const metadata = (row.log.metadata ?? {}) as Record<string, unknown>;
    return {
      id: String(row.log.id),
      kind: row.log.action,
      title: label?.title ?? row.log.action,
      description: describe(row.log.action, metadata, row.actor),
      at: row.log.timestamp ? new Date(row.log.timestamp).toISOString() : null,
      tone: label?.tone ?? 'neutral',
    };
  });
}
