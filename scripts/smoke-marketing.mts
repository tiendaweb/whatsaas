/**
 * Smoke de Marketing y del CRM de Empresa, CONTRA LA BASE:
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/smoke-marketing.mts
 *
 * SÓLO LEE. No escribe ni una fila.
 *
 * Existe porque el chequeo de tipos no ve nada de esto: una columna mal
 * escrita, un `inArray` con lista vacía, un `Date` metido adentro de un filtro
 * sobre una columna `date` o un GROUP BY armado con un parámetro pasan el build
 * en verde y revientan recién cuando alguien abre la pantalla.
 */
import { getResumenMarketing } from '@/lib/plugins/marketing/server/resumen';
import { getCrmEmpresa } from '@/lib/plugins/empresa/server/crm';

const TEAM_ID = Number(process.env.SMOKE_TEAM_ID ?? 2);
const USER_ID = Number(process.env.SMOKE_USER_ID ?? 3);

async function main() {
  console.log(`— Marketing, equipo ${TEAM_ID} —`);
  for (const dias of [7, 30, 90]) {
    const r = await getResumenMarketing(TEAM_ID, dias, USER_ID);
    const gasto = r.publicidad.gasto.map((g) => `${g.currency} ${(g.cents / 100).toLocaleString('es-AR')}`).join(' · ') || '—';
    console.log(
      `  ${dias}d · gasto ${gasto} · ${r.publicidad.impresiones.toLocaleString('es-AR')} impresiones · ` +
        `${r.publicidad.clicks} clicks · ${r.publicidad.resultados} resultados · top ${r.publicidad.top.length}`,
    );
    // La invariante que no se puede aflojar: cada moneda es su propio renglón.
    const monedas = new Set(r.publicidad.gasto.map((g) => g.currency));
    if (monedas.size !== r.publicidad.gasto.length) throw new Error('Monedas duplicadas: alguien las está sumando mal');
  }
  const r = await getResumenMarketing(TEAM_ID, 30, USER_ID);
  console.log(`  vistas: ${r.vistasDisponibles.join(', ')}`);
  console.log(`  apps activas: ${r.apps.activas.length} · difusión ${r.difusion.disponible ? 'habilitada' : 'apagada'}`);
  console.log(`  publicaciones ${r.publicaciones.publicadas} · formularios ${r.captacion.formularios} · leads ${r.captacion.envios}`);

  console.log(`\n— CRM de Empresa, equipo ${TEAM_ID} —`);
  const crm = await getCrmEmpresa(TEAM_ID, null, null);
  const conGente = crm.etapas.filter((e) => e.total > 0);
  console.log(`  ${crm.totales.contactos} contactos · ${conGente.length} etapas con gente · ${crm.totales.sinEtapa} sin etapa`);
  console.log(`  ${crm.totales.sinAgente} sin agente · ${crm.totales.conCorreccion} con corrección pendiente`);
  for (const e of conGente.slice(0, 5)) {
    console.log(`    ${e.name}: ${e.total} (muestra ${e.contactos.length})`);
  }
  // El total de la columna es el real, no el de las tarjetas que alcanzó a traer.
  for (const e of crm.etapas) {
    if (e.contactos.length > e.total) throw new Error(`La etapa ${e.name} muestra más tarjetas que su total`);
  }

  const filtrado = await getCrmEmpresa(TEAM_ID, 2, null);
  console.log(`  filtrado por marca 2: ${filtrado.totales.contactos} contactos`);
  const buscado = await getCrmEmpresa(TEAM_ID, null, 'a');
  console.log(`  buscando "a": ${buscado.totales.contactos} contactos`);
  // Marca inexistente: no puede armar un `in ()` ni tirar.
  const inexistente = await getCrmEmpresa(TEAM_ID, 999999, null);
  console.log(`  marca inexistente: ${inexistente.totales.contactos} contactos (esperado 0)`);

  console.log('\nOK');
  process.exit(0);
}

main().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
