import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('la reconciliación elimina índices globales y crea idempotencia por tenant', async () => {
  const migration = await readFile('lib/db/migrations/0053_reseller_reconciliation.sql', 'utf8');
  assert.match(migration, /DROP INDEX IF EXISTS payment_webhook_events_provider_event_id_uidx/);
  assert.match(migration, /COALESCE\(reseller_id, 0\), event_id/);
  assert.match(migration, /COALESCE\(reseller_id, 0\), payment_id/);
});

test('la transferencia de propietario queda en auditoría reseller durable', async () => {
  const migration = await readFile('lib/db/migrations/0054_reseller_audit.sql', 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reseller_audit_events/);
  assert.match(migration, /previous_owner_user_id integer REFERENCES users\(id\)/);
  assert.match(migration, /next_owner_user_id integer REFERENCES users\(id\)/);
  assert.match(migration, /reseller_audit_events_reseller_created_idx/);
});

test('el alta admin enlaza al propietario y registra el evento de creación', async () => {
  const actions = await readFile(
    'app/[locale]/(admin)/admin/resellers/actions.ts',
    'utf8',
  );
  assert.match(actions, /set\(\{ resellerId: createdReseller\.id, updatedAt: new Date\(\) \}\)/);
  assert.match(actions, /action: 'reseller_created'/);
  assert.match(actions, /nextOwnerUserId: createdUser\.id/);
});
