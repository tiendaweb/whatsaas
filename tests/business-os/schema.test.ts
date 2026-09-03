import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

let schemaSource: string;

test.before(async () => {
  schemaSource = await readFile('lib/db/schema.ts', 'utf8');
});

test('declara las tablas nuevas de Finanzas Fase 1', () => {
  assert.match(schemaSource, /export const teamFinancialAccounts = pgTable\(\s*"team_financial_accounts"/);
  assert.match(schemaSource, /export const teamCostCenters = pgTable\(\s*"team_cost_centers"/);
  assert.match(schemaSource, /export const teamBudgets = pgTable\(\s*"team_budgets"/);
  assert.match(schemaSource, /export const teamFinancialEntryPayments = pgTable\(\s*"team_financial_entry_payments"/);
  assert.match(schemaSource, /export const teamExchangeRates = pgTable\(\s*"team_exchange_rates"/);
});

test('declara la tabla nueva de participantes de reunión', () => {
  assert.match(schemaSource, /export const teamEventParticipants = pgTable\(\s*"team_event_participants"/);
});

test('cada tabla nueva de Fase 1 tiene teamId con FK cascade a teams (tenant-scoped)', () => {
  const tables = [
    'teamFinancialAccounts',
    'teamCostCenters',
    'teamBudgets',
    'teamFinancialEntryPayments',
    'teamExchangeRates',
    'teamEventParticipants',
  ];
  for (const table of tables) {
    const start = schemaSource.indexOf(`export const ${table} = pgTable(`);
    assert.ok(start >= 0, `no se encontró la tabla ${table}`);
    const slice = schemaSource.slice(start, start + 800);
    assert.match(
      slice,
      /teamId: integer\("team_id"\)\.notNull\(\)\.references\(\(\) => teams\.id, \{ onDelete: "cascade" \}\)/,
      `${table} debe filtrar por teamId con onDelete cascade`,
    );
  }
});

test('team_financial_entries suma las relaciones opcionales de Fase 1 (sale, project, account, cost center)', () => {
  const start = schemaSource.indexOf('export const teamFinancialEntries = pgTable(');
  assert.ok(start >= 0);
  const slice = schemaSource.slice(start, start + 3000);
  assert.match(slice, /saleId: integer\("sale_id"\)\.references\(\(\) => teamSales\.id, \{ onDelete: "set null" \}\)/);
  assert.match(slice, /projectId: integer\("project_id"\)\.references\(\(\) => teamTaskProjects\.id, \{ onDelete: "set null" \}\)/);
  assert.match(slice, /accountId: integer\("account_id"\)\.references\(\(\) => teamFinancialAccounts\.id, \{ onDelete: "set null" \}\)/);
  assert.match(slice, /costCenterId: integer\("cost_center_id"\)\.references\(\(\) => teamCostCenters\.id, \{ onDelete: "set null" \}\)/);
});

test('team_events gana kind/subtype/outcome/nextAction/customerId/relatedEventId', () => {
  const start = schemaSource.indexOf('export const teamEvents = pgTable(');
  assert.ok(start >= 0);
  const slice = schemaSource.slice(start, start + 2200);
  assert.match(slice, /kind: varchar\("kind", \{ length: 20 \}\)\.\$type<"meeting" \| "call">\(\)\.notNull\(\)\.default\("meeting"\)/);
  assert.match(slice, /subtype: varchar\("subtype", \{ length: 40 \}\)/);
  assert.match(slice, /outcome: text\("outcome"\)\.notNull\(\)\.default\(""\)/);
  assert.match(slice, /nextAction: text\("next_action"\)\.notNull\(\)\.default\(""\)/);
  assert.match(slice, /customerId: integer\("customer_id"\)\.references\(\(\) => teamCustomers\.id/);
  assert.match(slice, /relatedEventId: integer\("related_event_id"\)\.references\(\(\): AnyPgColumn => teamEvents\.id/);
});

test('team_notes gana eventId y commitments para funcionar como Meeting Note', () => {
  const start = schemaSource.indexOf('export const teamNotes = pgTable(');
  assert.ok(start >= 0);
  const slice = schemaSource.slice(start, start + 1800);
  assert.match(slice, /eventId: integer\("event_id"\)\.references\(\(\): AnyPgColumn => teamEvents\.id/);
  assert.match(slice, /commitments: jsonb\("commitments"\)/);
  assert.match(slice, /\.\$type<NoteCommitment\[\]>\(\)/);
  assert.match(schemaSource, /export type NoteCommitment = \{[^}]*taskItemId\?: number[^}]*\}/);
});
