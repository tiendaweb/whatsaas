/**
 * Smoke de la app Empresa, CONTRA LA BASE:
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/smoke-empresa.mts
 *
 * SÓLO LEE. No escribe ni una fila.
 *
 * Existe porque el chequeo de tipos no ve nada de esto: una columna mal
 * escrita, un `inArray` con lista vacía o un `Date` metido adentro de un filtro
 * de SQL pasan el build en verde y revientan recién cuando alguien abre la
 * pantalla. Acá se ejecutan las consultas de verdad, con y sin filtro de marca,
 * y se verifica lo único que no puede fallar nunca: que las monedas no se
 * sumen entre sí.
 */
import { getResumenEmpresa } from '@/lib/plugins/empresa/server/resumen';
import { APPS_AGRUPADAS, PLUGIN_POR_VISTA, VISTAS } from '@/lib/plugins/empresa/shared/vistas';

const TEAM_ID = Number(process.env.SMOKE_TEAM_ID ?? 2);
/**
 * Sin usuario, las apps de activación por usuario (Finanzas, Compras, RRHH,
 * Soporte, Contratos, Inteligencia) NO cuentan como activas: viven en
 * `team_member_plugins`. Es la misma trampa que el creador de herramientas del
 * agente IA, y sin este id el smoke daría "ninguna app activa" y parecería que
 * los sectores del Inicio están rotos.
 */
const USER_ID = Number(process.env.SMOKE_USER_ID ?? 3);

let fallas = 0;
function ok(condicion: boolean, texto: string) {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} · ${texto}`);
  if (!condicion) fallas += 1;
}

function monedasUnicas(montos: Array<{ currency: string }>): boolean {
  return new Set(montos.map((m) => m.currency)).size === montos.length;
}

async function main() {
  console.log(`\nEmpresa · equipo ${TEAM_ID}\n`);

  const todas = await getResumenEmpresa(TEAM_ID, null);
  console.log('Sin filtro de marca:');
  ok(todas.marcaId === null, 'el resumen se declara sin marca');
  ok(Array.isArray(todas.marcas), `${todas.marcas.length} marcas`);
  ok(todas.contadores.suscripcionesActivas >= 0, `${todas.contadores.suscripcionesActivas} suscripciones activas`);
  ok(todas.contadores.porVencer30 >= 0, `${todas.contadores.porVencer30} vencen en 30 días`);
  ok(todas.contadores.clientes >= 0, `${todas.contadores.clientes} clientes`);
  ok(todas.contadores.oportunidadesAbiertas >= 0, `${todas.contadores.oportunidadesAbiertas} oportunidades abiertas`);
  ok(todas.vencimientos.length <= 12, `${todas.vencimientos.length} vencimientos listados (tope 12)`);

  for (const [clave, montos] of Object.entries(todas.dinero)) {
    ok(monedasUnicas(montos), `${clave}: una fila por moneda (${montos.map((m) => `${m.currency} ${m.cents}`).join(', ') || 'vacío'})`);
  }

  const conocidas = new Set(APPS_AGRUPADAS.map((a) => a.pluginId));
  ok(todas.apps.activas.every((id) => conocidas.has(id)), `sin usuario: ${todas.apps.activas.join(', ') || 'ninguna app agrupada activa'}`);
  ok(todas.apps.contratosPorVencer >= 0, `${todas.apps.contratosPorVencer} contratos vencen en 60 días`);
  console.log(`        contadores de apps: ${JSON.stringify(todas.apps.contadores)}`);

  ok(
    todas.vistasDisponibles.includes('inicio') && todas.vistasDisponibles.includes('apps'),
    'las vistas propias de Empresa están siempre',
  );
  ok(
    VISTAS.filter((v) => PLUGIN_POR_VISTA[v] == null).every((v) => todas.vistasDisponibles.includes(v)),
    `vistas disponibles: ${todas.vistasDisponibles.join(', ')}`,
  );

  const conUsuario = await getResumenEmpresa(TEAM_ID, null, USER_ID);
  ok(
    conUsuario.apps.activas.every((id) => conocidas.has(id)),
    `con usuario ${USER_ID}: ${conUsuario.apps.activas.join(', ') || 'ninguna app agrupada activa'}`,
  );
  ok(
    conUsuario.apps.activas.length >= todas.apps.activas.length,
    'pasar el usuario nunca puede mostrar menos apps que no pasarlo',
  );

  // La lista de vencimientos tiene que venir ordenada por fecha: es lo que la
  // vuelve una lista de trabajo y no un volcado.
  const fechas = todas.vencimientos.map((v) => v.endDate);
  ok(
    fechas.every((f, i) => i === 0 || fechas[i - 1] <= f),
    'los vencimientos vienen del más próximo al más lejano',
  );

  // ── Con filtro de marca ────────────────────────────────────────────────────
  const marca = todas.marcas[0];
  if (!marca) {
    console.log('\nNo hay marcas cargadas: el filtro no se puede probar.');
  } else {
    console.log(`\nFiltrado por «${marca.name}» (id ${marca.id}):`);
    const una = await getResumenEmpresa(TEAM_ID, marca.id);
    ok(una.marcaId === marca.id, 'el resumen se declara con esa marca');
    ok(
      una.marcas.length === todas.marcas.length,
      `siguen viniendo las ${todas.marcas.length} marcas (el selector necesita todas)`,
    );
    ok(
      una.contadores.suscripcionesActivas <= todas.contadores.suscripcionesActivas,
      `${una.contadores.suscripcionesActivas} suscripciones activas (≤ ${todas.contadores.suscripcionesActivas})`,
    );
    ok(
      una.contadores.suscripcionesActivas === marca.suscripcionesActivas,
      'el contador global filtrado coincide con la fila de la marca',
    );
    ok(
      una.marcas.find((m) => m.id === marca.id)?.suscripcionesActivas === marca.suscripcionesActivas,
      'la fila de la marca no cambia según el filtro',
    );
    for (const [clave, montos] of Object.entries(una.dinero)) {
      ok(monedasUnicas(montos), `${clave} filtrado: una fila por moneda`);
    }

    // Una marca inexistente no puede tirar: el filtro viaja en la URL.
    const fantasma = await getResumenEmpresa(TEAM_ID, 999_999);
    ok(fantasma.contadores.suscripcionesActivas === 0, 'una marca inexistente devuelve cero, no un error');
  }

  console.log(`\n${fallas === 0 ? 'TODO OK' : `${fallas} FALLAS`}\n`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
