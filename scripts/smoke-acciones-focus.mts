/**
 * Las acciones preestablecidas del Focus: que produzcan pedidos ejecutables.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-acciones-focus.mts
 *
 * Sin base ni IA salvo el último bloque. Lo que se prueba es lo que rompe en
 * silencio: que cada plantilla nombre las tools que dice tener (un pedido que
 * pide "creá la tarea" sin decir con qué tool deja al conector adivinando), que
 * ninguna quede vacía, y que `deducirAccion` reconozca lo que las plantillas
 * generan — si no, supervisar una corrida mostraría la etiqueta equivocada.
 */
import { ACCIONES, ACCIONES_FOCUS, ACCIONES_VISIBLES, deducirAccion, tituloDeAccion, type AccionFocus } from '@/lib/plugins/sales-ops/ui/focus/acciones';

let ok = 0, fail = 0;
const check = (l: string, c: boolean, e = '') => { c ? ok++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${l}${e ? ' · ' + String(e).slice(0, 130) : ''}`); };

console.log('\n── Catálogo ──');
check('todas las acciones están en la lista visible', ACCIONES_FOCUS.every((a) => ACCIONES_VISIBLES.includes(a) || a === 'libre'), ACCIONES_VISIBLES.join(' '));
for (const key of ACCIONES_FOCUS) {
  const def = ACCIONES[key];
  check(`${key}: tiene label, ayuda y tools`, Boolean(def.label && def.ayuda && def.tools.length > 0));
}

console.log('\n── Las plantillas producen un pedido usable ──');
for (const key of ACCIONES_FOCUS) {
  const def = ACCIONES[key];
  const conDetalle = def.plantilla('Juan Pérez', 'recordale la seña');
  const sinDetalle = def.plantilla('Juan Pérez', '');
  if (key === 'libre') {
    check('libre: es el texto tal cual, sin plantilla', conDetalle === 'recordale la seña' && sinDetalle === '');
    continue;
  }
  check(`${key}: sirve sin detalle`, sinDetalle.trim().length > 60, `${sinDetalle.length} caracteres`);
  check(`${key}: mete el detalle cuando lo hay`, conDetalle.includes('recordale la seña'));
  check(`${key}: nombra al contacto`, conDetalle.includes('Juan Pérez'));
  // Cada plantilla tiene que nombrar al menos una de sus tools: si dice qué
  // hacer pero no con qué, el conector improvisa.
  const nombraTool = def.tools.some((t) => conDetalle.includes(t));
  check(`${key}: nombra alguna de sus tools`, nombraTool, def.tools.join(', '));
  check(`${key}: cierra con prompt_result`, conDetalle.includes('whatspro_sales_prompt_result'));
}

console.log('\n── deducirAccion reconoce lo que generan las plantillas ──');
for (const key of ACCIONES_FOCUS) {
  if (key === 'libre') continue;
  const texto = ACCIONES[key].plantilla('Juan Pérez', '');
  const deducida: AccionFocus = deducirAccion(texto);
  check(`${key} → se deduce ${deducida}`, deducida === key, deducida !== key ? `esperado ${key}` : '');
}
check('un texto cualquiera cae en libre', deducirAccion('hola qué tal') === 'libre');

console.log('\n── Títulos ──');
check('el título dice la acción y el contacto', tituloDeAccion('programar', 'Juan Pérez') === 'Programar · Juan Pérez', tituloDeAccion('programar', 'Juan Pérez'));
check('un nombre larguísimo no rompe el límite de 160', tituloDeAccion('tarea', 'x'.repeat(400)).length === 160);

console.log(`\n${fail === 0 ? '✓ TODO OK' : `✗ ${fail} fallas`} · ${ok} chequeos pasados\n`);
process.exit(fail === 0 ? 0 : 1);
