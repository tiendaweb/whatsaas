/**
 * Mueve contactos a una etapa concreta, de a uno, por el mismo camino que la
 * ficha (`applyCrmFix` → `updateCrm`: valida que la etapa sea del equipo y
 * audita cada cambio). Los pares chat→etapa se pasan en MOVIMIENTOS.
 *
 * Para los contactos que NO tienen corrección escrita por la clasificación: el
 * destino se deriva del dato duro (el plan contratado, o el gate cuando el
 * contacto ni siquiera está en el embudo), no de una opinión.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/mover-etapas-manual.mts [--apply]
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, funnelStages } from '@/lib/db/schema';
import { applyCrmFix } from '@/lib/plugins/sales-ops/server/crm';

const TEAM_ID = Number(process.env.CRM_TEAM_ID ?? 2);
const USER_ID = Number(process.env.CRM_USER_ID ?? 3);
const APPLY = process.argv.includes('--apply');

/** chatId → etapa destino, con el motivo del que se derivó. */
const MOVIMIENTOS: Array<{ chatId: number; stage: string; motivo: string }> = [
  // Internos y personales: no son oportunidades comerciales.
  { chatId: 19811, stage: 'Equipo / Descartes', motivo: 'reseller del equipo (RESELLER ILIMITADO)' },
  { chatId: 74607, stage: 'Equipo / Descartes', motivo: 'reseller del equipo (Plan Reseller 30)' },
  { chatId: 198, stage: 'Equipo / Descartes', motivo: 'cuenta interna (Ejecutiva de Ventas, reseller)' },
  { chatId: 14920, stage: 'Equipo / Descartes', motivo: 'interno del equipo (4.579 mensajes, sin ciclo comercial)' },
  // Membresía anual vencida y sin rechazo explícito: recuperables, no perdidos.
  { chatId: 2008, stage: 'Renovación vencida', motivo: 'Tienda WhatsApp Basica anual vencida el 2026-08-19' },
  { chatId: 13645, stage: 'Renovación vencida', motivo: '2 Sitio+ Tienda anual vencida el 2026-05-03' },
  { chatId: 80220, stage: 'Renovación vencida', motivo: 'Tienda WhatsApp Basica anual vencida el 2026-08-22' },
  { chatId: 59450, stage: 'Renovación vencida', motivo: 'Tienda WhatsApp Basica anual vencida el 2026-07-09' },
  { chatId: 59410, stage: 'Renovación vencida', motivo: 'Tienda WhatsApp Basica anual vencida el 2026-07-07' },
  // Rechazó renovar: ciclo cerrado.
  { chatId: 59567, stage: 'Perdido / no califica', motivo: 'rechazó explícitamente la renovación' },
  // Marcados como clientes por error: nunca compraron.
  { chatId: 190, stage: 'No contesto', motivo: 'prospecto de marzo con cotización prometida y sin respuesta' },
  { chatId: 63820, stage: 'No contesto', motivo: 'prospecto de julio, 47 días de silencio, sin venta' },
  // Clientes activos de verdad.
  { chatId: 4010, stage: 'Campaña Contratada/Activa', motivo: 'Ads Meta + Ficha de Google contratados (radar 23/08)' },
  { chatId: 40884, stage: 'Combo Full', motivo: 'Apapachar: sitio + tienda + ads activos' },
];

async function main() {
  const etapas = await db.select({ id: funnelStages.id, name: funnelStages.name }).from(funnelStages).where(eq(funnelStages.teamId, TEAM_ID));
  const porId = new Map(etapas.map((e) => [e.id, e.name]));
  const filas = await db
    .select({ chatId: contacts.chatId, name: contacts.name, stageId: contacts.funnelStageId })
    .from(contacts)
    .where(and(eq(contacts.teamId, TEAM_ID), inArray(contacts.chatId, MOVIMIENTOS.map((m) => m.chatId))));
  const actual = new Map(filas.map((f) => [f.chatId, f]));

  console.log('contact,antes,despues,motivo');
  for (const m of MOVIMIENTOS) {
    const c = actual.get(m.chatId);
    console.log(`${c?.name ?? `chat ${m.chatId}`},${porId.get(c?.stageId ?? -1) ?? '(sin etapa)'},${m.stage},${m.motivo}`);
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN. ${MOVIMIENTOS.length} movimientos, nada escrito.`);
    process.exit(0);
  }

  let ok = 0;
  for (const m of MOVIMIENTOS) {
    try {
      await applyCrmFix(TEAM_ID, USER_ID, m.chatId, { fix: { stage: m.stage, reason: m.motivo } });
      ok += 1;
    } catch (error) {
      console.log(`FALLÓ chat ${m.chatId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\nMovidos: ${ok}/${MOVIMIENTOS.length}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
