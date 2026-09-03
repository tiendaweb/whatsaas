import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRadarAppHref,
  parseRadarAppContext,
  parseRadarAppDeepLink,
} from '../../lib/plugins/radar/shared/app-link';
import {
  radarAppDefinitionSchema,
  type RadarAppDefinition,
} from '../../lib/plugins/radar/shared/engine';
import { validateRadarAppDefinition } from '../../lib/plugins/radar/server/engine/validate';

function definitionWithAction(action: NonNullable<RadarAppDefinition['actions']>[number]): RadarAppDefinition {
  return {
    name: 'App origen',
    defaultView: 'inicio',
    actions: [action],
    views: [{
      slug: 'inicio',
      name: 'Inicio',
      components: [{
        id: 'acceso',
        blocks: [{ type: 'text', body: 'Abrir destino' }],
        actions: [action.key],
      }],
    }],
  };
}

test('builds and parses a safe RADAR inter-app deep-link with business context', () => {
  const href = buildRadarAppHref({
    appSlug: 'produccion',
    view: 'cliente',
    sourceApp: 'business-woman',
    context: { customerId: 42, urgent: true },
  });

  if (!href) throw new Error('expected a valid RADAR app href');
  const url = new URL(href, 'https://whatspro.uno');
  assert.deepEqual(parseRadarAppDeepLink(url.searchParams), {
    appSlug: 'produccion',
    view: 'cliente',
    context: { sourceApp: 'business-woman', customerId: 42, urgent: true },
  });
});

test('rejects malformed or oversized app context', () => {
  assert.equal(parseRadarAppContext('{bad-json'), null);
  assert.equal(parseRadarAppContext(JSON.stringify({ nested: { id: 1 } })), null);
  assert.equal(
    parseRadarAppContext(JSON.stringify(Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`key${index}`, index])))),
    null,
  );
});

test('open_app is part of the declarative contract and validates its target', () => {
  const valid = definitionWithAction({
    key: 'abrir-produccion',
    kind: 'open_app',
    label: 'Abrir producción',
    appSlug: 'produccion',
    view: 'cliente',
    context: { customerId: 42 },
  });
  assert.equal(radarAppDefinitionSchema.safeParse(valid).success, true);
  assert.equal(validateRadarAppDefinition(valid).ok, true);

  const missingTarget = definitionWithAction({
    key: 'abrir-produccion',
    kind: 'open_app',
    label: 'Abrir producción',
  });
  const validation = validateRadarAppDefinition(missingTarget);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors[0]?.path, '/actions/0/appSlug');
});
