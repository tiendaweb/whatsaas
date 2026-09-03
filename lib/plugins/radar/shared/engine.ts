/**
 * Contrato del RADAR ENGINE: apps declarativas construibles por IA.
 *
 * Una "app" de Radar es un documento JSON versionado que describe vistas,
 * componentes, fuentes de datos, métricas y acciones. Las IA lo escriben por
 * MCP (`whatspro_radar_app_apply` / `whatspro_radar_ui_patch`), el servidor lo
 * valida y lo RESUELVE (ejecuta datasources y métricas y materializa BLOQUES
 * del contrato de `blocks.ts`), y el frontend sólo dibuja bloques ya resueltos
 * en una grilla responsive. No hay un segundo sistema de componentes: el
 * vocabulario visual del engine son los mismos 35 bloques de los widgets.
 *
 * Vive en shared/ sin 'server-only' a propósito: el cliente necesita los tipos
 * y los scripts de seed necesitan validar definiciones sin levantar Next.
 */
import { z } from 'zod';
import {
  RADAR_ICONS,
  RADAR_TONES,
  radarBlockSchema,
  type RadarBlock,
  type RadarIcon,
  type RadarTone,
} from './blocks';

const icon = z.enum(RADAR_ICONS);
const tone = z.enum(RADAR_TONES);

/** Slug estable de apps, vistas, componentes, datasources, métricas y acciones. */
export const RADAR_ENGINE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,47}$/;
const slug = z.string().trim().regex(RADAR_ENGINE_SLUG_REGEX, 'slug en minúsculas: letras, números y guion (2 a 48)');

export const RADAR_APP_STATUSES = ['draft', 'published', 'archived'] as const;
export type RadarAppStatus = (typeof RADAR_APP_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Grilla responsive                                                    */
/* ------------------------------------------------------------------ */

/**
 * Posición/ancho por breakpoint en la grilla de 12 columnas. Todo opcional:
 * sin `grid`, el componente ocupa 12 en móvil y 6 en escritorio. `x` es una
 * pista de columna inicial; el orden del array manda cuando falta.
 */
const gridSlotSchema = z.object({
  x: z.number().int().min(0).max(11).optional(),
  w: z.number().int().min(1).max(12).optional(),
});
export const radarGridSchema = z.object({
  desktop: gridSlotSchema.optional(),
  tablet: gridSlotSchema.optional(),
  mobile: gridSlotSchema.optional(),
});
export type RadarGrid = z.infer<typeof radarGridSchema>;

/* ------------------------------------------------------------------ */
/* Datasources y query DSL (seguro, sin SQL libre)                      */
/* ------------------------------------------------------------------ */

export const RADAR_CONDITION_OPS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with',
  'in', 'not_in', 'is_null', 'not_null',
  /** Campo fecha dentro de los últimos N días (value = N). */
  'within_days',
  /** Campo fecha anterior a hace N días (value = N). */
  'older_than_days',
] as const;
export type RadarConditionOp = (typeof RADAR_CONDITION_OPS)[number];

const conditionValue = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.array(z.union([z.string().max(200), z.number().finite()])).max(50),
]);

export const radarConditionSchema = z.object({
  /** Nombre de campo del source (o clave `custom.<campo>` para customData). */
  field: z.string().trim().min(1).max(60),
  op: z.enum(RADAR_CONDITION_OPS),
  value: conditionValue.optional(),
});
export type RadarCondition = z.infer<typeof radarConditionSchema>;

/**
 * Una fuente de datos declarada. `source` es el nombre de un recurso REAL de
 * WhatsPro (contacts, chats, messages, tasks, customers, sales, calendar_events,
 * notes, funnel_stages, tags, campaigns…): la lista viva, con los campos
 * filtrables de cada uno, la publica el servidor en el catálogo del engine.
 * Un source o campo inexistente no rompe nada: `validate` lo marca y el
 * componente que lo use se dibuja con su estado de error.
 */
export const radarDatasourceSchema = z.object({
  key: slug,
  source: z.string().trim().min(1).max(40),
  where: z.array(radarConditionSchema).max(12).optional(),
  sort: z.array(z.object({
    field: z.string().trim().min(1).max(60),
    dir: z.enum(['asc', 'desc']).optional(),
  })).max(3).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  /** Campos a devolver; sin esto, el set por defecto del source. */
  select: z.array(z.string().trim().min(1).max(60)).max(24).optional(),
  /**
   * CAMPOS COMPUTADOS por fila: `as` es el nombre del campo nuevo y `formula`
   * una expresión aritmética sobre los campos del source (ver shared/formula.ts):
   * números, + - * / (), y funciones days_since(x), hours_since(x), abs, min,
   * max, round. Ej.: urgency_score = "custom.radar_score - days_since(lastMessageAt) * 5".
   * Se calculan DESPUÉS de traer las filas; se puede ordenar por ellos (orden
   * en memoria) y usarlos en `map` de un binding, pero NO en `where`.
   */
  compute: z.array(z.object({
    as: z.string().trim().min(1).max(40).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'nombre simple: letras, números y guion bajo'),
    formula: z.string().trim().min(1).max(300),
  })).max(8).optional(),
});
export type RadarDatasource = z.infer<typeof radarDatasourceSchema>;

/** Query ad-hoc (whatspro_radar_query): un datasource sin key + agrupación. */
export const radarQuerySchema = radarDatasourceSchema.omit({ key: true }).extend({
  groupBy: z.array(z.string().trim().min(1).max(60)).max(2).optional(),
  metrics: z.array(z.object({
    aggregation: z.enum(['count', 'sum', 'avg', 'min', 'max']),
    field: z.string().trim().min(1).max(60).optional(),
    as: z.string().trim().min(1).max(40).optional(),
  })).max(6).optional(),
});
export type RadarQuery = z.infer<typeof radarQuerySchema>;

/* ------------------------------------------------------------------ */
/* Métricas                                                             */
/* ------------------------------------------------------------------ */

export const radarMetricSchema = z.object({
  key: slug,
  label: z.string().trim().min(1).max(80),
  /** Key de un datasource de la app, o directamente un source del sistema. Ausente si es una métrica de fórmula. */
  source: z.string().trim().min(1).max(48).optional(),
  aggregation: z.enum(['count', 'sum', 'avg', 'min', 'max']).optional(),
  /** Campo a agregar (obligatorio salvo count). */
  field: z.string().trim().min(1).max(60).optional(),
  /** Condiciones EXTRA sobre las del datasource. */
  where: z.array(radarConditionSchema).max(8).optional(),
  /**
   * MÉTRICA DE FÓRMULA: expresión aritmética sobre OTRAS MÉTRICAS de la app,
   * referenciadas por su key. Ej.: tasa de conversión = "(cierres / pipeline-activo) * 100".
   * Excluyente con source/aggregation. Sin ciclos; profundidad máxima 5.
   */
  formula: z.string().trim().min(1).max(300).optional(),
  format: z.enum(['number', 'currency', 'percent', 'compact']).optional(),
  currency: z.string().trim().length(3).optional(),
  icon: icon.optional(),
  tone: tone.optional(),
  hint: z.string().trim().max(160).optional(),
}).refine(
  (value) => (value.formula ? !value.source && !value.aggregation : Boolean(value.source && value.aggregation)),
  'una métrica lleva source+aggregation O una formula sobre otras métricas, nunca las dos cosas',
);
export type RadarMetric = z.infer<typeof radarMetricSchema>;

/* ------------------------------------------------------------------ */
/* Acciones (ejecutadas por el cliente)                                 */
/* ------------------------------------------------------------------ */

export const RADAR_ACTION_KINDS = ['navigate', 'open_url', 'open_chat', 'open_contact', 'open_app', 'copy', 'refresh'] as const;
export type RadarActionKind = (typeof RADAR_ACTION_KINDS)[number];

/**
 * Contexto serializable que una app puede pasarle a otra. Se limita a valores
 * escalares y pocas claves para que siga siendo seguro transportarlo en un
 * deep-link; no es un canal para inyectar definiciones ni código arbitrario.
 */
export const radarAppContextSchema = z.record(
  z.string().trim().min(1).max(40).regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/, 'clave simple de contexto'),
  z.union([z.string().max(240), z.number().finite(), z.boolean()]),
).refine((value) => Object.keys(value).length <= 12, 'el contexto admite hasta 12 claves');
export type RadarAppContext = z.infer<typeof radarAppContextSchema>;

export const radarActionSchema = z.object({
  key: slug,
  kind: z.enum(RADAR_ACTION_KINDS),
  label: z.string().trim().min(1).max(40),
  icon: icon.optional(),
  tone: tone.optional(),
  /** navigate: ruta interna; open_url: https. */
  url: z.string().trim().max(500).optional(),
  /** open_chat / open_contact. */
  contactId: z.number().int().positive().optional(),
  /** open_app: slug de la aplicación RADAR destino y vista opcional. */
  appSlug: slug.optional(),
  view: slug.optional(),
  /** open_app: contexto de negocio transportado al destino. */
  context: radarAppContextSchema.optional(),
  /** copy: texto a copiar. */
  text: z.string().trim().max(2000).optional(),
});
export type RadarAction = z.infer<typeof radarActionSchema>;

/* ------------------------------------------------------------------ */
/* Componentes                                                          */
/* ------------------------------------------------------------------ */

/** Cómo se dibuja el resultado de un datasource. */
export const RADAR_BINDING_DISPLAYS = ['table', 'list', 'contacts', 'tasks', 'stat', 'tiles'] as const;
export type RadarBindingDisplay = (typeof RADAR_BINDING_DISPLAYS)[number];

/**
 * Binding de datos: en vez de bloques estáticos, el componente declara de
 * dónde salen los datos y el SERVIDOR materializa los bloques al resolver la
 * vista. `map` renombra columnas del source a campos del display
 * (p. ej. { "title": "name", "detail": "radar_intencion" }).
 */
export const radarBindingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('datasource'),
    ref: slug,
    display: z.enum(RADAR_BINDING_DISPLAYS),
    map: z.record(z.string().max(40), z.string().max(60)).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    emptyText: z.string().trim().max(160).optional(),
  }),
  z.object({
    kind: z.literal('metrics'),
    refs: z.array(slug).min(1).max(8),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  }),
]);
export type RadarBinding = z.infer<typeof radarBindingSchema>;

/** Condición de visibilidad de un componente sobre el valor de una métrica. */
export const radarWhenSchema = z.object({
  metric: slug,
  op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
  value: z.number().finite(),
});
export type RadarWhen = z.infer<typeof radarWhenSchema>;

export const radarComponentSchema = z.object({
  id: slug,
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
  icon: icon.optional(),
  tone: tone.optional(),
  grid: radarGridSchema.optional(),
  /** Contenido estático: bloques del contrato de widgets, tal cual. */
  blocks: z.array(radarBlockSchema).max(20).optional(),
  /** Contenido vivo: el servidor lo materializa al resolver la vista. */
  binding: radarBindingSchema.optional(),
  /** Keys de acciones de la app que se muestran como botones del componente. */
  actions: z.array(slug).max(6).optional(),
  when: radarWhenSchema.optional(),
  refreshSeconds: z.number().int().min(15).max(3600).optional(),
}).refine(
  (value) => Boolean(value.blocks?.length) || Boolean(value.binding),
  'un componente necesita blocks (estático) o binding (datos vivos)',
);
export type RadarComponent = z.infer<typeof radarComponentSchema>;

/* ------------------------------------------------------------------ */
/* Vistas, navegación y tema                                            */
/* ------------------------------------------------------------------ */

export const radarVisibilitySchema = z.object({
  /** Sin esto, la ven todos los miembros con acceso a Radar. */
  userIds: z.array(z.number().int().positive()).max(20).optional(),
});
export type RadarVisibility = z.infer<typeof radarVisibilitySchema>;

export const radarViewSchema = z.object({
  slug,
  name: z.string().trim().min(1).max(60),
  icon: icon.optional(),
  tone: tone.optional(),
  hint: z.string().trim().max(120).optional(),
  /** Métrica cuyo valor se muestra como badge en la navegación. */
  badgeMetric: slug.optional(),
  components: z.array(radarComponentSchema).min(1).max(40),
  visibility: radarVisibilitySchema.optional(),
  refreshSeconds: z.number().int().min(15).max(3600).optional(),
});
export type RadarView = z.infer<typeof radarViewSchema>;

export const radarNavigationItemSchema = z.object({
  view: slug,
  label: z.string().trim().max(40).optional(),
  icon: icon.optional(),
  badgeMetric: slug.optional(),
});

export const radarThemeSchema = z.object({
  accent: tone.optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
});
export type RadarTheme = z.infer<typeof radarThemeSchema>;

/* ------------------------------------------------------------------ */
/* La app completa                                                      */
/* ------------------------------------------------------------------ */

export const radarAppDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  icon: icon.optional(),
  tone: tone.optional(),
  /** Dueño de la experiencia (p. ej. la vendedora de Business Woman). */
  ownerUserId: z.number().int().positive().optional(),
  defaultView: slug.optional(),
  views: z.array(radarViewSchema).min(1).max(12),
  datasources: z.array(radarDatasourceSchema).max(20).optional(),
  metrics: z.array(radarMetricSchema).max(40).optional(),
  actions: z.array(radarActionSchema).max(30).optional(),
  /** Orden/labels del menú de la app; sin esto, el orden de `views`. */
  navigation: z.array(radarNavigationItemSchema).max(16).optional(),
  theme: radarThemeSchema.optional(),
  visibility: radarVisibilitySchema.optional(),
});
export type RadarAppDefinition = z.infer<typeof radarAppDefinitionSchema>;

/** Fila de la app tal como sale del servidor. */
export type RadarAppRecord = {
  id: number;
  slug: string;
  name: string;
  icon: RadarIcon | null;
  tone: RadarTone | null;
  ownerUserId: number | null;
  status: RadarAppStatus;
  /** Borrador actual (siempre la última versión). */
  definition: RadarAppDefinition;
  version: number;
  publishedVersion: number | null;
  /** Definición congelada que ve el usuario final. */
  publishedDefinition: RadarAppDefinition | null;
  createdAt: string;
  updatedAt: string;
};

export type RadarAppSummary = Pick<
  RadarAppRecord,
  'slug' | 'name' | 'icon' | 'tone' | 'ownerUserId' | 'status' | 'version' | 'publishedVersion' | 'updatedAt'
>;

/* ------------------------------------------------------------------ */
/* Patch quirúrgico (subset seguro de JSON Patch)                       */
/* ------------------------------------------------------------------ */

export const radarPatchOpSchema = z.object({
  op: z.enum(['replace', 'add', 'remove']),
  /** JSON Pointer dentro de la definición, p. ej. "/views/0/components/2/grid/desktop/w". */
  path: z.string().trim().min(1).max(200).regex(/^\//, 'el path empieza con /'),
  value: z.unknown().optional(),
});
export type RadarPatchOp = z.infer<typeof radarPatchOpSchema>;
export const radarPatchSchema = z.array(radarPatchOpSchema).min(1).max(40);

/* ------------------------------------------------------------------ */
/* Validación                                                           */
/* ------------------------------------------------------------------ */

export type RadarValidationIssue = {
  severity: 'error' | 'warning';
  path: string;
  message: string;
};
export type RadarValidationResult = {
  ok: boolean;
  errors: RadarValidationIssue[];
  warnings: RadarValidationIssue[];
};

/* ------------------------------------------------------------------ */
/* Vista resuelta (lo que consume el frontend)                          */
/* ------------------------------------------------------------------ */

export type ResolvedRadarComponent = {
  id: string;
  title: string | null;
  description: string | null;
  icon: RadarIcon | null;
  tone: RadarTone | null;
  grid: RadarGrid | null;
  /** Bloques ya materializados (estáticos + bindings ejecutados). */
  blocks: RadarBlock[];
  actions: RadarAction[];
  /** Presente cuando un binding falló: la UI muestra el error, no rompe. */
  error: string | null;
  refreshSeconds: number | null;
};

export type ResolvedRadarView = {
  slug: string;
  name: string;
  icon: RadarIcon | null;
  tone: RadarTone | null;
  hint: string | null;
  components: ResolvedRadarComponent[];
  refreshSeconds: number | null;
};

export type ResolvedRadarNavItem = {
  view: string;
  label: string;
  icon: RadarIcon | null;
  tone: RadarTone | null;
  /** Valor ya calculado de badgeMetric, si la vista lo declaró. */
  badge: string | null;
};

/* ------------------------------------------------------------------ */
/* Estado por usuario e insights                                        */
/* ------------------------------------------------------------------ */

/** Estado libre por usuario+app (tab elegida, filtros, snoozes, pins…). */
export const radarUserStateSchema = z.record(z.string().max(60), z.unknown());
export type RadarUserState = Record<string, unknown>;

export const RADAR_INSIGHT_SEVERITIES = ['info', 'opportunity', 'warning', 'critical'] as const;
export const RADAR_INSIGHT_STATUSES = ['new', 'seen', 'accepted', 'dismissed', 'resolved', 'expired'] as const;
export type RadarInsightSeverity = (typeof RADAR_INSIGHT_SEVERITIES)[number];
export type RadarInsightStatus = (typeof RADAR_INSIGHT_STATUSES)[number];

export const radarInsightInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  severity: z.enum(RADAR_INSIGHT_SEVERITIES).optional(),
  /** 0-100. */
  confidence: z.number().int().min(0).max(100).optional(),
  contactId: z.number().int().positive().optional(),
  appSlug: slug.optional(),
  source: z.string().trim().max(80).optional(),
  evidence: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
  recommendedAction: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type RadarInsightInput = z.infer<typeof radarInsightInputSchema>;

export type RadarInsight = RadarInsightInput & {
  id: number;
  severity: RadarInsightSeverity;
  status: RadarInsightStatus;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Límites                                                              */
/* ------------------------------------------------------------------ */

export const RADAR_ENGINE_LIMITS = {
  maxApps: 20,
  maxViews: 12,
  maxComponentsPerView: 40,
  maxDatasources: 20,
  maxMetrics: 40,
  maxActions: 30,
  maxQueryLimit: 100,
  maxPatchOps: 40,
  maxVersionsKept: 50,
} as const;
