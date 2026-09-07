/**
 * Smoke de horas, ticket y las tres reglas del Protocolo Maestro, CONTRA LA BASE:
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/smoke-produccion-horas.mts
 *
 * Prueba lo que el plan `docs/produccion/02-PLAN-AAPP-BUSINESS.md` §1, §2 y §4
 * promete: el Evaluador del catálogo da lo mismo que la calculadora del HTML,
 * un pedido nace con ticket/rondas/estimado desde `catalogKey`, y lo VENDIDO
 * no avanza sin pago, sin handoff ni sin QA — mientras que un demo pasa por
 * todo eso sin pedir nada, porque es pre-venta.
 *
 * ESCRIBE: crea dos pedidos `[SMOKE] …` en el equipo 2 y los borra al final
 * (las sesiones se van por cascade). Si algo revienta a mitad, el `finally`
 * limpia igual. Nada real se toca.
 */
import { and, eq, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskItems } from '@/lib/db/schema';
import { createProductionOrder, loadProductionOs, updateProductionOrder } from '@/lib/plugins/tasks/server/production-os';
import { abrirSesion, cerrarSesion, registrarSesionManual, resumenHorasPorTarea } from '@/lib/plugins/tasks/server/work-sessions';
import { evaluarOportunidad, ticketEnUsd } from '@/lib/plugins/tasks/shared/catalogo';
import { HANDOFF_ITEMS, type Handoff } from '@/lib/plugins/tasks/shared/produccion';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
const USER = Number(process.env.SMOKE_USER_ID ?? 3);
const PREFIJO = '[SMOKE]';

let fallas = 0;
const check = (nombre: string, ok: boolean, detalle?: unknown) => {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle !== undefined ? ` → ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}` : ''}`);
  if (!ok) fallas += 1;
};
const cerca = (a: number | null | undefined, b: number, tol = 0.15) => a != null && Math.abs(a - b) <= tol;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** La transición tiene que fallar, y el motivo tiene que decir POR QUÉ (así lo lee una IA). */
async function debeFallar(nombre: string, fn: () => Promise<unknown>, contiene: RegExp) {
  try {
    await fn();
    check(nombre, false, 'no falló');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    check(nombre, contiene.test(msg), msg);
  }
}
async function debePasar(nombre: string, fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    check(nombre, true);
    return out;
  } catch (error) {
    check(nombre, false, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function limpiar() {
  await db.delete(teamTaskItems).where(and(eq(teamTaskItems.teamId, TEAM), like(teamTaskItems.title, `${PREFIJO}%`)));
}

async function pedido(taskId: number) {
  const { orders } = await loadProductionOs(TEAM);
  const order = orders.find((row) => row.id === taskId);
  if (!order) throw new Error(`el pedido ${taskId} no aparece en loadProductionOs`);
  return order;
}

try {
  await limpiar();

  // (a) El Evaluador del catálogo, tal cual la calculadora del HTML.
  const e1 = evaluarOportunidad(131, 3);
  check('evaluar(131 USD, 3 h) ≈ 43.7 US$/h → revisar', cerca(e1.usdPorHora, 43.67) && e1.nivel === 'revisar', e1);
  const e2 = evaluarOportunidad(200, 7);
  check('evaluar(200 USD, 7 h) → segundo plano por línea roja (>6 h y <250)', e2.nivel === 'segundo_plano' && /6 horas/.test(e2.motivo), e2);
  const e3 = evaluarOportunidad(300, 4);
  check('evaluar(300 USD, 4 h) → alta', e3.nivel === 'alta' && cerca(e3.usdPorHora, 75), e3);
  check('ticketEnUsd(4.000.000 ARS) ≈ 26.1', cerca(ticketEnUsd(4_000_000, 'ARS'), 26.14), ticketEnUsd(4_000_000, 'ARS'));
  check('sin horas no hay evaluación', evaluarOportunidad(131, null).nivel === null);

  // (b) Un pedido vendido nace con ticket, rondas y estimado desde el catálogo.
  const creado = await createProductionOrder(TEAM, USER, { title: `${PREFIJO} sitio vendido`, workKind: 'sitio_aapp', catalogKey: 'sitio_web', source: 'user' });
  const vendido = creado.task.id;
  let o = await pedido(vendido);
  check('nace con ticket 4.000.000 ARS desde catalogKey sitio_web', o.ticketAmount === 4_000_000 && o.ticketCurrency === 'ARS', { ticketAmount: o.ticketAmount, ticketCurrency: o.ticketCurrency });
  check('nace con 1 ronda incluida y 60 min estimados', o.revisionRoundsIncluded === 1 && o.estimatedMinutes === 60, { rondas: o.revisionRoundsIncluded, estimado: o.estimatedMinutes });
  check('trae ticketUsd ≈ 26.1 y evaluación sin horas', cerca(o.ticketUsd, 26.14) && o.evaluacion?.nivel === null, { ticketUsd: o.ticketUsd, evaluacion: o.evaluacion });

  // (c) Sin pago no hay posición en cola.
  await debeFallar('pedido → aceptado sin pago falla', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'aceptado' }, 'user'), /sin pago/i);
  await debePasar('pedido → aceptado con paymentState total pasa', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'aceptado', paymentState: 'total' }, 'user'));

  // (d) Sin handoff el trabajo no empieza.
  await debeFallar('aceptado → en_curso con handoff incompleto falla', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'en_curso' }, 'user'), /handoff/i);
  const handoff: Handoff = Object.fromEntries(HANDOFF_ITEMS.map((item, i) => [item.id, i % 2 ? 'ia' : 'ok'])) as Handoff;
  await debePasar('aceptado → en_curso con los 8 ítems ok/ia pasa', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'en_curso', handoff }, 'user'));

  // (e) Lo vendido pasa por QA.
  await debeFallar('en_curso → entregado sin QA falla', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'entregado', deliveryUrl: 'https://smoke.aapp.space/x' }, 'user'), /qa/i);
  await debePasar('en_curso → qa pasa', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'qa' }, 'user'));
  await debeFallar('qa → entregado sin enlace falla', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'entregado' }, 'user'), /enlace/i);
  await debePasar('qa → entregado con enlace pasa', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'entregado', deliveryUrl: 'https://smoke.aapp.space/x' }, 'user'));

  // (f) Las rondas se cuentan; la segunda es fuera de alcance.
  const r1 = (await debePasar('entregado → cambios (ronda 1)', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'cambios' }, 'user'))) as { revisionRoundsUsed?: number; fueraDeAlcance?: boolean } | null;
  check('ronda 1 de 1 incluida: used 1, fueraDeAlcance false', r1?.revisionRoundsUsed === 1 && r1?.fueraDeAlcance === false, r1 && { used: r1.revisionRoundsUsed, fuera: r1.fueraDeAlcance });
  await debePasar('cambios → entregado', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'entregado' }, 'user'));
  const r2 = (await debePasar('entregado → cambios (ronda 2)', () => updateProductionOrder(TEAM, USER, vendido, { workStatus: 'cambios' }, 'user'))) as { revisionRoundsUsed?: number; fueraDeAlcance?: boolean } | null;
  check('ronda 2 de 1 incluida: used 2, fueraDeAlcance true = extra a presupuesto', r2?.revisionRoundsUsed === 2 && r2?.fueraDeAlcance === true, r2 && { used: r2.revisionRoundsUsed, fuera: r2.fueraDeAlcance });

  // (g) Las horas viven en sesiones.
  await debePasar('abrirSesion', () => abrirSesion(TEAM, USER, vendido, 'foco', 'bloque'));
  await sleep(1200);
  await debePasar('cerrarSesion', () => cerrarSesion(TEAM, USER));
  await debePasar('registrarSesionManual 30 min', () => registrarSesionManual(TEAM, USER, vendido, 30, 'smoke'));
  const resumen = await resumenHorasPorTarea(TEAM, [vendido]);
  const horas = resumen.get(vendido);
  check('resumenHorasPorTarea ≥ 30 min de foco', (horas?.minutosFoco ?? 0) >= 30, horas);
  o = await pedido(vendido);
  check('el pedido trae horas ≥ 0.5 y evaluación con nivel', (o.horas ?? 0) >= 0.5 && o.evaluacion?.nivel != null, { horas: o.horas, evaluacion: o.evaluacion });

  // (h) Un demo no tiene ninguna de las tres reglas: es pre-venta.
  const demo = (await createProductionOrder(TEAM, USER, { title: `${PREFIJO} demo`, workKind: 'demo_sitio_aapp', source: 'user' })).task.id;
  await debePasar('demo: pedido → aceptado sin pago', () => updateProductionOrder(TEAM, USER, demo, { workStatus: 'aceptado' }, 'user'));
  await debePasar('demo: aceptado → en_curso sin handoff', () => updateProductionOrder(TEAM, USER, demo, { workStatus: 'en_curso' }, 'user'));
  await debePasar('demo: en_curso → entregado sin QA (con enlace)', () => updateProductionOrder(TEAM, USER, demo, { workStatus: 'entregado', deliveryUrl: 'https://smoke.aapp.space/demo' }, 'user'));
} catch (error) {
  console.error('✗ el smoke reventó:', error);
  fallas += 1;
} finally {
  await limpiar();
  const restos = await db.select({ id: teamTaskItems.id }).from(teamTaskItems).where(and(eq(teamTaskItems.teamId, TEAM), like(teamTaskItems.title, `${PREFIJO}%`)));
  check('limpieza: no quedan pedidos [SMOKE]', restos.length === 0);
}

console.log(fallas ? `\n${fallas} chequeo(s) fallaron` : '\nTodo en orden.');
process.exit(fallas ? 1 : 0);
