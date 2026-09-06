/**
 * Smoke del motor de "Ejecutar ahora" (doc 08 §5), CONTRA GEMINI.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-focus-ia.mts
 *
 * Gasta cuota de IA. No escribe nada: `ejecutarPedidoFocus` sólo devuelve texto.
 * Lo que se comprueba es el contrato de cuatro salidas: redacción → texto,
 * "para mañana a las 10" → programar (con fecha válida), etiqueta → crm
 * (propuesta validada contra el catálogo, sin aplicar), y lo que necesita
 * herramientas → conector.
 */
import { listAnalyses } from '@/lib/plugins/sales-ops/server/queries';
import { ejecutarPedidoFocus } from '@/lib/plugins/sales-ops/server/focus';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
let ok = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' · ' + extra.replace(/\s+/g, ' ').slice(0, 180) : ''}`);
};

const lista = await listAnalyses(TEAM, { vista: 'dinero', sort: 'priority', limit: 1 });
const fila = lista.rows[0];
if (!fila) {
  console.log('No hay contactos en Dinero para probar.');
  process.exit(0);
}
console.log(`\n── Motor Focus sobre "${fila.name}" (chat ${fila.chatId}, ${fila.currentGate}) ──`);

const casos: Array<{ pedido: string; esperado: 'texto' | 'conector' | 'programar' | 'crm'; message?: string }> = [
  { pedido: 'Escribile un recordatorio corto y amable de que quedó pendiente cerrar. Máximo 2 renglones.', esperado: 'texto' },
  { pedido: 'Acortá este mensaje a una sola línea, sin perder la fecha.', esperado: 'texto', message: 'Hola! Te recuerdo que el jueves vence el plazo para confirmar la propuesta. Cualquier duda me escribís y lo vemos.' },
  // Desde el 2026-09-05 el motor programa y propone CRM sin conector.
  { pedido: 'Programale para mañana a las 10 un recordatorio corto de que quedó pendiente confirmar la propuesta.', esperado: 'programar' },
  { pedido: 'Ponele la etiqueta "interesado" en el CRM.', esperado: 'crm' },
  { pedido: 'Mandale el mensaje ahora mismo por WhatsApp.', esperado: 'conector' },
  { pedido: 'Registrá el cobro de 50 dólares y pasalo a la etapa Ganado.', esperado: 'conector' },
  { pedido: 'Armale la demo web y creá el proyecto del cliente en Tareas.', esperado: 'conector' },
];

for (const caso of casos) {
  const r = await ejecutarPedidoFocus(TEAM, { chatId: fila.chatId, prompt: caso.pedido, message: caso.message ?? null, name: fila.name });
  if (!r.ok) {
    check(`«${caso.pedido.slice(0, 44)}…»`, false, r.error);
    continue;
  }
  const detalle = r.mode === 'texto' ? r.text : r.mode === 'programar' ? `${r.when} · ${r.text}` : r.mode === 'crm' ? `${r.steps.join(' / ')}${r.skipped.length ? ` (saltea: ${r.skipped.join(', ')})` : ''}` : r.reason;
  // "crm" puede caer a "conector" si la etiqueta pedida no existe en el equipo: se acepta con aviso.
  const ok = r.mode === caso.esperado || (caso.esperado === 'crm' && r.mode === 'conector' && /existe|catálogo|crear/i.test(r.reason ?? ''));
  check(`«${caso.pedido.slice(0, 44)}…» → ${r.mode} (esperado ${caso.esperado})`, ok, detalle ?? '');
  if (r.mode === 'programar') check('la fecha de "programar" tiene forma YYYY-MM-DDTHH:mm y es futura', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.when) && new Date(`${r.when}:00-03:00`).getTime() > Date.now(), r.when);
}

console.log('\n── Guardas ──');
const vacio = await ejecutarPedidoFocus(TEAM, { chatId: fila.chatId, prompt: '  ' });
check('un pedido vacío se rechaza sin llamar a la IA', !vacio.ok);

console.log(`\n${fail === 0 ? '✓ TODO OK' : `✗ ${fail} fallas`} · ${ok} chequeos pasados\n`);
process.exit(fail === 0 ? 0 : 1);
