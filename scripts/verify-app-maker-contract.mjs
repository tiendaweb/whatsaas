import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['lib/plugins/app-maker/shared/contract.ts'],
  absWorkingDir: process.cwd(),
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node22',
});
const source = bundle.outputFiles[0].text;
const contract = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const registryBundle = await build({
  entryPoints: ['lib/plugins/app-maker/shared/registries.ts'],
  absWorkingDir: process.cwd(),
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node22',
});
const registries = await import(`data:text/javascript;base64,${Buffer.from(registryBundle.outputFiles[0].text).toString('base64')}`);

const definition = {
  runtime: 'app-maker-v1',
  name: 'Operaciones internas',
  slug: 'operaciones-internas',
  icon: 'Blocks',
  category: 'Operaciones',
  theme: { accent: 'blue', density: 'compact' },
  design: { template: 'swiss-grid' },
  navigation: { desktop: 'sidebar', mobile: 'bottom', defaultView: 'principal' },
  connectors: [{ key: 'app-maker', type: 'internal', label: 'Datos de la aplicación' }],
  entities: [],
  dataModel: {
    entities: [
      { key: 'clientes', name: 'Cliente', titleField: 'nombre', fields: [{ key: 'nombre', label: 'Nombre', type: 'text', required: true }] },
      { key: 'ordenes', name: 'Orden', titleField: 'numero', fields: [{ key: 'numero', label: 'Número', type: 'text', required: true, unique: true }, { key: 'total', label: 'Total', type: 'currency' }] },
    ],
    relations: [{ key: 'cliente', label: 'Cliente', source: { kind: 'entity', key: 'ordenes' }, target: { kind: 'entity', key: 'clientes' }, type: 'belongs-to', onDelete: 'restrict' }],
  },
  dataSources: [{ key: 'ordenes', resource: 'app:ordenes', include: ['cliente'], pageSize: 25 }],
  actions: [
    { key: 'crear-orden', label: 'Crear orden', connector: 'app-maker', operation: 'appmaker_create_record', inputDefaults: { entityKey: 'ordenes' }, scope: 'form' },
    { key: 'eliminar-orden', label: 'Eliminar orden', connector: 'app-maker', operation: 'appmaker_delete_record', inputDefaults: { entityKey: 'ordenes' }, inputBindings: { recordId: '{{row.id}}' }, scope: 'record', tone: 'destructive', confirmation: '¿Eliminar esta orden?' },
  ],
  workflows: [{ key: 'alta-orden', name: 'Alta de orden', trigger: { type: 'record-created', entity: 'ordenes' }, steps: [{ action: 'crear-orden' }] }],
  views: [{ slug: 'principal', name: 'Principal', type: 'table', sections: [{ id: 'datos', layout: 'grid', blocks: [{ id: 'tabla', type: 'table', dataSource: 'ordenes' }] }] }],
  permissions: {},
  metadata: {},
};

definition.views[0].sections[0].blocks.push(
  { id: 'grafico', type: 'chart', dataSource: 'ordenes', chart: { variant: 'bar', categoryField: 'numero', valueFields: ['total'] } },
  { id: 'progreso', type: 'progress', dataSource: 'ordenes', progress: { valueField: 'total', max: 100 } },
  { id: 'cronologia', type: 'timeline', dataSource: 'ordenes', timeline: { titleField: 'numero', dateField: 'createdAt' } },
  { id: 'calendario', type: 'calendar', dataSource: 'ordenes', calendar: { titleField: 'numero', dateField: 'createdAt' } },
  { id: 'galeria', type: 'gallery', dataSource: 'ordenes', gallery: { mediaField: 'image', columns: 3 } },
  { id: 'encabezado', type: 'heading', heading: { text: 'Órdenes', level: 'h2' } },
  { id: 'aviso', type: 'callout', callout: { text: 'Revisá los datos antes de guardar.', tone: 'info' } },
  { id: 'separador', type: 'divider' },
  { id: 'espacio', type: 'spacer', spacer: { size: 'md' } },
  { id: 'imagen', type: 'image', media: { src: 'https://example.com/image.jpg', alt: 'Referencia' } },
  { id: 'video', type: 'video', media: { src: 'https://example.com/video.mp4', controls: true } },
  { id: 'formulario', type: 'form', action: 'crear-orden', form: { presentation: 'wizard', columns: 2, submitLabel: 'Guardar', fields: [{ key: 'numero', label: 'Número', type: 'text', required: true }, { key: 'total', label: 'Total', type: 'currency' }], steps: [{ id: 'datos', title: 'Datos', fields: ['numero'] }, { id: 'importe', title: 'Importe', fields: ['total'] }] } },
);

const parsed = contract.applicationDefinitionSchema.safeParse(definition);
assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
assert.equal(parsed.data.dataModel.entities.length, 2);
assert.equal(parsed.data.actions[0].refresh, true);
assert.equal(parsed.data.dataSources[0].include[0], 'cliente');
assert.equal(parsed.data.design.template, 'swiss-grid');
assert.equal(parsed.data.views[0].sections[0].blocks.length, 13);
assert.equal(registries.APP_MAKER_BLOCK_REGISTRY.length, 19);
assert.equal(registries.APP_MAKER_FORM_FIELD_TYPE_REGISTRY.length, 32);
assert.equal(registries.APP_MAKER_CHART_TYPE_REGISTRY.length, 7);
assert.equal(registries.APP_MAKER_FORM_PRESENTATION_REGISTRY.length, 4);
assert.equal(registries.APP_MAKER_DESIGN_TEMPLATE_REGISTRY.length, 5);

const unknownRelation = structuredClone(definition);
unknownRelation.dataSources[0].include = ['no-existe'];
assert.equal(contract.applicationDefinitionSchema.safeParse(unknownRelation).success, false);

const unsafeDelete = structuredClone(definition);
delete unsafeDelete.actions[1].confirmation;
assert.equal(contract.applicationDefinitionSchema.safeParse(unsafeDelete).success, false);

const duplicateField = structuredClone(definition);
duplicateField.dataModel.entities[0].fields.push({ key: 'nombre', label: 'Otro nombre', type: 'text' });
assert.equal(contract.applicationDefinitionSchema.safeParse(duplicateField).success, false);

const unknownDesign = structuredClone(definition);
unknownDesign.design.template = 'unknown-design';
assert.equal(contract.applicationDefinitionSchema.safeParse(unknownDesign).success, false);

const wizardWithoutSteps = structuredClone(definition);
delete wizardWithoutSteps.views[0].sections[0].blocks.find((block) => block.id === 'formulario').form.steps;
assert.equal(contract.applicationDefinitionSchema.safeParse(wizardWithoutSteps).success, false);

const unknownOptionsSource = structuredClone(definition);
unknownOptionsSource.views[0].sections[0].blocks.find((block) => block.id === 'formulario').form.fields[0].optionsDataSource = 'missing-source';
assert.equal(contract.applicationDefinitionSchema.safeParse(unknownOptionsSource).success, false);

console.log('APP MAKER contract verification passed.');
