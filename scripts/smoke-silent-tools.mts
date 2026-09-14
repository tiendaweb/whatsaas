/**
 * Smoke de las llamadas silenciosas, CONTRA LA BASE:
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/smoke-silent-tools.mts
 *
 * SÓLO LEE. No escribe ni una fila, no manda ningún aviso.
 *
 * Existe porque el chequeo de tipos no ve nada de esto: una función que quedó
 * fuera del catálogo, una que depende de una app apagada, o una marcada como
 * silenciosa que igual le habla al cliente, pasan el build en verde.
 */
import { BUILTIN_TOOLS, listBuiltinToolCatalog } from '@/lib/plugins/ai-chat/builtin';
import { silentTools } from '@/lib/plugins/ai-chat/builtin/silent';
import { getDynamicTools } from '@/lib/plugins/ai-chat/tools';

const TEAM_ID = Number(process.env.SMOKE_TEAM_ID ?? 2);

let fallas = 0;
function ok(condicion: boolean, texto: string) {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} · ${texto}`);
  if (!condicion) fallas++;
}

const esperadas = [
  'capture_business_profile', 'log_product_interest', 'log_objection', 'write_contact_note',
  'alert_team', 'route_to_department', 'flag_payment_proof', 'mark_do_not_contact',
];

console.log(`\n== Catálogo (equipo ${TEAM_ID}) ==`);
const catalogo = await listBuiltinToolCatalog(TEAM_ID);
ok(catalogo.length === BUILTIN_TOOLS.length, `el catálogo trae las ${BUILTIN_TOOLS.length} funciones integradas`);

for (const nombre of esperadas) {
  const fila = catalogo.find((t) => t.name === nombre);
  ok(Boolean(fila), `${nombre}: está en el catálogo`);
  if (!fila) continue;
  ok(fila.silent === true, `${nombre}: figura como silenciosa`);
  ok(fila.pluginActive, `${nombre}: disponible (no depende de una app apagada)`);
  ok(fila.enabled, `${nombre}: encendida para el equipo`);
}

console.log('\n== Confirmar pago ==');
const confirmar = catalogo.find((t) => t.name === 'confirm_payment');
ok(Boolean(confirmar), 'confirm_payment: está en el catálogo');
ok(confirmar?.silent === false, 'confirm_payment: NO es silenciosa (al cliente hay que confirmarle)');
ok(confirmar?.pluginActive === true, 'confirm_payment: disponible aunque Finanzas o Ventas estén apagadas');
const defConfirmar = silentTools.find((t) => t.name === 'confirm_payment');
ok(
  ['importe', 'moneda'].every((p) => (defConfirmar?.parameters as any)?.required?.includes(p)),
  'confirm_payment: exige importe y moneda, no cobra a ciegas',
);
ok(
  /flag_payment_proof/.test(defConfirmar?.description ?? ''),
  'confirm_payment: le dice al modelo cuándo usar el otro camino',
);
ok(
  /confirm_payment/.test(silentTools.find((t) => t.name === 'flag_payment_proof')?.description ?? ''),
  'flag_payment_proof: le dice al modelo cuándo confirmar en serio',
);

console.log('\n== Invariantes ==');
ok(silentTools.filter((t) => t.name !== 'confirm_payment').every((t) => t.silent === true), 'todas las silenciosas están marcadas silent');
ok(silentTools.every((t) => t.pluginId === null), 'todas son del núcleo: ninguna depende de una app');
ok(silentTools.every((t) => t.risk === 'write'), 'todas declaran que escriben');
ok(new Set(BUILTIN_TOOLS.map((t) => t.name)).size === BUILTIN_TOOLS.length, 'no hay nombres repetidos en el catálogo');

console.log('\n== Lo que ve el agente ==');
const delAgente = await getDynamicTools(TEAM_ID);
const silenciosas = delAgente.filter((t) => t.silent);
ok(silenciosas.length >= esperadas.length, `el agente recibe ${silenciosas.length} funciones silenciosas`);
for (const nombre of esperadas) {
  ok(delAgente.some((t) => t.name === nombre), `${nombre}: se le ofrece al agente`);
}

console.log(`\n${fallas === 0 ? 'TODO OK' : `${fallas} FALLAS`}\n`);
process.exit(fallas === 0 ? 0 : 1);
