import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['lib/plugins/grok-connector/server/app-maker-tools.ts'],
  absWorkingDir: process.cwd(),
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node20',
});
const contract = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

assert.deepEqual(contract.APP_MAKER_SCOPES, ['appmaker:read', 'appmaker:write', 'appmaker:publish', 'appmaker:media']);
assert.equal(contract.appMakerReadTools.length, 7);
assert.equal(contract.appMakerWriteTools.length, 9);
assert.equal(contract.appMakerPublishTools.length, 1);
assert.equal(contract.appMakerMediaTools.length, 3);
assert.equal(contract.appMakerTools.length, 20);

const names = contract.appMakerTools.map((tool) => tool.name);
assert.equal(new Set(names).size, names.length, 'App Maker MCP tool names must be unique');
for (const name of names) {
  assert.ok(name.startsWith('whatspro_appmaker_'), `Unexpected tool namespace: ${name}`);
  assert.ok(contract.requiredAppMakerScopes(name)?.length, `Missing scope policy: ${name}`);
}
for (const name of ['whatspro_appmaker_archive_app', 'whatspro_appmaker_delete_record', 'whatspro_appmaker_unlink_record', 'whatspro_appmaker_delete_attachment']) {
  const tool = contract.appMakerTools.find((candidate) => candidate.name === name);
  assert.equal(tool.inputSchema.properties.confirm.const, true, `${name} must require explicit confirmation`);
}
assert.deepEqual(contract.requiredAppMakerScopes('whatspro_appmaker_upload_attachment'), ['appmaker:media', 'appmaker:write']);
assert.deepEqual(contract.requiredAppMakerScopes('whatspro_appmaker_delete_attachment'), ['appmaker:media', 'appmaker:write']);
assert.deepEqual(contract.requiredAppMakerScopes('whatspro_appmaker_get_attachment'), ['appmaker:media', 'appmaker:read']);
assert.deepEqual(contract.requiredAppMakerScopes('whatspro_appmaker_publish_app'), ['appmaker:publish', 'appmaker:write']);

const [oauth, route, catalog, chatgptRoute, claudeRoute] = await Promise.all([
  readFile('lib/plugins/grok-connector/server/oauth.ts', 'utf8'),
  readFile('app/api/plugins/grok-connector/mcp/route.ts', 'utf8'),
  readFile('lib/readonly-api/catalog.ts', 'utf8'),
  readFile('app/api/plugins/chatgpt-connector/mcp/route.ts', 'utf8'),
  readFile('app/api/plugins/claude-code-connector/mcp/route.ts', 'utf8'),
]);
for (const scope of contract.APP_MAKER_SCOPES) assert.ok(oauth.includes(`'${scope}'`), `OAuth does not advertise ${scope}`);
assert.ok(route.includes('executeAppMakerTool'), 'Shared MCP route does not dispatch App Maker tools');
assert.ok(route.includes('requiredAppMakerScopes'), 'Shared MCP route does not enforce App Maker scopes');
for (const resource of ['app-maker-apps', 'app-maker-records', 'app-maker-record-links', 'app-maker-attachments']) {
  assert.ok(catalog.includes(`'${resource}'`), `Legacy read-only catalog is missing ${resource}`);
}
assert.ok(chatgptRoute.includes("grok-connector/mcp/route"), 'ChatGPT must reuse the shared MCP route');
assert.ok(claudeRoute.includes("grok-connector/mcp/route"), 'Claude Code remote must reuse the shared MCP route');
assert.ok(
  route.includes('tools: [...appTools, ...readOnlyTools, ...(context.actionsEnabled ? actionTools : [])]'),
  'App Maker tools must be announced before the large shared catalog so Claude can discover them',
);

console.log(`APP MAKER MCP verification passed: ${names.length} tools, ${contract.APP_MAKER_SCOPES.length} dedicated scopes, 3 remote connectors.`);
