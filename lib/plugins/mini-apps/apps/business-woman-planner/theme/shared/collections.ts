/**
 * Catálogo CERRADO de colecciones de datos que un bloque del tema "custom"
 * puede leer/escribir. Son las mismas colecciones que ya usa la UI clásica
 * (`lib/plugins/mini-apps/apps/business-woman-planner/index.tsx`), guardadas
 * en `mini_app_records` — el tema NUNCA duplica datos, sólo cambia cómo se
 * ven. Fase 0 deja afuera `projects`/`columns`/`tasks` (tablero, con
 * semántica de kanban y posible integración en vivo con Tasks OS) y
 * `dashboardWidgets` (es config del home clásico, no contenido); esas siguen
 * disponibles como pestaña "builtin" en el menú.
 */

// 'tags': lista de strings cortos editable como chips (BwRecordDrawer/
// BwFormModal la dibujan con un input "agregar chip" en vez de texto plano).
export type BwFieldType = 'text' | 'longtext' | 'number' | 'boolean' | 'date' | 'select' | 'tags';

export type BwFieldDef = {
  key: string;
  label: string;
  type: BwFieldType;
  options?: readonly string[];
};

export type BwCollectionDef = {
  label: string;
  description: string;
  fields: readonly BwFieldDef[];
};

export const BW_COLLECTIONS = {
  agenda: {
    label: 'Agenda',
    description: 'Bloques de la agenda diaria (hora + tarea).',
    fields: [
      { key: 'time', label: 'Hora', type: 'text' },
      { key: 'task', label: 'Tarea', type: 'text' },
      { key: 'done', label: 'Hecho', type: 'boolean' },
    ],
  },
  clients: {
    label: 'Clientes',
    description: 'Cartera de clientes local del planner (independiente del CRM).',
    fields: [
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'status', label: 'Estado', type: 'select', options: ['potencial', 'activo', 'seguimiento', 'cerrado'] },
      { key: 'notes', label: 'Notas', type: 'longtext' },
      { key: 'contacted', label: 'Contactado', type: 'boolean' },
      { key: 'phone', label: 'Teléfono', type: 'text' },
      { key: 'tags', label: 'Etiquetas', type: 'tags' },
    ],
  },
  sales: {
    label: 'Ventas',
    description: 'Ventas registradas (monto, estado, cobro).',
    fields: [
      { key: 'client', label: 'Cliente', type: 'text' },
      { key: 'amount', label: 'Monto', type: 'number' },
      { key: 'currency', label: 'Moneda', type: 'text' },
      { key: 'status', label: 'Estado', type: 'select', options: ['pendiente', 'en_proceso', 'cobrado'] },
      { key: 'paid', label: 'Pagado', type: 'boolean' },
      { key: 'date', label: 'Fecha', type: 'date' },
      { key: 'description', label: 'Descripción', type: 'text' },
      { key: 'category', label: 'Categoría', type: 'text' },
    ],
  },
  payments: {
    label: 'Pagos',
    description: 'Egresos y gastos recurrentes a controlar.',
    fields: [
      { key: 'concept', label: 'Concepto', type: 'text' },
      { key: 'amount', label: 'Monto', type: 'number' },
      { key: 'currency', label: 'Moneda', type: 'text' },
      { key: 'dueDate', label: 'Vencimiento', type: 'date' },
      { key: 'paid', label: 'Pagado', type: 'boolean' },
    ],
  },
  domains: {
    label: 'Dominios',
    description: 'Dominios propios o de clientes y su vencimiento.',
    fields: [
      { key: 'domain', label: 'Dominio', type: 'text' },
      { key: 'client', label: 'Cliente', type: 'text' },
      { key: 'status', label: 'Estado', type: 'select', options: ['activo', 'por_renovar', 'pendiente', 'vencido'] },
      { key: 'dueDate', label: 'Vencimiento', type: 'date' },
      { key: 'done', label: 'Resuelto', type: 'boolean' },
    ],
  },
  links: {
    label: 'Enlaces',
    description: 'Enlaces guardados (herramientas, clientes, recursos).',
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'description', label: 'Descripción', type: 'text' },
      { key: 'group', label: 'Grupo', type: 'text' },
    ],
  },
  notes: {
    label: 'Notas',
    description: 'Notas tipo sticky-note, con categoría y fijado.',
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'body', label: 'Contenido', type: 'longtext' },
      { key: 'tag', label: 'Categoría', type: 'text' },
      { key: 'pinned', label: 'Fijada', type: 'boolean' },
    ],
  },
  videos: {
    label: 'Videos',
    description: 'Videos de referencia guardados (YouTube).',
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'notes', label: 'Notas', type: 'longtext' },
    ],
  },
  growth: {
    label: 'Crecimiento',
    description: 'Metas de crecimiento personal/profesional y su progreso.',
    fields: [
      { key: 'goal', label: 'Meta', type: 'text' },
      { key: 'progress', label: 'Progreso %', type: 'number' },
      { key: 'done', label: 'Lograda', type: 'boolean' },
    ],
  },
  home: {
    label: 'Casa',
    description: 'Checklist del hogar.',
    fields: [
      { key: 'task', label: 'Tarea', type: 'text' },
      { key: 'done', label: 'Hecho', type: 'boolean' },
    ],
  },
} as const satisfies Record<string, BwCollectionDef>;

export type BwCollectionKey = keyof typeof BW_COLLECTIONS;
export const BW_COLLECTION_KEYS = Object.keys(BW_COLLECTIONS) as BwCollectionKey[];

export function bwCollectionFields(collection: string): readonly BwFieldDef[] {
  return (BW_COLLECTIONS as Record<string, BwCollectionDef>)[collection]?.fields ?? [];
}

export function bwFieldDef(collection: string, field: string): BwFieldDef | undefined {
  return bwCollectionFields(collection).find((f) => f.key === field);
}
