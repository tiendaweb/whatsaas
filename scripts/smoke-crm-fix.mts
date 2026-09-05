/**
 * Smoke de la corrección de CRM aplicable (doc 08 / crm_fix), CONTRA LA BASE.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-crm-fix.mts
 *
 * Elige un contacto que YA tenga etapa y cuyo `crm_to_fix` esté vacío, y le
 * propone moverlo a la etapa que ya tiene, escrita mal a propósito (mayúsculas y
 * sin acentos). Así se ejercita todo el camino —resolver nombres contra el
 * catálogo, armar el patch, `updateCrm`, borrar la propuesta— sin cambiarle el
 * CRM a nadie: el antes y el después tienen que ser idénticos.
 *
 * Los casos que NO tienen que escribir (nombres inexistentes, etiquetas que ya
 * están) se prueban primero, y se verifica que la propuesta siga en pie.
 */
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, teamCommercialAnalysis } from '@/lib/db/schema';
import { CrmError, applyCrmFix, getCrm } from '@/lib/plugins/sales-ops/server/crm';
import type { CrmFix } from '@/lib/plugins/sales-ops/shared/crm-fix';
import { describeCrmFix, normalizeCrmFix } from '@/lib/plugins/sales-ops/shared/crm-fix';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
const USER = Number(process.env.SMOKE_USER_ID ?? 1);
let ok = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' · ' + String(extra).slice(0, 150) : ''}`);
};

console.log('\n── normalizeCrmFix / describeCrmFix (sin base) ──');
check('una propuesta vacía no se guarda', normalizeCrmFix({ reason: 'nada' }) === null);
check('sólo motivo tampoco', normalizeCrmFix({}) === null);
const ejemplo = normalizeCrmFix({ stage: 'Ganado', add_tags: ['vip'], fields: { Rubro: null } });
check('una propuesta con contenido sí', ejemplo !== null, JSON.stringify(ejemplo));
check('se describe en castellano', describeCrmFix(ejemplo!).length === 3, describeCrmFix(ejemplo!).join(' / '));

const [fila] = await db
  .select({ chatId: teamCommercialAnalysis.chatId })
  .from(teamCommercialAnalysis)
  .innerJoin(contacts, eq(contacts.chatId, teamCommercialAnalysis.chatId))
  .where(and(
    eq(teamCommercialAnalysis.teamId, TEAM),
    isNull(teamCommercialAnalysis.crmToFix),
    isNotNull(contacts.funnelStageId),
    eq(contacts.teamId, TEAM),
  ))
  .limit(1);

if (!fila) {
  console.log('\nNo hay ningún contacto con etapa y sin crm_to_fix para probar. Fin.');
  process.exit(fail === 0 ? 0 : 1);
}

const chatId = fila.chatId;
const antes = await getCrm(TEAM, chatId);
const etapaActual = antes!.stages.find((s) => s.id === antes!.funnelStageId)!;
console.log(`\n── applyCrmFix sobre el chat ${chatId} (etapa "${etapaActual.name}", ${antes!.tagIds.length} etiquetas) ──`);

const poner = async (fix: CrmFix | null) => {
  await db.update(teamCommercialAnalysis).set({ crmFix: fix }).where(and(eq(teamCommercialAnalysis.teamId, TEAM), eq(teamCommercialAnalysis.chatId, chatId)));
};
const leerFix = async () => {
  const [r] = await db.select({ crmFix: teamCommercialAnalysis.crmFix }).from(teamCommercialAnalysis).where(and(eq(teamCommercialAnalysis.teamId, TEAM), eq(teamCommercialAnalysis.chatId, chatId))).limit(1);
  return r?.crmFix ?? null;
};

// 1. Sin propuesta: tiene que negarse.
await poner(null);
try {
  await applyCrmFix(TEAM, USER, chatId);
  check('sin propuesta se niega', false, 'no tiró');
} catch (e) {
  check('sin propuesta se niega', e instanceof CrmError, e instanceof Error ? e.message : String(e));
}

// 2. Nombres que no existen: no escribe y deja la propuesta en pie.
await poner({ stage: 'Etapa Que No Existe 9f2', addTags: ['etiqueta-inventada-9f2'], reason: 'prueba' });
try {
  await applyCrmFix(TEAM, USER, chatId);
  check('nombres inexistentes no escriben', false, 'no tiró');
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  check('nombres inexistentes no escriben', e instanceof CrmError && msg.includes('No existe'), msg);
}
check('la propuesta sigue en pie tras el rechazo', (await leerFix()) !== null);
const tras2 = await getCrm(TEAM, chatId);
check('el CRM no se movió', tras2!.funnelStageId === antes!.funnelStageId && tras2!.tagIds.length === antes!.tagIds.length);

// 3. La etapa que ya tiene, escrita mal: resuelve, aplica y no cambia nada.
const mal = etapaActual.name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
await poner({ stage: mal, reason: 'smoke' });
try {
  const r = await applyCrmFix(TEAM, USER, chatId);
  check('resuelve el nombre sin mayúsculas ni acentos', r.applied.some((x) => x.includes(etapaActual.name)), `${mal} → ${r.applied.join(' · ')}`);
} catch (e) {
  check('resuelve el nombre sin mayúsculas ni acentos', false, e instanceof Error ? e.message : String(e));
}

const despues = await getCrm(TEAM, chatId);
check('la etapa quedó igual que antes', despues!.funnelStageId === antes!.funnelStageId, `${antes!.funnelStageId} → ${despues!.funnelStageId}`);
check('las etiquetas quedaron igual', despues!.tagIds.slice().sort().join(',') === antes!.tagIds.slice().sort().join(','));
check('la propuesta se borró al aplicarla', (await leerFix()) === null);

// Deja la fila como estaba.
await poner(null);
console.log(`\n${fail === 0 ? '✓ TODO OK' : `✗ ${fail} fallas`} · ${ok} chequeos pasados\n`);
process.exit(fail === 0 ? 0 : 1);
