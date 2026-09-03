import type { ApplicationDefinition } from './contract';
import { APP_MAKER_ACTION_POLICIES } from './connector-policies';
import { APP_MAKER_DESIGN_TEMPLATES } from './design-templates';

export const APP_MAKER_BLOCK_REGISTRY = [
  { type: 'metric', category: 'indicadores', label: 'Métrica', description: 'Conteo, suma, promedio, mínimo o máximo.', dataBound: true },
  { type: 'chart', category: 'graficos', label: 'Gráfico', description: 'Barras, líneas, área, torta, dona, radar o dispersión.', dataBound: true },
  { type: 'progress', category: 'indicadores', label: 'Progreso', description: 'Barras de avance por registro.', dataBound: true },
  { type: 'table', category: 'datos', label: 'Tabla', description: 'Datos tabulares con selección y acciones.', dataBound: true },
  { type: 'list', category: 'datos', label: 'Lista', description: 'Registros en una lista compacta.', dataBound: true },
  { type: 'detail', category: 'datos', label: 'Ficha', description: 'Detalle de un registro.', dataBound: true },
  { type: 'kanban', category: 'productividad', label: 'Kanban', description: 'Registros agrupados por estado.', dataBound: true },
  { type: 'timeline', category: 'productividad', label: 'Cronología', description: 'Eventos ordenados por fecha.', dataBound: true },
  { type: 'calendar', category: 'productividad', label: 'Calendario', description: 'Registros agrupados por día.', dataBound: true },
  { type: 'gallery', category: 'media', label: 'Galería', description: 'Colección responsive de imágenes.', dataBound: true },
  { type: 'heading', category: 'contenido', label: 'Encabezado', description: 'Título editorial con nivel y alineación.', dataBound: false },
  { type: 'text', category: 'contenido', label: 'Texto', description: 'Contenido de lectura.', dataBound: false },
  { type: 'callout', category: 'contenido', label: 'Aviso', description: 'Mensaje informativo, positivo, preventivo o crítico.', dataBound: false },
  { type: 'divider', category: 'estructura', label: 'Separador', description: 'Regla visual entre contenidos.', dataBound: false },
  { type: 'spacer', category: 'estructura', label: 'Espaciador', description: 'Control de ritmo vertical.', dataBound: false },
  { type: 'image', category: 'media', label: 'Imagen', description: 'Imagen estática o vinculada a datos.', dataBound: false },
  { type: 'video', category: 'media', label: 'Video', description: 'Reproductor de video estático o vinculado.', dataBound: false },
  { type: 'form', category: 'acciones', label: 'Formulario', description: 'Estándar, compacto, en línea o por pasos.', dataBound: false },
  { type: 'actions', category: 'acciones', label: 'Acciones rápidas', description: 'Grupo de operaciones permitidas.', dataBound: false },
] as const;

export const APP_MAKER_VIEW_REGISTRY = [
  'dashboard', 'table', 'list', 'kanban', 'calendar', 'timeline', 'detail', 'form',
  'analytics', 'activity-feed', 'inbox', 'chat', 'pipeline', 'gallery', 'profile', 'command-center',
] as const;

export const APP_MAKER_NAVIGATION_REGISTRY = {
  desktop: ['sidebar', 'topbar', 'tabs', 'split', 'hybrid'],
  mobile: ['bottom', 'drawer', 'stacked', 'tabs'],
} as const;

export const APP_MAKER_FIELD_TYPE_REGISTRY = [
  'text', 'long-text', 'rich-text', 'number', 'currency', 'percent', 'boolean',
  'date', 'datetime', 'duration', 'email', 'phone', 'url', 'status', 'select',
  'multi-select', 'user', 'department', 'relation', 'image', 'file', 'audio',
  'video', 'formula', 'lookup', 'rollup',
] as const;

export const APP_MAKER_FORM_FIELD_TYPE_REGISTRY = [
  { type: 'text', category: 'texto', label: 'Texto' },
  { type: 'textarea', category: 'texto', label: 'Texto largo' },
  { type: 'rich-text', category: 'texto', label: 'Texto enriquecido' },
  { type: 'password', category: 'texto', label: 'Contraseña' },
  { type: 'search', category: 'texto', label: 'Búsqueda' },
  { type: 'email', category: 'contacto', label: 'Correo electrónico' },
  { type: 'phone', category: 'contacto', label: 'Teléfono' },
  { type: 'url', category: 'contacto', label: 'URL' },
  { type: 'number', category: 'numero', label: 'Número' },
  { type: 'currency', category: 'numero', label: 'Moneda' },
  { type: 'percent', category: 'numero', label: 'Porcentaje' },
  { type: 'range', category: 'numero', label: 'Rango' },
  { type: 'rating', category: 'numero', label: 'Calificación' },
  { type: 'date', category: 'fecha', label: 'Fecha' },
  { type: 'datetime', category: 'fecha', label: 'Fecha y hora' },
  { type: 'time', category: 'fecha', label: 'Hora' },
  { type: 'month', category: 'fecha', label: 'Mes' },
  { type: 'week', category: 'fecha', label: 'Semana' },
  { type: 'checkbox', category: 'seleccion', label: 'Casilla' },
  { type: 'toggle', category: 'seleccion', label: 'Interruptor' },
  { type: 'radio', category: 'seleccion', label: 'Opciones visibles' },
  { type: 'select', category: 'seleccion', label: 'Selector' },
  { type: 'multi-select', category: 'seleccion', label: 'Selección múltiple' },
  { type: 'color', category: 'seleccion', label: 'Color' },
  { type: 'user', category: 'relacion', label: 'Usuario' },
  { type: 'department', category: 'relacion', label: 'Departamento' },
  { type: 'relation', category: 'relacion', label: 'Relación' },
  { type: 'file', category: 'archivo', label: 'Archivo' },
  { type: 'image', category: 'archivo', label: 'Imagen' },
  { type: 'audio', category: 'archivo', label: 'Audio' },
  { type: 'video', category: 'archivo', label: 'Video' },
  { type: 'hidden', category: 'sistema', label: 'Oculto' },
] as const;

export const APP_MAKER_CHART_TYPE_REGISTRY = [
  { type: 'bar', label: 'Barras', supportsMultipleSeries: true },
  { type: 'line', label: 'Líneas', supportsMultipleSeries: true },
  { type: 'area', label: 'Área', supportsMultipleSeries: true },
  { type: 'pie', label: 'Torta', supportsMultipleSeries: false },
  { type: 'donut', label: 'Dona', supportsMultipleSeries: false },
  { type: 'radar', label: 'Radar', supportsMultipleSeries: true },
  { type: 'scatter', label: 'Dispersión', supportsMultipleSeries: true },
] as const;

export const APP_MAKER_FORM_PRESENTATION_REGISTRY = [
  { type: 'standard', label: 'Estándar', description: 'Campos organizados en una grilla configurable.' },
  { type: 'compact', label: 'Compacto', description: 'Menor altura y separación para alta densidad.' },
  { type: 'inline', label: 'En línea', description: 'Campos y acción en una misma fila adaptable.' },
  { type: 'wizard', label: 'Por pasos', description: 'Proceso guiado con progreso y navegación.' },
] as const;

export const APP_MAKER_DESIGN_TEMPLATE_REGISTRY = APP_MAKER_DESIGN_TEMPLATES;

export const APP_MAKER_RELATION_TYPE_REGISTRY = [
  'belongs-to', 'has-many', 'many-to-many', 'one-to-one', 'parent-child', 'polymorphic',
] as const;

export const APP_MAKER_CONNECTOR_REGISTRY = [
  {
    key: 'whatspro',
    label: 'WhatsPro',
    description: 'Datos internos con scope de equipo y operaciones MCP auditadas.',
    capabilities: ['read', 'write', 'audit', 'crm', 'customers', 'memberships', 'tasks', 'documents', 'communication', 'notes', 'calendar'],
  },
  {
    key: 'app-maker',
    label: 'Datos de la aplicación',
    description: 'CRUD, relaciones, archivos y flujos sobre entidades propias de la app.',
    capabilities: ['read', 'write', 'relations', 'attachments', 'workflows', 'audit'],
  },
] as const;

/** @deprecated Prefer the richer server catalog, which also includes schemas and availability. */
export const APP_MAKER_ACTION_REGISTRY = APP_MAKER_ACTION_POLICIES.map((policy) => ({
  connector: 'whatspro' as const,
  operation: policy.operation,
  permissions: policy.permissions,
  category: policy.category,
  pluginId: policy.pluginId,
  destructive: policy.destructive ?? false,
}));

export type AppMakerTemplate = {
  key: string;
  name: string;
  description: string;
  definition: ApplicationDefinition;
};

const commercialCenter: ApplicationDefinition = {
  runtime: 'app-maker-v1',
  name: 'Centro comercial',
  slug: 'centro-comercial',
  description: 'Vista ejecutiva de clientes, pipeline y actividad con acciones reales.',
  icon: 'BriefcaseBusiness',
  category: 'Comercial',
  theme: { accent: 'emerald', density: 'comfortable' },
  design: { template: 'adaptive-light-dark' },
  navigation: { desktop: 'sidebar', mobile: 'bottom', defaultView: 'resumen' },
  entities: ['contacts', 'customers', 'sales'],
  dataModel: { entities: [], relations: [] },
  workflows: [],
  connectors: [{ key: 'whatspro', type: 'internal', label: 'WhatsPro' }],
  dataSources: [
    { key: 'contactos', resource: 'contacts', pageSize: 30, fields: ['id', 'name', 'funnelStageId', 'assignedUserId', 'updatedAt'] },
    { key: 'clientes', resource: 'customers', pageSize: 30, fields: ['id', 'name', 'status', 'email', 'phone', 'updatedAt'] },
    { key: 'ventas', resource: 'sales', pageSize: 30, fields: ['id', 'reference', 'status', 'amount', 'currency', 'updatedAt'] },
  ],
  actions: [{
    key: 'crear-nota',
    label: 'Crear nota de seguimiento',
    connector: 'whatspro',
    operation: 'whatspro_create_note',
    icon: 'NotebookPen',
    tone: 'primary',
    scope: 'global',
    inputDefaults: { title: 'Seguimiento comercial', content: 'Creado desde Centro comercial' },
    refresh: true,
  }],
  views: [
    {
      slug: 'resumen',
      name: 'Resumen',
      icon: 'LayoutDashboard',
      type: 'dashboard',
      sections: [{
        id: 'pulso',
        title: 'Pulso del negocio',
        layout: 'grid',
        blocks: [
          { id: 'total-contactos', type: 'metric', title: 'Contactos recientes', dataSource: 'contactos', metric: { operation: 'count', format: 'number' }, grid: { desktop: 4, tablet: 6, mobile: 12 }, mobilePriority: 10, hidden: false, collapsible: false, sticky: false },
          { id: 'total-clientes', type: 'metric', title: 'Clientes recientes', dataSource: 'clientes', metric: { operation: 'count', format: 'number' }, grid: { desktop: 4, tablet: 6, mobile: 12 }, mobilePriority: 20, hidden: false, collapsible: false, sticky: false },
          { id: 'total-ventas', type: 'metric', title: 'Ventas recientes', dataSource: 'ventas', metric: { operation: 'count', format: 'number' }, grid: { desktop: 4, tablet: 12, mobile: 12 }, mobilePriority: 30, hidden: false, collapsible: false, sticky: false },
          { id: 'tabla-contactos', type: 'table', title: 'Contactos', dataSource: 'contactos', fields: ['id', 'name', 'funnelStageId', 'assignedUserId', 'updatedAt'], actions: ['crear-nota'], grid: { desktop: 12, tablet: 12, mobile: 12 }, mobilePriority: 40, hidden: false, collapsible: false, sticky: false },
        ],
      }],
    },
    {
      slug: 'clientes',
      name: 'Clientes',
      icon: 'Users',
      type: 'table',
      sections: [{
        id: 'directorio',
        layout: 'stack',
        blocks: [{ id: 'directorio-clientes', type: 'table', title: 'Directorio', dataSource: 'clientes', fields: ['id', 'name', 'status', 'email', 'phone'], grid: { desktop: 12, tablet: 12, mobile: 12 }, mobilePriority: 10, hidden: false, collapsible: false, sticky: false }],
      }],
    },
  ],
  permissions: {},
  metadata: { template: 'commercial-center' },
};

const productionBoard: ApplicationDefinition = {
  runtime: 'app-maker-v1',
  name: 'Operaciones de producción',
  slug: 'operaciones-produccion',
  description: 'Tablero mobile-first de trabajo, responsables y documentación operativa.',
  icon: 'Factory',
  category: 'Operaciones',
  theme: { accent: 'blue', density: 'compact' },
  design: { template: 'adaptive-light-dark' },
  navigation: { desktop: 'topbar', mobile: 'stacked', defaultView: 'tablero' },
  entities: ['tasks', 'documents', 'team-members'],
  dataModel: { entities: [], relations: [] },
  workflows: [],
  connectors: [{ key: 'whatspro', type: 'internal', label: 'WhatsPro' }],
  dataSources: [
    { key: 'tareas', resource: 'tasks', pageSize: 50, fields: ['id', 'title', 'status', 'columnId', 'projectId', 'dueDate', 'updatedAt'] },
    { key: 'documentos', resource: 'documents', pageSize: 20, fields: ['id', 'title', 'emoji', 'updatedAt'] },
    { key: 'equipo', resource: 'team-members', pageSize: 30, fields: ['id', 'userId', 'role', 'joinedAt'] },
  ],
  actions: [{
    key: 'crear-bitacora',
    label: 'Crear entrada de bitácora',
    connector: 'whatspro',
    operation: 'whatspro_create_note',
    icon: 'NotebookPen',
    tone: 'primary',
    scope: 'form',
    inputDefaults: { tags: ['produccion'], status: 'todo' },
    refresh: true,
  }],
  views: [
    {
      slug: 'tablero',
      name: 'Tablero',
      icon: 'Columns3',
      type: 'kanban',
      sections: [{
        id: 'trabajo',
        title: 'Trabajo activo',
        layout: 'stack',
        blocks: [{ id: 'kanban-tareas', type: 'kanban', title: 'Producción', dataSource: 'tareas', groupBy: 'status', fields: ['title', 'dueDate', 'projectId'], grid: { desktop: 12, tablet: 12, mobile: 12 }, mobilePriority: 10, hidden: false, collapsible: false, sticky: false }],
      }],
    },
    {
      slug: 'bitacora',
      name: 'Bitácora',
      icon: 'NotebookPen',
      type: 'form',
      sections: [{
        id: 'registro',
        title: 'Nuevo registro',
        layout: 'split',
        blocks: [
          {
            id: 'form-bitacora',
            type: 'form',
            title: 'Registrar avance',
            action: 'crear-bitacora',
            form: {
              submitLabel: 'Guardar en bitácora',
              fields: [
                { key: 'title', label: 'Título', type: 'text', required: true, placeholder: 'Ej. Lote terminado' },
                { key: 'content', label: 'Detalle', type: 'textarea', required: false, placeholder: 'Resultado, bloqueos y siguiente paso' },
              ],
            },
            grid: { desktop: 5, tablet: 12, mobile: 12 },
            mobilePriority: 10,
            hidden: false,
            collapsible: false,
            sticky: true,
          },
          { id: 'docs-operativos', type: 'list', title: 'Documentos operativos', dataSource: 'documentos', fields: ['emoji', 'title', 'updatedAt'], grid: { desktop: 7, tablet: 12, mobile: 12 }, mobilePriority: 20, hidden: false, collapsible: true, sticky: false },
        ],
      }],
    },
  ],
  permissions: {},
  metadata: { template: 'production-board' },
};

export const APP_MAKER_TEMPLATE_REGISTRY: AppMakerTemplate[] = [
  {
    key: 'commercial-center',
    name: 'Centro comercial',
    description: 'Dashboard + tabla sobre contactos, clientes y ventas.',
    definition: commercialCenter,
  },
  {
    key: 'production-board',
    name: 'Operaciones de producción',
    description: 'Kanban + formulario + documentos, con navegación topbar/stacked.',
    definition: productionBoard,
  },
];
