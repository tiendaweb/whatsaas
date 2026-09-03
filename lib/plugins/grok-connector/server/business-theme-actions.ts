import 'server-only';

/**
 * Tools MCP del motor de temas de Business Woman Planner: un conector de IA
 * arma un menú y vistas propias (bloques ligados a las colecciones de datos
 * ya existentes del planner) sin tocar una línea del tema clásico.
 *
 * Mismo patrón que el Radar Engine (`radar-engine-actions.ts`): JSON Schema
 * liviano acá, validación zod fina con los schemas del contrato compartido
 * (`lib/plugins/mini-apps/apps/business-woman-planner/theme/shared/schema.ts`).
 * La persistencia vive en `.../theme/server/store.ts`: acá sólo hay permisos,
 * parseo y auditoría.
 *
 * Fase 0: sólo existe para el slug "business-woman-planner". El resto de las
 * mini-apps no tienen fila de tema (siempre están en modo "default").
 */
import { z } from 'zod';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';
import { BW_COLLECTIONS, BW_COLLECTION_KEYS } from '@/lib/plugins/mini-apps/apps/business-woman-planner/theme/shared/collections';
import {
  BW_BLOCK_TYPES,
  BW_BUILTIN_TABS,
  BW_FILTER_OPS,
  BW_MENU_PLACEMENTS,
  BW_SYSTEM_SOURCES,
  BW_THEME_MODES,
  BW_WIDTHS,
  bwDefaultThemeDefinition,
  bwThemeDefinitionSchema,
} from '@/lib/plugins/mini-apps/apps/business-woman-planner/theme/shared/schema';
import { BW_THEME_ICONS, BW_THEME_TONES } from '@/lib/plugins/mini-apps/apps/business-woman-planner/theme/shared/tokens';
import {
  applyBwTheme,
  getBwTheme,
  listBwThemeVersions,
  publishBwTheme,
  rollbackBwTheme,
  setBwThemeMode,
} from '@/lib/plugins/mini-apps/apps/business-woman-planner/theme/server/store';
import { validateBwThemeDefinition } from '@/lib/plugins/mini-apps/apps/business-woman-planner/theme/server/validate';
import { RADAR_CONDITION_OPS } from '@/lib/plugins/radar/shared/engine';
import { listRadarSources } from '@/lib/plugins/radar/server/engine/data';

const MINI_APPS_PLUGIN = 'mini-apps';
const THEME_ENABLED_SLUGS = new Set(['business-woman-planner']);

const APP_SLUG_FIELD = {
  type: 'string' as const,
  default: 'business-woman-planner',
  description: 'Slug de la mini-app. Fase 0: sólo "business-woman-planner" tiene motor de temas.',
};

const DEFINITION_FIELD_DESCRIPTION =
  'Objeto BwThemeDefinition completo: {name, menu: [...], views?: [...], layout?, appearance?}. Cada ítem de menu es {kind:"builtin", tab, label?, icon?, order, visible, primary} (reordena/renombra/oculta una de las 12 vistas clásicas, reusándola tal cual) o {kind:"custom", viewId, label, icon?, order, visible, primary} (apunta a una vista nueva en definition.views). Cada view es {id, title, icon?, tone?, blocks: [...]}. layout={menuPlacement:"top"|"left"} (sidebar vertical). appearance={background?} (color/degradé/imagen de fondo del tema entero). El detalle de bloques, bindings (colecciones locales o fuentes reales de WhatsPro), tamaños, colores e iconos válidos lo da whatspro_business_theme_catalog.';

function requireEnabledSlug(appSlug: string) {
  if (!THEME_ENABLED_SLUGS.has(appSlug)) {
    throw new Error(`"${appSlug}" no tiene motor de temas todavía. Hoy sólo funciona con "business-woman-planner".`);
  }
}

/* ------------------------------------------------------------------ */
/* Herramientas de lectura                                              */
/* ------------------------------------------------------------------ */

export const businessThemeReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_business_theme_catalog',
    description:
      'El MANUAL del motor de temas de Business Woman Planner: qué es el modo "custom", las 12 pestañas clásicas reordenables (BW_BUILTIN_TABS), layout del menú (top/sidebar izquierdo), apariencia del tema (color/degradé/imagen de fondo), el catálogo de COLECCIONES propias del planner con sus campos (agenda, clients, sales, payments, domains, links, notes, videos, growth, home — las mismas que ya usa la UI clásica, ningún dato se duplica), las FUENTES de datos REALES de WhatsPro que también se pueden leer (contactos, tareas, clientes del CRM, notas, agenda, etc. — mismo motor que Radar Engine, con su catálogo de campos incluido), los 10 tipos de bloque disponibles (heading, text, metric, list, table, cards, form_button, rotating_text, image, columns) con su forma exacta, el sistema de tamaños (width: full/half/third/two_thirds — así se "cambia el tamaño de los widgets"), los tonos cerrados + color libre (customColor) por bloque, los iconos permitidos, y un ejemplo de definición completa que combina varias de estas piezas. LLAMALA SIEMPRE ANTES de whatspro_business_theme_apply: inventar una colección, source, campo, tono o icono hace que la validación rechace la definición. No tiene parámetros y no toca la base de datos.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_business_theme_get',
    description:
      'Devuelve el tema de una mini-app: el modo actual (default/custom), el borrador completo con su versión, la versión publicada (si hay) y el resultado de VALIDARLO. Es el paso previo obligado a cualquier edición: de acá sale la definition sobre la que trabajar y la version para expected_version. Si el equipo nunca activó el modo custom, devuelve mode="default" y definition=null — en ese caso, primero whatspro_business_theme_set_mode(mode="custom").',
    inputSchema: {
      type: 'object',
      properties: { app_slug: APP_SLUG_FIELD },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_business_theme_versions',
    description:
      'Historial de versiones del tema de una mini-app: número, resumen del cambio, autor, fecha y cuál está publicada. Sirve para elegir el to_version de whatspro_business_theme_rollback o para auditar qué cambió.',
    inputSchema: {
      type: 'object',
      properties: { app_slug: APP_SLUG_FIELD },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_business_theme_validate',
    description:
      'Valida una definición del tema contra el contrato y contra las colecciones reales, SIN escribir nada. Devuelve {ok, errors, warnings} con el path exacto de cada problema. Dos formas de uso excluyentes: {app_slug} valida el BORRADOR guardado, y {definition} valida una definición que todavía no guardaste (equivale a whatspro_business_theme_apply con dry_run=true pero sin necesitar que ya exista tema). Usala como chequeo rápido antes del apply final.',
    inputSchema: {
      type: 'object',
      properties: {
        app_slug: { ...APP_SLUG_FIELD, description: 'Valida el borrador guardado de esta mini-app. Excluyente con definition.' },
        definition: { type: 'object', description: `Definición completa a validar sin guardar. ${DEFINITION_FIELD_DESCRIPTION}` },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Herramientas de acción                                               */
/* ------------------------------------------------------------------ */

export const businessThemeActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_business_theme_set_mode',
    description:
      'Activa o desactiva el tema "custom" de una mini-app. mode="custom" pasa a usar el motor data-driven (si es la primera vez, siembra una definición inicial que reproduce el menú clásico 1:1 — el resultado visual no cambia hasta que se edite con whatspro_business_theme_apply). mode="default" vuelve a la UI clásica de siempre, sin borrar el trabajo guardado: los datos de las colecciones no se tocan en ningún caso.',
    inputSchema: {
      type: 'object',
      required: ['mode'],
      properties: {
        app_slug: APP_SLUG_FIELD,
        mode: { type: 'string', enum: [...BW_THEME_MODES], description: '"custom" activa el motor editable; "default" vuelve a la UI clásica.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_business_theme_apply',
    description:
      'LA herramienta central: crea o reemplaza el tema completo de una mini-app a partir de su definición JSON. Guarda una VERSIÓN nueva del borrador (el historial no se pierde: whatspro_business_theme_rollback vuelve atrás). Flujo recomendado: whatspro_business_theme_catalog (referencia) → whatspro_business_theme_get (estado actual + expected_version) → armar la definition → apply con dry_run=true para ver la validación sin escribir → corregir → apply en serio → publish=true (o whatspro_business_theme_publish después de revisar).',
    inputSchema: {
      type: 'object',
      required: ['definition'],
      properties: {
        app_slug: APP_SLUG_FIELD,
        definition: { type: 'object', description: DEFINITION_FIELD_DESCRIPTION },
        expected_version: { type: 'integer', minimum: 1, description: 'Optimistic locking: la versión que creés que es la actual (de whatspro_business_theme_get). Si no coincide, se rechaza el cambio en vez de pisar una edición ajena.' },
        dry_run: { type: 'boolean', description: 'true valida y muestra qué pasaría SIN escribir nada.' },
        publish: { type: 'boolean', description: 'true además de guardar el borrador, lo publica en el mismo paso.' },
        summary: { type: 'string', maxLength: 300, description: 'Etiqueta humana de la versión, para el historial. Ej.: "agregué vista de resumen ejecutivo".' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_business_theme_publish',
    description:
      'Publica el tema: congela una versión del borrador como la que ve el usuario final. Hasta publicar, el usuario sigue viendo la última versión publicada (o el tema clásico, si nunca se publicó nada en modo custom). Sin version publica el borrador actual; con version publica esa versión puntual del historial.',
    inputSchema: {
      type: 'object',
      properties: {
        app_slug: APP_SLUG_FIELD,
        version: { type: 'integer', minimum: 1, description: 'Versión puntual del historial a publicar. Sin esto, el borrador actual.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_business_theme_rollback',
    description:
      'Vuelve el tema a una versión anterior. NO borra historia: crea una VERSIÓN NUEVA con el contenido de to_version y la publica, así el historial completo sigue disponible. El número de versión sale de whatspro_business_theme_versions.',
    inputSchema: {
      type: 'object',
      required: ['to_version'],
      properties: {
        app_slug: APP_SLUG_FIELD,
        to_version: { type: 'integer', minimum: 1, description: 'Versión del historial a restaurar.' },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Schemas de entrada                                                   */
/* ------------------------------------------------------------------ */

const appSlugSchema = z.string().trim().min(1).max(100).default('business-woman-planner');

const getSchema = z.object({ app_slug: appSlugSchema });
const versionsSchema = z.object({ app_slug: appSlugSchema });

const validateSchema = z.object({
  app_slug: appSlugSchema,
  definition: z.unknown().optional(),
});

const setModeSchema = z.object({
  app_slug: appSlugSchema,
  mode: z.enum(BW_THEME_MODES),
});

const applySchema = z.object({
  app_slug: appSlugSchema,
  definition: z.unknown(),
  expected_version: z.number().int().positive().optional(),
  dry_run: z.boolean().optional(),
  publish: z.boolean().optional(),
  summary: z.string().trim().max(300).optional(),
});

const publishSchema = z.object({
  app_slug: appSlugSchema,
  version: z.number().int().positive().optional(),
});

const rollbackSchema = z.object({
  app_slug: appSlugSchema,
  to_version: z.number().int().positive(),
});

/* ------------------------------------------------------------------ */
/* Ejecución                                                            */
/* ------------------------------------------------------------------ */

function catalogPayload() {
  return {
    howTo: 'Llamá whatspro_business_theme_get para ver el estado actual, armá una BwThemeDefinition con este catálogo y aplicala con whatspro_business_theme_apply. Empezá SIEMPRE por reordenar/ocultar pestañas builtin (riesgo cero, reusan la vista clásica entera); agregá vistas custom sólo cuando el pedido pide algo que ninguna pestaña clásica ya resuelve. No hay ejecución de código: todo widget es 100% declarativo (datos + composición visual) — para contenido que "cambia todos los días" (frases, tips) usá el bloque rotating_text con una lista de items, NO inventes lógica.',
    modes: BW_THEME_MODES,
    builtinTabs: BW_BUILTIN_TABS,
    layout: {
      shape: '{ menuPlacement: "top"|"left" }',
      help: '"top" (default) = tira horizontal de pestañas arriba, igual a Fase 0. "left" = sidebar vertical fijo a la izquierda en escritorio (colapsa a barra superior en móvil). Va en definition.layout.',
    },
    appearance: {
      shape: '{ background?: {type:"color", color:hex} | {type:"gradient", from:hex, to:hex, angle?:0-360} | {type:"image", url:httpUrl}, fontFamily?: "system"|"serif"|"mono"|"rounded" }',
      help: 'Va en definition.appearance. background: sin esto, se usa el fondo diario clásico (amanece/atardece según la hora); "color"/"gradient" son instantáneos; "image" acepta cualquier URL http(s) (mismo criterio que el fondo clásico del planner). fontFamily: 4 font-stacks del sistema (sin fetch externo, cero impacto de performance) — "rounded" es la más "amigable/redondeada", "serif" la más "editorial".',
    },
    recordDetail: {
      help: 'list/table/cards tienen "openDetail" (default true): tocar una fila abre un panel lateral DERECHO con TODOS los campos del catálogo de la colección (nunca omite ninguno), editables, más Guardar/Archivar/Eliminar — es la "ficha" de un registro (de cliente, de venta, de lo que sea). Archivar es reversible (marca _archived, las vistas lo excluyen por defecto — includeArchived:true en el binding las vuelve a mostrar); Eliminar es definitivo, con confirmación. Para bindings "system" el panel es de SOLO LECTURA (crear/editar recursos reales de WhatsPro no está en esta fase). openDetail:false lo desactiva si un widget es sólo informativo.',
    },
    tagsFieldType: {
      help: 'La colección "clients" tiene un campo "tags" (type:"tags"): en el formulario de alta y en la ficha se edita como chips (agregar/quitar), no como texto plano. Es el único campo tipo "tags" hoy — si un pedido necesita etiquetas en otra colección local, decilo explícitamente al armar la definition (no se puede inventar en otras colecciones sin agregarlo al catálogo primero). Para ETIQUETAS DE TAREAS no hace falta nada de esto: ya se editan dentro de la ficha de tarea que abre el bloque kanban.',
    },
    widths: BW_WIDTHS,
    widthHelp: 'Todo bloque (incluido columns) acepta "width" para controlar su tamaño en una grilla de 12 columnas: "full" (fila completa), "half" (mitad), "third" (un tercio), "two_thirds". Sin esto, "full". Es la forma de "cambiar el tamaño de los widgets" sin drag&drop.',
    collections: Object.fromEntries(
      BW_COLLECTION_KEYS.map((key) => [key, { label: BW_COLLECTIONS[key].label, description: BW_COLLECTIONS[key].description, fields: BW_COLLECTIONS[key].fields }]),
    ),
    systemSources: {
      help: 'Un binding {kind:"system", source, where?, sort?, select?, limit?} lee datos REALES de WhatsPro (no sólo las colecciones propias del planner) — mismo motor y misma whitelist que usa Radar Engine, aislado por equipo. El catálogo de campos exacto por source está más abajo (mismo formato que whatspro_radar_engine_catalog). where usa los operadores de conditionOps (más ricos que los locales: within_days, older_than_days, in, etc.).',
      sources: BW_SYSTEM_SOURCES,
      conditionOps: RADAR_CONDITION_OPS,
      fields: listRadarSources(),
    },
    blockTypes: BW_BLOCK_TYPES,
    filterOps: BW_FILTER_OPS,
    tones: BW_THEME_TONES,
    icons: BW_THEME_ICONS,
    customColorHelp: 'Todo bloque con "tone" también acepta "customColor" (hex de 6 dígitos, ej "#7c3aed"): si viene, GANA sobre tone y pinta ese color exacto en vez de uno de los 9 tonos cerrados. Usalo cuando el pedido especifica un color puntual ("quiero que sea violeta oscuro tipo #4c1d95"); para todo lo demás preferí los tones cerrados, se ven más consistentes entre sí.',
    menuItemShapes: {
      builtin: '{ kind:"builtin", id, tab: BW_BUILTIN_TABS, label?, icon?, order, visible, primary }',
      custom: '{ kind:"custom", id, viewId, label, icon?, order, visible, primary }',
    },
    blockShapes: {
      heading: '{ id, type:"heading", text, level:"1"|"2"|"3", icon?, tone?, customColor?, width? }',
      text: '{ id, type:"text", text, tone?, customColor?, width? }',
      metric: '{ id, type:"metric", label, binding, aggregate:"count"|"sum"|"avg", field? (obligatorio si sum/avg), icon?, tone?, customColor?, width? }',
      list: '{ id, type:"list", title?, binding, primaryField, secondaryField?, tone?, customColor?, width? }',
      table: '{ id, type:"table", title?, binding, columns: [campo, ...], width? }',
      cards: '{ id, type:"cards", title?, binding, titleField, subtitleField?, badgeField?, tone?, customColor?, width? }',
      form_button: '{ id, type:"form_button", label, collection (SÓLO colección local, no system), icon?, tone?, customColor?, width? }',
      rotating_text: '{ id, type:"rotating_text", title?, items: [texto, ...] (2 a 60), mode:"daily"|"random", icon?, tone?, customColor?, width? } — "daily" muestra items[díaDelAño % N], estable durante todo el día.',
      image: '{ id, type:"image", url: httpUrl, alt?, caption?, width? }',
      kanban: '{ id, type:"kanban", title?, projectId, width? } — tablero embebido de UN proyecto (projectId = _recordId real de un proyecto, lo trae whatspro_business_theme_get si ya se creó alguno, o se ve en la pestaña "Proyectos"). Reusa EXACTAMENTE el motor de tareas clásico: arrastrar entre columnas, alta rápida, y al abrir una tarea aparece la MISMA ficha completa (título, notas, checklist con tildes, tags, fechas, comentarios y vinculaciones a otras tareas) — no hay que armar nada de eso, ya existe. No permite crear/renombrar/borrar columnas desde el widget (eso sigue en la pestaña "Proyectos" completa).',
      quick_actions: '{ id, type:"quick_actions", title?, actions: [{label, icon?, tone?, action:{kind:"create", collection} | {kind:"navigate", viewId}}] (hasta 8), width? } — fila de botones: "create" abre el formulario de alta de una colección local; "navigate" cambia a otra vista custom de la misma definición.',
      columns: '{ id, type:"columns", lanes: [[bloque, ...], [bloque, ...]], width? } (hasta 4 carriles; para layouts más finos que width solo)',
    },
    bindingShapes: {
      local: '{ kind:"local", collection, filters?: [{field, op: eq|neq|contains|is_true|is_false, value?}] (hasta 5), sortField?, sortDir?:"asc"|"desc", limit? (hasta 200) }',
      system: '{ kind:"system", source, where?: [{field, op, value?}] (conditionOps, hasta 8), sort?: [{field, dir?}] (hasta 3), select?: [campo,...] (hasta 12), limit? (hasta 100) }',
    },
    pizarraNote: 'La pestaña clásica "Pizarra" (whiteboard, tab builtin) es hoy un placeholder sin funcionalidad real en la UI clásica — no se puede "rediseñar" reusándola porque no hay nada andando adentro. Para un pedido tipo "rediseñame la pizarra, fácil de usar en el celular", la mejor respuesta HOY es una vista custom con un bloque kanban (columnas apiladas verticalmente, pensado para poco ancho — ideal en móvil) y/o cards — no un canvas libre con arrastre en cualquier posición (eso es una interacción distinta que este motor no tiene todavía, ver Roadmap). Ofrecé esa alternativa en vez de fingir que se puede lo mismo.',
    exampleDefinition: bwDefaultThemeDefinition(),
    exampleKanbanView: {
      id: 'tareas-hoy',
      title: 'Tareas de hoy',
      icon: 'ClipboardList',
      tone: 'rose',
      blocks: [
        { id: 'qa1', type: 'quick_actions', actions: [{ label: 'Ver clientes', icon: 'Users', tone: 'rose', action: { kind: 'navigate', viewId: 'resumen-ejecutivo' } }], width: 'full' },
        { id: 'kb1', type: 'kanban', title: 'Mi proyecto principal', projectId: 'project-main', width: 'full' },
      ],
    },
    exampleCustomView: {
      id: 'resumen-ejecutivo',
      title: 'Resumen ejecutivo',
      icon: 'TrendingUp',
      tone: 'violet',
      blocks: [
        { id: 'h1', type: 'heading', text: 'Cómo viene el mes', level: '2', icon: 'Sparkles', tone: 'violet', width: 'full' },
        { id: 'm1', type: 'metric', label: 'Ventas cobradas', binding: { kind: 'local', collection: 'sales', filters: [{ field: 'status', op: 'eq', value: 'cobrado' }] }, aggregate: 'count', icon: 'DollarSign', tone: 'emerald', width: 'third' },
        { id: 'm2', type: 'metric', label: 'Clientes activos', binding: { kind: 'local', collection: 'clients', filters: [{ field: 'status', op: 'eq', value: 'activo' }] }, aggregate: 'count', icon: 'Users', tone: 'rose', width: 'third' },
        { id: 'm3', type: 'metric', label: 'Leads calientes (CRM)', binding: { kind: 'system', source: 'contacts', where: [{ field: 'funnel_stage', op: 'eq', value: 'caliente' }] }, aggregate: 'count', icon: 'TrendingUp', tone: 'amber', width: 'third' },
        { id: 'l1', type: 'list', title: 'Últimos clientes', binding: { kind: 'local', collection: 'clients', sortField: 'name', limit: 5 }, primaryField: 'name', secondaryField: 'status', width: 'half' },
        { id: 'rt1', type: 'rotating_text', title: 'Frase del día', items: ['Hoy es un buen día para cerrar una venta.', 'Un cliente feliz trae tres más.', 'Constancia > perfección.'], mode: 'daily', icon: 'Sparkles', tone: 'violet', width: 'half' },
        { id: 'fb1', type: 'form_button', label: 'Agregar cliente', collection: 'clients', icon: 'Users', tone: 'rose', width: 'full' },
      ],
    },
  };
}

export async function executeBusinessThemeReadTool(name: string, args: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  await assertPermission(context, 'miniAppsRead', MINI_APPS_PLUGIN);

  if (name === 'whatspro_business_theme_catalog') return catalogPayload();

  if (name === 'whatspro_business_theme_get') {
    const input = parse(getSchema, args);
    requireEnabledSlug(input.app_slug);
    const theme = await getBwTheme(context.teamId, input.app_slug);
    if (!theme) return { mode: 'default', definition: null, publishedDefinition: null };
    return { ...theme, validation: validateBwThemeDefinition(theme.definition) };
  }

  if (name === 'whatspro_business_theme_versions') {
    const input = parse(versionsSchema, args);
    requireEnabledSlug(input.app_slug);
    return listBwThemeVersions(context.teamId, input.app_slug);
  }

  if (name === 'whatspro_business_theme_validate') {
    const input = parse(validateSchema, args);
    requireEnabledSlug(input.app_slug);
    if (input.definition === undefined) {
      const theme = await getBwTheme(context.teamId, input.app_slug);
      if (!theme) throw new Error(`No hay tema guardado para "${input.app_slug}" todavía. Mandá definition inline o activá el modo custom primero.`);
      return validateBwThemeDefinition(theme.definition);
    }
    const parsed = bwThemeDefinitionSchema.safeParse(input.definition);
    if (!parsed.success) {
      return {
        ok: false,
        errors: parsed.error.issues.map((issue) => ({ severity: 'error', path: `/${issue.path.map(String).join('/')}`, message: issue.message })),
        warnings: [],
      };
    }
    return validateBwThemeDefinition(parsed.data);
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function executeBusinessThemeAction(name: string, args: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  await assertPermission(context, 'miniAppsWrite', MINI_APPS_PLUGIN);

  if (name === 'whatspro_business_theme_set_mode') {
    const input = parse(setModeSchema, args);
    requireEnabledSlug(input.app_slug);
    const theme = await setBwThemeMode({ teamId: context.teamId, userId: context.userId, appSlug: input.app_slug, mode: input.mode });
    await audit(context, 'business_theme.set_mode', theme.id);
    return theme;
  }

  if (name === 'whatspro_business_theme_apply') {
    const input = parse(applySchema, args);
    requireEnabledSlug(input.app_slug);
    const result = await applyBwTheme({
      teamId: context.teamId,
      userId: context.userId,
      appSlug: input.app_slug,
      definition: input.definition,
      expectedVersion: input.expected_version,
      dryRun: input.dry_run,
      publish: input.publish,
      summary: input.summary,
    });
    if (result.applied && result.theme) await audit(context, 'business_theme.apply', result.theme.id);
    return result;
  }

  if (name === 'whatspro_business_theme_publish') {
    const input = parse(publishSchema, args);
    requireEnabledSlug(input.app_slug);
    const theme = await publishBwTheme({ teamId: context.teamId, userId: context.userId, appSlug: input.app_slug, version: input.version });
    await audit(context, 'business_theme.publish', theme.id);
    return theme;
  }

  if (name === 'whatspro_business_theme_rollback') {
    const input = parse(rollbackSchema, args);
    requireEnabledSlug(input.app_slug);
    const theme = await rollbackBwTheme({ teamId: context.teamId, userId: context.userId, appSlug: input.app_slug, toVersion: input.to_version });
    await audit(context, 'business_theme.rollback', theme.id);
    return theme;
  }

  throw new Error(`Unknown tool: ${name}`);
}
