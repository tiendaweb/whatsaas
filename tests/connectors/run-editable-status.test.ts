import assert from 'node:assert/strict';
import test from 'node:test';
import { RUN_EDITABLE_STATUSES, runEsEditable } from '../../lib/plugins/sales-ops/shared/skills';

/**
 * La regla de "qué corrida se puede corregir" la comparten la Cola (para
 * mostrar el botón), el servidor (`editQueuedRun`) y la tool MCP
 * `whatspro_sales_run_manage` con action=edit. Si se corren, la pantalla vuelve
 * a ofrecer un botón que la API rechaza — que fue justamente el bug: una
 * corrida fallida aparece "para supervisar" y "Corregir" respondía
 * «sólo se edita mientras espera en la cola».
 */

test('se corrige todo lo que espera una decisión', () => {
  assert.equal(runEsEditable('queued'), true, 'espera aprobación');
  assert.equal(runEsEditable('failed'), true, 'falló: el texto corregido es el que se reintenta');
  assert.equal(runEsEditable('blocked'), true, 'pide criterio: la respuesta se anexa a este texto');
});

test('no se corrige lo que ya está en manos de otro o cerrado', () => {
  assert.equal(runEsEditable('in_progress'), false, 'un conector la está ejecutando');
  assert.equal(runEsEditable('completed'), false, 'ese texto produjo la respuesta guardada');
  assert.equal(runEsEditable('cancelled'), false, 'ya se descartó');
});

test('un estado desconocido no se edita', () => {
  assert.equal(runEsEditable('cualquier_cosa'), false);
});

test('la lista es exactamente lo que la Cola muestra para supervisar', () => {
  assert.deepEqual([...RUN_EDITABLE_STATUSES], ['queued', 'failed', 'blocked']);
});
