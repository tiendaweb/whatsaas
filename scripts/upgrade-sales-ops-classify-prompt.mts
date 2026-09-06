/**
 * Sube `sales-ops.classify` del equipo al texto actual del código.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/upgrade-sales-ops-classify-prompt.mts [teamId]
 *
 * El prompt activo guardado en `team_prompts` pisa la constante; la v1 del
 * equipo 2 (2026-08-29) no tiene `crm_fix` en el contrato y el conector no lo
 * compensa. Idempotente: si la activa ya coincide con el default, no toca nada;
 * si no, crea la versión siguiente activa y retira la anterior (misma regla que
 * `upsertSkill`).
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPrompts } from '@/lib/db/schema';
import { SALES_OPS_CLASSIFY_PROMPT } from '@/lib/plugins/sales-ops/server/prompts';

const teamId = Number(process.argv[2] ?? 2);
const def = SALES_OPS_CLASSIFY_PROMPT;
const filas = await db.select().from(teamPrompts).where(and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, def.key)));
const activa = filas.find((f) => f.status === 'active');
if (activa && activa.systemPrompt === def.systemPrompt && activa.userTemplate === def.userTemplate) {
  console.log(`= ${def.key} v${activa.version} ya es el default`);
  process.exit(0);
}
const version = filas.reduce((m, f) => Math.max(m, f.version), 0) + 1;
await db.transaction(async (tx) => {
  await tx.update(teamPrompts).set({ status: 'retired', updatedAt: new Date() }).where(and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, def.key)));
  await tx.insert(teamPrompts).values({
    teamId,
    key: def.key,
    purpose: def.purpose,
    version,
    status: 'active',
    title: def.title,
    systemPrompt: def.systemPrompt,
    userTemplate: def.userTemplate,
    createdBy: activa?.createdBy ?? null,
  });
});
console.log(`^ ${def.key} v${version} creada (v${activa?.version ?? '?'} retirada) para el equipo ${teamId}`);
process.exit(0);
