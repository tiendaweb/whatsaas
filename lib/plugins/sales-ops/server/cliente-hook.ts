import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, teamCommercialAnalysis, teamPlugins } from '@/lib/db/schema';
import { SALES_OPS_PLUGIN_ID } from '../shared/taxonomy';
import { classifyChat } from './classifier';
import { isExcludedChat } from './dossier';

/**
 * Lo que el motor comercial hace cuando un contacto pasa a estar vinculado a
 * un cliente (desde Clientes, desde el bot, desde un conector o porque
 * `vincularSiCoincide` lo aplicó solo).
 *
 * Antes vincular no cambiaba nada: la huella del análisis no miraba el vínculo
 * y el chat seguía en la cola como lead hasta que alguien lo reclasificaba a
 * mano. Acá se marca el análisis como viejo y, si no era G11, se reclasifica
 * por reglas (R1 fuerte fuerza G11 → `cliente`): sin IA, porque para un
 * cliente ya vinculado la IA no aporta nada que las reglas no sepan.
 *
 * `lib/customers` lo importa dinámicamente: si el plugin no está habilitado
 * para el equipo, no se hace nada.
 */
export async function marcarAnalisisPorVinculo(
  teamId: number,
  contactId: number,
): Promise<{ chatId: number | null; marcado: boolean; reclasificado: boolean }> {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, teamId), eq(contacts.id, contactId)),
    columns: { chatId: true },
  });
  const chatId = contact?.chatId ?? null;
  if (chatId == null || isExcludedChat(teamId, chatId)) return { chatId, marcado: false, reclasificado: false };

  const [habilitado] = await db
    .select({ id: teamPlugins.id })
    .from(teamPlugins)
    .where(and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, SALES_OPS_PLUGIN_ID), eq(teamPlugins.enabled, true)))
    .limit(1);
  if (!habilitado) return { chatId, marcado: false, reclasificado: false };

  const existente = await db.query.teamCommercialAnalysis.findFirst({
    where: and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)),
    columns: { id: true, currentGate: true },
  });
  let marcado = false;
  if (existente) {
    await db
      .update(teamCommercialAnalysis)
      .set({ stale: true, updatedAt: new Date() })
      .where(eq(teamCommercialAnalysis.id, existente.id));
    marcado = true;
  }

  let reclasificado = false;
  if (!existente || existente.currentGate !== 'G11') {
    try {
      await classifyChat(teamId, chatId, { engine: 'rules', reason: 'chat_changed' });
      reclasificado = true;
    } catch (error) {
      // Un chat de grupo o excluido no tiene expediente: el vínculo vale igual.
      console.error('[sales-ops/cliente-hook] reclasificar por vínculo falló', error);
    }
  }
  return { chatId, marcado, reclasificado };
}
