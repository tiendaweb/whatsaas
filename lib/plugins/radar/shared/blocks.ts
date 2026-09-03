/**
 * Contrato de BLOQUES de Radar.
 *
 * Un "bloque" es la unidad visual mínima que Radar sabe dibujar: una card, un
 * KPI, un gráfico, una tabla, un esquema. Las IA (vía el conector MCP) generan
 * arrays de bloques en JSON y la UI los renderiza sin saber de antemano qué
 * viene — por eso el contrato vive acá, compartido entre cliente y servidor, y
 * NO lleva 'server-only'.
 *
 * Reglas al agregar un tipo nuevo:
 * 1. Sumar el schema zod al `radarBlockSchema` (discriminated union por `type`).
 * 2. Sumar el renderer en `lib/plugins/radar/ui/blocks/` y registrarlo en el
 *    dispatcher `RadarBlock.tsx`.
 * 3. Documentarlo en `RADAR_BLOCK_CATALOG` — eso es lo que leen las IA.
 * Nunca romper un tipo existente: los bloques ya guardados en la base se
 * renderizan tal cual quedaron.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Vocabulario común                                                    */
/* ------------------------------------------------------------------ */

/** Paleta cerrada. La IA elige un tono semántico, nunca un color en hex. */
export const RADAR_TONES = [
  'neutral', 'indigo', 'violet', 'rose', 'amber', 'emerald', 'sky', 'orange', 'teal', 'slate',
] as const;
export type RadarTone = (typeof RADAR_TONES)[number];

/**
 * Iconos habilitados (nombres de lucide-react). Lista cerrada a propósito: si
 * la IA inventa un nombre, el renderer usa un fallback semántico en vez de
 * romper el bundle con un import dinámico arbitrario.
 */
export const RADAR_ICONS = [
  'Radar', 'Sparkles', 'Target', 'TrendingUp', 'TrendingDown', 'Gauge', 'Activity',
  'AlertTriangle', 'AlertOctagon', 'CheckCircle2', 'XCircle', 'CircleHelp', 'Info',
  'Clock', 'CalendarClock', 'CalendarDays', 'History', 'Timer',
  'Users', 'UserRound', 'UserCheck', 'UserX', 'Handshake', 'MessageSquareText', 'MessagesSquare',
  'Phone', 'PhoneCall', 'Mic', 'Mail', 'Send',
  'ShoppingCart', 'CircleDollarSign', 'BadgeDollarSign', 'Receipt', 'Wallet', 'CreditCard',
  'FileText', 'FileCode2', 'ScrollText', 'ClipboardList', 'Notebook', 'BookOpen', 'FolderOpen',
  'Lightbulb', 'Flame', 'Zap', 'Rocket', 'Star', 'Award', 'Crown', 'Gem',
  'Search', 'Filter', 'Map', 'MapPin', 'Compass', 'Route', 'Milestone', 'Flag',
  'ThumbsUp', 'ThumbsDown', 'Heart', 'Eye', 'EyeOff', 'Bell', 'BellRing',
  'Layers', 'LayoutGrid', 'Boxes', 'Package', 'Building2', 'Globe2', 'Store',
  'GitBranch', 'Workflow', 'Share2', 'Link2', 'Anchor', 'Shield', 'ShieldAlert', 'Lock',
  'Wrench', 'Settings2', 'Bug', 'Hammer', 'Puzzle', 'Brain', 'Bot', 'Cpu',
  'ArrowUpRight', 'ArrowDownRight', 'ArrowRight', 'Repeat', 'RefreshCcw', 'Undo2',
  'Snowflake', 'Sun', 'CloudRain', 'Hourglass', 'Scale', 'Scissors', 'Ban', 'Pause',
  // Elementos del sistema: tareas, etiquetas, adjuntos, formularios, fichas.
  'Tag', 'Tags', 'ListChecks', 'ListTodo', 'Paperclip', 'Reply', 'Briefcase',
  'FolderKanban', 'Kanban', 'ClipboardCheck', 'FormInput', 'UserPlus', 'IdCard',
  'CalendarCheck', 'SquarePen', 'Inbox',
] as const;
export type RadarIcon = (typeof RADAR_ICONS)[number];

const tone = z.enum(RADAR_TONES);
const icon = z.enum(RADAR_ICONS);
const shortText = z.string().trim().min(1).max(160);
const longText = z.string().trim().min(1).max(4000);

/** Chip corto que acompaña a un título (P1, "score 90", "audio 51s"). */
const badgeSchema = z.object({
  label: z.string().trim().min(1).max(48),
  tone: tone.optional(),
});
export type RadarBadge = z.infer<typeof badgeSchema>;

/** Un punto de datos con nombre. Base de casi todos los gráficos. */
const dataPointSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.number().finite(),
  tone: tone.optional(),
  /** Detalle opcional que se muestra en el tooltip. */
  hint: z.string().trim().max(200).optional(),
});
export type RadarDataPoint = z.infer<typeof dataPointSchema>;

/** Una serie con nombre, para gráficos multi-serie. */
const seriesSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tone: tone.optional(),
  points: z.array(dataPointSchema).min(1).max(400),
});
export type RadarSeries = z.infer<typeof seriesSchema>;

/** Encabezado común: todos los bloques pueden llevar título e icono. */
const blockHeader = {
  title: shortText.optional(),
  subtitle: z.string().trim().max(200).optional(),
  icon: icon.optional(),
  tone: tone.optional(),
};

/* ------------------------------------------------------------------ */
/* Bloques                                                              */
/* ------------------------------------------------------------------ */

/**
 * `card` — el bloque estrella del pedido: icono + título + descripción, con
 * subtítulo opcional. Es lo que envuelve cada sección de la nota RADAR
 * ("SEÑALES DE COMPRA", "QUÉ BUSCA", "PUNTO DE CAÍDA", "FALLA DEL EMBUDO"…).
 */
/**
 * Cómo interpretar el cuerpo de un bloque de texto. `markdown` habilita el
 * subconjunto seguro (títulos, listas, tablas, negrita, código, enlaces); no
 * se acepta HTML crudo por esta vía — para eso está el bloque `html`.
 */
const textFormat = z.enum(['plain', 'markdown']);

const cardBlock = z.object({
  type: z.literal('card'),
  ...blockHeader,
  title: shortText,
  description: longText,
  /** Si es 'markdown', `description` y `bullets` se renderizan como markdown. */
  format: textFormat.optional(),
  badges: z.array(badgeSchema).max(6).optional(),
  /** Viñetas opcionales debajo de la descripción. */
  bullets: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  /** Enlace de salida (documento, chat, tarea). Debe ser una ruta interna o https. */
  href: z.string().trim().max(500).optional(),
  hrefLabel: z.string().trim().max(48).optional(),
});

/** `kpi` — número grande con etiqueta y variación opcional. */
const kpiItemSchema = z.object({
  label: shortText,
  value: z.union([z.number().finite(), z.string().trim().max(24)]),
  unit: z.string().trim().max(12).optional(),
  icon: icon.optional(),
  tone: tone.optional(),
  /** Variación relativa, en porcentaje. Positivo sube, negativo baja. */
  delta: z.number().finite().optional(),
  deltaLabel: z.string().trim().max(48).optional(),
  hint: z.string().trim().max(200).optional(),
  href: z.string().trim().max(500).optional(),
});
export type RadarKpiItem = z.infer<typeof kpiItemSchema>;

const kpiBlock = z.object({
  type: z.literal('kpi'),
  ...blockHeader,
  items: z.array(kpiItemSchema).min(1).max(8),
  /** Columnas en escritorio; en móvil siempre colapsa a 2. */
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
});

/** `score` — anillo/gauge para un puntaje único (score Radar, confianza). */
const scoreBlock = z.object({
  type: z.literal('score'),
  ...blockHeader,
  value: z.number().finite(),
  max: z.number().finite().positive().default(100),
  label: shortText.optional(),
  caption: z.string().trim().max(200).optional(),
  /** Umbrales para colorear automáticamente el anillo. */
  thresholds: z.array(z.object({ min: z.number(), tone })).max(6).optional(),
});

/** `progress` — barras de progreso, una o varias apiladas verticalmente. */
const progressBlock = z.object({
  type: z.literal('progress'),
  ...blockHeader,
  items: z.array(z.object({
    label: shortText,
    value: z.number().finite(),
    max: z.number().finite().positive().default(100),
    tone: tone.optional(),
    hint: z.string().trim().max(200).optional(),
    /** Muestra "12/30" en vez del porcentaje. */
    showRaw: z.boolean().optional(),
  })).min(1).max(20),
});

/** `meter` — barra segmentada horizontal (mix de estados en una sola línea). */
const meterBlock = z.object({
  type: z.literal('meter'),
  ...blockHeader,
  segments: z.array(dataPointSchema).min(1).max(12),
  /** Si es true muestra los valores absolutos junto a la leyenda. */
  showValues: z.boolean().optional(),
});

const chartBase = {
  ...blockHeader,
  height: z.number().int().min(120).max(560).optional(),
  /** Formato del eje de valores. */
  valueFormat: z.enum(['number', 'percent', 'currency', 'compact']).optional(),
  currency: z.string().trim().length(3).optional(),
  legend: z.boolean().optional(),
};

const barChart = z.object({
  type: z.literal('barChart'),
  ...chartBase,
  points: z.array(dataPointSchema).min(1).max(200).optional(),
  series: z.array(seriesSchema).min(1).max(8).optional(),
  orientation: z.enum(['vertical', 'horizontal']).optional(),
  stacked: z.boolean().optional(),
});

const lineChart = z.object({
  type: z.literal('lineChart'),
  ...chartBase,
  series: z.array(seriesSchema).min(1).max(8),
  curved: z.boolean().optional(),
  showDots: z.boolean().optional(),
});

const areaChart = z.object({
  type: z.literal('areaChart'),
  ...chartBase,
  series: z.array(seriesSchema).min(1).max(6),
  stacked: z.boolean().optional(),
  curved: z.boolean().optional(),
});

const pieChart = z.object({
  type: z.literal('pieChart'),
  ...chartBase,
  points: z.array(dataPointSchema).min(1).max(12),
  /** `donut` deja el centro libre para un total. */
  variant: z.enum(['pie', 'donut']).optional(),
  centerLabel: z.string().trim().max(48).optional(),
  centerValue: z.union([z.number().finite(), z.string().trim().max(24)]).optional(),
});

const radarChart = z.object({
  type: z.literal('radarChart'),
  ...chartBase,
  axes: z.array(z.string().trim().min(1).max(40)).min(3).max(12),
  series: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    tone: tone.optional(),
    /** Un valor por eje, en el mismo orden que `axes`. */
    values: z.array(z.number().finite()).min(3).max(12),
  })).min(1).max(4),
  max: z.number().finite().positive().optional(),
});

const funnelChart = z.object({
  type: z.literal('funnel'),
  ...chartBase,
  steps: z.array(z.object({
    label: shortText,
    value: z.number().finite().nonnegative(),
    tone: tone.optional(),
    hint: z.string().trim().max(200).optional(),
  })).min(2).max(10),
  /** Muestra el % de conversión entre pasos. */
  showConversion: z.boolean().optional(),
});

const sparkline = z.object({
  type: z.literal('sparkline'),
  ...blockHeader,
  values: z.array(z.number().finite()).min(2).max(200),
  label: shortText.optional(),
  value: z.union([z.number().finite(), z.string().trim().max(24)]).optional(),
  delta: z.number().finite().optional(),
});

const heatmap = z.object({
  type: z.literal('heatmap'),
  ...chartBase,
  rows: z.array(z.string().trim().min(1).max(40)).min(1).max(24),
  columns: z.array(z.string().trim().min(1).max(40)).min(1).max(31),
  /** Matriz `rows.length` x `columns.length`; `null` = sin dato. */
  values: z.array(z.array(z.number().finite().nullable())).min(1).max(24),
});

/** `table` — tabla compacta con scroll horizontal propio. */
const tableBlock = z.object({
  type: z.literal('table'),
  ...blockHeader,
  columns: z.array(z.object({
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(60),
    align: z.enum(['left', 'center', 'right']).optional(),
    format: z.enum(['text', 'number', 'percent', 'currency', 'date', 'badge']).optional(),
  })).min(1).max(10),
  rows: z.array(z.record(
    z.string(),
    z.union([z.string().max(400), z.number().finite(), z.boolean(), z.null()]),
  )).max(200),
  /** Clave de columna por la que resaltar la fila (tono por valor). */
  highlightKey: z.string().trim().max(40).optional(),
});

/** `timeline` — cronología de hechos. Ideal para la evidencia de una nota. */
const timelineBlock = z.object({
  type: z.literal('timeline'),
  ...blockHeader,
  items: z.array(z.object({
    title: shortText,
    detail: z.string().trim().max(1000).optional(),
    date: z.string().trim().max(40).optional(),
    icon: icon.optional(),
    tone: tone.optional(),
  })).min(1).max(40),
});

/** `list` — lista de ítems con icono, para señales, riesgos, pendientes. */
const listBlock = z.object({
  type: z.literal('list'),
  ...blockHeader,
  items: z.array(z.object({
    text: z.string().trim().min(1).max(600),
    icon: icon.optional(),
    tone: tone.optional(),
    badge: badgeSchema.optional(),
    href: z.string().trim().max(500).optional(),
  })).min(1).max(40),
  variant: z.enum(['plain', 'checklist', 'numbered']).optional(),
});

/** `steps` — esquema/flujo por pasos (el "dónde está la pelota" del embudo). */
const stepsBlock = z.object({
  type: z.literal('steps'),
  ...blockHeader,
  steps: z.array(z.object({
    label: shortText,
    detail: z.string().trim().max(600).optional(),
    state: z.enum(['done', 'current', 'pending', 'blocked']).optional(),
    icon: icon.optional(),
  })).min(2).max(12),
  orientation: z.enum(['horizontal', 'vertical']).optional(),
});

/** `callout` — aviso destacado (falla del embudo, riesgo, oportunidad). */
const calloutBlock = z.object({
  type: z.literal('callout'),
  ...blockHeader,
  body: longText,
  format: textFormat.optional(),
  variant: z.enum(['info', 'success', 'warning', 'danger', 'idea']).optional(),
});

/** `quote` — cita textual del cliente, con su fuente. */
const quoteBlock = z.object({
  type: z.literal('quote'),
  ...blockHeader,
  text: longText,
  source: z.string().trim().max(200).optional(),
});

/** `stat` — fila de dato/valor tipo ficha (intención, objeción, etapa…). */
const statBlock = z.object({
  type: z.literal('stat'),
  ...blockHeader,
  items: z.array(z.object({
    label: shortText,
    value: z.string().trim().max(300),
    icon: icon.optional(),
    tone: tone.optional(),
  })).min(1).max(20),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

/** `text` — párrafo suelto, en texto plano o markdown. */
const textBlock = z.object({
  type: z.literal('text'),
  ...blockHeader,
  body: longText,
  format: textFormat.optional(),
});

/**
 * `markdown` — documento markdown completo dentro de un bloque. Para cuando la
 * IA quiere escribir un análisis con títulos, listas y tablas sin partirlo en
 * bloques sueltos.
 */
const markdownBlock = z.object({
  type: z.literal('markdown'),
  ...blockHeader,
  body: z.string().trim().min(1).max(20000),
});

/**
 * `html` — fragmento chico de HTML, para maquetar algo que ningún bloque cubre
 * (una tabla con celdas combinadas, una insignia rara, un layout puntual).
 *
 * Se sanea con DOMPurify y se dibuja EN LÍNEA, en el mismo documento: por eso
 * es a propósito un subconjunto pobre — sin script, sin iframe, sin form, sin
 * style ni handlers. Para un informe entero con gráficos interactivos está el
 * documento HTML del plugin Documentos, que va en un iframe aislado.
 */
const htmlBlock = z.object({
  type: z.literal('html'),
  ...blockHeader,
  html: z.string().trim().min(1).max(20000),
});

/** `contacts` — lista de contactos analizados, con enlace correcto al chat. */
const contactsBlock = z.object({
  type: z.literal('contacts'),
  ...blockHeader,
  items: z.array(z.object({
    contactId: z.number().int().positive(),
    name: z.string().trim().min(1).max(200),
    /** JID crudo; el renderer arma la ruta del chat, no la IA. */
    remoteJid: z.string().trim().max(120).nullable().optional(),
    instanceId: z.union([z.number().int(), z.string().trim().max(60)]).nullable().optional(),
    priority: z.string().trim().max(24).nullable().optional(),
    score: z.number().finite().nullable().optional(),
    detail: z.string().trim().max(400).optional(),
    badges: z.array(badgeSchema).max(4).optional(),
  })).max(200),
});

/** `documents` — informes/documentos vinculados, abiertos desde el panel. */
const documentsBlock = z.object({
  type: z.literal('documents'),
  ...blockHeader,
  items: z.array(z.object({
    id: z.number().int().positive(),
    title: z.string().trim().min(1).max(300),
    emoji: z.string().trim().max(8).nullable().optional(),
    format: z.enum(['markdown', 'html']).optional(),
    updatedAt: z.string().trim().max(40).optional(),
    folder: z.string().trim().max(160).optional(),
  })).max(200),
});

/** `divider` — separador con etiqueta opcional. */
const dividerBlock = z.object({
  type: z.literal('divider'),
  label: z.string().trim().max(80).optional(),
});

/**
 * `image` — una imagen con caption. Solo https o rutas internas: un `data:` o
 * `javascript:` inventado por la IA no llega al DOM.
 */
const imageBlock = z.object({
  type: z.literal('image'),
  ...blockHeader,
  url: z.string().trim().min(1).max(600).refine(
    (value) => value.startsWith('/') || /^https:\/\//i.test(value),
    'la url tiene que ser https:// o una ruta interna que empiece con /',
  ),
  alt: z.string().trim().max(200).optional(),
  caption: z.string().trim().max(300).optional(),
  /** Alto máximo en px; sin esto la imagen escala libre al ancho del bloque. */
  height: z.number().int().min(80).max(720).optional(),
  href: z.string().trim().max(500).optional(),
});

/**
 * `tiles` — grilla de mini-cards con icono, título y descripción, como las del
 * menú lateral. Es el bloque para armar "menús" de accesos o resúmenes de
 * áreas: cada tile puede llevar su enlace, su tono y su badge.
 */
const tilesBlock = z.object({
  type: z.literal('tiles'),
  ...blockHeader,
  /** Columnas en escritorio; en móvil colapsa a 1–2 según el ancho. */
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  items: z.array(z.object({
    label: shortText,
    description: z.string().trim().max(300).optional(),
    icon: icon.optional(),
    tone: tone.optional(),
    badge: badgeSchema.optional(),
    /** Valor grande opcional a la derecha (contador, monto). */
    value: z.union([z.number().finite(), z.string().trim().max(24)]).optional(),
    href: z.string().trim().max(500).optional(),
  })).min(1).max(12),
});

/* --- Bloques vinculados al resto del sistema ----------------------- */

/** Estado visual de una tarea dentro del bloque `tasks`. */
export const RADAR_TASK_STATES = ['pending', 'in_progress', 'done', 'blocked', 'overdue'] as const;
export type RadarTaskState = (typeof RADAR_TASK_STATES)[number];

/**
 * `tasks` — tareas del sistema (o propuestas), con estado, vencimiento y
 * responsable. Los datos van EMBEBIDOS (mismo criterio que `contacts`): la IA
 * los lee con las tools de Tareas OS y los pinta acá; `id` y `href` son
 * opcionales y sólo agregan el enlace.
 */
const tasksBlock = z.object({
  type: z.literal('tasks'),
  ...blockHeader,
  items: z.array(z.object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    state: z.enum(RADAR_TASK_STATES).optional(),
    due: z.string().trim().max(40).optional(),
    assignee: z.string().trim().max(80).optional(),
    project: z.string().trim().max(80).optional(),
    detail: z.string().trim().max(300).optional(),
    tone: tone.optional(),
    badge: badgeSchema.optional(),
    href: z.string().trim().max(500).optional(),
  })).min(1).max(40),
  /** Muestra la barra hechas/total arriba de la lista. */
  showProgress: z.boolean().optional(),
});

/**
 * `checklist` — lista con estado hecho/pendiente por ítem (a diferencia de
 * `list` variant checklist, que dibuja todo tildado). Para briefs, onboarding
 * de un cliente, pasos de un espacio de trabajo.
 */
const checklistBlock = z.object({
  type: z.literal('checklist'),
  ...blockHeader,
  items: z.array(z.object({
    text: z.string().trim().min(1).max(500),
    done: z.boolean().optional(),
    hint: z.string().trim().max(200).optional(),
    tone: tone.optional(),
  })).min(1).max(40),
  showProgress: z.boolean().optional(),
});

/** Qué clase de elemento del sistema enlaza un ítem de `resources`. */
export const RADAR_RESOURCE_KINDS = [
  'document', 'task', 'project', 'workspace', 'contact', 'user', 'file', 'link',
] as const;
export type RadarResourceKind = (typeof RADAR_RESOURCE_KINDS)[number];

/**
 * `resources` — lista de elementos vinculados del sistema: documentos, tareas,
 * proyectos, workspaces, personas, archivos y links externos, mezclados. Cada
 * `kind` trae icono y destino por defecto (un documento con `id` se abre en el
 * visor de Radar; tareas/proyectos/workspaces van a Tareas OS); `url` lo pisa.
 */
const resourcesBlock = z.object({
  type: z.literal('resources'),
  ...blockHeader,
  items: z.array(z.object({
    kind: z.enum(RADAR_RESOURCE_KINDS),
    /** Id real del elemento en el sistema, si existe. */
    id: z.number().int().positive().optional(),
    label: z.string().trim().min(1).max(200),
    detail: z.string().trim().max(300).optional(),
    icon: icon.optional(),
    tone: tone.optional(),
    badge: badgeSchema.optional(),
    /** Destino explícito (https o ruta interna). Pisa el default del kind. */
    url: z.string().trim().max(600).optional(),
  })).min(1).max(40),
});

/** `tags` — nube de etiquetas/chips, con conteo opcional. */
const tagsBlock = z.object({
  type: z.literal('tags'),
  ...blockHeader,
  items: z.array(z.object({
    label: z.string().trim().min(1).max(48),
    tone: tone.optional(),
    count: z.number().int().nonnegative().optional(),
  })).min(1).max(40),
});

/**
 * `replies` — respuestas recomendadas listas para copiar: cada ítem trae el
 * texto sugerido y un botón "Copiar" en la UI. Para la ficha de un cliente
 * ("si pregunta el precio, respondé esto").
 */
const repliesBlock = z.object({
  type: z.literal('replies'),
  ...blockHeader,
  items: z.array(z.object({
    /** Cuándo usarla: "Si pregunta precio", "Primer contacto". */
    label: z.string().trim().max(80).optional(),
    text: z.string().trim().min(1).max(2000),
    tone: tone.optional(),
  })).min(1).max(12),
});

/**
 * `form` — especificación de un formulario o brief a completar: qué campos
 * pedir, de qué tipo y cuáles son obligatorios. No es interactivo — es el
 * plano del formulario, para que una persona (u otra IA) lo construya o lo
 * releve con el cliente.
 */
const formBlock = z.object({
  type: z.literal('form'),
  ...blockHeader,
  description: z.string().trim().max(600).optional(),
  fields: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    fieldType: z.enum(['text', 'textarea', 'number', 'select', 'multiselect', 'date', 'phone', 'email', 'url', 'checkbox', 'file']).optional(),
    required: z.boolean().optional(),
    placeholder: z.string().trim().max(160).optional(),
    options: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    hint: z.string().trim().max(200).optional(),
  })).min(1).max(30),
  /** Texto del botón/cierre del formulario, si aplica. */
  cta: z.string().trim().max(60).optional(),
});

/**
 * Todo bloque que puede vivir DENTRO de una columna. Es la unión completa menos
 * `columns`: un nivel de anidado alcanza para maquetar y evita la recursión
 * infinita en el schema y en el render.
 */
const leafBlocks = [
  cardBlock, kpiBlock, scoreBlock, progressBlock, meterBlock,
  barChart, lineChart, areaChart, pieChart, radarChart, funnelChart, sparkline, heatmap,
  tableBlock, timelineBlock, listBlock, stepsBlock, calloutBlock, quoteBlock, statBlock,
  textBlock, markdownBlock, htmlBlock, contactsBlock, documentsBlock, dividerBlock,
  imageBlock, tilesBlock,
  tasksBlock, checklistBlock, resourcesBlock, tagsBlock, repliesBlock, formBlock,
] as const;

const radarLeafBlockSchema = z.discriminatedUnion('type', [...leafBlocks]);
export type RadarLeafBlock = z.infer<typeof radarLeafBlockSchema>;

/**
 * `columns` — layout: parte el ancho del widget en 2 a 4 columnas y mete
 * bloques adentro de cada una. Con esto un solo widget puede maquetar una
 * pantalla (score a la izquierda, timeline a la derecha) sin depender del
 * tamaño de widgets vecinos. En móvil las columnas se apilan.
 */
const columnsBlock = z.object({
  type: z.literal('columns'),
  ...blockHeader,
  columns: z.array(z.object({
    blocks: z.array(radarLeafBlockSchema).min(1).max(12),
  })).min(2).max(4),
});

export const radarBlockSchema = z.discriminatedUnion('type', [...leafBlocks, columnsBlock]);

export type RadarBlock = z.infer<typeof radarBlockSchema>;
export type RadarBlockType = RadarBlock['type'];

export const radarBlocksSchema = z.array(radarBlockSchema).max(60);

/**
 * Valida una lista de bloques descartando los inválidos en vez de tirar todo.
 * Un widget con 9 bloques buenos y 1 roto tiene que seguir dibujándose.
 */
export function parseRadarBlocks(input: unknown): RadarBlock[] {
  if (!Array.isArray(input)) return [];
  const out: RadarBlock[] = [];
  for (const candidate of input) {
    const parsed = radarBlockSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Widgets                                                              */
/* ------------------------------------------------------------------ */

/**
 * Ancho del widget en la grilla de 12 columnas (en móvil todos ocupan 12).
 * En escritorio: xs = 4 por fila, sm = 3 por fila, md = 2 por fila,
 * lg = dos tercios (convive con un xs/sm al lado), full = fila entera.
 */
export const RADAR_WIDGET_SIZES = ['xs', 'sm', 'md', 'lg', 'full'] as const;
export type RadarWidgetSize = (typeof RADAR_WIDGET_SIZES)[number];

/** Columnas de 12 que ocupa cada tamaño. Tiene que coincidir con `SPAN_CLASS` en `WidgetGrid`. */
export const RADAR_WIDGET_SPAN: Record<RadarWidgetSize, number> = { xs: 3, sm: 4, md: 6, lg: 8, full: 12 };

/** Cuántos widgets de ese tamaño entran por fila en escritorio. */
export const RADAR_WIDGET_PER_ROW: Record<RadarWidgetSize, number> = { xs: 4, sm: 3, md: 2, lg: 1, full: 1 };

/** Dónde vive el widget. `chat` = panel Radar dentro de un chat. */
export const RADAR_WIDGET_SURFACES = ['dashboard', 'chat', 'both'] as const;
export type RadarWidgetSurface = (typeof RADAR_WIDGET_SURFACES)[number];

/**
 * Secciones FIJAS del menú lateral de Radar: las que traen una vista propia
 * (contadores, listados, informes). Además de éstas, cada equipo puede crear
 * secciones PERSONALIZADAS (ver `radarCustomSectionSchema`): entradas nuevas
 * del menú cuyo contenido son exclusivamente los widgets que se les asignen.
 */
export const RADAR_SECTIONS = [
  'resumen', 'clientes', 'prioridades', 'informes', 'seguimiento', 'mejoras', 'trabajos',
] as const;
export type RadarSection = (typeof RADAR_SECTIONS)[number];

/**
 * Id de sección tal como viaja en un widget: una builtin o el slug de una
 * personalizada. El tipo es `string` a propósito — la lista real de ids
 * válidos vive en la apariencia del equipo, no en el código.
 */
export type RadarSectionId = string;

/** Slug válido para el id de una sección personalizada. */
export const RADAR_SECTION_ID_REGEX = /^[a-z0-9][a-z0-9-]{1,31}$/;

/** Ids que una sección personalizada no puede usar: builtins + navegación fija. */
export const RADAR_RESERVED_SECTION_IDS: readonly string[] = [...RADAR_SECTIONS, 'banco'];

export function isBuiltinRadarSection(value: string): value is RadarSection {
  return (RADAR_SECTIONS as readonly string[]).includes(value);
}

/** ¿`value` puede ser el id de una sección (builtin o personalizada)? Sólo forma, no existencia. */
export function isValidRadarSectionId(value: unknown): value is RadarSectionId {
  return typeof value === 'string' && (isBuiltinRadarSection(value) || RADAR_SECTION_ID_REGEX.test(value));
}

export const RADAR_SECTION_LABEL: Record<RadarSection, string> = {
  resumen: 'Resumen',
  clientes: 'Clientes',
  prioridades: 'Prioridades',
  informes: 'Informes',
  seguimiento: 'Seguimiento',
  mejoras: 'Análisis de mejora',
  trabajos: 'Reportes de trabajo',
};

/**
 * Un icono por sección, todos distintos entre sí: en el menú lateral colapsado
 * el icono es lo ÚNICO que queda, así que dos secciones no pueden compartirlo.
 * `Gauge`, `Flame` y `Activity` quedan reservados para bloques (score, señales
 * de compra y estado del análisis), para que en una misma pantalla un icono no
 * signifique dos cosas distintas.
 *
 * Es sólo el DEFAULT: cada equipo puede pisarlo (igual que la etiqueta y el
 * tono) desde `server/appearance.ts`, la API `/api/plugins/radar/appearance` o
 * la herramienta MCP `whatspro_radar_set_appearance`.
 */
export const RADAR_SECTION_ICON: Record<RadarSection, RadarIcon> = {
  resumen: 'LayoutGrid',
  clientes: 'Users',
  prioridades: 'Target',
  informes: 'ScrollText',
  seguimiento: 'CheckCircle2',
  mejoras: 'Wrench',
  trabajos: 'Hammer',
};

/**
 * Icono por TIPO DE BLOQUE. Es el default de un widget que se crea sin `icon`:
 * se toma del primer bloque, o sea de lo que el widget realmente muestra. Antes
 * el default era el icono de la sección y todos los widgets de una misma
 * sección salían con el mismo icono, que es exactamente lo que hace inútil a un
 * icono. Todos distintos entre sí; el tipo `RadarIcon` garantiza que cada
 * nombre exista de verdad en `RADAR_ICONS`.
 */
export const RADAR_BLOCK_DEFAULT_ICON: Record<RadarBlockType, RadarIcon> = {
  card: 'Lightbulb',
  kpi: 'Target',
  score: 'Gauge',
  progress: 'Flag',
  meter: 'Puzzle',
  barChart: 'Layers',
  lineChart: 'TrendingUp',
  areaChart: 'Activity',
  pieChart: 'Scale',
  radarChart: 'Radar',
  funnel: 'Filter',
  sparkline: 'ArrowUpRight',
  heatmap: 'Flame',
  table: 'LayoutGrid',
  timeline: 'History',
  list: 'ClipboardList',
  steps: 'Route',
  callout: 'BellRing',
  quote: 'MessageSquareText',
  stat: 'Info',
  text: 'FileText',
  markdown: 'Notebook',
  html: 'FileCode2',
  contacts: 'Users',
  documents: 'FolderOpen',
  divider: 'Scissors',
  image: 'Eye',
  tiles: 'Boxes',
  columns: 'Package',
  tasks: 'ListTodo',
  checklist: 'ListChecks',
  resources: 'Link2',
  tags: 'Tags',
  replies: 'Reply',
  form: 'FormInput',
};

/* ------------------------------------------------------------------ */
/* Apariencia de las secciones                                          */
/* ------------------------------------------------------------------ */

/**
 * Override por equipo del icono, la etiqueta y el tono de una sección. Se
 * guarda en `team_plugins.settings.appearance` del plugin `radar`, así que no
 * necesita tabla propia; lo que no viene, cae en las constantes de arriba.
 */
export const radarSectionAppearanceSchema = z.object({
  icon: icon.optional(),
  label: z.string().trim().min(1).max(40).optional(),
  tone: tone.optional(),
  /** Renglón chico bajo el título en la card del menú. */
  hint: z.string().trim().min(1).max(120).optional(),
  /** true saca la sección del menú sin perder sus widgets ni su override. */
  hidden: z.boolean().optional(),
});
export type RadarSectionAppearance = z.infer<typeof radarSectionAppearanceSchema>;

/**
 * Sección PERSONALIZADA del menú: la crea el equipo (o una IA por MCP) y su
 * contenido son los widgets que se le asignen por `section: id`. Vive en la
 * misma apariencia que los overrides — no necesita tabla propia.
 */
export const radarCustomSectionSchema = z.object({
  id: z.string().trim().regex(RADAR_SECTION_ID_REGEX, 'slug en minúsculas: letras, números y guion (2 a 32)'),
  label: z.string().trim().min(1).max(40),
  icon: icon.optional(),
  tone: tone.optional(),
  hint: z.string().trim().min(1).max(120).optional(),
  hidden: z.boolean().optional(),
});
export type RadarCustomSection = z.infer<typeof radarCustomSectionSchema>;

export const radarAppearanceSchema = z.object({
  // `partialRecord` y no `record`: con `record` + enum, zod v4 exige TODAS las
  // secciones y una apariencia parcial (lo normal) no validaría.
  sections: z.partialRecord(z.enum(RADAR_SECTIONS), radarSectionAppearanceSchema).optional(),
  /** Secciones personalizadas del equipo, en el orden en que se crearon. */
  custom: z.array(radarCustomSectionSchema).max(12).optional(),
  /**
   * Orden del menú completo, como lista de ids (builtins + personalizadas).
   * Los ids que falten se agregan al final en su orden por defecto; los que
   * sobren se ignoran. Así un reorder viejo nunca "pierde" una sección nueva.
   */
  order: z.array(z.string().trim().min(1).max(40)).max(24).optional(),
});
export type RadarAppearance = {
  sections: Partial<Record<RadarSection, RadarSectionAppearance>>;
  custom: RadarCustomSection[];
  order: string[];
};

/**
 * Lectura tolerante, mismo criterio que `parseRadarBlocks`: un override roto
 * (icono inventado, etiqueta vacía) se descarta y el resto sigue valiendo. La
 * apariencia la puede escribir una IA: que un valor malo apague el menú lateral
 * entero sería peor que ignorarlo.
 */
export function parseRadarAppearance(input: unknown): RadarAppearance {
  const sections: Partial<Record<RadarSection, RadarSectionAppearance>> = {};
  const custom: RadarCustomSection[] = [];
  const order: string[] = [];
  if (!input || typeof input !== 'object') return { sections, custom, order };

  const raw = (input as { sections?: unknown }).sections;
  if (raw && typeof raw === 'object') {
    for (const section of RADAR_SECTIONS) {
      const candidate = (raw as Record<string, unknown>)[section];
      if (!candidate || typeof candidate !== 'object') continue;
      // Campo por campo: si la IA manda un icono válido y una etiqueta vacía, se
      // guarda el icono en vez de perder los dos.
      const entry: RadarSectionAppearance = {};
      const source = candidate as Record<string, unknown>;
      const parsedIcon = icon.safeParse(source.icon);
      if (parsedIcon.success) entry.icon = parsedIcon.data;
      const parsedLabel = radarSectionAppearanceSchema.shape.label.safeParse(source.label);
      if (parsedLabel.success && parsedLabel.data !== undefined) entry.label = parsedLabel.data;
      const parsedTone = tone.safeParse(source.tone);
      if (parsedTone.success) entry.tone = parsedTone.data;
      const parsedHint = radarSectionAppearanceSchema.shape.hint.safeParse(source.hint);
      if (parsedHint.success && parsedHint.data !== undefined) entry.hint = parsedHint.data;
      if (typeof source.hidden === 'boolean') entry.hidden = source.hidden;
      if (Object.keys(entry).length) sections[section] = entry;
    }
  }

  // Secciones personalizadas: la entrada rota se descarta entera (sin id o sin
  // etiqueta válidos no hay sección posible), y un id repetido o reservado
  // también — la primera aparición gana.
  const rawCustom = (input as { custom?: unknown }).custom;
  if (Array.isArray(rawCustom)) {
    const seen = new Set<string>(RADAR_RESERVED_SECTION_IDS);
    for (const candidate of rawCustom.slice(0, 12)) {
      const parsed = radarCustomSectionSchema.safeParse(candidate);
      if (!parsed.success || seen.has(parsed.data.id)) continue;
      seen.add(parsed.data.id);
      custom.push(parsed.data);
    }
  }

  const rawOrder = (input as { order?: unknown }).order;
  if (Array.isArray(rawOrder)) {
    for (const candidate of rawOrder.slice(0, 24)) {
      if (typeof candidate === 'string' && candidate && !order.includes(candidate)) order.push(candidate);
    }
  }

  return { sections, custom, order };
}

export const radarWidgetInputSchema = z.object({
  /** Clave estable por equipo: re-enviarla actualiza el widget en vez de duplicarlo. */
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i, 'usa letras, números, guion y guion bajo'),
  title: shortText,
  description: z.string().trim().max(400).optional(),
  icon: icon.optional(),
  tone: tone.optional(),
  /**
   * Builtin o slug de una sección personalizada. Acá sólo se valida la FORMA;
   * que la sección exista de verdad en el equipo lo chequea quien escribe
   * (la API y las tools MCP), que es quien puede leer la apariencia.
   */
  section: z.string().trim().refine(isValidRadarSectionId, 'sección inválida: usá una builtin o el slug de una sección personalizada').optional(),
  surface: z.enum(RADAR_WIDGET_SURFACES).optional(),
  size: z.enum(RADAR_WIDGET_SIZES).optional(),
  position: z.number().int().min(0).max(9999).optional(),
  /** Si se indica, el widget solo aparece en la ficha de ese contacto. */
  contactId: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
  blocks: radarBlocksSchema,
});
export type RadarWidgetInput = z.infer<typeof radarWidgetInputSchema>;

export type RadarWidget = {
  id: number;
  key: string;
  title: string;
  description: string | null;
  icon: RadarIcon | null;
  tone: RadarTone | null;
  /** Builtin o slug de una sección personalizada del equipo. */
  section: RadarSectionId;
  surface: RadarWidgetSurface;
  size: RadarWidgetSize;
  position: number;
  contactId: number | null;
  enabled: boolean;
  source: 'ai' | 'user' | 'system';
  blocks: RadarBlock[];
  /** Fecha en la que se archivó en el banco. `null` = está en uso. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Catálogo para las IA                                                 */
/* ------------------------------------------------------------------ */

/**
 * Descripción en prosa de cada bloque. La devuelve la herramienta MCP
 * `whatspro_radar_block_catalog` para que la IA sepa qué puede dibujar sin
 * tener que adivinar el schema.
 */
export const RADAR_BLOCK_CATALOG: Array<{ type: RadarBlockType; use: string; example: Record<string, unknown> }> = [
  { type: 'card', use: 'Icono + título + descripción (subtítulo opcional). El bloque por defecto para cada sección de un análisis: qué busca, señales de compra, proyecto, objeción, punto de caída, falla del embudo.', example: { type: 'card', icon: 'Flame', tone: 'rose', title: 'Señales de compra', subtitle: '4 señales fuertes', description: 'Pidió propuesta y presupuesto explícito.', bullets: ['Entregó el brief sin que se lo pidieran', 'Definió el alcance él mismo'] } },
  { type: 'kpi', use: 'Fila de números grandes con etiqueta, icono y variación. Para totales del tablero.', example: { type: 'kpi', items: [{ label: 'Analizados', value: 61, icon: 'Users', tone: 'indigo' }, { label: 'P1 · Hoy', value: 7, icon: 'AlertTriangle', tone: 'rose', delta: 12 }] } },
  { type: 'score', use: 'Anillo de puntaje único con umbrales de color. Para score Radar o confianza.', example: { type: 'score', title: 'Score Radar', value: 90, max: 100, caption: 'Confianza 70/100', thresholds: [{ min: 0, tone: 'rose' }, { min: 50, tone: 'amber' }, { min: 75, tone: 'emerald' }] } },
  { type: 'progress', use: 'Barras de progreso apiladas verticalmente, una por ítem.', example: { type: 'progress', title: 'Avance por etapa', items: [{ label: 'Propuesta enviada', value: 8, max: 12, tone: 'indigo', showRaw: true }] } },
  { type: 'meter', use: 'Una sola barra horizontal partida en segmentos de colores, con leyenda. Para mix de estados.', example: { type: 'meter', title: 'Distribución de prioridades', segments: [{ label: 'P1', value: 7, tone: 'rose' }, { label: 'P2', value: 21, tone: 'amber' }], showValues: true } },
  { type: 'barChart', use: 'Barras verticales u horizontales, simples o apiladas, una o varias series.', example: { type: 'barChart', title: 'Objeciones más frecuentes', orientation: 'horizontal', points: [{ label: 'Precio', value: 14 }, { label: 'Timing', value: 9 }] } },
  { type: 'lineChart', use: 'Evolución en el tiempo, una o varias series.', example: { type: 'lineChart', title: 'Contactos analizados por semana', series: [{ name: '2026', points: [{ label: 'S30', value: 12 }, { label: 'S31', value: 18 }] }], curved: true } },
  { type: 'areaChart', use: 'Como lineChart pero con área rellena; admite apilado.', example: { type: 'areaChart', title: 'Volumen por prioridad', stacked: true, series: [{ name: 'P1', tone: 'rose', points: [{ label: 'S30', value: 4 }] }] } },
  { type: 'pieChart', use: 'Torta o dona con total al centro. Máximo 12 porciones.', example: { type: 'pieChart', variant: 'donut', title: 'Recuperabilidad', centerLabel: 'Leads', centerValue: 61, points: [{ label: 'Alta', value: 22, tone: 'emerald' }] } },
  { type: 'radarChart', use: 'Perfil multi-eje. Para comparar un lead contra el promedio.', example: { type: 'radarChart', axes: ['Intención', 'Madurez', 'Urgencia', 'Presupuesto', 'Confianza'], series: [{ name: 'Este lead', values: [90, 80, 95, 40, 70] }], max: 100 } },
  { type: 'funnel', use: 'Embudo por pasos con conversión entre etapas.', example: { type: 'funnel', title: 'Embudo comercial', showConversion: true, steps: [{ label: 'Nuevo lead', value: 61 }, { label: 'Pendiente demo', value: 24 }] } },
  { type: 'sparkline', use: 'Mini gráfico de línea junto a un número. Para tendencias compactas.', example: { type: 'sparkline', label: 'Respuestas / día', value: 14, delta: -8, values: [9, 12, 15, 11, 14] } },
  { type: 'heatmap', use: 'Matriz de intensidad filas × columnas. Para actividad por día y hora.', example: { type: 'heatmap', rows: ['Lun', 'Mar'], columns: ['09', '10', '11'], values: [[2, 5, 1], [0, 3, 7]] } },
  { type: 'table', use: 'Tabla compacta con formato por columna. Scrollea sola en horizontal.', example: { type: 'table', columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'score', label: 'Score', align: 'right', format: 'number' }], rows: [{ cliente: 'Mano a Mano', score: 90 }] } },
  { type: 'timeline', use: 'Cronología de hechos con fecha, icono y detalle. Para la evidencia de un análisis.', example: { type: 'timeline', title: 'Evidencia', items: [{ date: '22/08 01:39', title: 'Entregó el brief', detail: 'Concept board + 2 videos', icon: 'FileText' }] } },
  { type: 'list', use: 'Lista con icono por ítem; variante checklist o numerada.', example: { type: 'list', title: 'Acción vigente', variant: 'numbered', items: [{ text: 'Escuchar los 2 audios y dejar por escrito qué se le dijo', tone: 'amber' }] } },
  { type: 'steps', use: 'Esquema de pasos con estado (hecho / actual / pendiente / bloqueado). Para mostrar dónde está la pelota.', example: { type: 'steps', title: '¿Dónde está la pelota?', steps: [{ label: 'Nos escribió', state: 'done' }, { label: 'Respondemos', state: 'current' }, { label: 'Scoping', state: 'pending' }] } },
  { type: 'callout', use: 'Aviso destacado. Para fallas del embudo, riesgos y oportunidades.', example: { type: 'callout', variant: 'warning', title: 'Falla del embudo', body: 'Pidió una app a medida y la automatización le mandó el menú de Sitio Web.' } },
  { type: 'quote', use: 'Cita textual del cliente con su fuente.', example: { type: 'quote', text: 'cuánto pueden demorar y cuánto sería el costo', source: 'Audio 51s · 22/08 01:40' } },
  { type: 'stat', use: 'Filas dato/valor tipo ficha. Para intención, objeción, recuperabilidad, etapa sugerida.', example: { type: 'stat', columns: 2, items: [{ label: 'Intención', value: 'Compra activa', tone: 'emerald' }, { label: 'Objeción', value: 'Sin objeción' }] } },
  { type: 'text', use: 'Párrafo libre, en texto plano o markdown (format: "markdown"). Último recurso cuando ningún bloque estructurado encaja.', example: { type: 'text', title: 'Contexto', format: 'markdown', body: 'Llega con **naming**, logo y paleta definidos.' } },
  { type: 'markdown', use: 'Markdown completo dentro de un bloque: títulos, listas, tablas, negrita, código y enlaces. Para un análisis largo que no querés partir en bloques sueltos. No acepta HTML crudo.', example: { type: 'markdown', title: 'Diagnóstico', icon: 'Notebook', body: '## Qué pasó\n\n- Pidió presupuesto el **22/08**\n- No se respondió en 24 h\n\n| Etapa | Días |\n| --- | --- |\n| Propuesta | 3 |' } },
  { type: 'html', use: 'Fragmento CHICO de HTML saneado, en línea, para maquetar algo puntual que ningún bloque cubre. Sin script, iframe, form, style ni handlers on*. Para un informe entero con gráficos usá whatspro_radar_publish_report, que va en un iframe aislado.', example: { type: 'html', title: 'Comparativa', html: '<table><tr><th>Plan</th><th>Precio</th></tr><tr><td>Tienda</td><td><b>$60.000</b></td></tr></table>' } },
  { type: 'contacts', use: 'Lista de contactos con enlace al chat. Pasá el remoteJid crudo: el enlace lo arma la UI.', example: { type: 'contacts', title: 'Trabajar hoy', items: [{ contactId: 12, name: 'Mano a Mano', remoteJid: '5493764000000@s.whatsapp.net', priority: 'P1', score: 90 }] } },
  { type: 'documents', use: 'Informes y documentos vinculados; se abren dentro del panel de Radar.', example: { type: 'documents', title: 'Informes del cliente', items: [{ id: 84, title: 'Diagnóstico Mano a Mano', format: 'html' }] } },
  { type: 'divider', use: 'Separador con etiqueta opcional.', example: { type: 'divider', label: 'Detalle' } },
  { type: 'image', use: 'Imagen con caption y enlace opcional. Sólo https:// o rutas internas (/...); cualquier otra url se descarta.', example: { type: 'image', title: 'Captura del sitio', url: 'https://ejemplo.com/screenshot.png', alt: 'Home del sitio', caption: 'Versión publicada el 20/08' } },
  { type: 'tiles', use: 'Grilla de mini-cards con icono, título, descripción y enlace — el mismo estilo de card que usa el menú lateral. Para armar menús de accesos, resúmenes de áreas o listas de apps/recursos. columns controla cuántas entran por fila en escritorio (2, 3 o 4).', example: { type: 'tiles', title: 'Áreas del negocio', columns: 3, items: [{ label: 'Ventas', description: '7 leads calientes', icon: 'Flame', tone: 'rose', value: 7, href: '/plugins/radar' }, { label: 'Cobranzas', description: '2 vencidas', icon: 'Wallet', tone: 'amber', badge: { label: 'urgente', tone: 'rose' } }] } },
  { type: 'columns', use: 'LAYOUT: parte el ancho del widget en 2 a 4 columnas y mete bloques adentro de cada una (cualquier bloque menos otro columns). Para maquetar una pantalla dentro de un solo widget: score a la izquierda + timeline a la derecha, tres KPIs lado a lado, etc. En móvil las columnas se apilan.', example: { type: 'columns', columns: [{ blocks: [{ type: 'score', title: 'Score', value: 90, max: 100 }] }, { blocks: [{ type: 'list', title: 'Señales', items: [{ text: 'Pidió presupuesto', tone: 'emerald' }] }] }] } },
  { type: 'tasks', use: 'Tareas con estado (pending/in_progress/done/blocked/overdue), vencimiento, responsable y proyecto. Los datos van embebidos: leelos con las tools de Tareas OS (whatspro_tasks_board, whatspro_manage_task) y pintalos acá; id/href sólo agregan el enlace. showProgress dibuja la barra hechas/total.', example: { type: 'tasks', title: 'Tareas del cliente', showProgress: true, items: [{ id: 41, title: 'Enviar propuesta', state: 'in_progress', due: '25/08', assignee: 'Noelia', project: 'Mano a Mano' }, { title: 'Escuchar los audios', state: 'overdue', tone: 'rose' }] } },
  { type: 'checklist', use: 'Lista con estado hecho/pendiente POR ÍTEM (a diferencia de list variant checklist, que dibuja todo tildado). Para briefs, onboarding, pasos de un espacio de trabajo. showProgress muestra el avance.', example: { type: 'checklist', title: 'Onboarding', showProgress: true, items: [{ text: 'Logo y paleta recibidos', done: true }, { text: 'Definir dominio', done: false, hint: 'Propuso manoamano.com.ar' }] } },
  { type: 'resources', use: 'Elementos vinculados del sistema, mezclados: documentos, tareas, proyectos, workspaces, personas (contact/user), archivos y links. Cada kind trae icono y destino por defecto (document con id se abre en el visor de Radar; task/project/workspace van a Tareas OS); url lo pisa. Para el bloque "material de este cliente" o "accesos del espacio".', example: { type: 'resources', title: 'Material del proyecto', items: [{ kind: 'document', id: 84, label: 'Diagnóstico inicial' }, { kind: 'project', label: 'Rediseño tienda', detail: 'Tareas OS · 8 tareas' }, { kind: 'file', label: 'brief.pdf', url: 'https://ejemplo.com/brief.pdf' }, { kind: 'link', label: 'Sitio actual', url: 'https://manoamano.com.ar' }] } },
  { type: 'tags', use: 'Nube de etiquetas/chips con tono y conteo opcional. Para las etiquetas de un contacto o la distribución de tags del embudo. Las etiquetas reales se leen/escriben con whatspro_set_contact_tags y whatspro_manage_tag.', example: { type: 'tags', title: 'Etiquetas', items: [{ label: 'combo-full', tone: 'indigo' }, { label: 'urgente', tone: 'rose', count: 3 }] } },
  { type: 'replies', use: 'Respuestas recomendadas listas para copiar: cada ítem trae cuándo usarla (label) y el texto exacto, con botón Copiar en la UI. Para la ficha de un cliente: qué contestarle según lo que pregunte.', example: { type: 'replies', title: 'Respuestas sugeridas', items: [{ label: 'Si pregunta precio', text: 'El Combo Full sale $60.000 e incluye tienda + dominio + 3 meses de soporte.', tone: 'emerald' }, { label: 'Si duda del plazo', text: 'Lo entregamos en 7 días hábiles desde que recibimos el material.' }] } },
  { type: 'form', use: 'Especificación de un formulario o brief a relevar: campos, tipo, obligatorios, opciones. NO es interactivo — es el plano del formulario para construirlo o completarlo con el cliente. Para "qué falta preguntarle" o el brief de un proyecto.', example: { type: 'form', title: 'Brief pendiente', description: 'Datos que faltan para arrancar la tienda.', cta: 'Enviar al cliente', fields: [{ label: 'Rubro', fieldType: 'select', required: true, options: ['Indumentaria', 'Alimentos', 'Servicios'] }, { label: 'Logo en vector', fieldType: 'file', required: true }, { label: 'Referencias que le gusten', fieldType: 'textarea', hint: 'Links de sitios o tiendas' }] } },
];
