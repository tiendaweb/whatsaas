/**
 * Smoke del Focus del Command Center (doc 08), CONTRA LA BASE.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-focus.mts
 *
 * No escribe nada. Lo que se prueba es lo que el typecheck NO ve: los dos
 * órdenes nuevos son SQL crudo y un error ahí pasa el build y explota en
 * runtime.
 */
import { listAnalyses } from '@/lib/plugins/sales-ops/server/queries';
import type { ListQuery } from '@/lib/plugins/sales-ops/shared/api-types';
import { gateRank } from '@/lib/plugins/sales-ops/shared/taxonomy';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
let ok = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' · ' + extra : ''}`);
};

console.log(`\n── Órdenes nuevos de la cola (equipo ${TEAM}) ──`);

for (const sort of ['priority', 'age', 'oldest', 'gate', 'lastFollowup'] as const) {
  try {
    const r = await listAnalyses(TEAM, { vista: 'todos', sort, limit: 20 });
    check(`sort=${sort} corre`, true, `${r.rows.length} filas de ${r.total}`);
    if (sort === 'gate' && r.rows.length > 1) {
      const rangos = r.rows.map((x) => gateRank(x.currentGate));
      check('sort=gate viene de mayor a menor', rangos.every((v, i) => i === 0 || rangos[i - 1] >= v), rangos.join(' '));
    }
    if (sort === 'oldest' && r.rows.length > 1) {
      const fechas = r.rows.map((x) => (x.lastCustomerMessageAt ? Date.parse(x.lastCustomerMessageAt) : Number.POSITIVE_INFINITY));
      check('sort=oldest viene del más viejo al más nuevo', fechas.every((v, i) => i === 0 || fechas[i - 1] <= v));
    }
  } catch (e) {
    check(`sort=${sort} corre`, false, e instanceof Error ? e.message.slice(0, 160) : String(e));
  }
}

console.log('\n── Paginación por cursor con los órdenes nuevos ──');
for (const sort of ['oldest', 'gate'] as const) {
  try {
    const p1 = await listAnalyses(TEAM, { vista: 'todos', sort, limit: 5 });
    if (!p1.nextCursor) {
      console.log(`  – sort=${sort}: no hay segunda página (${p1.total} filas en total)`);
      continue;
    }
    const p2 = await listAnalyses(TEAM, { vista: 'todos', sort, limit: 5, cursor: p1.nextCursor });
    const repetidos = p2.rows.filter((r) => p1.rows.some((x) => x.chatId === r.chatId));
    check(`sort=${sort}: la segunda página no repite`, repetidos.length === 0, `${repetidos.length} repetidos`);
  } catch (e) {
    check(`sort=${sort}: pagina`, false, e instanceof Error ? e.message.slice(0, 160) : String(e));
  }
}

console.log('\n── La cola del Focus tal cual la pide la UI ──');
for (const vista of ['dinero', 'oportunidades', 'barrido', 'limpieza'] as const) {
  try {
    const q: ListQuery = { vista, queued: 'sin', sort: 'priority', limit: 50 };
    const r = await listAnalyses(TEAM, q);
    check(`etapa ${vista}`, true, `${r.rows.length} en la primera página de ${r.total} pendientes`);
  } catch (e) {
    check(`etapa ${vista}`, false, e instanceof Error ? e.message.slice(0, 160) : String(e));
  }
}

console.log(`\n${fail === 0 ? '✓ TODO OK' : `✗ ${fail} fallas`} · ${ok} chequeos pasados\n`);
process.exit(fail === 0 ? 0 : 1);
