import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORK_KINDS,
  WORK_STATUS_TRANSITIONS,
  checklistPorDefecto,
  estadoTareaPara,
  familiaDe,
  puedeTransicionar,
} from '../../lib/plugins/tasks/shared/produccion';

test('cada tipo de Producción OS tiene familia y checklist operativo', () => {
  for (const kind of WORK_KINDS) {
    assert.ok(familiaDe(kind), `${kind} necesita familia`);
    assert.ok(checklistPorDefecto(kind).length >= 4, `${kind} necesita checklist`);
  }
});

test('los estados finales cierran Tareas y los operativos quedan abiertos', () => {
  assert.equal(estadoTareaPara('entregado'), 'done');
  assert.equal(estadoTareaPara('descartado'), 'done');
  assert.equal(estadoTareaPara('en_curso'), 'in_progress');
  assert.equal(estadoTareaPara('espera_cliente'), 'in_progress');
  assert.equal(estadoTareaPara('pedido'), 'open');
  assert.equal(estadoTareaPara('aceptado'), 'open');
});

test('el flujo impide saltar de pedido a entregado y permite reabrir cambios', () => {
  assert.equal(puedeTransicionar('pedido', 'entregado'), false);
  assert.equal(puedeTransicionar('pedido', 'aceptado'), true);
  assert.equal(puedeTransicionar('en_curso', 'entregado'), true);
  assert.equal(puedeTransicionar('entregado', 'cambios'), true);
  assert.deepEqual(WORK_STATUS_TRANSITIONS.descartado, ['pedido']);
});
