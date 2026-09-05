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
import { ACCIONES, ACCIONES_FOCUS, ACCIONES_VISIBLES, bloqueDeCapacidades, componerPedido, deducirAccion, tituloDeAccion, type AccionFocus } from '@/lib/plugins/sales-ops/ui/focus/acciones';

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
check('un nombre larguísimo no rompe el límite de 160', tituloDeAccion('tareas', 'x'.repeat(400)).length === 160);

console.log('\n── El pedido que ve el conector ──');
const todas = [...ACCIONES_FOCUS];
const pedido = componerPedido('Juan Pérez', 'recordale la seña', todas);
check('nombra al contacto', pedido.includes('Juan Pérez'));
check('mete lo que pidió la persona', pedido.includes('recordale la seña'));
check('arranca por el expediente', pedido.includes('whatspro_sales_dossier'));
check('cierra con prompt_result', pedido.includes('whatspro_sales_prompt_result'));
check('lista las capacidades', pedido.includes('QUÉ PODÉS HACER'));
for (const key of todas) {
  if (key === 'libre') continue;
  check(`ofrece ${key}`, pedido.includes(ACCIONES[key].label));
}
const sinDetalle = componerPedido('Juan Pérez', '', todas);
check('sin detalle igual es un pedido válido', sinDetalle.length > 200 && sinDetalle.includes('leé el chat'));

console.log('\n── Sólo se ofrece lo habilitado ──');
const recortadas = componerPedido('Juan Pérez', 'algo', ['mensaje', 'crm']);
check('nombra las permitidas', recortadas.includes('Mensaje') && recortadas.includes('CRM'));
check('NO nombra las apagadas', !recortadas.includes('Tareas OS') && !recortadas.includes('Documento'));
check('sin capacidades no hay bloque', bloqueDeCapacidades(['libre']) === '');

console.log(`\n${fail === 0 ? '✓ TODO OK' : `✗ ${fail} fallas`} · ${ok} chequeos pasados\n`);
process.exit(fail === 0 ? 0 : 1);
