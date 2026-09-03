import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_DOCUMENT_PORTAL,
  documentPortalDefinitionSchema,
} from '../../lib/plugins/documents/shared/portal';

test('el portal predeterminado cumple el contrato declarativo', () => {
  const result = documentPortalDefinitionSchema.safeParse(DEFAULT_DOCUMENT_PORTAL);
  assert.equal(result.success, true);
});

test('una fuente manual conserva el orden explícito de documentos', () => {
  const parsed = documentPortalDefinitionSchema.parse({
    ...DEFAULT_DOCUMENT_PORTAL,
    views: [{
      id: 'operaciones',
      name: 'Operaciones',
      icon: 'folder-kanban',
      sections: [{
        id: 'manuales',
        title: 'Manuales',
        layout: 'list',
        source: { kind: 'manual', documentIds: [19, 4, 27] },
      }],
    }],
    defaultViewId: 'operaciones',
  });

  const source = parsed.views[0].sections[0].source;
  assert.equal(source.kind, 'manual');
  if (source.kind === 'manual') assert.deepEqual(source.documentIds, [19, 4, 27]);
});

test('rechaza vistas duplicadas y documentos repetidos en una sección', () => {
  const result = documentPortalDefinitionSchema.safeParse({
    ...DEFAULT_DOCUMENT_PORTAL,
    views: [
      {
        id: 'inicio',
        name: 'Uno',
        icon: 'home',
        sections: [{ id: 'docs', title: 'Docs', layout: 'grid', source: { kind: 'manual', documentIds: [1, 1] } }],
      },
      {
        id: 'inicio',
        name: 'Dos',
        icon: 'files',
        sections: [{ id: 'docs', title: 'Docs', layout: 'grid', source: { kind: 'recent', limit: 4 } }],
      },
    ],
  });

  assert.equal(result.success, false);
});
