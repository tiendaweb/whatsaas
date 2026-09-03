import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrandIdentity,
  renderTenantCopy,
  renderTenantText,
} from '../../lib/branding/constants';

test('resuelve nombre, dominio y correo del tenant', () => {
  assert.deepEqual(
    buildBrandIdentity({ name: ' ChatPro ', supportEmail: null }, 'CHATPRO.UNO'),
    {
      name: 'ChatPro',
      hostname: 'chatpro.uno',
      supportEmail: 'support@chatpro.uno',
    },
  );
});

test('respeta el correo configurado por el reseller', () => {
  assert.equal(
    buildBrandIdentity({ name: 'ChatPro', supportEmail: ' ayuda@chatpro.uno ' }, 'chatpro.uno')
      .supportEmail,
    'ayuda@chatpro.uno',
  );
});

test('reemplaza placeholders y marcas heredadas solo en copy administrado', () => {
  const identity = buildBrandIdentity({ name: 'ChatPro' }, 'chatpro.uno');
  assert.equal(
    renderTenantText(
      '{brand} conecta WhatSaaS y WhatsPro desde whatspro.uno o whatspro.com. Visita {domain}.',
      identity,
    ),
    'ChatPro conecta ChatPro y ChatPro desde chatpro.uno o chatpro.uno. Visita chatpro.uno.',
  );
});

test('transforma DTOs sin convertir fechas ni mutar el original', () => {
  const identity = buildBrandIdentity({ name: 'ChatPro' }, 'chatpro.uno');
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const source = {
    description: 'API REST de WhatsaaS',
    nested: [{ url: 'https://whatspro.uno/docs' }],
    createdAt,
  };
  const result = renderTenantCopy(source, identity);

  assert.equal(result.description, 'API REST de ChatPro');
  assert.equal(result.nested[0].url, 'https://chatpro.uno/docs');
  assert.equal(result.createdAt, createdAt);
  assert.equal(source.description, 'API REST de WhatsaaS');
});
