/**
 * Contrato del tema "custom" de Business Woman Planner. Mismo patrón que el
 * Radar Engine (`lib/plugins/radar/shared/engine.ts`): un solo documento JSON
 * versionado, con el schema real viviendo acá (zod) y no en columnas SQL, así
 * un conector puede reescribirlo por completo por MCP sin migraciones nuevas
 * cada vez que aparece un bloque más.
 *
 * Menú: cada ítem puede ser `builtin` (reordena/renombra/oculta una de las 12
 * vistas clásicas ya construidas — reuso total, cero riesgo) o `custom`
 * (apunta a una vista nueva armada con bloques). La UI clásica ("default") no
 * lee nada de este archivo.
 *
 * Fase 1 (personalización más profunda, ver docs de arquitectura): layout del
 * menú (top/left), tamaño de bloque (`width`), color libre por bloque
 * (`customColor`, hex — no reemplaza los tonos cerrados, es una salida de
 * escape controlada), fondo del tema (`appearance`), un binding que además de
 * las colecciones locales del planner puede leer datos REALES de WhatsPro
 * (`kind: "system"`, reusando el motor de datos ya validado de Radar Engine —
 * SIN SQL libre, misma whitelist), y dos bloques nuevos: `rotating_text`
 * (contenido declarativo que rota por día — la forma segura de un "widget con
 * lógica a medida" sin ejecutar código de la IA) e `image`.
 */
import { z } from 'zod';
import { radarConditionSchema } from '@/lib/plugins/radar/shared/engine';
import { BW_COLLECTION_KEYS, type BwCollectionKey } from './collections';
import { BW_THEME_ICONS, BW_THEME_TONES } from './tokens';

export const BW_BUILTIN_TABS = [
  'today', 'board', 'calendar', 'notes', 'videos', 'agenda',
  'clients', 'sales', 'links', 'home', 'growth', 'whiteboard',
] as const;
export type BwBuiltinTab = (typeof BW_BUILTIN_TABS)[number];

// El cast preserva los literales de BwCollectionKey (si se castea a
// [string, ...string[]] a secas, z.enum infiere `string` liso y se pierde
// el chequeo de tipos en todo lo que use `.collection` más abajo).
const collectionEnum = z.enum(BW_COLLECTION_KEYS as [BwCollectionKey, ...BwCollectionKey[]]);
const iconEnum = z.enum(BW_THEME_ICONS);
const toneEnum = z.enum(BW_THEME_TONES);

/** Color libre además de los 9 tonos cerrados: SIEMPRE un hex de 6 dígitos,
 * aplicado por CSS inline (nunca concatenado en una clase Tailwind — ver
 * `theme/shared/tokens.ts` para la razón). No es una puerta a CSS/HTML libre:
 * es un string de 6 caracteres hexadecimales, nada más. */
export const BW_HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const hexColor = z.string().regex(BW_HEX_COLOR_REGEX, 'color hex de 6 dígitos, ej. "#f43f5e"');

/** Sólo protocolo http(s) — mismo criterio que `isSafeHref` de la app
 * Documentos, adaptado a "sólo externo" porque acá no hay rutas internas. */
export function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
const httpUrl = z.string().refine(isSafeExternalUrl, 'tiene que ser una URL http(s) válida');

export const BW_WIDTHS = ['full', 'half', 'third', 'two_thirds'] as const;
export type BwWidth = (typeof BW_WIDTHS)[number];
const widthEnum = z.enum(BW_WIDTHS);

export const BW_MENU_PLACEMENTS = ['top', 'left'] as const;
export type BwMenuPlacement = (typeof BW_MENU_PLACEMENTS)[number];

/**
 * Fuentes de datos REALES de WhatsPro (más allá de las colecciones propias
 * del planner) que un binding `kind: "system"` puede leer. Son exactamente
 * los "sources" que ya expone y valida el motor de datos de Radar Engine
 * (`lib/plugins/radar/server/engine/data.ts`) — se reusa esa whitelist en vez
 * de duplicarla; el catálogo exacto de campos por source lo da
 * `whatspro_radar_engine_catalog`.
 */
export const BW_SYSTEM_SOURCES = [
  'contacts', 'chats', 'messages', 'tasks', 'customers', 'sales',
  'calendar_events', 'notes', 'funnel_stages', 'tags', 'campaigns',
] as const;
export type BwSystemSource = (typeof BW_SYSTEM_SOURCES)[number];

/* ------------------------------------------------------------------ */
/* Bindings: cómo un bloque lee datos                                   */
/* ------------------------------------------------------------------ */

export const BW_FILTER_OPS = ['eq', 'neq', 'contains', 'is_true', 'is_false'] as const;
export type BwFilterOp = (typeof BW_FILTER_OPS)[number];

export const bwFilterSchema = z.object({
  field: z.string().min(1).max(60),
  op: z.enum(BW_FILTER_OPS),
  value: z.union([z.string().max(200), z.number(), z.boolean()]).optional(),
});

/** `local`: una de las colecciones propias del planner — se resuelve en el
 * cliente, contra los datos que `useMiniAppData` ya cargó (cero red extra). */
export const bwLocalBindingSchema = z.object({
  kind: z.literal('local'),
  collection: collectionEnum,
  filters: z.array(bwFilterSchema).max(5).optional(),
  sortField: z.string().max(60).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  /** Por defecto, los registros archivados (`_archived: true`, lo pone
   * BwRecordDrawer al "Archivar") NO aparecen. true los vuelve a mostrar —
   * útil para una vista tipo "Archivo". */
  includeArchived: z.boolean().optional(),
});
export type BwLocalBinding = z.infer<typeof bwLocalBindingSchema>;

/** `system`: un recurso real de WhatsPro (contactos, tareas, clientes…) — se
 * resuelve en el SERVIDOR (`POST /api/mini-apps/[slug]/theme/query`), vía el
 * mismo `executeRadarQuery` que ya usa Radar Engine: nada de SQL libre, todo
 * aislado por equipo, los operadores son los de `radarConditionSchema`
 * (bastante más ricos que los locales: within_days, older_than_days, in…). */
export const bwSystemBindingSchema = z.object({
  kind: z.literal('system'),
  source: z.enum(BW_SYSTEM_SOURCES),
  where: z.array(radarConditionSchema).max(8).optional(),
  sort: z.array(z.object({ field: z.string().min(1).max(60), dir: z.enum(['asc', 'desc']).optional() })).max(3).optional(),
  select: z.array(z.string().min(1).max(60)).max(12).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type BwSystemBinding = z.infer<typeof bwSystemBindingSchema>;

export const bwBindingSchema = z.discriminatedUnion('kind', [bwLocalBindingSchema, bwSystemBindingSchema]);
export type BwBinding = z.infer<typeof bwBindingSchema>;

/* ------------------------------------------------------------------ */
/* Bloques                                                              */
/* ------------------------------------------------------------------ */

const bwHeadingBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('heading'),
  text: z.string().min(1).max(200),
  level: z.enum(['1', '2', '3']).default('2'),
  icon: iconEnum.optional(),
  tone: toneEnum.optional(),
  customColor: hexColor.optional(),
  width: widthEnum.optional(),
});

const bwTextBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('text'),
  text: z.string().min(1).max(2000),
  tone: toneEnum.optional(),
  customColor: hexColor.optional(),
  width: widthEnum.optional(),
});

const bwMetricBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('metric'),
  label: z.string().min(1).max(80),
  binding: bwBindingSchema,
  aggregate: z.enum(['count', 'sum', 'avg']).default('count'),
  /** obligatorio si aggregate es sum/avg: el campo numérico a agregar. */
  field: z.string().max(60).optional(),
  icon: iconEnum.optional(),
  tone: toneEnum.optional(),
  customColor: hexColor.optional(),
  width: widthEnum.optional(),
});

const bwListBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('list'),
  title: z.string().max(120).optional(),
  binding: bwBindingSchema,
  primaryField: z.string().min(1).max(60),
  secondaryField: z.string().max(60).optional(),
  tone: toneEnum.optional(),
  customColor: hexColor.optional(),
  width: widthEnum.optional(),
  /** true (default): tocar una fila abre el panel lateral de detalle
   * (BwRecordDrawer) — ver/editar todos los campos, archivar, eliminar. Sólo
   * aplica a bindings `local` (los `system` abren el panel en solo lectura). */
  openDetail: z.boolean().default(true),
});

const bwTableBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('table'),
  title: z.string().max(120).optional(),
  binding: bwBindingSchema,
  columns: z.array(z.string().min(1).max(60)).min(1).max(8),
  width: widthEnum.optional(),
  openDetail: z.boolean().default(true),
});

const bwCardsBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('cards'),
  title: z.string().max(120).optional(),
  binding: bwBindingSchema,
  titleField: z.string().min(1).max(60),
  subtitleField: z.string().max(60).optional(),
  badgeField: z.string().max(60).optional(),
  tone: toneEnum.optional(),
  customColor: hexColor.optional(),
  width: widthEnum.optional(),
  openDetail: z.boolean().default(true),
});

const bwFormButtonBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('form_button'),
  label: z.string().min(1).max(80),
  collection: collectionEnum,
  icon: iconEnum.optional(),
  tone: toneEnum.optional(),
  customColor: hexColor.optional(),
  width: widthEnum.optional(),
});

/** Contenido declarativo que rota por día (o al azar en cada carga): la
 * respuesta segura a "quiero un widget con una frase motivacional distinta
 * todos los días". La IA escribe el CONTENIDO (`items`); no hay código de
 * ningún tipo que se ejecute — `mode: "daily"` elige `items[díaDelAño % N]`
 * en el cliente, así que es determinístico y estable durante todo el día. */
const bwRotatingTextBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('rotating_text'),
  title: z.string().max(120).optional(),
  items: z.array(z.string().min(1).max(300)).min(1).max(60),
  mode: z.enum(['daily', 'random']).default('daily'),
  icon: iconEnum.optional(),
  tone: toneEnum.optional(),
  customColor: hexColor.optional(),
  width: widthEnum.optional(),
});

const bwImageBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('image'),
  url: httpUrl,
  alt: z.string().max(200).optional(),
  caption: z.string().max(200).optional(),
  width: widthEnum.optional(),
});

/**
 * Tablero de tareas embebido, acotado a UN proyecto (`projectId`, el
 * `_recordId` de un `BusinessProject` real). Reusa el mismo motor de datos y
 * la misma ficha de tarea (checklist, notas, comentarios, vinculaciones) que
 * ya tiene la pestaña clásica "Proyectos" — ver `theme/ui/BoardContext.tsx`.
 * A propósito NO permite crear/renombrar/borrar columnas desde acá (esas
 * acciones siguen viviendo en la pestaña "Proyectos" completa); sí crear
 * tareas, arrastrarlas entre columnas y abrir/editar/tildar/archivar* una.
 * (*archivar una tarea = moverla a una columna cuyo título contenga
 * "hecho"/"archiv" — no hay un flag de archivado separado para tareas,
 * a diferencia de las colecciones locales).
 */
const bwKanbanBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('kanban'),
  title: z.string().max(120).optional(),
  projectId: z.string().min(1).max(120),
  width: widthEnum.optional(),
});

// Nota de implementación: `action` es un objeto plano con campos opcionales
// (no un discriminatedUnion anidado) a propósito — un discriminatedUnion dentro
// de otro discriminatedUnion, dentro del union recursivo `bwBlockSchema`,
// hacía que `tsc` se quedara sin memoria al inferir el tipo (confirmado con
// un OOM real, no una sospecha). La validación de "collection obligatorio si
// kind=create / viewId obligatorio si kind=navigate" se hace con `.refine`.
const bwQuickActionSchema = z.object({
  label: z.string().min(1).max(40),
  icon: iconEnum.optional(),
  tone: toneEnum.optional(),
  action: z.object({
    kind: z.enum(['create', 'navigate']),
    collection: collectionEnum.optional(),
    viewId: z.string().min(1).max(60).optional(),
  }).refine(
    (value) => (value.kind === 'create' ? value.collection !== undefined : value.viewId !== undefined),
    { message: 'kind="create" necesita collection; kind="navigate" necesita viewId.' },
  ),
});
const bwQuickActionsBlock = z.object({
  id: z.string().min(1).max(60),
  type: z.literal('quick_actions'),
  title: z.string().max(120).optional(),
  actions: z.array(bwQuickActionSchema).min(1).max(8),
  width: widthEnum.optional(),
});

const bwLeafBlockSchema = z.discriminatedUnion('type', [
  bwHeadingBlock,
  bwTextBlock,
  bwMetricBlock,
  bwListBlock,
  bwTableBlock,
  bwCardsBlock,
  bwFormButtonBlock,
  bwRotatingTextBlock,
  bwImageBlock,
  bwKanbanBlock,
  bwQuickActionsBlock,
]);

// `columns` es estructural (organiza otros bloques en carriles) y por eso es
// el único recursivo — necesita z.lazy para poder referenciarse a sí mismo.
export const bwBlockSchema: z.ZodType<BwBlock> = z.lazy(() =>
  z.union([
    bwLeafBlockSchema,
    z.object({
      id: z.string().min(1).max(60),
      type: z.literal('columns'),
      lanes: z.array(z.array(bwBlockSchema).max(12)).min(1).max(4),
      width: widthEnum.optional(),
    }),
  ]),
);

export type BwLeafBlock = z.infer<typeof bwLeafBlockSchema>;
export type BwBlock = BwLeafBlock | { id: string; type: 'columns'; lanes: BwBlock[][]; width?: BwWidth };

export const BW_BLOCK_TYPES = [
  'heading', 'text', 'metric', 'list', 'table', 'cards', 'form_button',
  'rotating_text', 'image', 'kanban', 'quick_actions', 'columns',
] as const;

/* ------------------------------------------------------------------ */
/* Vistas                                                               */
/* ------------------------------------------------------------------ */

export const bwViewSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  icon: iconEnum.optional(),
  tone: toneEnum.optional(),
  blocks: z.array(bwBlockSchema).max(24).default([]),
});
export type BwView = z.infer<typeof bwViewSchema>;

/* ------------------------------------------------------------------ */
/* Menú                                                                 */
/* ------------------------------------------------------------------ */

const bwMenuItemBase = {
  id: z.string().min(1).max(60),
  order: z.number().int().min(0).max(999).default(0),
  visible: z.boolean().default(true),
  /** aparece en la barra inferior de móvil (máximo 4 ítems primarios en uso). */
  primary: z.boolean().default(false),
};

export const bwMenuItemSchema = z.discriminatedUnion('kind', [
  z.object({
    ...bwMenuItemBase,
    kind: z.literal('builtin'),
    tab: z.enum(BW_BUILTIN_TABS),
    /** si no viene, se usa la etiqueta clásica de esa pestaña. */
    label: z.string().max(40).optional(),
    icon: iconEnum.optional(),
  }),
  z.object({
    ...bwMenuItemBase,
    kind: z.literal('custom'),
    /** referencia a definition.views[].id */
    viewId: z.string().min(1).max(60),
    label: z.string().min(1).max(40),
    icon: iconEnum.optional(),
  }),
]);
export type BwMenuItem = z.infer<typeof bwMenuItemSchema>;

/* ------------------------------------------------------------------ */
/* Layout y apariencia (nivel tema)                                     */
/* ------------------------------------------------------------------ */

export const bwLayoutSchema = z.object({
  /** "top" = tira horizontal (Fase 0, sigue siendo el default). "left" =
   * sidebar vertical de escritorio (colapsa a barra superior en móvil). */
  menuPlacement: z.enum(BW_MENU_PLACEMENTS).default('top'),
});
export type BwLayout = z.infer<typeof bwLayoutSchema>;

export const bwBackgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('color'), color: hexColor }),
  z.object({ type: z.literal('gradient'), from: hexColor, to: hexColor, angle: z.number().int().min(0).max(360).default(135) }),
  z.object({ type: z.literal('image'), url: httpUrl }),
]);
export type BwBackground = z.infer<typeof bwBackgroundSchema>;

/** Familias tipográficas CERRADAS (mismo motivo que tonos/iconos): son
 * font-stacks del sistema, sin ningún fetch externo (ni Google Fonts) — cero
 * impacto de performance/CSP y funcionan igual en cualquier dispositivo. */
export const BW_FONT_FAMILIES = ['system', 'serif', 'mono', 'rounded'] as const;
export type BwFontFamily = (typeof BW_FONT_FAMILIES)[number];

export const bwAppearanceSchema = z.object({
  background: bwBackgroundSchema.optional(),
  fontFamily: z.enum(BW_FONT_FAMILIES).optional(),
});
export type BwAppearance = z.infer<typeof bwAppearanceSchema>;

/* ------------------------------------------------------------------ */
/* Documento completo                                                   */
/* ------------------------------------------------------------------ */

export const bwThemeDefinitionSchema = z.object({
  name: z.string().min(1).max(120).default('Business Woman Planner'),
  menu: z.array(bwMenuItemSchema).min(1).max(24),
  views: z.array(bwViewSchema).max(24).default([]),
  layout: bwLayoutSchema.optional(),
  appearance: bwAppearanceSchema.optional(),
});
export type BwThemeDefinition = z.infer<typeof bwThemeDefinitionSchema>;

export const BW_THEME_MODES = ['default', 'custom'] as const;
export type BwThemeMode = (typeof BW_THEME_MODES)[number];

export const BW_THEME_STATUSES = ['draft', 'published', 'archived'] as const;
export type BwThemeStatus = (typeof BW_THEME_STATUSES)[number];

export const BW_THEME_LIMITS = {
  maxVersionsKept: 30,
};

export type BwThemeRecord = {
  id: number;
  appSlug: string;
  mode: BwThemeMode;
  status: BwThemeStatus;
  definition: BwThemeDefinition;
  version: number;
  publishedVersion: number | null;
  publishedDefinition: BwThemeDefinition | null;
  createdAt: string;
  updatedAt: string;
};

export type BwValidationIssue = { severity: 'error' | 'warning'; path: string; message: string };
export type BwValidationResult = { ok: boolean; errors: BwValidationIssue[]; warnings: BwValidationIssue[] };

/**
 * Definición mínima de arranque: un menú que refleja EXACTAMENTE el orden y
 * las etiquetas clásicas de las 12 pestañas, sin vistas custom todavía. Es lo
 * que se aplica la primera vez que un equipo pasa a modo "custom" sin haberle
 * pedido nada aún a un conector — el resultado visual es idéntico al tema
 * clásico (mismas pestañas, mismo orden), sólo que ahora es DATA en vez de
 * código, y un conector puede empezar a tocarla.
 */
export const BW_BUILTIN_TAB_LABELS: Record<BwBuiltinTab, string> = {
  today: 'Inicio', clients: 'Clientes', sales: 'Ventas', links: 'Links',
  board: 'Proyectos', whiteboard: 'Pizarra', calendar: 'Calendario', notes: 'Notas',
  agenda: 'Agenda', videos: 'Videos', home: 'Casa', growth: 'Crecimiento',
};

export function bwDefaultThemeDefinition(): BwThemeDefinition {
  const primary = new Set<BwBuiltinTab>(['today', 'clients', 'board', 'whiteboard']);
  return {
    name: 'Business Woman Planner',
    menu: BW_BUILTIN_TABS.map((tab, index) => ({
      kind: 'builtin' as const,
      id: `builtin-${tab}`,
      tab,
      label: BW_BUILTIN_TAB_LABELS[tab],
      order: index,
      visible: true,
      primary: primary.has(tab),
    })),
    views: [],
  };
}
