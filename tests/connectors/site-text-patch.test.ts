import assert from 'node:assert/strict';
import test from 'node:test';
import { applyExactTextPatches } from '../../lib/plugins/sites/server/text-patch';

test('applies ordered exact patches without touching surrounding code', () => {
  const source = 'const mode = "draft";\nexport const enabled = false;\n';
  const result = applyExactTextPatches(source, [
    { search: '"draft"', replace: '"published"', expectedOccurrences: 1 },
    { search: 'enabled = false', replace: 'enabled = true', expectedOccurrences: 1 },
  ]);
  assert.equal(result, 'const mode = "published";\nexport const enabled = true;\n');
});

test('rejects stale or ambiguous patch anchors', () => {
  assert.throws(
    () => applyExactTextPatches('button(); button();', [{ search: 'button()', replace: 'link()' }]),
    /esperaba 1 coincidencia.*encontró 2/,
  );
});

test('can intentionally replace a known number of matches', () => {
  assert.equal(
    applyExactTextPatches('a + a + b', [{ search: 'a', replace: 'x', expectedOccurrences: 2 }]),
    'x + x + b',
  );
});
