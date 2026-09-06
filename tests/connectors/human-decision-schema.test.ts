import assert from 'node:assert/strict';
import test from 'node:test';
import {
  humanDecisionRequestSchema,
  validateHumanDecisionAnswers,
} from '../../lib/plugins/sales-ops/shared/human-decision';

const request = humanDecisionRequestSchema.parse({
  title: 'Elegí cómo continuar',
  fields: [
    {
      id: 'canal',
      type: 'buttons',
      label: 'Canal de respuesta',
      required: true,
      allowOther: true,
      options: [
        { label: 'WhatsApp', value: 'whatsapp' },
        { label: 'Correo', value: 'email' },
      ],
    },
    { id: 'detalle', type: 'textarea', label: 'Indicaciones adicionales' },
  ],
});

test('acepta una opción declarada y conserva el texto humano', () => {
  const result = validateHumanDecisionAnswers(request, { values: { canal: 'whatsapp', detalle: 'Enviar mañana.' } });
  assert.deepEqual(result, { ok: true, values: { canal: 'whatsapp', detalle: 'Enviar mañana.' } });
});

test('allowOther permite una respuesta que no estaba entre los botones', () => {
  const result = validateHumanDecisionAnswers(request, { values: { canal: 'llamada telefónica' } });
  assert.equal(result.ok, true);
});

test('rechaza campos obligatorios vacíos y opciones inventadas cuando no se permite otra', () => {
  const missing = validateHumanDecisionAnswers(request, { values: {} });
  assert.equal(missing.ok, false);

  const strictRequest = humanDecisionRequestSchema.parse({
    title: 'Confirmar',
    fields: [{ id: 'estado', type: 'select', label: 'Estado', options: [{ label: 'Sí', value: 'yes' }, { label: 'No', value: 'no' }] }],
  });
  const invalid = validateHumanDecisionAnswers(strictRequest, { values: { estado: 'tal_vez' } });
  assert.equal(invalid.ok, false);
});

test('el formulario rechaza ids repetidos', () => {
  const parsed = humanDecisionRequestSchema.safeParse({
    title: 'Completar',
    fields: [
      { id: 'dato', type: 'text', label: 'Dato' },
      { id: 'dato', type: 'textarea', label: 'Otro dato' },
    ],
  });
  assert.equal(parsed.success, false);
});
