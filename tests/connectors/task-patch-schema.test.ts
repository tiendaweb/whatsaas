import assert from 'node:assert/strict';
import test from 'node:test';
import { DESTRUCTIVE_TASK_FIELDS, taskPatchFieldsSchema } from '../../lib/plugins/grok-connector/shared/task-patch-schema';

/**
 * Regresión de un bug real: un conector mandaba sólo `label_ids` para poner
 * una etiqueta y la tarea perdía la descripción y el checklist, y volvía a
 * "abierta" si estaba terminada.
 *
 * La causa era que el esquema de actualización heredaba los `.default()` del
 * esquema de creación: zod rellenaba los campos ausentes (`notes: ''`,
 * `checklist: []`, `status: 'open'`) y el handler, que decide qué escribir con
 * `!== undefined`, los escribía.
 */

test('un campo ausente queda ausente: mandar sólo etiquetas no toca nada más', () => {
  const parsed = taskPatchFieldsSchema.parse({ label_ids: ['tag-urgente'] });

  assert.deepEqual(parsed.label_ids, ['tag-urgente']);
  for (const field of DESTRUCTIVE_TASK_FIELDS) {
    if (field === 'label_ids') continue;
    assert.equal(
      parsed[field], undefined,
      `"${field}" se rellenó solo: el handler lo va a escribir y va a borrar el dato del usuario.`,
    );
  }
  // Ni siquiera debe existir la clave, para que un spread la ignore.
  assert.deepEqual(Object.keys(parsed).sort(), ['label_ids']);
});

test('ningún campo del parche declara un valor por defecto', () => {
  // Chequeo estructural: si alguien agrega `.default()` a este esquema, el bug
  // vuelve aunque el test de arriba siga pasando para los campos actuales.
  for (const [name, schema] of Object.entries(taskPatchFieldsSchema.shape)) {
    const parsedAlone = taskPatchFieldsSchema.parse({});
    assert.equal(
      (parsedAlone as Record<string, unknown>)[name], undefined,
      `"${name}" tiene un valor por defecto en el esquema de actualización; sacalo (los defaults van sólo en el de creación).`,
    );
    void schema;
  }
  assert.deepEqual(taskPatchFieldsSchema.parse({}), {});
});

test('lo que sí se manda se respeta, incluido vaciar a propósito', () => {
  // Vaciar la descripción explícitamente tiene que seguir siendo posible:
  // el arreglo distingue "no lo mandé" de "lo mandé vacío".
  const parsed = taskPatchFieldsSchema.parse({ notes: '' });
  assert.equal(parsed.notes, '');
  assert.ok('notes' in parsed);
  assert.equal(parsed.checklist, undefined);
});
