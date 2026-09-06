/**
 * Smoke de las partes SIN IA del motor de "Ejecutar ahora" (2026-09-05), contra la base.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-focus-directo.mts
 *
 * No escribe nada y no gasta cuota. Prueba lo que `smoke-focus-ia.mts` no
 * puede cuando Gemini está sin cuota: que la fecha de "programar" se valide
 * bien y que una corrección de CRM se resuelva contra el catálogo del equipo
 * (nombres que existen se normalizan; los inventados se saltean sin romper).
 */
import { listAnalyses } from '@/lib/plugins/sales-ops/server/queries';
import { cuandoValido, validarFix } from '@/lib/plugins/sales-ops/server/focus';
import { computeNextRunAt } from '@/lib/plugins/scheduled-messages/schedule';
import { aLocal, desdeZona, fechaEnZona, parsearLocal, sumarDias } from '@/lib/time/zona';
import { getCrm } from '@/lib/plugins/sales-ops/server/crm';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
let ok = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' · ' + extra.replace(/\s+/g, ' ').slice(0, 160) : ''}`);
};

console.log('\n── cuandoValido (hora del negocio) ──');
const manana = sumarDias(fechaEnZona(), 1);
check('mañana a las 10 pasa tal cual', cuandoValido(`${manana}T10:00`)?.when === `${manana}T10:00` && cuandoValido(`${manana}T10:00`)?.ajustado === false);
check('con espacio en vez de T también', cuandoValido(`${manana} 16:30`)?.when === `${manana}T16:30`);
const pasada = cuandoValido('2020-01-01T10:00');
check('una fecha pasada se corre a un horario futuro y avisa', !!pasada && pasada.ajustado && !!pasada.aviso && parsearLocal(pasada.when)!.getTime() > Date.now(), pasada?.when ?? '');
const pasadaNoche = cuandoValido('2020-01-01T23:00');
check('fuera del horario laboral cae a mañana a las 10', pasadaNoche?.when === `${manana}T10:00`, pasadaNoche?.when ?? '');
check('basura se rechaza', cuandoValido('mañana a las 10') === null && cuandoValido(null) === null);

console.log('\n── zona horaria (servidor en UTC, negocio en Argentina) ──');
const diez = desdeZona('2026-09-07', 10, 0);
check('las 10 de Argentina son las 13 UTC', diez.toISOString() === '2026-09-07T13:00:00.000Z', diez.toISOString());
check('aLocal deshace desdeZona', aLocal(diez) === '2026-09-07T10:00', aLocal(diez));
const diario = computeNextRunAt({ scheduleType: 'daily', hour: 10, minute: 0 }, { now: new Date('2026-09-07T12:00:00.000Z') });
check('un diario a las 10 sale a las 13 UTC del mismo día si todavía no pasó', diario?.toISOString() === '2026-09-07T13:00:00.000Z', diario?.toISOString() ?? '');
const diarioPasado = computeNextRunAt({ scheduleType: 'daily', hour: 10, minute: 0 }, { now: new Date('2026-09-07T14:00:00.000Z') });
check('…y al día siguiente si ya pasó', diarioPasado?.toISOString() === '2026-09-08T13:00:00.000Z', diarioPasado?.toISOString() ?? '');
// 2026-09-07 es lunes: un semanal de miércoles (3) a las 9 → 2026-09-09 12:00 UTC.
const semanal = computeNextRunAt({ scheduleType: 'weekly', hour: 9, minute: 0, weekdays: [3] }, { now: new Date('2026-09-07T12:00:00.000Z') });
check('un semanal de miércoles a las 9 cae el miércoles a las 12 UTC', semanal?.toISOString() === '2026-09-09T12:00:00.000Z', semanal?.toISOString() ?? '');
check('after run, un "once" no tiene próxima', computeNextRunAt({ scheduleType: 'once', scheduledAt: new Date() }, { afterRun: true }) === null);

console.log(`\n── validarFix (equipo ${TEAM}) ──`);
const lista = await listAnalyses(TEAM, { vista: 'todos', sort: 'priority', limit: 20 });
let chatId: number | null = null;
let crm: Awaited<ReturnType<typeof getCrm>> = null;
for (const fila of lista.rows) {
  const c = await getCrm(TEAM, fila.chatId);
  if (c?.contactId) { chatId = fila.chatId; crm = c; break; }
}
if (!chatId || !crm) {
  console.log('No hay contactos con ficha para probar.');
} else {
  const etapa = crm.stages[0]?.name ?? null;
  const etiqueta = crm.allTags[0]?.name ?? null;
  const r = await validarFix(TEAM, chatId, {
    stage: etapa ? etapa.toUpperCase() : undefined,
    addTags: [...(etiqueta ? [etiqueta.toLowerCase()] : []), 'EtiquetaQueNoExiste_zz'],
    fields: { CampoQueNoExiste_zz: 'x' },
    reason: 'smoke',
  });
  check('resuelve sin error', !('error' in r), 'error' in r ? r.error : '');
  if (!('error' in r)) {
    if (etapa) check('la etapa vuelve con el nombre exacto del catálogo', r.fix.stage === etapa, `${r.fix.stage}`);
    if (etiqueta) check('la etiqueta vuelve con el nombre exacto del catálogo', r.fix.addTags?.[0] === etiqueta, `${r.fix.addTags?.join(',')}`);
    check('lo inventado queda en skipped y no en el fix', r.skipped.length === 2 && !(r.fix.addTags ?? []).includes('EtiquetaQueNoExiste_zz') && !r.fix.fields, r.skipped.join(' | '));
  }
  const nada = await validarFix(TEAM, chatId, { addTags: ['EtiquetaQueNoExiste_zz'] });
  check('una corrección que no toca nada existente devuelve error', 'error' in nada, 'error' in nada ? nada.error : '');
}

console.log(`\n${fail === 0 ? '✓ TODO OK' : `✗ ${fail} fallas`} · ${ok} chequeos pasados\n`);
process.exit(fail === 0 ? 0 : 1);
