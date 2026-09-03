import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// lib/readonly-api/catalog.ts importa 'server-only' y el cliente de Drizzle
// (@/lib/db/drizzle), así que no se puede importar en este runner de tests
// puro (node:test sin resolución de alias @/ ni conexión a DB). Se verifica
// por contenido, igual que tests/resellers/migration-security.test.ts.
let catalogSource: string;

test.before(async () => {
  catalogSource = await readFile('lib/readonly-api/catalog.ts', 'utf8');
});

const NEW_RESOURCE_KEYS = [
  'financial-entries',
  'financial-accounts',
  'financial-entry-payments',
  'financial-receipts',
  'cost-centers',
  'budgets',
  'exchange-rates',
  'event-participants',
];

test('todas las tablas nuevas de Fase 1 quedan registradas en el catálogo readonly (whatspro_list_records/get_record)', () => {
  for (const key of NEW_RESOURCE_KEYS) {
    assert.match(catalogSource, new RegExp(`'${key}'`), `falta registrar el recurso '${key}' en readOnlyResources`);
  }
});

test('los recursos nuevos usan direct()/through() (tenant-scoped por construcción, no una query libre)', () => {
  for (const key of NEW_RESOURCE_KEYS) {
    const idx = catalogSource.indexOf(`'${key}'`);
    assert.ok(idx >= 0, `no se encontró '${key}'`);
    const line = catalogSource.slice(Math.max(0, idx - 20), idx + 20);
    assert.match(line, /direct\(|through\(/, `'${key}' debe declararse con direct()/through()`);
  }
});

test('event-participants se resuelve a través de team_events (no expone participantes de otros teams)', () => {
  assert.match(catalogSource, /through\('event-participants', 'plugins', 'Event participants',[\s\S]*?teamEventParticipants, 'eventId', teamEvents, 'id'/);
});
