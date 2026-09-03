/**
 * Prueba de humo de las tools nuevas del conector CONTRA LA BASE.
 *
 * `tsc --noEmit` y `verify-connector-tools.mts` no ven la clase de error que más
 * duele acá: un `Date` dentro de un `FILTER`, un `GROUP BY` con parámetro, una
 * columna que no existe. Todo eso compila y explota recién en runtime, con la
 * pantalla caída y sin logs. Este script las ejecuta de verdad.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-connector-tools.mts
 *
 * No escribe nada: lo único que toca son lecturas y los modos dry_run.
 */
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { buildPermissionContext } from '@/lib/auth/permissions-guard';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { chatVisibilityCondition, resourceAccessDenial } from '@/lib/readonly-api/actor-guard';
import { policiedResourceKeys } from '@/lib/readonly-api/resource-policies';
import { listReadOnlyResource, readOnlyResourceMap, readOnlyResources } from '@/lib/readonly-api/catalog';
import { executeOperationsTool } from '@/lib/plugins/grok-connector/server/operations-actions';
import { executeTasksTool } from '@/lib/plugins/grok-connector/server/tasks-actions';

const TEAM = 2;
const [member] = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, TEAM)).limit(1);
const ctx = { teamId: TEAM, userId: member!.userId };
const perm = (await buildPermissionContext(TEAM, member!.userId))!;
const active = new Set((await resolveActivePluginsForTeam(TEAM, member!.userId)).map((p) => p.pluginId));
console.log(`rol=${perm.role} chatVisibility=${perm.chatVisibility} plugins activos=${active.size}\n`);

// 1. Las secciones de oportunidades traen datos o dicen por qué no.
const fq: any = await executeOperationsTool('whatspro_crm_followup_queue', { limit: 2 }, ctx);
console.log(`followup: chats=${fq.count} oportunidades_estancadas=${fq.stalled_deals_count} skipped=${fq.stalled_deals_skipped ?? 'no'}`);
const fs: any = await executeTasksTool('whatspro_crm_funnel_snapshot', {}, ctx);
console.log(`embudo: etapas=${fs.stages.length} deals_by_stage=${JSON.stringify(fs.deals_by_stage)} skipped=${fs.deals_skipped ?? 'no'}\n`);

// 2. El guard: ningún recurso mapeado puede quedar denegado para un owner.
let denied = 0;
for (const key of readOnlyResources.map((r) => r.key)) {
  const d = resourceAccessDenial(perm, key, active);
  if (d) { denied++; if (denied <= 6) console.log(`  denegado a ${perm.role}: ${key} → ${d}`); }
}
console.log(`recursos del catalogo=${readOnlyResources.length} con politica=${policiedResourceKeys().length} denegados para ${perm.role}=${denied}`);


// 3. La condición de visibilidad no rompe la consulta real.
for (const key of ['chats', 'messages', 'contacts', 'financial-entries']) {
  const resource = readOnlyResourceMap.get(key)!;
  const cond = await chatVisibilityCondition(perm, resource);
  const rows: any = await listReadOnlyResource(resource, TEAM, new URLSearchParams({ per_page: '2' }), cond ? [cond] : []);
  console.log(`  ${key}: filas=${rows.data.length} condicion_visibilidad=${cond ? 'sí' : 'no (ve todo)'}`);
}

// 4. Simulación de un agente con visibilidad restringida: la consulta tiene que correr igual.
const fake = { ...perm, role: 'agent', chatVisibility: 'assigned' as const };
for (const key of ['chats', 'messages', 'contacts']) {
  const resource = readOnlyResourceMap.get(key)!;
  const cond = await chatVisibilityCondition(fake, resource);
  const rows: any = await listReadOnlyResource(resource, TEAM, new URLSearchParams({ per_page: '2' }), cond ? [cond] : []);
  console.log(`  [agente/assigned] ${key}: filas=${rows.data.length} condicion=${cond ? 'sí' : 'NO'}`);
}
process.exit(0);
