/**
 * Mueve a cada contacto a la etapa que le corresponde.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/mover-etapas-crm.mts          # dry-run
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/mover-etapas-crm.mts --apply  # escribe
 *
 * Escribe SIEMPRE por `applyCrmFix`, de a un contacto, que es el mismo camino
 * que el botón de la ficha: misma validación de pertenencia al equipo, misma
 * auditoría. No hay UPDATE masivo acá y es a propósito — si una fila falla, las
 * demás siguen y queda dicho cuál falló.
 *
 * Sólo toca la ETAPA. Pasa un `fix` propio con nada más que `stage`, así la
 * corrección guardada por la clasificación (etiquetas y campos) NO se borra y
 * queda para revisarse aparte.
 *
 * Antes de escribir deja el snapshot de la etapa actual de cada contacto en
 * `docs/conectores/etapas-antes-<fecha>.csv`: revertir es cargar ese CSV.
 */
import { writeFileSync } from 'node:fs';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, funnelStages, teamCommercialAnalysis } from '@/lib/db/schema';
import { applyCrmFix } from '@/lib/plugins/sales-ops/server/crm';

const TEAM_ID = Number(process.env.CRM_TEAM_ID ?? 2);
const USER_ID = Number(process.env.CRM_USER_ID ?? 3); // Noelia, owner
const APPLY = process.argv.includes('--apply');

async function main() {
  const etapas = await db
    .select({ id: funnelStages.id, name: funnelStages.name })
    .from(funnelStages)
    .where(eq(funnelStages.teamId, TEAM_ID));
  const nombrePorId = new Map(etapas.map((e) => [e.id, e.name]));

  const filas = await db
    .select({
      chatId: teamCommercialAnalysis.chatId,
      fix: teamCommercialAnalysis.crmFix,
      contactId: contacts.id,
      nombre: contacts.name,
      etapaActual: contacts.funnelStageId,
    })
    .from(teamCommercialAnalysis)
    .innerJoin(contacts, and(eq(contacts.teamId, TEAM_ID), eq(contacts.chatId, teamCommercialAnalysis.chatId)))
    .where(and(eq(teamCommercialAnalysis.teamId, TEAM_ID), isNotNull(teamCommercialAnalysis.crmFix)));

  const pendientes = filas
    .map((f) => ({ ...f, destino: (f.fix as { stage?: string | null } | null)?.stage ?? null }))
    .filter((f) => typeof f.destino === 'string' && f.destino.trim() !== '')
    .filter((f) => nombrePorId.get(f.etapaActual ?? -1)?.trim().toLowerCase() !== f.destino!.trim().toLowerCase());

  console.log(`${pendientes.length} contactos con etapa propuesta distinta de la actual (equipo ${TEAM_ID}).\n`);

  const fecha = new Date().toISOString().slice(0, 10);
  const csv = ['contact_id,chat_id,nombre,etapa_antes,etapa_despues']
    .concat(pendientes.map((p) => [
      p.contactId,
      p.chatId,
      `"${(p.nombre ?? '').replace(/"/g, "'")}"`,
      `"${nombrePorId.get(p.etapaActual ?? -1) ?? ''}"`,
      `"${p.destino}"`,
    ].join(',')))
    .join('\n');
  const ruta = `docs/conectores/etapas-antes-${fecha}.csv`;
  writeFileSync(ruta, `${csv}\n`);
  console.log(`Snapshot para revertir: ${ruta}\n`);

  if (!APPLY) {
    for (const p of pendientes.slice(0, 15)) {
      console.log(`  ${p.nombre}: ${nombrePorId.get(p.etapaActual ?? -1) ?? '(sin etapa)'} → ${p.destino}`);
    }
    console.log(`\nDRY-RUN. Nada escrito. Correr con --apply para mover los ${pendientes.length}.`);
    process.exit(0);
  }

  let ok = 0;
  const fallos: string[] = [];
  for (const p of pendientes) {
    try {
      await applyCrmFix(TEAM_ID, USER_ID, p.chatId, { fix: { stage: p.destino! } });
      ok += 1;
    } catch (error) {
      fallos.push(`chat ${p.chatId} (${p.nombre}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`Movidos: ${ok}/${pendientes.length}`);
  if (fallos.length) {
    console.log(`\nFallaron ${fallos.length}:`);
    for (const f of fallos) console.log(`  ${f}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
