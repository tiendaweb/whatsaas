/**
 * Barra de progreso del Focus: la aritmética y el denominador.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-focus-progreso.mts
 *
 * Dos partes. La primera prueba las funciones puras contra los dos bugs que
 * tuvo: retroceder no puede bajar la barra, y saltear no puede subirla. La
 * segunda va contra la base: pagina una etapa entera y comprueba que el total
 * que el servidor informa en la PRIMERA página —el denominador de la barra— sea
 * el que efectivamente se puede recorrer, o la barra nunca llegaría a 100.
 */
import { listAnalyses } from '@/lib/plugins/sales-ops/server/queries';
import { contarProcesados, porcentaje, type TipoProceso } from '@/lib/plugins/sales-ops/ui/focus/useColaFocus';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
let ok = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' · ' + String(extra) : ''}`);
};

console.log('\n── Aritmética de la barra ──');
const rows = [1, 2, 3, 4, 5].map((chatId) => ({ chatId }));
const p: Record<number, TipoProceso> = {};

check('sin nada hecho, 0 %', porcentaje(contarProcesados(rows, p), 5) === 0);

p[1] = 'ejecutado';
p[2] = 'encolado';
check('dos resueltos de cinco → 40 %', porcentaje(contarProcesados(rows, p), 5) === 40, `${contarProcesados(rows, p)}/5`);

p[3] = 'saltado';
check('saltear no suma', porcentaje(contarProcesados(rows, p), 5) === 40, `${contarProcesados(rows, p)}/5`);

// El bug: contar sólo hasta el índice hacía que volver atrás bajara la barra.
check('volver atrás no baja la barra', contarProcesados(rows, p) === contarProcesados(rows.slice(0), p), 'el conteo no depende del índice');

p[4] = 'ejecutado';
p[5] = 'encolado';
check('cuatro resueltos y uno salteado → 80 %', porcentaje(contarProcesados(rows, p), 5) === 80, `${contarProcesados(rows, p)}/5 = ${porcentaje(contarProcesados(rows, p), 5)} %`);

// Un salteado que después se resuelve tiene que sumar: se vuelve con la flecha
// y se lo trabaja, y la barra tiene que reflejarlo.
p[3] = 'ejecutado';
check('resolver un salteado sí suma → 100 %', porcentaje(contarProcesados(rows, p), 5) === 100, `${contarProcesados(rows, p)}/5`);

console.log('\n── Guardas ──');
check('total 0 no rompe', porcentaje(3, 0) === 0);
check('total negativo no rompe', porcentaje(3, -1) === 0);
check('total NaN no rompe', porcentaje(3, Number.NaN) === 0);
check('nunca pasa de 100', porcentaje(999, 10) === 100);
check('nunca baja de 0', porcentaje(-5, 10) === 0);

console.log('\n── El denominador es alcanzable (contra la base) ──');
for (const vista of ['dinero', 'oportunidades', 'barrido', 'limpieza'] as const) {
  const primera = await listAnalyses(TEAM, { vista, queued: 'sin', sort: 'priority', limit: 50 });
  const totalDeclarado = primera.total;
  let vistas = primera.rows.length;
  let cursor = primera.nextCursor;
  let paginas = 1;
  const ids = new Set(primera.rows.map((r) => r.chatId));
  while (cursor && paginas < 40) {
    const p2 = await listAnalyses(TEAM, { vista, queued: 'sin', sort: 'priority', limit: 50, cursor });
    for (const r of p2.rows) ids.add(r.chatId);
    vistas += p2.rows.length;
    cursor = p2.nextCursor;
    paginas += 1;
  }
  check(
    `${vista}: se recorren las ${totalDeclarado} que declara la primera página`,
    ids.size === totalDeclarado,
    `${ids.size} únicas de ${vistas} devueltas en ${paginas} páginas · barra final ${porcentaje(ids.size, totalDeclarado)} %`,
  );
}

console.log(`\n${fail === 0 ? '✓ TODO OK' : `✗ ${fail} fallas`} · ${ok} chequeos pasados\n`);
process.exit(fail === 0 ? 0 : 1);
