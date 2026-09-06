import assert from 'node:assert/strict';
import test from 'node:test';
import { asegurarParrafos, desescaparSaltos } from '../../lib/messaging/parrafos';

/**
 * Los conectores mandan el mensaje entero en un bloque (el 2/9 salieron 23
 * programados de hasta 650 caracteres sin un salto). El servidor lo parte en
 * párrafos por oración, pero SÓLO cuando no hay ningún salto: lo que ya viene
 * con párrafos es decisión de quien lo escribió.
 */
const BLOQUE =
  'Hola 👋 Soy Noelia de AAPP SPACE. En marzo nos escribieron pidiendo información y quedó ahí, sin que nadie les contara nada concreto. ' +
  'Para una vidriería con urgencias 24 horas, la web propia es lo que hace que aparezcan en Google cuando a alguien se le rompe un vidrio de madrugada: los servicios, la zona y el botón de WhatsApp. ' +
  'Estamos en los últimos días con los valores actuales: el sitio web queda en $40.000 por el año, pago único. ' +
  'Si quieren verlo antes de decidir, mándenme el nombre y el logo y les armo una demo en www.aapp.space/demo.';

test('un bloque largo sin saltos se parte en párrafos', () => {
  const out = asegurarParrafos(BLOQUE);
  const parrafos = out.split('\n\n');
  assert.ok(parrafos.length >= 3, `esperaba 3+ párrafos, hay ${parrafos.length}`);
  assert.equal(parrafos[0], 'Hola 👋 Soy Noelia de AAPP SPACE.', 'el saludo corto va solo');
  assert.ok(out.includes('$40.000 por el año'), 'no corta dentro de un número');
  assert.ok(out.includes('www.aapp.space/demo.'), 'no corta dentro de una URL');
  assert.equal(out.replace(/\n\n/g, ' '), BLOQUE, 'no cambia ni una letra: sólo agrega saltos');
});

test('con un salto ya presente se respeta tal cual', () => {
  const conParrafos = 'Hola Marce.\n\nTe paso los ejemplos.';
  assert.equal(asegurarParrafos(conParrafos), conParrafos);
});

test('un texto corto queda igual', () => {
  assert.equal(asegurarParrafos('Hola! ¿Cómo estás? Te escribo por la tienda.'), 'Hola! ¿Cómo estás? Te escribo por la tienda.');
});

test('los "\\n" escritos como dos caracteres se vuelven saltos reales', () => {
  assert.equal(desescaparSaltos('Hola\\n\\nChau'), 'Hola\n\nChau');
  assert.equal(asegurarParrafos('Hola\\nChau'), 'Hola\nChau');
});
