import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(path, 'utf8');

test('los motores internos resuelven el prompt activo del equipo', () => {
  const radar = source('lib/plugins/sales-ops/server/radar.ts');
  const focus = source('lib/plugins/sales-ops/server/focus.ts');
  const suggestions = source('lib/plugins/sales-ops/server/suggestions.ts');
  const runner = source('lib/plugins/sales-ops/server/skill-runner.ts');
  const tasks = source('lib/plugins/tasks/server/production-os.ts');
  assert.match(radar, /getActivePrompt\(teamId, SALES_OPS_PROMPT_KEYS\.radar\)/);
  assert.match(focus, /getPromptForDefinition\(teamId/);
  assert.match(suggestions, /key: 'sales-ops\.suggestions'/);
  assert.match(runner, /key: 'sales-ops\.skill-api'/);
  assert.match(tasks, /getTeamSystemPrompt\(teamId/);
  assert.match(tasks, /key: 'tasks\.production-execute'/);
});

test('Prompt Studio expone documentos versionados por módulo y equipo', () => {
  const catalog = source('lib/plugins/sales-ops/server/system-prompts.ts');
  const api = source('app/api/plugins/sales-ops/prompts/system/[key]/route.ts');
  assert.match(catalog, /SYSTEM_PROMPT_MODULES/);
  assert.match(catalog, /SALES_OPS_SYSTEM_PROMPT_SAVED/);
  assert.match(catalog, /status: 'retired'/);
  assert.match(api, /salesOpsWrite/);
  assert.match(api, /expectedVersion/);
  assert.match(catalog, /label: 'Tareas OS'/);
});
