import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamCommercialAnalysis } from '@/lib/db/schema';
import { OWNERS, type Owner } from '../shared/taxonomy';
import { getSalesOpsSettings, patchSalesOpsSettings } from './settings';

/**
 * Acciones rápidas sobre un lead desde una lista: posponer o transferir.
 *
 * Posponer no cambia el análisis: lo saca de las listas hasta una fecha (y
 * vuelve solo). Transferir cambia el responsable recomendado, que es lo que
 * usa el filtro "Responsable" del menú: es la forma de mandarle el lead a
 * otra persona sin tocar etapa ni estado.
 */
async function audit(teamId: number, userId: number, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/lead] audit', error);
  }
}

export async function snoozeLead(teamId: number, userId: number, chatId: number, until: Date, note?: string) {
  const ahora = new Date().toISOString();
  const vigentes = (await getSalesOpsSettings(teamId)).leadSnoozes.filter((x) => x.until > ahora && x.chatId !== chatId);
  const next = [...vigentes, { chatId, until: until.toISOString(), note: note?.slice(0, 200), at: ahora }].slice(-1000);
  await patchSalesOpsSettings(teamId, userId, { leadSnoozes: next });
  await audit(teamId, userId, 'SALES_OPS_LEAD_SNOOZED', { chatId, until: until.toISOString(), note: note ?? null });
  return { chatId, until: until.toISOString() };
}

export async function unsnoozeLead(teamId: number, userId: number, chatId: number) {
  const vigentes = (await getSalesOpsSettings(teamId)).leadSnoozes.filter((x) => x.chatId !== chatId);
  await patchSalesOpsSettings(teamId, userId, { leadSnoozes: vigentes });
  await audit(teamId, userId, 'SALES_OPS_LEAD_UNSNOOZED', { chatId });
  return { chatId };
}

export async function transferLead(teamId: number, userId: number, chatId: number, owner: Owner) {
  if (!OWNERS.includes(owner)) throw new Error('Responsable desconocido.');
  const [row] = await db
    .update(teamCommercialAnalysis)
    .set({ recommendedOwner: owner, updatedAt: new Date() })
    .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)))
    .returning({ chatId: teamCommercialAnalysis.chatId, owner: teamCommercialAnalysis.recommendedOwner });
  if (!row) throw new Error('El chat no tiene análisis todavía: clasificalo primero.');
  await audit(teamId, userId, 'SALES_OPS_LEAD_TRANSFERRED', { chatId, owner });
  return { chatId, owner };
}
