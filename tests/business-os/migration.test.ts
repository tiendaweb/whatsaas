import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

let migrationSource: string;

test.before(async () => {
  migrationSource = await readFile('lib/db/migrations/0068_business_os_phase1.sql', 'utf8');
});

test('crea las tablas nuevas de Fase 1 con guard IF NOT EXISTS (re-ejecutable sin romper producción)', () => {
  for (const table of [
    'team_financial_accounts',
    'team_cost_centers',
    'team_budgets',
    'team_financial_entry_payments',
    'team_exchange_rates',
    'team_event_participants',
  ]) {
    assert.match(migrationSource, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`), `falta guard IF NOT EXISTS para ${table}`);
  }
});

test('agrega columnas nuevas con ADD COLUMN IF NOT EXISTS (idempotente, sin choque con columnas ya aplicadas)', () => {
  const expectedColumns: Array<[string, string]> = [
    ['team_financial_entries', 'sale_id'],
    ['team_financial_entries', 'project_id'],
    ['team_financial_entries', 'account_id'],
    ['team_financial_entries', 'cost_center_id'],
    ['team_events', 'kind'],
    ['team_events', 'subtype'],
    ['team_events', 'outcome'],
    ['team_events', 'next_action'],
    ['team_events', 'customer_id'],
    ['team_events', 'related_event_id'],
    ['team_notes', 'event_id'],
    ['team_notes', 'commitments'],
  ];
  for (const [table, column] of expectedColumns) {
    assert.match(
      migrationSource,
      new RegExp(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}"`),
      `falta ADD COLUMN IF NOT EXISTS ${table}.${column}`,
    );
  }
});

test('NO recrea objetos que ya existían en producción antes de esta fase (evita el desync de journal)', () => {
  // Estos objetos ya existían en la BD real (finance/grok-connector/etc. de fases
  // anteriores); drizzle-kit generate los incluyó por error porque el snapshot
  // estaba desincronizado. El archivo aplicado a producción NO debe recrearlos.
  assert.doesNotMatch(migrationSource, /CREATE TABLE[^\n]*"conversation_ai_summaries"/);
  assert.doesNotMatch(migrationSource, /CREATE TABLE[^\n]*"grok_connector_credentials"/);
  assert.doesNotMatch(migrationSource, /CREATE TABLE[^\n]*"grok_connector_oauth_clients"/);
  assert.doesNotMatch(migrationSource, /CREATE TABLE[^\n]*"read_only_api_tokens"/);
  assert.doesNotMatch(migrationSource, /CREATE TABLE[^\n]*"team_financial_receipts"/);
  // team_financial_entries ya existía: solo debe recibir ALTER TABLE ADD COLUMN,
  // nunca un CREATE TABLE completo (eso rompería porque la tabla ya existe con datos).
  assert.doesNotMatch(migrationSource, /CREATE TABLE[^\n]*"team_financial_entries"/);
  assert.doesNotMatch(migrationSource, /ADD COLUMN[^\n]*"visibility"/);
  assert.doesNotMatch(migrationSource, /"funnel_stage_group_id"/);
});

test('las foreign keys nuevas apuntan a las tablas correctas', () => {
  assert.match(migrationSource, /"team_financial_entries_sale_id_team_sales_id_fk" FOREIGN KEY \("sale_id"\) REFERENCES "public"\."team_sales"\("id"\)/);
  assert.match(migrationSource, /"team_financial_entries_project_id_team_task_projects_id_fk" FOREIGN KEY \("project_id"\) REFERENCES "public"\."team_task_projects"\("id"\)/);
  assert.match(migrationSource, /"team_financial_entries_account_id_team_financial_accounts_id_fk" FOREIGN KEY \("account_id"\) REFERENCES "public"\."team_financial_accounts"\("id"\)/);
  assert.match(migrationSource, /"team_financial_entries_cost_center_id_team_cost_centers_id_fk" FOREIGN KEY \("cost_center_id"\) REFERENCES "public"\."team_cost_centers"\("id"\)/);
  assert.match(migrationSource, /"team_notes_event_id_team_events_id_fk" FOREIGN KEY \("event_id"\) REFERENCES "public"\."team_events"\("id"\)/);
});

test('todas las tablas nuevas quedan indexadas por teamId (o por la columna que las vincula al team)', () => {
  assert.match(migrationSource, /CREATE INDEX IF NOT EXISTS "team_financial_accounts_team_active_idx" ON "team_financial_accounts" USING btree \("team_id","is_active"\)/);
  assert.match(migrationSource, /CREATE INDEX IF NOT EXISTS "team_cost_centers_team_active_idx" ON "team_cost_centers" USING btree \("team_id","is_active"\)/);
  assert.match(migrationSource, /CREATE INDEX IF NOT EXISTS "team_budgets_team_period_idx" ON "team_budgets" USING btree \("team_id","period_start","period_end"\)/);
  assert.match(migrationSource, /CREATE INDEX IF NOT EXISTS "team_financial_entry_payments_team_paid_on_idx" ON "team_financial_entry_payments" USING btree \("team_id","paid_on"\)/);
  assert.match(migrationSource, /CREATE INDEX IF NOT EXISTS "team_event_participants_event_idx" ON "team_event_participants" USING btree \("event_id"\)/);
});
