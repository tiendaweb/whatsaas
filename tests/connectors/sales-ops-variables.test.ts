import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aplicarVariables,
  detectarVariables,
  tieneVariablesPendientes,
} from '../../lib/plugins/sales-ops/shared/variables';

test('detecta y completa variables con llaves o corchetes', () => {
  const texto = 'Hola {{nombre}}, ¿te queda [[horario_sabado]] o [[horario_domingo]]?';

  assert.deepEqual(detectarVariables(texto).map((v) => v.name), [
    'nombre',
    'horario_sabado',
    'horario_domingo',
  ]);
  assert.equal(
    aplicarVariables(texto, {
      nombre: 'Ana',
      horario_sabado: '10:00 h',
      horario_domingo: '17:00 h',
    }),
    'Hola Ana, ¿te queda 10:00 h o 17:00 h?',
  );
});

test('la barrera reconoce cualquier variable pendiente soportada', () => {
  assert.equal(tieneVariablesPendientes('Mensaje final sin variables.'), false);
  assert.equal(tieneVariablesPendientes('Hola [[nombre]]'), true);
  assert.equal(tieneVariablesPendientes('Hola {{ nombre }}'), true);
});
