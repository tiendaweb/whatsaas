import { z } from 'zod';
import { APP_MAKER_ACTION_POLICY_MAP, APP_MAKER_CONNECTOR_KEYS } from './connector-policies';
import { APP_MAKER_DESIGN_TEMPLATE_KEYS } from './design-templates';

/**
 * Public contract for APP MAKER applications.
 *
 * This contract deliberately does not import Radar or Mini Apps. Those products
 * may consume or adapt the contract later, but an APP MAKER definition remains
 * portable and understandable on its own.
 */
export const APP_MAKER_RUNTIME = 'app-maker-v1' as const;
export const APP_MAKER_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,47}$/;

const slug = z
  .string()
  .trim()
  .regex(APP_MAKER_SLUG_REGEX, 'Usá entre 2 y 48 caracteres: minúsculas, números y guiones.');

export const appStatusSchema = z.enum(['draft', 'preview', 'published', 'archived']);
export type AppStatus = z.infer<typeof appStatusSchema>;

export const appViewTypeSchema = z.enum([
  'dashboard',
  'table',
  'list',
  'kanban',
  'calendar',
  'timeline',
  'detail',
  'form',
  'analytics',
  'activity-feed',
  'inbox',
  'chat',
  'pipeline',
  'gallery',
  'profile',
  'command-center',
]);
export type AppViewType = z.infer<typeof appViewTypeSchema>;

export const appNavigationPatternSchema = z.enum([
  'sidebar',
  'topbar',
  'tabs',
  'split',
  'hybrid',
  'bottom',
  'drawer',
  'stacked',
]);
export type AppNavigationPattern = z.infer<typeof appNavigationPatternSchema>;

const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);

export const appAudienceSchema = z.object({
  roles: z.array(z.enum(['owner', 'admin', 'agent'])).max(3).optional(),
  userIds: z.array(z.number().int().positive()).max(100).optional(),
});
export type AppAudience = z.infer<typeof appAudienceSchema>;

export const appFieldTypeSchema = z.enum([
  'text', 'long-text', 'rich-text', 'number', 'currency', 'percent', 'boolean',
  'date', 'datetime', 'duration', 'email', 'phone', 'url', 'status', 'select',
  'multi-select', 'user', 'department', 'relation', 'image', 'file', 'audio',
  'video', 'formula', 'lookup', 'rollup',
]);
export type AppFieldType = z.infer<typeof appFieldTypeSchema>;

const appFieldOptionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: scalar,
  color: z.string().trim().max(32).optional(),
});

export const appEntityFieldSchema = z.object({
  key: slug,
  label: z.string().trim().min(1).max(100),
  type: appFieldTypeSchema,
  description: z.string().trim().max(240).optional(),
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  options: z.array(appFieldOptionSchema).max(100).optional(),
  validation: z.object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    pattern: z.string().max(240).optional(),
  }).optional(),
  relation: slug.optional(),
  computed: z.object({
    expression: z.string().trim().min(1).max(1000).optional(),
    relation: slug.optional(),
    field: z.string().trim().max(80).optional(),
    operation: z.enum(['count', 'sum', 'avg', 'min', 'max', 'first', 'join']).optional(),
  }).optional(),
  permissions: z.object({
    read: appAudienceSchema.optional(),
    write: appAudienceSchema.optional(),
  }).default({}),
  sensitive: z.boolean().default(false),
  hidden: z.boolean().default(false),
});
export type AppEntityFieldDefinition = z.infer<typeof appEntityFieldSchema>;

const appEntityOperationPermissionsSchema = z.object({
  read: appAudienceSchema.optional(),
  create: appAudienceSchema.optional(),
  update: appAudienceSchema.optional(),
  delete: appAudienceSchema.optional(),
}).default({});

export const appEntitySchema = z.object({
  key: slug,
  name: z.string().trim().min(1).max(100),
  pluralName: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().max(60).optional(),
  titleField: slug,
  fields: z.array(appEntityFieldSchema).min(1).max(80),
  permissions: appEntityOperationPermissionsSchema,
  timestamps: z.boolean().default(true),
}).superRefine((entity, context) => {
  const keys = new Set<string>();
  for (const [index, field] of entity.fields.entries()) {
    if (keys.has(field.key)) context.addIssue({ code: 'custom', path: ['fields', index, 'key'], message: `Campo duplicado: ${field.key}.` });
    keys.add(field.key);
  }
  if (!keys.has(entity.titleField)) context.addIssue({ code: 'custom', path: ['titleField'], message: 'El campo de título no existe.' });
});
export type AppEntityDefinition = z.infer<typeof appEntitySchema>;

export const appRelationSchema = z.object({
  key: slug,
  label: z.string().trim().min(1).max(100),
  inverseLabel: z.string().trim().max(100).optional(),
  source: z.object({ kind: z.literal('entity'), key: slug }),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('entity'), key: slug }),
    z.object({ kind: z.literal('resource'), key: z.string().trim().min(1).max(80) }),
  ]),
  type: z.enum(['belongs-to', 'has-many', 'many-to-many', 'one-to-one', 'parent-child', 'polymorphic']),
  onDelete: z.enum(['restrict', 'cascade', 'unlink']).default('unlink'),
  required: z.boolean().default(false),
});
export type AppRelationDefinition = z.infer<typeof appRelationSchema>;

export const appDataModelSchema = z.object({
  entities: z.array(appEntitySchema).max(30).default([]),
  relations: z.array(appRelationSchema).max(80).default([]),
}).default({ entities: [], relations: [] });
export type AppDataModelDefinition = z.infer<typeof appDataModelSchema>;

export const appDataFilterSchema = z.object({
  field: z.string().trim().min(1).max(80),
  operator: z.enum(['eq', 'neq', 'contains', 'starts-with', 'gt', 'gte', 'lt', 'lte', 'in', 'is-empty']).default('eq'),
  value: scalar,
});

export const appDataSourceSchema = z.object({
  key: slug,
  resource: z.string().trim().min(1).max(80),
  filters: z.array(appDataFilterSchema).max(12).optional(),
  search: z.string().trim().max(200).optional(),
  pageSize: z.number().int().min(1).max(100).default(25),
  fields: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  sort: z.array(z.object({ field: z.string().trim().min(1).max(80), direction: z.enum(['asc', 'desc']).default('asc') })).max(5).optional(),
  include: z.array(slug).max(10).optional(),
});
export type AppDataSourceDefinition = z.infer<typeof appDataSourceSchema>;

export const appInputBindingSchema = z.union([
  z.string().trim().min(1).max(500),
  z.object({
    source: z.enum(['form', 'row', 'selected', 'route', 'currentUser', 'team', 'dataSource', 'actionResult', 'literal']),
    path: z.string().trim().max(160).optional(),
    value: z.unknown().optional(),
    fallback: z.unknown().optional(),
  }),
]);
export type AppInputBinding = z.infer<typeof appInputBindingSchema>;

export const appActionSchema = z.object({
  key: slug,
  label: z.string().trim().min(1).max(80),
  connector: z.string().trim().min(1).max(80),
  operation: z.string().trim().min(1).max(120),
  icon: z.string().trim().max(60).optional(),
  tone: z.enum(['primary', 'secondary', 'destructive']).default('primary'),
  inputDefaults: z.record(z.string().max(80), z.unknown()).optional(),
  inputBindings: z.record(z.string().max(80), appInputBindingSchema).optional(),
  scope: z.enum(['global', 'record', 'form']).default('global'),
  confirmation: z.string().trim().max(240).optional(),
  refresh: z.boolean().default(true),
});
export type AppActionDefinition = z.infer<typeof appActionSchema>;

export const appFormFieldTypeSchema = z.enum([
  'text', 'textarea', 'rich-text', 'password', 'search', 'number', 'currency', 'percent',
  'date', 'datetime', 'time', 'month', 'week', 'email', 'phone', 'url', 'color', 'range',
  'checkbox', 'toggle', 'radio', 'select', 'multi-select', 'rating', 'user', 'department',
  'relation', 'file', 'image', 'audio', 'video', 'hidden',
]);
export type AppFormFieldType = z.infer<typeof appFormFieldTypeSchema>;

export const appFormFieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(100),
  type: appFormFieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(160).optional(),
  helpText: z.string().trim().max(240).optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(z.object({ label: z.string().max(80), value: scalar })).max(40).optional(),
  optionsDataSource: slug.optional(),
  relation: slug.optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  step: z.number().positive().optional(),
  minLength: z.number().int().min(0).max(20_000).optional(),
  maxLength: z.number().int().min(1).max(20_000).optional(),
  pattern: z.string().max(240).optional(),
  prefix: z.string().trim().max(20).optional(),
  suffix: z.string().trim().max(20).optional(),
  accept: z.string().trim().max(200).optional(),
  multiple: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  disabled: z.boolean().optional(),
  width: z.enum(['full', 'half', 'third', 'quarter']).optional(),
  visibleWhen: z.object({
    field: z.string().trim().min(1).max(80),
    operator: z.enum(['eq', 'neq', 'contains', 'truthy', 'falsy']),
    value: scalar.optional(),
  }).optional(),
});
export type AppFormFieldDefinition = z.infer<typeof appFormFieldSchema>;

const appGridSchema = z.object({
  desktop: z.number().int().min(1).max(12).default(6),
  tablet: z.number().int().min(1).max(12).default(12),
  mobile: z.number().int().min(1).max(12).default(12),
});

export const appBlockSchema = z.object({
  id: slug,
  type: z.enum([
    'metric', 'table', 'list', 'kanban', 'detail', 'chart', 'progress', 'timeline',
    'calendar', 'gallery', 'text', 'heading', 'callout', 'divider', 'spacer', 'image',
    'video', 'form', 'actions',
  ]),
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().max(60).optional(),
  dataSource: slug.optional(),
  action: slug.optional(),
  actions: z.array(slug).max(8).optional(),
  fields: z.array(z.string().trim().min(1).max(80)).max(16).optional(),
  groupBy: z.string().trim().max(80).optional(),
  metric: z.object({
    operation: z.enum(['count', 'sum', 'avg', 'min', 'max']).default('count'),
    field: z.string().trim().max(80).optional(),
    format: z.enum(['number', 'currency', 'percent']).default('number'),
    currency: z.string().trim().length(3).optional(),
  }).optional(),
  chart: z.object({
    variant: z.enum(['bar', 'line', 'area', 'pie', 'donut', 'radar', 'scatter']).default('bar'),
    categoryField: z.string().trim().min(1).max(80),
    valueFields: z.array(z.string().trim().min(1).max(80)).min(1).max(6),
    stacked: z.boolean().default(false),
    showLegend: z.boolean().default(true),
    showGrid: z.boolean().default(true),
  }).optional(),
  progress: z.object({
    valueField: z.string().trim().min(1).max(80),
    labelField: z.string().trim().max(80).optional(),
    max: z.number().positive().default(100),
    format: z.enum(['number', 'percent', 'currency']).default('percent'),
    currency: z.string().trim().length(3).optional(),
  }).optional(),
  timeline: z.object({
    titleField: z.string().trim().min(1).max(80),
    dateField: z.string().trim().min(1).max(80),
    descriptionField: z.string().trim().max(80).optional(),
    statusField: z.string().trim().max(80).optional(),
  }).optional(),
  calendar: z.object({
    titleField: z.string().trim().min(1).max(80),
    dateField: z.string().trim().min(1).max(80),
    endDateField: z.string().trim().max(80).optional(),
    colorField: z.string().trim().max(80).optional(),
  }).optional(),
  gallery: z.object({
    mediaField: z.string().trim().min(1).max(80),
    titleField: z.string().trim().max(80).optional(),
    descriptionField: z.string().trim().max(80).optional(),
    columns: z.number().int().min(1).max(6).default(3),
    fit: z.enum(['cover', 'contain']).default('cover'),
  }).optional(),
  text: z.string().max(20_000).optional(),
  heading: z.object({
    text: z.string().trim().min(1).max(240),
    level: z.enum(['h1', 'h2', 'h3', 'h4']).default('h2'),
    eyebrow: z.string().trim().max(100).optional(),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }).optional(),
  callout: z.object({
    text: z.string().trim().min(1).max(2000),
    tone: z.enum(['info', 'success', 'warning', 'danger', 'neutral']).default('info'),
  }).optional(),
  media: z.object({
    src: z.string().trim().url().max(2000).optional(),
    srcField: z.string().trim().max(80).optional(),
    alt: z.string().trim().max(240).optional(),
    caption: z.string().trim().max(300).optional(),
    fit: z.enum(['cover', 'contain']).default('cover'),
    aspectRatio: z.enum(['square', 'video', 'wide', 'auto']).default('video'),
    controls: z.boolean().default(true),
  }).optional(),
  spacer: z.object({ size: z.enum(['sm', 'md', 'lg', 'xl']).default('md') }).optional(),
  form: z.object({
    fields: z.array(appFormFieldSchema).min(1).max(30),
    submitLabel: z.string().trim().min(1).max(80).default('Guardar'),
    presentation: z.enum(['standard', 'compact', 'inline', 'wizard']).optional(),
    columns: z.number().int().min(1).max(4).optional(),
    steps: z.array(z.object({
      id: slug,
      title: z.string().trim().min(1).max(100),
      description: z.string().trim().max(240).optional(),
      fields: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
    })).min(2).max(8).optional(),
    successMessage: z.string().trim().max(200).optional(),
    resetAfterSubmit: z.boolean().optional(),
  }).optional(),
  grid: appGridSchema.default({ desktop: 6, tablet: 12, mobile: 12 }),
  mobilePriority: z.number().int().min(0).max(100).default(50),
  hidden: z.boolean().default(false),
  collapsible: z.boolean().default(false),
  sticky: z.boolean().default(false),
}).superRefine((block, context) => {
  if (['metric', 'table', 'list', 'kanban', 'detail', 'chart', 'progress', 'timeline', 'calendar', 'gallery'].includes(block.type) && !block.dataSource) {
    context.addIssue({ code: 'custom', path: ['dataSource'], message: `${block.type} necesita dataSource.` });
  }
  if (block.type === 'form' && (!block.action || !block.form)) {
    context.addIssue({ code: 'custom', path: ['form'], message: 'form necesita action y campos.' });
  }
  if (block.type === 'text' && !block.text) {
    context.addIssue({ code: 'custom', path: ['text'], message: 'text necesita contenido.' });
  }
  if (block.type === 'chart' && !block.chart) context.addIssue({ code: 'custom', path: ['chart'], message: 'chart necesita configuración.' });
  if (block.type === 'progress' && !block.progress) context.addIssue({ code: 'custom', path: ['progress'], message: 'progress necesita configuración.' });
  if (block.type === 'timeline' && !block.timeline) context.addIssue({ code: 'custom', path: ['timeline'], message: 'timeline necesita configuración.' });
  if (block.type === 'calendar' && !block.calendar) context.addIssue({ code: 'custom', path: ['calendar'], message: 'calendar necesita configuración.' });
  if (block.type === 'gallery' && !block.gallery) context.addIssue({ code: 'custom', path: ['gallery'], message: 'gallery necesita configuración.' });
  if (block.type === 'heading' && !block.heading) context.addIssue({ code: 'custom', path: ['heading'], message: 'heading necesita configuración.' });
  if (block.type === 'callout' && !block.callout) context.addIssue({ code: 'custom', path: ['callout'], message: 'callout necesita configuración.' });
  if (['image', 'video'].includes(block.type) && !block.media) context.addIssue({ code: 'custom', path: ['media'], message: `${block.type} necesita configuración de media.` });
  if (block.form?.presentation === 'wizard' && !block.form.steps?.length) context.addIssue({ code: 'custom', path: ['form', 'steps'], message: 'El formulario wizard necesita pasos.' });
  if (block.form?.steps) {
    const fieldKeys = new Set(block.form.fields.map((field) => field.key));
    const stepFields = block.form.steps.flatMap((step) => step.fields);
    for (const field of stepFields) if (!fieldKeys.has(field)) context.addIssue({ code: 'custom', path: ['form', 'steps'], message: `Campo de paso desconocido: ${field}.` });
    if (new Set(stepFields).size !== stepFields.length) context.addIssue({ code: 'custom', path: ['form', 'steps'], message: 'Un campo no puede aparecer en más de un paso.' });
  }
});
export type AppBlockDefinition = z.infer<typeof appBlockSchema>;

export const appSectionSchema = z.object({
  id: slug,
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
  layout: z.enum(['grid', 'stack', 'split']).default('grid'),
  blocks: z.array(appBlockSchema).min(1).max(40),
});
export type AppSectionDefinition = z.infer<typeof appSectionSchema>;

export const appViewSchema = z.object({
  slug,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
  icon: z.string().trim().max(60).optional(),
  type: appViewTypeSchema,
  sections: z.array(appSectionSchema).min(1).max(20),
  visibility: appAudienceSchema.optional(),
});
export type AppViewDefinition = z.infer<typeof appViewSchema>;

export const applicationDefinitionSchema = z.object({
  runtime: z.literal(APP_MAKER_RUNTIME).default(APP_MAKER_RUNTIME),
  name: z.string().trim().min(1).max(120),
  slug,
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(60).default('Blocks'),
  category: z.string().trim().max(80).default('Operaciones'),
  theme: z.object({
    accent: z.enum(['emerald', 'blue', 'violet', 'rose', 'amber', 'slate']).default('emerald'),
    density: z.enum(['comfortable', 'compact']).default('comfortable'),
  }).default({ accent: 'emerald', density: 'comfortable' }),
  design: z.object({
    template: z.enum(APP_MAKER_DESIGN_TEMPLATE_KEYS).default('adaptive-light-dark'),
  }).default({ template: 'adaptive-light-dark' }),
  navigation: z.object({
    desktop: appNavigationPatternSchema.default('sidebar'),
    mobile: appNavigationPatternSchema.default('bottom'),
    defaultView: slug,
  }),
  views: z.array(appViewSchema).min(1).max(20),
  dataSources: z.array(appDataSourceSchema).max(30).default([]),
  actions: z.array(appActionSchema).max(40).default([]),
  connectors: z.array(z.object({
    key: slug,
    type: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
  })).max(20).default([]),
  entities: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  dataModel: appDataModelSchema,
  workflows: z.array(z.object({
    key: slug,
    name: z.string().trim().min(1).max(100),
    enabled: z.boolean().default(true),
    trigger: z.object({
      type: z.enum(['manual', 'record-created', 'record-updated', 'record-deleted']),
      entity: slug.optional(),
    }),
    steps: z.array(z.object({
      action: slug,
      inputBindings: z.record(z.string().max(80), appInputBindingSchema).optional(),
      continueOnError: z.boolean().default(false),
    })).min(1).max(20),
  })).max(30).default([]),
  permissions: appAudienceSchema.default({}),
  metadata: z.record(z.string().max(80), z.unknown()).default({}),
}).superRefine((definition, context) => {
  const reportDuplicates = (values: string[], path: string, label: string) => {
    const seen = new Set<string>();
    for (const [index, value] of values.entries()) {
      if (seen.has(value)) context.addIssue({ code: 'custom', path: [path, index], message: `${label} duplicado: ${value}.` });
      seen.add(value);
    }
  };

  reportDuplicates(definition.views.map((view) => view.slug), 'views', 'Slug de vista');
  reportDuplicates(definition.dataSources.map((source) => source.key), 'dataSources', 'Data source');
  reportDuplicates(definition.actions.map((action) => action.key), 'actions', 'Acción');
  reportDuplicates(definition.connectors.map((connector) => connector.key), 'connectors', 'Conector');
  reportDuplicates(definition.dataModel.entities.map((entity) => entity.key), 'dataModel.entities', 'Entidad');
  reportDuplicates(definition.dataModel.relations.map((relation) => relation.key), 'dataModel.relations', 'Relación');
  reportDuplicates(definition.workflows.map((workflow) => workflow.key), 'workflows', 'Flujo');

  const viewSlugs = new Set(definition.views.map((view) => view.slug));
  if (!viewSlugs.has(definition.navigation.defaultView)) {
    context.addIssue({ code: 'custom', path: ['navigation', 'defaultView'], message: 'La vista inicial no existe.' });
  }
  const sourceKeys = new Set(definition.dataSources.map((source) => source.key));
  const actionKeys = new Set(definition.actions.map((action) => action.key));
  const connectorKeys = new Set(definition.connectors.map((connector) => connector.key));

  for (const [connectorIndex, connector] of definition.connectors.entries()) {
    if (!(APP_MAKER_CONNECTOR_KEYS as readonly string[]).includes(connector.key)) {
      context.addIssue({ code: 'custom', path: ['connectors', connectorIndex, 'key'], message: `Conector no soportado: ${connector.key}.` });
    }
    if (connector.type !== 'internal') {
      context.addIssue({ code: 'custom', path: ['connectors', connectorIndex, 'type'], message: 'Los conectores internos de App Maker deben usar el tipo internal.' });
    }
  }

  for (const [actionIndex, action] of definition.actions.entries()) {
    if (!connectorKeys.has(action.connector)) {
      context.addIssue({ code: 'custom', path: ['actions', actionIndex, 'connector'], message: `Conector no declarado: ${action.connector}.` });
    }
    const policy = action.connector === 'whatspro' ? APP_MAKER_ACTION_POLICY_MAP.get(action.operation) : undefined;
    const internalOperation = action.connector === 'app-maker' && ['appmaker_create_record', 'appmaker_update_record', 'appmaker_delete_record', 'appmaker_link_record', 'appmaker_unlink_record'].includes(action.operation);
    if ((!policy && !internalOperation) || !['whatspro', 'app-maker'].includes(action.connector)) {
      context.addIssue({ code: 'custom', path: ['actions', actionIndex, 'operation'], message: `Operación no permitida: ${action.operation}.` });
    }
    const destructive = policy?.destructive || (action.connector === 'app-maker' && ['appmaker_delete_record', 'appmaker_unlink_record'].includes(action.operation));
    if (destructive && (action.tone !== 'destructive' || !action.confirmation)) {
      context.addIssue({
        code: 'custom',
        path: ['actions', actionIndex],
        message: 'Las operaciones destructivas necesitan tone destructive y un mensaje de confirmación.',
      });
    }
  }

  const entityKeys = new Set(definition.dataModel.entities.map((entity) => entity.key));
  const relationKeys = new Set(definition.dataModel.relations.map((relation) => relation.key));
  for (const [relationIndex, relation] of definition.dataModel.relations.entries()) {
    if (!entityKeys.has(relation.source.key)) context.addIssue({ code: 'custom', path: ['dataModel', 'relations', relationIndex, 'source', 'key'], message: `Entidad de origen desconocida: ${relation.source.key}.` });
    if (relation.target.kind === 'entity' && !entityKeys.has(relation.target.key)) context.addIssue({ code: 'custom', path: ['dataModel', 'relations', relationIndex, 'target', 'key'], message: `Entidad de destino desconocida: ${relation.target.key}.` });
  }
  for (const [entityIndex, entity] of definition.dataModel.entities.entries()) {
    for (const [fieldIndex, field] of entity.fields.entries()) {
      const relationKey = field.relation ?? field.computed?.relation;
      if (relationKey && !relationKeys.has(relationKey)) context.addIssue({ code: 'custom', path: ['dataModel', 'entities', entityIndex, 'fields', fieldIndex, 'relation'], message: `Relación desconocida: ${relationKey}.` });
      if (relationKey && !definition.dataModel.relations.some((relation) => relation.key === relationKey && relation.source.key === entity.key)) context.addIssue({ code: 'custom', path: ['dataModel', 'entities', entityIndex, 'fields', fieldIndex, 'relation'], message: 'La relación debe salir de esta entidad.' });
    }
  }
  for (const [sourceIndex, source] of definition.dataSources.entries()) {
    if (source.resource.startsWith('app:') && !entityKeys.has(source.resource.slice(4))) {
      context.addIssue({ code: 'custom', path: ['dataSources', sourceIndex, 'resource'], message: `Entidad de App Maker desconocida: ${source.resource.slice(4)}.` });
    }
    for (const relation of source.include ?? []) {
      if (!definition.dataModel.relations.some((candidate) => candidate.key === relation)) context.addIssue({ code: 'custom', path: ['dataSources', sourceIndex, 'include'], message: `Relación desconocida: ${relation}.` });
    }
  }
  for (const [workflowIndex, workflow] of definition.workflows.entries()) {
    if (workflow.trigger.type !== 'manual' && (!workflow.trigger.entity || !entityKeys.has(workflow.trigger.entity))) {
      context.addIssue({ code: 'custom', path: ['workflows', workflowIndex, 'trigger', 'entity'], message: 'El flujo necesita una entidad válida.' });
    }
    for (const [stepIndex, step] of workflow.steps.entries()) {
      if (!actionKeys.has(step.action)) context.addIssue({ code: 'custom', path: ['workflows', workflowIndex, 'steps', stepIndex, 'action'], message: `Acción desconocida: ${step.action}.` });
    }
  }

  for (const [viewIndex, view] of definition.views.entries()) {
    reportDuplicates(
      view.sections.flatMap((section) => section.blocks.map((block) => block.id)),
      `views.${viewIndex}.blocks`,
      'ID de bloque',
    );
    for (const [sectionIndex, section] of view.sections.entries()) {
      for (const [blockIndex, block] of section.blocks.entries()) {
        const base = ['views', viewIndex, 'sections', sectionIndex, 'blocks', blockIndex] as Array<string | number>;
        if (block.dataSource && !sourceKeys.has(block.dataSource)) {
          context.addIssue({ code: 'custom', path: [...base, 'dataSource'], message: `Data source desconocido: ${block.dataSource}.` });
        }
        if (block.action && !actionKeys.has(block.action)) {
          context.addIssue({ code: 'custom', path: [...base, 'action'], message: `Acción desconocida: ${block.action}.` });
        }
        for (const action of block.actions ?? []) {
          if (!actionKeys.has(action)) {
            context.addIssue({ code: 'custom', path: [...base, 'actions'], message: `Acción desconocida: ${action}.` });
          }
        }
        for (const [fieldIndex, field] of (block.form?.fields ?? []).entries()) {
          if (field.optionsDataSource && !sourceKeys.has(field.optionsDataSource)) {
            context.addIssue({ code: 'custom', path: [...base, 'form', 'fields', fieldIndex, 'optionsDataSource'], message: `Data source desconocido: ${field.optionsDataSource}.` });
          }
        }
      }
    }
  }
});

export type ApplicationDefinition = z.infer<typeof applicationDefinitionSchema>;

export type AppMakerRecord = {
  id: number;
  slug: string;
  name: string;
  status: AppStatus;
  version: number;
  publishedVersion: number | null;
  definition: ApplicationDefinition;
  publishedDefinition: ApplicationDefinition | null;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedAppMakerView = {
  app: Pick<AppMakerRecord, 'slug' | 'name' | 'status' | 'version' | 'publishedVersion'> & {
    description?: string;
    icon: string;
    category: string;
    theme: ApplicationDefinition['theme'];
    design: ApplicationDefinition['design'];
  };
  definition: Pick<ApplicationDefinition, 'navigation' | 'views'>;
  activeView: AppViewDefinition;
  data: Record<string, { rows: Array<Record<string, unknown>>; error?: string; meta?: Record<string, unknown> }>;
  actions: AppActionDefinition[];
};
