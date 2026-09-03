import 'server-only';

/**
 * Tools MCP del RADAR ENGINE: apps declarativas (vistas + componentes +
 * datasources + métricas + acciones) que una IA construye por conversación.
 *
 * Mismo patrón que `radar-actions.ts` (los widgets sueltos): descripciones
 * larguísimas orientadas a que la IA sepa CUÁNDO y CÓMO usar cada tool,
 * JSON Schema liviano en la superficie y validación zod fina adentro con los
 * schemas del contrato compartido (`lib/plugins/radar/shared/engine.ts`).
 *
 * La lógica de persistencia vive en `lib/plugins/radar/server/engine/*`:
 * acá sólo hay permisos, parseo, transformaciones en memoria y auditoría.
 */
import { z } from 'zod';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';
import {
  RADAR_ACTION_KINDS,
  RADAR_BINDING_DISPLAYS,
  RADAR_CONDITION_OPS,
  RADAR_ENGINE_LIMITS,
  RADAR_ENGINE_SLUG_REGEX,
  RADAR_INSIGHT_SEVERITIES,
  RADAR_INSIGHT_STATUSES,
  radarAppDefinitionSchema,
  radarComponentSchema,
  radarDatasourceSchema,
  radarGridSchema,
  radarInsightInputSchema,
  radarMetricSchema,
  radarPatchSchema,
  radarQuerySchema,
  radarUserStateSchema,
  radarViewSchema,
  type RadarActionKind,
  type RadarAppDefinition,
  type RadarBindingDisplay,
  type RadarConditionOp,
  type RadarComponent,
  type RadarPatchOp,
  type RadarView,
} from '@/lib/plugins/radar/shared/engine';
import { RADAR_ICONS, RADAR_TONES } from '@/lib/plugins/radar/shared/blocks';
import {
  applyRadarApp,
  archiveRadarApp,
  duplicateRadarApp,
  getRadarApp,
  getRadarAppVersion,
  listRadarAppVersions,
  listRadarApps,
  publishRadarApp,
  rollbackRadarApp,
} from '@/lib/plugins/radar/server/engine/apps';
import { applyJsonPatch } from '@/lib/plugins/radar/server/engine/patch';
import { validateRadarAppDefinition } from '@/lib/plugins/radar/server/engine/validate';
import {
  executeRadarDatasource,
  executeRadarQuery,
  listRadarSources,
  resolveRadarMetricValue,
} from '@/lib/plugins/radar/server/engine/data';
import { getRadarUserState, setRadarUserState } from '@/lib/plugins/radar/server/engine/state';
import {
  createRadarInsight,
  listRadarInsights,
  updateRadarInsightStatus,
} from '@/lib/plugins/radar/server/engine/insights';

const RADAR_PLUGIN = 'radar';

/* ------------------------------------------------------------------ */
/* Guías del catálogo: qué hace cada op, display y kind                */
/* ------------------------------------------------------------------ */

/**
 * Una línea por operador del DSL de condiciones. La lista plana del contrato
 * no le alcanza a una IA: sin el "para qué" termina filtrando fechas con `eq`.
 */
const CONDITION_OP_HELP: Record<RadarConditionOp, string> = {
  eq: 'el campo es exactamente igual a value',
  neq: 'el campo es distinto de value',
  gt: 'el campo (numérico o fecha) es mayor que value',
  gte: 'el campo es mayor o igual que value',
  lt: 'el campo es menor que value',
  lte: 'el campo es menor o igual que value',
  contains: 'el campo de texto contiene value (sin distinguir mayúsculas)',
  starts_with: 'el campo de texto empieza con value',
  in: 'el campo está dentro de la lista value (array de hasta 50)',
  not_in: 'el campo NO está dentro de la lista value',
  is_null: 'el campo está vacío (no lleva value)',
  not_null: 'el campo tiene algún valor (no lleva value)',
  within_days: 'el campo FECHA cae dentro de los últimos N días; value = N (número)',
  older_than_days: 'el campo FECHA es anterior a hace N días; value = N (número)',
};

/** Cómo dibuja el servidor el resultado de un datasource, display por display. */
const BINDING_DISPLAY_HELP: Record<RadarBindingDisplay, string> = {
  table: 'tabla con una columna por campo del select (o del map); ideal para filas heterogéneas',
  list: 'lista vertical de ítems título + detalle; usa map {title, detail, hint} para elegir los campos',
  contacts: 'tarjetas de contacto con avatar y acceso al chat; el source tiene que devolver contactos',
  tasks: 'lista de tareas con estado y vencimiento; el source tiene que devolver tareas',
  stat: 'filas dato/valor tipo ficha; para pocos registros con campos clave',
  tiles: 'mosaico de tarjetas chicas; para colecciones cortas y visuales',
};

/** Qué hace el cliente cuando el usuario toca una acción, kind por kind. */
const ACTION_KIND_HELP: Record<RadarActionKind, string> = {
  navigate: 'navega a una ruta INTERNA de WhatsPro (url = "/dashboard", "/contacts"…)',
  open_url: 'abre una URL externa https en otra pestaña (url obligatoria)',
  open_chat: 'abre la conversación de WhatsApp del contacto (contactId obligatorio)',
  open_contact: 'abre la ficha del contacto (contactId obligatorio)',
  open_app: 'abre otra app RADAR con {appSlug, view?, context?}; context admite hasta 12 valores escalares y recibe sourceApp automáticamente',
  copy: 'copia "text" al portapapeles (para números de pago, links, respuestas armadas)',
  refresh: 'vuelve a resolver la vista (re-ejecuta datasources y métricas)',
};

/* ------------------------------------------------------------------ */
/* App de ejemplo del catálogo                                          */
/* ------------------------------------------------------------------ */

/**
 * Definición COMPLETA y VÁLIDA lista para copiar: una vista con un binding de
 * métricas, un binding de datasource dibujado como contactos y un componente
 * estático con bloques. Tipada como RadarAppDefinition a propósito: si el
 * contrato cambia, esto deja de compilar antes de mentirle a una IA.
 */
const EXAMPLE_APP: RadarAppDefinition = {
  name: 'Panel de ventas',
  description: 'Leads calientes de la semana y cómo leerlos.',
  icon: 'Radar',
  tone: 'indigo',
  defaultView: 'inicio',
  datasources: [
    {
      key: 'leads-calientes',
      source: 'contacts',
      where: [
        { field: 'radar_score', op: 'gte', value: 70 },
        { field: 'updated_at', op: 'within_days', value: 7 },
      ],
      sort: [{ field: 'radar_score', dir: 'desc' }],
      limit: 10,
    },
  ],
  metrics: [
    {
      key: 'leads-nuevos-7d',
      label: 'Leads nuevos (7 días)',
      source: 'contacts',
      aggregation: 'count',
      where: [{ field: 'created_at', op: 'within_days', value: 7 }],
      format: 'number',
      icon: 'Users',
      tone: 'emerald',
    },
    {
      key: 'leads-calientes-total',
      label: 'Leads calientes',
      source: 'leads-calientes',
      aggregation: 'count',
      icon: 'Flame',
      tone: 'rose',
      hint: 'Score 70+ con actividad en la semana',
    },
  ],
  actions: [
    { key: 'ver-embudo', kind: 'navigate', label: 'Ver embudo', icon: 'Filter', url: '/dashboard' },
  ],
  views: [
    {
      slug: 'inicio',
      name: 'Inicio',
      icon: 'LayoutGrid',
      components: [
        {
          id: 'kpis-semana',
          title: 'Esta semana',
          binding: { kind: 'metrics', refs: ['leads-nuevos-7d', 'leads-calientes-total'], columns: 2 },
          grid: { desktop: { w: 12 } },
        },
        {
          id: 'lista-calientes',
          title: 'Leads calientes',
          icon: 'Flame',
          tone: 'rose',
          binding: {
            kind: 'datasource',
            ref: 'leads-calientes',
            display: 'contacts',
            limit: 10,
            emptyText: 'Sin leads calientes esta semana.',
          },
          actions: ['ver-embudo'],
          grid: { desktop: { w: 6 } },
        },
        {
          id: 'como-leer',
          title: 'Cómo leer este panel',
          icon: 'BookOpen',
          tone: 'slate',
          blocks: [
            {
              type: 'callout',
              variant: 'info',
              body: 'Un lead es "caliente" cuando su score Radar supera 70 y hubo actividad en los últimos 7 días. Tocá una tarjeta para abrir el chat.',
            },
          ],
          grid: { desktop: { w: 6 } },
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Fragmentos de descripción y de schema reutilizados                   */
/* ------------------------------------------------------------------ */

const SLUG_PATTERN = RADAR_ENGINE_SLUG_REGEX.source;

const SLUG_FIELD = {
  type: 'string',
  minLength: 2,
  maxLength: 48,
  pattern: SLUG_PATTERN,
  description: 'Slug de la app (minúsculas, números y guion, 2 a 48). Las apps existentes las lista whatspro_radar_app_list.',
} as const;

const PUBLISH_FIELD = {
  type: 'boolean',
  description: 'true publica la versión resultante en el mismo paso (lo que ve el usuario final). Sin esto el cambio queda en el BORRADOR y el usuario sigue viendo la última versión publicada; publicás después con whatspro_radar_app_publish.',
} as const;

const SUMMARY_FIELD = {
  type: 'string',
  maxLength: 300,
  description: 'Resumen de una línea del cambio, visible en el historial de versiones. Ej.: "agrega la vista Cobranzas con dos métricas".',
} as const;

const EXPECTED_VERSION_FIELD = {
  type: 'integer',
  minimum: 1,
  description: 'Control de concurrencia optimista: la versión del borrador que creés estar editando (la devuelven app_get y app_apply). Si otro proceso escribió en el medio, la llamada falla en vez de pisar su cambio. Recomendado siempre que edites una app existente.',
} as const;

const DEFINITION_FIELD_DESCRIPTION = [
  'La definición COMPLETA de la app como objeto JSON: { name, description?, icon?, tone?, ownerUserId?, defaultView?, views: [...], datasources?: [...], metrics?: [...], actions?: [...], navigation?: [...], theme?, visibility? }.',
  'Cada view tiene { slug, name, icon?, tone?, hint?, badgeMetric?, components: [...], visibility?, refreshSeconds? } y cada componente { id, title?, description?, icon?, tone?, grid?, blocks? | binding?, actions?, when?, refreshSeconds? }.',
  'El detalle EXACTO de cada campo, las listas cerradas de iconos/tonos/sources y un ejemplo completo listo para copiar los devuelve whatspro_radar_engine_catalog: llamala primero.',
  'Los bloques estáticos de un componente son los MISMOS del catálogo de whatspro_radar_block_catalog.',
  'Los iconos son editables por nivel: definition.icon (app), views[i].icon (vista), navigation[i].icon (pestaña), components[i].icon (tarjeta), metrics[i].icon (KPI) y actions[i].icon (botón). No uses Sparkles como comodín: elegí un icono que describa la función.',
  'Para conectar apps usá una action {kind:"open_app", appSlug:"app-destino", view?:"vista", context?:{customerId:123}}; el engine genera un deep-link seguro y agrega sourceApp.',
].join(' ');

/* ------------------------------------------------------------------ */
/* Herramientas de lectura                                              */
/* ------------------------------------------------------------------ */

export const radarEngineReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_radar_engine_catalog',
    description:
      'El MANUAL del Radar Engine: todo lo que una IA necesita para construir una app declarativa de Radar (vistas + componentes + datasources + métricas + acciones). Devuelve además icons, tones e iconEditing para elegir y cambiar iconos por nivel sin repetir Sparkles. Incluye howTo, sources reales, operadores, displays, tipos de acción, límites y exampleApp. Los componentes dibujan los MISMOS bloques de whatspro_radar_block_catalog. LLAMALA SIEMPRE ANTES DE whatspro_radar_app_apply: inventar un source, campo o icono hace que la validación rechace o degrade la app. No tiene parámetros y no toca la base de datos.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_radar_app_list',
    description:
      'Lista las apps del Radar Engine de este equipo, con slug, nombre, icono, tono, dueño, estado (draft/published/archived), versión del borrador, versión publicada y fecha de actualización. Usala antes de crear una app para no duplicar un slug que ya existe (whatspro_radar_app_apply sobre un slug existente lo EDITA, no crea otra), para responder "¿qué apps de Radar tenemos?" o para encontrar el slug exacto que piden las demás tools. Las archivadas no aparecen salvo que mandes include_archived=true.',
    inputSchema: {
      type: 'object',
      properties: {
        include_archived: { type: 'boolean', description: 'true incluye también las apps archivadas con whatspro_radar_app_manage. Por defecto, solo las vivas.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_app_get',
    description:
      'Devuelve UNA app del Radar Engine completa: el registro (slug, estado, versión del borrador, versión publicada) con su definition entera, el resultado de VALIDAR ese borrador contra los sources reales del equipo (errores y warnings con su path) y las últimas 10 versiones del historial. Es el paso previo obligado a cualquier edición: de acá salen la definition sobre la que trabajar y la version para expected_version. Con el parámetro version devuelve esa versión HISTÓRICA puntual en lugar del estado actual (para comparar antes de un rollback). Ejemplos: "¿cómo está armada la app de Noelia?" (slug="panel-noelia"); "mostrame cómo era la versión 3" (slug="panel-noelia", version=3).',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: {
        slug: SLUG_FIELD,
        version: { type: 'integer', minimum: 1, description: 'Número de versión histórica a devolver. Sin esto, el estado actual (borrador + validación + últimas versiones).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_app_versions',
    description:
      'Historial COMPLETO de versiones de una app del Radar Engine: número, resumen del cambio, autor y fecha de cada una, y cuál está publicada. whatspro_radar_app_get ya trae las últimas 10; ésta es para cuando hace falta el historial entero, típicamente para elegir el to_version de un whatspro_radar_app_rollback ("volvé la app a como estaba el lunes") o para auditar quién cambió qué.',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: SLUG_FIELD },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_datasource_preview',
    description:
      'Ejecuta un datasource y devuelve una MUESTRA de hasta 10 filas ({rows, count, note}), sin guardar nada. Es la herramienta para probar los datos ANTES de meter el datasource en una app: verificás que el source y los campos existen, que el where filtra lo que creés y qué columnas vas a tener para el "map" del binding. Dos formas de uso: {app_slug, key} ejecuta un datasource YA GUARDADO en esa app, y {datasource: {...}} ejecuta uno inline que todavía no guardaste (el objeto RadarDatasource completo: key, source, where?, sort?, limit?, select? — el detalle lo da whatspro_radar_engine_catalog). Ejemplo: probar {datasource:{key:"prueba", source:"contacts", where:[{field:"radar_score", op:"gte", value:70}]}} antes de un app_apply. El limit se fuerza a 10 acá; en la app puede ser hasta 100.',
    inputSchema: {
      type: 'object',
      properties: {
        app_slug: { ...SLUG_FIELD, description: 'App que tiene guardado el datasource a probar. Va junto con key. Omitilo si mandás datasource inline.' },
        key: { type: 'string', minLength: 2, maxLength: 48, pattern: SLUG_PATTERN, description: 'Key del datasource dentro de esa app (campo "key" de definition.datasources). Va junto con app_slug.' },
        datasource: { type: 'object', description: 'Datasource inline a probar SIN guardarlo: objeto RadarDatasource {key, source, where?, sort?, limit?, select?}. Los sources y operadores válidos los da whatspro_radar_engine_catalog. Excluyente con app_slug+key.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_query',
    description:
      'Consulta ad-hoc SEGURA sobre los sources del engine (sin SQL): un datasource sin key + agrupación opcional. Sirve para explorar los datos del equipo mientras diseñás una app ("¿cuántos contactos hay por etapa del embudo?") o para responder preguntas puntuales sin crear nada. El objeto query lleva {source, where?, sort?, limit?, select?, groupBy? (hasta 2 campos), metrics? (hasta 6: {aggregation: count|sum|avg|min|max, field?, as?})}. Con groupBy devuelve una fila por grupo con las métricas calculadas; sin groupBy, filas crudas. El limit se capea en 100. Ejemplo: {query:{source:"contacts", groupBy:["funnel_stage"], metrics:[{aggregation:"count", as:"total"}]}}. Los sources y campos válidos los da whatspro_radar_engine_catalog.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'object', description: 'Objeto RadarQuery: {source, where?, sort?, limit?, select?, groupBy?, metrics?}. El detalle exacto de cada campo lo da whatspro_radar_engine_catalog.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_metric_preview',
    description:
      'Calcula UNA métrica y devuelve {value, formatted} sin guardar nada: es la forma de verificar que una métrica da el número esperado ANTES de meterla en definition.metrics de una app. El objeto metric es el RadarMetric del contrato: {key, label, source, aggregation: count|sum|avg|min|max, field? (obligatorio salvo count), where?, format?, currency?, icon?, tone?, hint?}. "source" puede ser un source del sistema (contacts, tasks…) o la KEY de un datasource de una app: en ese caso mandá app_slug para que la métrica herede los datasources de esa app. Ejemplos: probar {metric:{key:"ventas-mes", label:"Ventas del mes", source:"sales", aggregation:"sum", field:"amount", format:"currency", currency:"ARS", where:[{field:"created_at", op:"within_days", value:30}]}}; o {app_slug:"panel-noelia", metric:{key:"calientes", label:"Calientes", source:"leads-calientes", aggregation:"count"}}.',
    inputSchema: {
      type: 'object',
      required: ['metric'],
      properties: {
        metric: { type: 'object', description: 'Objeto RadarMetric: {key, label, source, aggregation, field?, where?, format?, currency?, icon?, tone?, hint?}. El detalle exacto lo da whatspro_radar_engine_catalog.' },
        app_slug: { ...SLUG_FIELD, description: 'App cuyos datasources hereda la métrica, para que "source" pueda ser la key de un datasource guardado de esa app. Opcional.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_insight_list',
    description:
      'Lista los INSIGHTS de Radar del equipo: hallazgos accionables que las IA registran con whatspro_radar_insight_manage (oportunidades, riesgos, avisos) y que el usuario acepta, descarta o resuelve desde la UI. Cada uno trae título, descripción, severidad (info/opportunity/warning/critical), estado (new/seen/accepted/dismissed/resolved/expired), confianza 0-100, contacto y app asociados, evidencia y acción recomendada. Usala antes de crear un insight para no repetir uno que ya está abierto, o para responder "¿qué detectó Radar esta semana?". Ejemplo: status="new" + severity="critical" para lo urgente sin ver.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...RADAR_INSIGHT_STATUSES], description: 'Filtra por estado del ciclo de vida: new = sin ver, seen = visto, accepted = el usuario lo tomó, dismissed = descartado, resolved = resuelto, expired = venció solo.' },
        severity: { type: 'string', enum: [...RADAR_INSIGHT_SEVERITIES], description: 'Filtra por severidad: info, opportunity, warning o critical.' },
        contact_id: { type: 'integer', minimum: 1, description: 'Solo los insights vinculados a ese contacto.' },
        app_slug: { ...SLUG_FIELD, description: 'Solo los insights vinculados a esa app del engine.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Máximo de insights a devolver. Por defecto lo decide el servidor.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_validate',
    description:
      'Valida una definición de app del Radar Engine contra el contrato Y contra los sources reales del equipo, SIN escribir nada. Devuelve {ok, errors, warnings} con el path exacto de cada problema (p. ej. "/views/0/components/2/binding/ref"). Dos formas de uso excluyentes: {slug} valida el BORRADOR guardado de esa app, y {definition} valida una definición que todavía no guardaste (equivale a un whatspro_radar_app_apply con dry_run=true pero sin pisar nada ni necesitar slug). Usala como chequeo rápido mientras armás una definición larga, antes del apply final. Los errores bloquean la publicación; los warnings (un source desconocido, una ref rota) dejan guardar pero ese componente se dibuja en estado de error.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { ...SLUG_FIELD, description: 'App existente cuyo BORRADOR se valida. Excluyente con definition: mandá uno de los dos.' },
        definition: { type: 'object', description: `Definición completa a validar sin guardar. ${DEFINITION_FIELD_DESCRIPTION}` },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Herramientas de acción                                               */
/* ------------------------------------------------------------------ */

export const radarEngineActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_radar_app_apply',
    description:
      'LA herramienta central del Radar Engine: crea o reemplaza una app declarativa completa a partir de su definición JSON. Si el slug no existe, la crea; si existe, guarda una VERSIÓN nueva del borrador con esta definición (el historial no se pierde: whatspro_radar_app_rollback vuelve atrás). Es la que responde a pedidos como "Creá una vista Business Woman para Noelia con sus leads calientes, sus ventas del mes y sus tareas de hoy": armás la definition (vistas, componentes, datasources, métricas, acciones), la aplicás con dry_run=true para ver la validación sin escribir, corregís y aplicás en serio; después probás los datos con whatspro_radar_datasource_preview y publicás con publish=true o con whatspro_radar_app_publish. FLUJO OBLIGADO: llamá PRIMERO a whatspro_radar_engine_catalog (sources, operadores, límites y un exampleApp completo) — una definition inventada de memoria casi siempre referencia sources o campos que no existen. La respuesta devuelve el resultado entero, validation incluida: si applied es false, ahí están los issues exactos a corregir. Para cambios CHICOS sobre una app existente (mover un componente, cambiar un ancho, retocar un título) NO reenvíes la definición entera: usá whatspro_radar_ui_patch, whatspro_radar_view_manage o whatspro_radar_component_manage, que no arriesgan pisar el resto.',
    inputSchema: {
      type: 'object',
      required: ['slug', 'definition'],
      properties: {
        slug: { ...SLUG_FIELD, description: 'Slug estable de la app (minúsculas, números y guion, 2 a 48). Reusar un slug existente EDITA esa app (versión nueva del borrador); uno nuevo la crea. Ej.: "panel-noelia", "cobranzas".' },
        definition: { type: 'object', description: DEFINITION_FIELD_DESCRIPTION },
        expected_version: EXPECTED_VERSION_FIELD,
        dry_run: { type: 'boolean', description: 'true valida y muestra qué pasaría SIN escribir nada. Usalo siempre en el primer intento de una definición nueva.' },
        publish: PUBLISH_FIELD,
        summary: SUMMARY_FIELD,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_ui_patch',
    description:
      'Cambio QUIRÚRGICO sobre la definición de una app existente, sin reenviarla entera: un subset seguro de JSON Patch (replace/add/remove) aplicado al borrador, que se guarda como versión nueva. Es la herramienta correcta para retoques puntuales: ancho, título, icono, tono o contenido. Los iconos se pueden cambiar en /icon (app), /views/i/icon, /navigation/i/icon, /views/i/components/j/icon, /metrics/i/icon y /actions/i/icon; elegí valores de engine_catalog.icons y no repitas Sparkles como comodín. Los paths son JSON Pointers de la definition real que devuelve whatspro_radar_app_get. Ejemplos: cambiar una tarjeta → [{op:"replace", path:"/views/0/components/2/icon", value:"TrendingUp"}]; ensancharla → [{op:"replace", path:"/views/0/components/2/grid/desktop/w", value:8}]; renombrar la app → [{op:"replace", path:"/name", value:"Panel Noelia"}]. Hasta 40 ops por llamada; el resultado se valida completo antes de guardar. Para operaciones estructurales son más cómodas whatspro_radar_view_manage y whatspro_radar_component_manage; para rehacer la app entera, whatspro_radar_app_apply.',
    inputSchema: {
      type: 'object',
      required: ['slug', 'ops'],
      properties: {
        slug: SLUG_FIELD,
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: RADAR_ENGINE_LIMITS.maxPatchOps,
          items: { type: 'object' },
          description: 'Operaciones {op: "replace"|"add"|"remove", path: JSON Pointer que empieza con "/", value? (obligatorio en replace/add)} aplicadas en orden sobre el borrador. En arrays, "/-" agrega al final. Ej.: [{op:"replace", path:"/views/0/components/2/grid/desktop/w", value:8}].',
        },
        expected_version: EXPECTED_VERSION_FIELD,
        dry_run: { type: 'boolean', description: 'true muestra el resultado y la validación SIN guardar.' },
        publish: PUBLISH_FIELD,
        summary: SUMMARY_FIELD,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_view_manage',
    description:
      'Administra las VISTAS (pantallas) de una app del engine sin reenviar la definición entera. Cinco acciones: action="create" agrega una vista nueva (view = el objeto RadarView completo: {slug, name, icon?, tone?, hint?, badgeMetric?, components: [...], visibility?, refreshSeconds?}); action="update" REEMPLAZA una vista existente identificada por view_slug con el objeto view (si le cambiás el slug adentro, las referencias en defaultView y navigation se actualizan solas); action="delete" la borra (la única vista de la app no se puede borrar; defaultView y navigation se limpian solos); action="duplicate" la copia con new_slug (y name opcional) para usarla de plantilla; action="reorder" reordena las vistas mandando order=[slugs] — podés mandar una lista parcial con lo que va primero y el resto conserva su orden. Todo pasa por la validación completa antes de guardarse. Ejemplos: "Agregale a la app una pantalla de Cobranzas" (action="create", view={slug:"cobranzas", name:"Cobranzas", components:[...]}); "Duplicá la vista de Noelia para Carla" (action="duplicate", view_slug="noelia", new_slug="carla", name="Carla"). Los objetos view exactos los describe whatspro_radar_engine_catalog; la app actual la ves con whatspro_radar_app_get.',
    inputSchema: {
      type: 'object',
      required: ['slug', 'action'],
      properties: {
        slug: SLUG_FIELD,
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'duplicate', 'reorder'],
          description: 'create = vista nueva (usa view); update = reemplazar una vista (usa view_slug + view); delete = borrarla (usa view_slug); duplicate = copiarla (usa view_slug + new_slug, opcional name); reorder = reordenar (usa order).',
        },
        view: { type: 'object', description: 'Objeto RadarView COMPLETO para create/update: {slug, name, icon?, tone?, hint?, badgeMetric?, components: [al menos 1], visibility?, refreshSeconds?}. El detalle exacto lo da whatspro_radar_engine_catalog.' },
        view_slug: { type: 'string', minLength: 2, maxLength: 48, pattern: SLUG_PATTERN, description: 'Slug de la vista sobre la que se actúa (update/delete/duplicate), tal como figura en definition.views.' },
        new_slug: { type: 'string', minLength: 2, maxLength: 48, pattern: SLUG_PATTERN, description: 'SÓLO para duplicate: slug de la copia. No puede estar tomado por otra vista.' },
        name: { type: 'string', minLength: 1, maxLength: 60, description: 'SÓLO para duplicate: nombre visible de la copia. Ausente = "<nombre original> (copia)".' },
        order: {
          type: 'array',
          minItems: 1,
          maxItems: RADAR_ENGINE_LIMITS.maxViews,
          items: { type: 'string', minLength: 2, maxLength: 48, pattern: SLUG_PATTERN },
          description: 'SÓLO para reorder: slugs de vista en el orden deseado. Los que no mandes quedan después, en su orden actual; los desconocidos se ignoran.',
        },
        publish: PUBLISH_FIELD,
        summary: SUMMARY_FIELD,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_component_manage',
    description:
      'Administra los COMPONENTES de una vista de una app del engine, uno por uno y sin reenviar nada más. Cinco acciones: action="add" agrega un componente al final de la vista (component = objeto RadarComponent completo: {id, title?, description?, icon?, tone?, grid?, blocks? o binding?, actions?, when?, refreshSeconds?} — necesita blocks O binding); action="update" REEMPLAZA el componente component_id con el objeto component; action="remove" lo saca (el último componente de una vista no se puede sacar: las vistas necesitan al menos uno); action="move" lo mueve al índice position dentro de la vista (0 = primero); action="resize" le cambia sólo la grilla (grid = {desktop?: {x?, w?}, tablet?: {...}, mobile?: {...}} sobre 12 columnas — {desktop:{w:12}} es ancho completo, {desktop:{w:6}} media fila). Todo pasa por la validación completa antes de guardarse. Ejemplos: "Agregale a Inicio una tarjeta con los leads fríos" (action="add", view_slug="inicio", component={id:"leads-frios", binding:{kind:"datasource", ref:"leads-frios", display:"contacts"}}); "Poné el gráfico primero y a media fila" (action="move" + position=0, y después action="resize" + grid={desktop:{w:6}}). Para varios cambios de una sola vez, whatspro_radar_transaction_apply los aplica en forma atómica.',
    inputSchema: {
      type: 'object',
      required: ['slug', 'view_slug', 'action'],
      properties: {
        slug: SLUG_FIELD,
        view_slug: { type: 'string', minLength: 2, maxLength: 48, pattern: SLUG_PATTERN, description: 'Vista dueña del componente, tal como figura en definition.views.' },
        action: {
          type: 'string',
          enum: ['add', 'update', 'remove', 'move', 'resize'],
          description: 'add = componente nuevo al final (usa component); update = reemplazarlo (usa component_id + component); remove = sacarlo (usa component_id); move = moverlo de lugar (usa component_id + position); resize = cambiarle la grilla (usa component_id + grid).',
        },
        component: { type: 'object', description: 'Objeto RadarComponent COMPLETO para add/update: {id, title?, description?, icon?, tone?, grid?, blocks? o binding?, actions?, when?, refreshSeconds?}. Necesita blocks (estático) o binding (datos vivos). El detalle exacto lo da whatspro_radar_engine_catalog; los bloques son los de whatspro_radar_block_catalog.' },
        component_id: { type: 'string', minLength: 2, maxLength: 48, pattern: SLUG_PATTERN, description: 'Id del componente sobre el que se actúa (update/remove/move/resize), tal como figura en la vista.' },
        position: { type: 'integer', minimum: 0, maximum: RADAR_ENGINE_LIMITS.maxComponentsPerView - 1, description: 'SÓLO para move: índice destino dentro de la vista (0 = primero). Se recorta al final si te pasás.' },
        grid: { type: 'object', description: 'SÓLO para resize: objeto RadarGrid {desktop?: {x?: 0-11, w?: 1-12}, tablet?: {...}, mobile?: {...}}. Reemplaza la grilla del componente.' },
        publish: PUBLISH_FIELD,
        summary: SUMMARY_FIELD,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_app_publish',
    description:
      'Publica una app del Radar Engine: congela una versión del borrador como la definición que ve el usuario final. Hasta que publicás, todos los apply/patch/manage editan el BORRADOR y el usuario sigue viendo la última versión publicada (o nada, si nunca se publicó): éste es el paso que "sube" el trabajo. Sin version publica el borrador actual; con version publica esa versión puntual del historial. Las tools de escritura también aceptan publish=true para hacerlo en el mismo paso; ésta existe para publicar DESPUÉS de revisar, que es el flujo recomendado: apply → app_get/preview para verificar → publish. Ejemplo: "Listo, mostrásela a Noelia" → whatspro_radar_app_publish(slug="panel-noelia").',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: {
        slug: SLUG_FIELD,
        version: { type: 'integer', minimum: 1, description: 'Versión puntual del historial a publicar. Sin esto, el borrador actual.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_app_rollback',
    description:
      'Vuelve una app del Radar Engine a una versión anterior. NO borra historia: crea una VERSIÓN NUEVA cuyo contenido es el de to_version y la publica, así el historial completo sigue disponible y el propio rollback se puede revertir con otro rollback. Es la respuesta a "volvé la app a como estaba ayer" o al usuario al que un cambio le rompió la pantalla. El número de versión lo sacás de whatspro_radar_app_versions (historial completo, con resumen y fecha de cada una) o de las últimas 10 que trae whatspro_radar_app_get; con whatspro_radar_app_get(slug, version=N) podés inspeccionar el contenido exacto antes de volver.',
    inputSchema: {
      type: 'object',
      required: ['slug', 'to_version'],
      properties: {
        slug: SLUG_FIELD,
        to_version: { type: 'integer', minimum: 1, description: 'Versión del historial a restaurar. OBLIGATORIO. La lista whatspro_radar_app_versions.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_app_manage',
    description:
      'Ciclo de vida de las apps del Radar Engine: lo que no es editar su contenido. Dos acciones: action="duplicate" copia una app entera a un slug nuevo (new_slug obligatorio, name opcional) — la forma de usar una app como plantilla, p. ej. "armale a Carla el mismo panel que tiene Noelia" (slug="panel-noelia", new_slug="panel-carla", name="Panel Carla"; después le cambiás el ownerUserId y los filtros con whatspro_radar_ui_patch); la copia nace como borrador sin publicar. action="archive" retira la app de la circulación sin borrarla: desaparece para el usuario final pero conserva su definición e historial, y whatspro_radar_app_list(include_archived=true) la sigue mostrando. No hay borrado físico por MCP: archivar es la operación más destructiva disponible, a propósito.',
    inputSchema: {
      type: 'object',
      required: ['action', 'slug'],
      properties: {
        action: {
          type: 'string',
          enum: ['duplicate', 'archive'],
          description: 'duplicate = copiar la app a new_slug (plantilla); archive = retirarla sin borrar su historial.',
        },
        slug: SLUG_FIELD,
        new_slug: { type: 'string', minLength: 2, maxLength: 48, pattern: SLUG_PATTERN, description: 'SÓLO para duplicate: slug de la copia. No puede estar tomado por otra app.' },
        name: { type: 'string', minLength: 1, maxLength: 80, description: 'SÓLO para duplicate: nombre visible de la copia. Ausente = "<nombre original> (copia)".' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_user_state',
    description:
      'Estado libre POR USUARIO del Radar Engine: un JSON chico donde se guardan preferencias y memoria de uso (tab elegida, filtros activos, tarjetas fijadas, avisos silenciados). action="get" lo lee (con app_slug lee el estado de esa app; sin app_slug, el estado global del usuario en Radar). action="set" lo escribe: por defecto MERGEA el objeto state sobre el existente clave por clave (lo que no mandás no se toca), y con replace=true lo reemplaza entero. Es estado del USUARIO que está hablando, no del equipo: no lo uses para datos compartidos (para eso están la definición de la app o los insights). Ejemplos: "acordate de que Noelia prefiere arrancar en la vista de cobranzas" (action="set", app_slug="panel-noelia", state={preferredView:"cobranzas"}); leerlo al arrancar para retomar donde quedó.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['get', 'set'], description: 'get = leer el estado; set = escribirlo (merge por defecto, replace=true para pisar todo).' },
        app_slug: { ...SLUG_FIELD, description: 'App a la que pertenece el estado. Sin esto, el estado global del usuario en Radar.' },
        state: { type: 'object', description: 'SÓLO para set: objeto JSON plano con las claves a guardar (hasta 60 caracteres por clave; valores libres y chicos). Se mergea sobre el existente salvo replace=true.' },
        replace: { type: 'boolean', description: 'SÓLO para set: true descarta el estado anterior y guarda exactamente state. Por defecto false (merge).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_insight_manage',
    description:
      'Registra o actualiza INSIGHTS de Radar: hallazgos accionables que quedan guardados con su ciclo de vida, para que el usuario los vea, acepte o descarte desde la UI (y otras IA no repitan el análisis). action="create" registra uno nuevo: title (obligatorio), description, severity (info/opportunity/warning/critical), confidence 0-100, contact_id y app_slug para vincularlo, source (qué análisis lo produjo), evidence (hasta 10 citas o datos que lo respaldan), recommended_action (qué conviene hacer) y expires_at (ISO 8601; pasa a expired solo). action="update_status" mueve uno existente de estado (id + status: new/seen/accepted/dismissed/resolved/expired) — típicamente resolved cuando la acción recomendada ya se hizo, o dismissed si el usuario lo descartó por chat. ANTES de crear, mirá whatspro_radar_insight_list para no duplicar uno abierto sobre lo mismo. Ejemplos: "El cliente Mano a Mano lleva 12 días sin responder y tenía score 88" → create con severity="warning", contact_id=12, evidence=[...], recommended_action="reactivar con el audio de seguimiento"; el usuario dice "ya lo llamé, listo" → update_status con status="resolved".',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update_status'], description: 'create = insight nuevo (usa title y los campos opcionales); update_status = cambiar el estado de uno existente (usa id + status).' },
        title: { type: 'string', minLength: 1, maxLength: 200, description: 'SÓLO para create (obligatorio ahí): el hallazgo en una frase. Ej.: "3 leads calientes sin respuesta hace 48 h".' },
        description: { type: 'string', maxLength: 2000, description: 'create: el detalle del hallazgo, en texto plano.' },
        severity: { type: 'string', enum: [...RADAR_INSIGHT_SEVERITIES], description: 'create: info = dato, opportunity = chance de venta, warning = riesgo, critical = urgente. Por defecto lo decide el servidor.' },
        confidence: { type: 'integer', minimum: 0, maximum: 100, description: 'create: confianza 0-100 en el hallazgo.' },
        contact_id: { type: 'integer', minimum: 1, description: 'create: contacto al que refiere el insight, si es de un cliente puntual.' },
        app_slug: { ...SLUG_FIELD, description: 'create: app del engine a la que pertenece el insight, si nació de una app.' },
        source: { type: 'string', maxLength: 80, description: 'create: qué análisis o proceso lo produjo. Ej.: "analisis-semanal", "revision-embudo".' },
        evidence: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 500 }, description: 'create: citas o datos concretos que respaldan el hallazgo, uno por ítem.' },
        recommended_action: { type: 'string', maxLength: 500, description: 'create: qué conviene hacer al respecto, en imperativo.' },
        expires_at: { type: 'string', description: 'create: fecha ISO 8601 en la que el insight deja de tener sentido y pasa a expired solo. Ej.: "2026-09-01T00:00:00Z".' },
        id: { type: 'integer', minimum: 1, description: 'SÓLO para update_status: id del insight, tal como lo devuelve whatspro_radar_insight_list.' },
        status: { type: 'string', enum: [...RADAR_INSIGHT_STATUSES], description: 'SÓLO para update_status: estado nuevo. resolved = la acción ya se hizo; dismissed = descartado; accepted = el usuario lo tomó.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_transaction_apply',
    description:
      'Aplica VARIAS ediciones sobre una app del engine en una sola operación ATÓMICA: se carga la definición UNA vez, se aplican las operaciones en memoria EN ORDEN, se valida el resultado final completo y se guarda con UNA sola versión nueva. SI CUALQUIER OPERACIÓN FALLA, NO SE ESCRIBE NADA: la respuesta dice exactamente cuál falló (índice y tool) y por qué, y la app queda como estaba. Es la herramienta para reorganizaciones grandes que quedarían rotas a medias si se hicieran de a una: "agregá la vista Cobranzas, mové el gráfico de ventas ahí y ensanchá los KPIs" es UNA transacción de tres operaciones, no tres llamadas. Cada operación es {tool, data}: tool="ui_patch" con data={ops:[...]} (mismo formato que whatspro_radar_ui_patch), tool="view_manage" con data={action, view?, view_slug?, new_slug?, name?, order?} (mismo formato que whatspro_radar_view_manage, sin slug/publish), tool="component_manage" con data={action, view_slug, component?, component_id?, position?, grid?} (mismo formato que whatspro_radar_component_manage, sin slug/publish). Hasta 20 operaciones; el historial registra una única versión con todo el cambio, así que un rollback también lo deshace entero.',
    inputSchema: {
      type: 'object',
      required: ['slug', 'operations'],
      properties: {
        slug: SLUG_FIELD,
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: { type: 'object' },
          description: 'Operaciones {tool: "ui_patch"|"view_manage"|"component_manage", data: {...}} aplicadas en orden sobre la MISMA definición en memoria. data lleva los mismos campos que la tool homónima, sin slug ni publish/summary/expected_version (esos van a nivel transacción). Todo o nada: una que falle anula el lote entero.',
        },
        expected_version: EXPECTED_VERSION_FIELD,
        publish: PUBLISH_FIELD,
        summary: SUMMARY_FIELD,
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Schemas de entrada                                                   */
/* ------------------------------------------------------------------ */

const slugSchema = z.string().trim().regex(RADAR_ENGINE_SLUG_REGEX, 'slug en minúsculas: letras, números y guion (2 a 48)');

const appListSchema = z.object({
  include_archived: z.boolean().optional(),
});

const appGetSchema = z.object({
  slug: slugSchema,
  version: z.number().int().positive().optional(),
});

const appVersionsSchema = z.object({ slug: slugSchema });

const datasourcePreviewSchema = z.object({
  app_slug: slugSchema.optional(),
  key: slugSchema.optional(),
  datasource: z.unknown().optional(),
}).refine(
  (value) => value.datasource != null || (value.app_slug != null && value.key != null),
  'mandá {app_slug, key} (datasource guardado) O {datasource} (inline)',
).refine(
  (value) => !(value.datasource != null && (value.app_slug != null || value.key != null)),
  'datasource inline es excluyente con app_slug/key: mandá UNA de las dos formas',
);

const querySchema = z.object({ query: z.unknown() });

const metricPreviewSchema = z.object({
  metric: z.unknown(),
  app_slug: slugSchema.optional(),
});

const insightListSchema = z.object({
  status: z.enum(RADAR_INSIGHT_STATUSES).optional(),
  severity: z.enum(RADAR_INSIGHT_SEVERITIES).optional(),
  contact_id: z.number().int().positive().optional(),
  app_slug: slugSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const validateSchema = z.object({
  slug: slugSchema.optional(),
  definition: z.unknown().optional(),
}).refine(
  (value) => (value.slug != null) !== (value.definition != null),
  'mandá slug O definition, exactamente uno de los dos',
);

/** Campos comunes de toda escritura que pasa por applyRadarApp. */
const writeCommonSchema = z.object({
  expected_version: z.number().int().positive().optional(),
  dry_run: z.boolean().optional(),
  publish: z.boolean().optional(),
  summary: z.string().trim().max(300).optional(),
});

const appApplySchema = writeCommonSchema.extend({
  slug: slugSchema,
  definition: z.unknown(),
});

const uiPatchSchema = writeCommonSchema.extend({
  slug: slugSchema,
  ops: z.unknown(),
});

/**
 * Los campos de view_manage y component_manage se validan en dos capas: esta
 * forma laxa (que también usa la transacción para cada operación) y los checks
 * por acción de `applyViewOperation` / `applyComponentOperation`, que son los
 * que dan errores con nombre y apellido.
 */
const viewOperationSchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'duplicate', 'reorder']),
  view: z.unknown().optional(),
  view_slug: slugSchema.optional(),
  new_slug: slugSchema.optional(),
  name: z.string().trim().min(1).max(60).optional(),
  order: z.array(slugSchema).min(1).max(RADAR_ENGINE_LIMITS.maxViews).optional(),
});
type ViewOperation = z.infer<typeof viewOperationSchema>;

const viewManageSchema = viewOperationSchema.extend({
  slug: slugSchema,
  publish: z.boolean().optional(),
  summary: z.string().trim().max(300).optional(),
});

const componentOperationSchema = z.object({
  action: z.enum(['add', 'update', 'remove', 'move', 'resize']),
  view_slug: slugSchema,
  component: z.unknown().optional(),
  component_id: slugSchema.optional(),
  position: z.number().int().min(0).max(RADAR_ENGINE_LIMITS.maxComponentsPerView - 1).optional(),
  grid: z.unknown().optional(),
});
type ComponentOperation = z.infer<typeof componentOperationSchema>;

const componentManageSchema = componentOperationSchema.extend({
  slug: slugSchema,
  publish: z.boolean().optional(),
  summary: z.string().trim().max(300).optional(),
});

const appPublishSchema = z.object({
  slug: slugSchema,
  version: z.number().int().positive().optional(),
});

const appRollbackSchema = z.object({
  slug: slugSchema,
  to_version: z.number().int().positive(),
});

const appManageSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('duplicate'),
    slug: slugSchema,
    new_slug: slugSchema,
    name: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({
    action: z.literal('archive'),
    slug: slugSchema,
  }),
]);

const userStateSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('get'),
    app_slug: slugSchema.optional(),
  }),
  z.object({
    action: z.literal('set'),
    app_slug: slugSchema.optional(),
    state: z.unknown(),
    replace: z.boolean().optional(),
  }),
]);

const insightManageSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    severity: z.enum(RADAR_INSIGHT_SEVERITIES).optional(),
    confidence: z.number().int().min(0).max(100).optional(),
    contact_id: z.number().int().positive().optional(),
    app_slug: slugSchema.optional(),
    source: z.string().trim().max(80).optional(),
    evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(10).optional(),
    recommended_action: z.string().trim().max(500).optional(),
    expires_at: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal('update_status'),
    id: z.number().int().positive(),
    status: z.enum(RADAR_INSIGHT_STATUSES),
  }),
]);

const transactionOperationSchema = z.object({
  tool: z.enum(['ui_patch', 'view_manage', 'component_manage']),
  data: z.record(z.string(), z.unknown()),
});

const transactionApplySchema = z.object({
  slug: slugSchema,
  operations: z.array(transactionOperationSchema).min(1).max(20),
  expected_version: z.number().int().positive().optional(),
  publish: z.boolean().optional(),
  summary: z.string().trim().max(300).optional(),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Como `parse` pero para valores ANIDADOS (una definition, una view, un array
 * de ops): etiqueta el error con qué objeto estaba mal para que la IA sepa
 * cuál de sus argumentos corregir.
 */
function parseValue<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || label}: ${issue.message}`)
      .join('; ');
    throw new Error(`${label} inválido: ${detail}. El contrato exacto lo da whatspro_radar_engine_catalog.`);
  }
  return parsed.data;
}

/** Sources conocidos del sistema, para la validación semántica. */
function knownSourceNames(): string[] {
  return listRadarSources().map((descriptor) => descriptor.source);
}

/** App existente o error accionable (con la lista real de slugs cerca). */
async function requireApp(context: GrokActionContext, slug: string) {
  const app = await getRadarApp(context.teamId, slug);
  if (!app) {
    const apps = await listRadarApps(context.teamId, { includeArchived: true });
    const existing = apps.map((item) => item.slug).join(', ') || '(ninguna)';
    throw new Error(
      `No existe ninguna app del engine con el slug "${slug}" en este equipo. Apps existentes: ${existing}. Verificá con whatspro_radar_app_list, o creala con whatspro_radar_app_apply.`,
    );
  }
  return app;
}

/** Copia profunda del borrador: las transformaciones mutan la copia, nunca el registro. */
function cloneDefinition(definition: RadarAppDefinition): RadarAppDefinition {
  return structuredClone(definition);
}

function findView(definition: RadarAppDefinition, viewSlug: string): RadarView {
  const view = definition.views.find((candidate) => candidate.slug === viewSlug);
  if (!view) {
    throw new Error(
      `La vista "${viewSlug}" no existe en esta app. Vistas actuales: ${definition.views.map((candidate) => candidate.slug).join(', ')}.`,
    );
  }
  return view;
}

/** Limpia defaultView y navigation cuando una vista desaparece o cambia de slug. */
function repointViewReferences(definition: RadarAppDefinition, oldSlug: string, newSlug: string | null) {
  if (definition.defaultView === oldSlug) {
    const fallback = newSlug ?? definition.views[0]?.slug;
    if (fallback) definition.defaultView = fallback;
    else delete definition.defaultView;
  }
  if (definition.navigation) {
    if (newSlug) {
      for (const item of definition.navigation) {
        if (item.view === oldSlug) item.view = newSlug;
      }
    } else {
      definition.navigation = definition.navigation.filter((item) => item.view !== oldSlug);
      if (!definition.navigation.length) delete definition.navigation;
    }
  }
}

/**
 * Transformación pura de una operación de VISTA sobre la definición en
 * memoria. La usan whatspro_radar_view_manage y la transacción: tira Error
 * con mensaje accionable y no escribe nada.
 */
function applyViewOperation(definition: RadarAppDefinition, op: ViewOperation): void {
  if (op.action === 'create') {
    if (op.view == null) throw new Error('action="create" necesita el objeto "view" (RadarView completo).');
    const view = parseValue(radarViewSchema, op.view, 'view');
    if (definition.views.some((candidate) => candidate.slug === view.slug)) {
      throw new Error(`Ya existe una vista con el slug "${view.slug}" en esta app: usá action="update" para reemplazarla, u otro slug.`);
    }
    if (definition.views.length >= RADAR_ENGINE_LIMITS.maxViews) {
      throw new Error(`La app ya tiene el máximo de ${RADAR_ENGINE_LIMITS.maxViews} vistas.`);
    }
    definition.views.push(view);
    return;
  }

  if (op.action === 'update') {
    if (!op.view_slug) throw new Error('action="update" necesita "view_slug" (la vista a reemplazar).');
    if (op.view == null) throw new Error('action="update" necesita el objeto "view" (RadarView completo que reemplaza al actual).');
    const view = parseValue(radarViewSchema, op.view, 'view');
    const index = definition.views.findIndex((candidate) => candidate.slug === op.view_slug);
    if (index < 0) findView(definition, op.view_slug); // tira el error con la lista real
    if (view.slug !== op.view_slug && definition.views.some((candidate) => candidate.slug === view.slug)) {
      throw new Error(`No se puede renombrar la vista a "${view.slug}": ya hay otra vista con ese slug.`);
    }
    definition.views[index] = view;
    if (view.slug !== op.view_slug) repointViewReferences(definition, op.view_slug, view.slug);
    return;
  }

  if (op.action === 'delete') {
    if (!op.view_slug) throw new Error('action="delete" necesita "view_slug" (la vista a borrar).');
    findView(definition, op.view_slug);
    if (definition.views.length <= 1) {
      throw new Error('No se puede borrar la única vista de la app: una app necesita al menos una vista. Agregá otra antes, o archivá la app con whatspro_radar_app_manage.');
    }
    definition.views = definition.views.filter((candidate) => candidate.slug !== op.view_slug);
    repointViewReferences(definition, op.view_slug, null);
    return;
  }

  if (op.action === 'duplicate') {
    if (!op.view_slug) throw new Error('action="duplicate" necesita "view_slug" (la vista a copiar).');
    if (!op.new_slug) throw new Error('action="duplicate" necesita "new_slug" (el slug de la copia).');
    const source = findView(definition, op.view_slug);
    if (definition.views.some((candidate) => candidate.slug === op.new_slug)) {
      throw new Error(`Ya existe una vista con el slug "${op.new_slug}": elegí otro new_slug.`);
    }
    if (definition.views.length >= RADAR_ENGINE_LIMITS.maxViews) {
      throw new Error(`La app ya tiene el máximo de ${RADAR_ENGINE_LIMITS.maxViews} vistas.`);
    }
    const copy = structuredClone(source);
    copy.slug = op.new_slug;
    copy.name = (op.name ?? `${source.name} (copia)`).slice(0, 60);
    const index = definition.views.findIndex((candidate) => candidate.slug === op.view_slug);
    definition.views.splice(index + 1, 0, copy);
    return;
  }

  // reorder
  if (!op.order?.length) throw new Error('action="reorder" necesita "order" (array de slugs de vista en el orden deseado).');
  const bySlug = new Map(definition.views.map((view) => [view.slug, view]));
  const picked: RadarView[] = [];
  for (const viewSlug of op.order) {
    const view = bySlug.get(viewSlug);
    if (view) {
      picked.push(view);
      bySlug.delete(viewSlug);
    }
  }
  if (!picked.length) {
    throw new Error(
      `Ninguno de los slugs de "order" existe en esta app. Vistas actuales: ${definition.views.map((view) => view.slug).join(', ')}.`,
    );
  }
  definition.views = [...picked, ...definition.views.filter((view) => bySlug.has(view.slug))];
}

/**
 * Transformación pura de una operación de COMPONENTE. Mismo criterio que
 * `applyViewOperation`: memoria, errores claros, nada de escritura.
 */
function applyComponentOperation(definition: RadarAppDefinition, op: ComponentOperation): void {
  const view = findView(definition, op.view_slug);

  const findIndex = (componentId: string) => {
    const index = view.components.findIndex((candidate) => candidate.id === componentId);
    if (index < 0) {
      throw new Error(
        `El componente "${componentId}" no existe en la vista "${view.slug}". Componentes actuales: ${view.components.map((candidate) => candidate.id).join(', ')}.`,
      );
    }
    return index;
  };

  if (op.action === 'add') {
    if (op.component == null) throw new Error('action="add" necesita el objeto "component" (RadarComponent completo, con blocks o binding).');
    const component = parseValue(radarComponentSchema, op.component, 'component');
    if (view.components.some((candidate) => candidate.id === component.id)) {
      throw new Error(`Ya existe un componente con el id "${component.id}" en la vista "${view.slug}": usá action="update" o cambiale el id.`);
    }
    if (view.components.length >= RADAR_ENGINE_LIMITS.maxComponentsPerView) {
      throw new Error(`La vista "${view.slug}" ya tiene el máximo de ${RADAR_ENGINE_LIMITS.maxComponentsPerView} componentes.`);
    }
    view.components.push(component);
    return;
  }

  if (op.action === 'update') {
    if (!op.component_id) throw new Error('action="update" necesita "component_id" (el componente a reemplazar).');
    if (op.component == null) throw new Error('action="update" necesita el objeto "component" (RadarComponent completo que reemplaza al actual).');
    const component = parseValue(radarComponentSchema, op.component, 'component');
    const index = findIndex(op.component_id);
    if (component.id !== op.component_id && view.components.some((candidate) => candidate.id === component.id)) {
      throw new Error(`No se puede renombrar el componente a "${component.id}": ya hay otro con ese id en la vista.`);
    }
    view.components[index] = component;
    return;
  }

  if (op.action === 'remove') {
    if (!op.component_id) throw new Error('action="remove" necesita "component_id" (el componente a sacar).');
    const index = findIndex(op.component_id);
    if (view.components.length <= 1) {
      throw new Error(`No se puede sacar el único componente de la vista "${view.slug}": una vista necesita al menos uno. Si sobra la vista entera, usá whatspro_radar_view_manage action="delete".`);
    }
    view.components.splice(index, 1);
    return;
  }

  if (op.action === 'move') {
    if (!op.component_id) throw new Error('action="move" necesita "component_id" (el componente a mover).');
    if (op.position == null) throw new Error('action="move" necesita "position" (índice destino dentro de la vista, 0 = primero).');
    const index = findIndex(op.component_id);
    const [component] = view.components.splice(index, 1);
    const target = Math.min(op.position, view.components.length);
    view.components.splice(target, 0, component as RadarComponent);
    return;
  }

  // resize
  if (!op.component_id) throw new Error('action="resize" necesita "component_id" (el componente a redimensionar).');
  if (op.grid == null) throw new Error('action="resize" necesita "grid" (objeto RadarGrid, p. ej. {desktop:{w:8}}).');
  const grid = parseValue(radarGridSchema, op.grid, 'grid');
  const index = findIndex(op.component_id);
  view.components[index] = { ...(view.components[index] as RadarComponent), grid };
}

/**
 * Empaqueta el resultado de `applyRadarApp` para el MCP: si no se aplicó, la
 * respuesta lo dice en palabras y deja los issues a mano, para que la IA
 * corrija en el siguiente intento en vez de asumir que salió bien.
 */
function describeApplyResult(result: Awaited<ReturnType<typeof applyRadarApp>>, dryRun: boolean | undefined) {
  const validation = result.validation;
  return {
    ...result,
    success: result.applied,
    ...(dryRun ? { note: 'dry_run: NO se escribió nada. Esto es lo que pasaría al aplicar en serio.' } : {}),
    ...(!result.applied && !dryRun
      ? {
          note: `No se escribió nada: la validación encontró ${validation?.errors?.length ?? 0} error(es). Corregí los issues listados en "validation" (cada uno trae el path exacto dentro de la definición) y reintentá; whatspro_radar_engine_catalog tiene el contrato completo, los sources reales y un ejemplo válido.`,
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Implementaciones: lectura                                            */
/* ------------------------------------------------------------------ */

async function engineCatalog(_input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  return {
    object: 'radar_engine_catalog',
    howTo: [
      'Una app del Radar Engine es un JSON versionado: views (pantallas) → components (tarjetas en una grilla de 12 columnas) que muestran blocks estáticos o un binding a datos vivos, más datasources (de dónde salen los datos), metrics (números agregados) y actions (botones).',
      'Ciclo recomendado: 1) llamá esta tool y mirá "sources" y "exampleApp"; 2) armá la definition y aplicala con whatspro_radar_app_apply(dry_run=true) para ver la validación sin escribir; 3) corregí y aplicá en serio; 4) probá los datos reales con whatspro_radar_datasource_preview y whatspro_radar_metric_preview; 5) publicá con whatspro_radar_app_publish (hasta ahí el usuario no ve nada).',
      'Los componentes dibujan los MISMOS bloques del catálogo de whatspro_radar_block_catalog: para el detalle de cada bloque estático (card, kpi, barChart…) consultá aquél.',
      'Para editar una app existente no reenvíes la definición entera: whatspro_radar_ui_patch (retoques), whatspro_radar_view_manage (pantallas), whatspro_radar_component_manage (tarjetas) y whatspro_radar_transaction_apply (varios cambios atómicos).',
      'Los iconos deben describir la función, no el hecho de que la app use IA. Sparkles queda reservado para una función generativa explícita; app, vistas, tarjetas, métricas y acciones pueden tener iconos distintos.',
      'Un source o campo que no existe no rompe la app: la validación lo marca como warning y ese componente se dibuja con su estado de error — pero verificalo antes con "sources" de acá abajo, que es la lista real de este sistema.',
    ].join(' '),
    sources: listRadarSources(),
    icons: RADAR_ICONS,
    tones: RADAR_TONES,
    iconEditing: {
      app: 'definition.icon — p. ej. Briefcase para una app de trabajo',
      view: 'definition.views[i].icon — p. ej. CalendarDays para Hoy',
      navigation: 'definition.navigation[i].icon — permite que la pestaña use un icono distinto al default de la vista',
      component: 'definition.views[i].components[j].icon — p. ej. Flame para leads calientes',
      metric: 'definition.metrics[i].icon — p. ej. Gauge para score, Wallet para cobros',
      action: 'definition.actions[i].icon — p. ej. MessageSquareText para abrir un chat',
      patchExamples: [
        { op: 'replace', path: '/icon', value: 'Briefcase' },
        { op: 'replace', path: '/views/0/icon', value: 'CalendarDays' },
        { op: 'replace', path: '/views/0/components/1/icon', value: 'Flame' },
        { op: 'replace', path: '/metrics/0/icon', value: 'Gauge' },
      ],
      rule: 'No repetir Sparkles como comodín. Usarlo sólo para una función explícitamente generativa; cada icono debe poder entenderse sin leer el título.',
    },
    sourcesNote: 'Los únicos valores válidos para "source" de un datasource, una métrica o una query. Cada uno lista sus campos filtrables; los campos personalizados se referencian como "custom.<campo>".',
    conditionOps: RADAR_CONDITION_OPS.map((op) => ({ op, help: CONDITION_OP_HELP[op] })),
    bindingDisplays: RADAR_BINDING_DISPLAYS.map((display) => ({ display, help: BINDING_DISPLAY_HELP[display] })),
    bindingNote: 'Un binding {kind:"datasource", ref, display, map?, limit?, emptyText?} dibuja las filas de un datasource; {kind:"metrics", refs:[...], columns?} dibuja hasta 8 métricas como KPIs. "map" renombra columnas del source a campos del display, p. ej. {"title":"name", "detail":"funnel_stage"}.',
    actionKinds: RADAR_ACTION_KINDS.map((kind) => ({ kind, help: ACTION_KIND_HELP[kind] })),
    formulas: {
      note: 'FÓRMULAS: aritmética segura (números, + - * / y paréntesis; funciones days_since(campo), hours_since(campo), abs, min, max, round) evaluada por el engine, sin SQL ni código. Dos lugares: (1) MÉTRICAS DE FÓRMULA — una métrica con "formula" en vez de source+aggregation combina OTRAS métricas de la app por su key; (2) CAMPOS COMPUTADOS — "compute" en un datasource agrega campos calculados POR FILA a partir de los campos del source (incluidos custom.*), usables en sort y en el map de un binding, pero NO en where. Operando ausente o división por cero → null.',
      metricExample: { key: 'tasa-de-cierre', label: 'Tasa de cierre', formula: '(cierres / pipeline-activo) * 100', format: 'percent', tone: 'emerald' },
      computeExample: {
        key: 'foco',
        source: 'contacts',
        where: [{ field: 'custom.radar_prioridad', op: 'in', value: ['P1', 'P2'] }],
        compute: [{ as: 'urgency_score', formula: 'custom.radar_score - days_since(lastMessageAt) * 5' }],
        sort: [{ field: 'urgency_score', dir: 'desc' }],
        limit: 10,
      },
    },
    limits: RADAR_ENGINE_LIMITS,
    exampleApp: EXAMPLE_APP,
    exampleAppNote: 'Definición completa y válida lista para copiar: una vista con un binding de métricas, un datasource dibujado como contactos y un componente estático con bloques. Adaptá keys, filtros y textos; verificá los nombres de campo contra "sources".',
  };
}

async function appList(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(appListSchema, input);
  const apps = await listRadarApps(context.teamId, {
    ...(data.include_archived !== undefined ? { includeArchived: data.include_archived } : {}),
  });
  return { object: 'radar_engine_apps', count: apps.length, apps };
}

async function appGet(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(appGetSchema, input);
  const app = await requireApp(context, data.slug);

  if (data.version != null) {
    const historic = await getRadarAppVersion(context.teamId, data.slug, data.version);
    if (!historic) {
      throw new Error(
        `La app "${data.slug}" no tiene una versión ${data.version}. El historial completo lo da whatspro_radar_app_versions; la versión actual del borrador es ${app.version}.`,
      );
    }
    return {
      object: 'radar_engine_app_version',
      slug: data.slug,
      requested_version: data.version,
      current_version: app.version,
      published_version: app.publishedVersion,
      version: historic,
    };
  }

  const versions = await listRadarAppVersions(context.teamId, data.slug);
  const validation = validateRadarAppDefinition(app.definition, { knownSources: knownSourceNames() });
  return {
    object: 'radar_engine_app',
    app,
    validation,
    versions: Array.isArray(versions) ? versions.slice(0, 10) : versions,
    versionsNote: 'Últimas 10 versiones; el historial completo lo da whatspro_radar_app_versions.',
  };
}

async function appVersions(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(appVersionsSchema, input);
  const app = await requireApp(context, data.slug);
  const versions = await listRadarAppVersions(context.teamId, data.slug);
  return {
    object: 'radar_engine_app_versions',
    slug: data.slug,
    current_version: app.version,
    published_version: app.publishedVersion,
    count: Array.isArray(versions) ? versions.length : undefined,
    versions,
  };
}

/** Tope duro de filas en cualquier preview: alcanza para verificar, no para volcar datos. */
const PREVIEW_LIMIT = 10;

async function datasourcePreview(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(datasourcePreviewSchema, input);

  let datasource;
  let origin: string;
  if (data.datasource != null) {
    datasource = parseValue(radarDatasourceSchema, data.datasource, 'datasource');
    origin = 'inline';
  } else {
    const app = await requireApp(context, data.app_slug!);
    const stored = app.definition.datasources?.find((candidate) => candidate.key === data.key);
    if (!stored) {
      throw new Error(
        `La app "${data.app_slug}" no tiene un datasource con la key "${data.key}". Datasources actuales: ${app.definition.datasources?.map((candidate) => candidate.key).join(', ') || '(ninguno)'}.`,
      );
    }
    datasource = stored;
    origin = `app "${data.app_slug}"`;
  }

  const limited = { ...datasource, limit: Math.min(datasource.limit ?? PREVIEW_LIMIT, PREVIEW_LIMIT) };
  const rows = await executeRadarDatasource(context.teamId, limited);
  const count = Array.isArray(rows) ? rows.length : null;
  return {
    object: 'radar_datasource_preview',
    datasource: limited,
    rows,
    count,
    note: `Muestra de hasta ${PREVIEW_LIMIT} filas del datasource (${origin}); dentro de una app el limit puede llegar a ${RADAR_ENGINE_LIMITS.maxQueryLimit}. Nada se guardó: para dejarlo en la app usá whatspro_radar_app_apply o whatspro_radar_ui_patch.`,
  };
}

async function adHocQuery(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(querySchema, input);
  const query = parseValue(radarQuerySchema, data.query, 'query');
  const limited = { ...query, limit: Math.min(query.limit ?? RADAR_ENGINE_LIMITS.maxQueryLimit, RADAR_ENGINE_LIMITS.maxQueryLimit) };
  const rows = await executeRadarQuery(context.teamId, limited);
  return {
    object: 'radar_query_result',
    query: limited,
    rows,
    count: Array.isArray(rows) ? rows.length : null,
  };
}

async function metricPreview(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(metricPreviewSchema, input);
  const metric = parseValue(radarMetricSchema, data.metric, 'metric');

  let datasources;
  let appMetrics;
  if (data.app_slug) {
    const app = await requireApp(context, data.app_slug);
    datasources = app.definition.datasources;
    // Con la app a mano, una métrica de fórmula puede referenciar a las de la app.
    appMetrics = app.definition.metrics;
  }

  const result = await resolveRadarMetricValue(context.teamId, metric, datasources, appMetrics);
  return {
    object: 'radar_metric_preview',
    metric: metric.key,
    label: metric.label,
    result,
    note: 'Nada se guardó: para dejar la métrica en una app, agregala a definition.metrics con whatspro_radar_app_apply o whatspro_radar_ui_patch.',
  };
}

async function insightList(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(insightListSchema, input);
  const insights = await listRadarInsights(context.teamId, {
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.severity !== undefined ? { severity: data.severity } : {}),
    ...(data.contact_id !== undefined ? { contactId: data.contact_id } : {}),
    ...(data.app_slug !== undefined ? { appSlug: data.app_slug } : {}),
    ...(data.limit !== undefined ? { limit: data.limit } : {}),
  });
  return {
    object: 'radar_insights',
    count: Array.isArray(insights) ? insights.length : undefined,
    insights,
  };
}

async function validateDefinition(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(validateSchema, input);

  let definition: RadarAppDefinition;
  let target: string;
  if (data.slug) {
    const app = await requireApp(context, data.slug);
    definition = app.definition;
    target = `borrador de "${data.slug}" (versión ${app.version})`;
  } else {
    definition = parseValue(radarAppDefinitionSchema, data.definition, 'definition');
    target = 'definición inline (no guardada)';
  }

  const validation = validateRadarAppDefinition(definition, { knownSources: knownSourceNames() });
  return {
    object: 'radar_engine_validation',
    target,
    validation,
    note: validation.ok
      ? 'La definición es válida. Nada se escribió: guardala con whatspro_radar_app_apply cuando quieras.'
      : 'Nada se escribió. Los errors bloquean; los warnings dejan guardar pero ese componente se dibuja en estado de error. Cada issue trae el path exacto dentro de la definición.',
  };
}

/* ------------------------------------------------------------------ */
/* Implementaciones: escritura                                          */
/* ------------------------------------------------------------------ */

async function appApply(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(appApplySchema, input);
  const definition = parseValue(radarAppDefinitionSchema, data.definition, 'definition');

  const result = await applyRadarApp({
    teamId: context.teamId,
    userId: context.userId,
    slug: data.slug,
    definition,
    ...(data.expected_version !== undefined ? { expectedVersion: data.expected_version } : {}),
    ...(data.dry_run !== undefined ? { dryRun: data.dry_run } : {}),
    ...(data.publish !== undefined ? { publish: data.publish } : {}),
    ...(data.summary !== undefined ? { summary: data.summary } : {}),
  });
  if (result.applied && !data.dry_run) await audit(context, 'GROK_RADAR_ENGINE_APP_APPLIED', data.slug);
  return describeApplyResult(result, data.dry_run);
}

async function uiPatch(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(uiPatchSchema, input);
  const ops = parseValue<RadarPatchOp[]>(radarPatchSchema, data.ops, 'ops');

  const app = await requireApp(context, data.slug);
  let patched: RadarAppDefinition;
  try {
    patched = applyJsonPatch(app.definition, ops);
  } catch (error) {
    throw new Error(
      `El patch no se pudo aplicar sobre la versión ${app.version} de "${data.slug}": ${error instanceof Error ? error.message : String(error)}. Mirá la estructura real con whatspro_radar_app_get y corregí los paths. No se escribió nada.`,
    );
  }

  const result = await applyRadarApp({
    teamId: context.teamId,
    userId: context.userId,
    slug: data.slug,
    definition: patched,
    ...(data.expected_version !== undefined ? { expectedVersion: data.expected_version } : {}),
    ...(data.dry_run !== undefined ? { dryRun: data.dry_run } : {}),
    ...(data.publish !== undefined ? { publish: data.publish } : {}),
    ...(data.summary !== undefined ? { summary: data.summary } : {}),
  });
  if (result.applied && !data.dry_run) await audit(context, 'GROK_RADAR_ENGINE_UI_PATCHED', data.slug);
  return { ...describeApplyResult(result, data.dry_run), ops_applied: ops.length };
}

async function viewManage(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(viewManageSchema, input);

  const app = await requireApp(context, data.slug);
  const definition = cloneDefinition(app.definition);
  applyViewOperation(definition, data);

  const result = await applyRadarApp({
    teamId: context.teamId,
    userId: context.userId,
    slug: data.slug,
    definition,
    expectedVersion: app.version,
    ...(data.publish !== undefined ? { publish: data.publish } : {}),
    summary: data.summary ?? `view ${data.action}${data.view_slug ? ` (${data.view_slug})` : ''}`,
  });
  if (result.applied) await audit(context, 'GROK_RADAR_ENGINE_VIEW_MANAGED', `${data.slug}:${data.action}`);
  return {
    ...describeApplyResult(result, undefined),
    action: data.action,
    views: definition.views.map((view) => view.slug),
  };
}

async function componentManage(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(componentManageSchema, input);

  const app = await requireApp(context, data.slug);
  const definition = cloneDefinition(app.definition);
  applyComponentOperation(definition, data);

  const result = await applyRadarApp({
    teamId: context.teamId,
    userId: context.userId,
    slug: data.slug,
    definition,
    expectedVersion: app.version,
    ...(data.publish !== undefined ? { publish: data.publish } : {}),
    summary: data.summary ?? `component ${data.action} en ${data.view_slug}`,
  });
  if (result.applied) await audit(context, 'GROK_RADAR_ENGINE_COMPONENT_MANAGED', `${data.slug}:${data.action}`);
  return {
    ...describeApplyResult(result, undefined),
    action: data.action,
    view_slug: data.view_slug,
    components: findView(definition, data.view_slug).components.map((component) => component.id),
  };
}

async function appPublish(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(appPublishSchema, input);
  await requireApp(context, data.slug);
  const result = await publishRadarApp({
    teamId: context.teamId,
    userId: context.userId,
    slug: data.slug,
    ...(data.version !== undefined ? { version: data.version } : {}),
  });
  await audit(context, 'GROK_RADAR_ENGINE_APP_PUBLISHED', data.slug);
  return {
    success: true,
    ...result,
    note: 'La app quedó publicada: el usuario final ya ve esta versión. Los próximos apply/patch vuelven a editar el borrador sin afectarla hasta el próximo publish.',
  };
}

async function appRollback(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(appRollbackSchema, input);
  await requireApp(context, data.slug);
  const result = await rollbackRadarApp({
    teamId: context.teamId,
    userId: context.userId,
    slug: data.slug,
    toVersion: data.to_version,
  });
  await audit(context, 'GROK_RADAR_ENGINE_APP_ROLLED_BACK', `${data.slug}:v${data.to_version}`);
  return {
    success: true,
    ...result,
    note: `Se creó una versión nueva con el contenido de la versión ${data.to_version} y quedó publicada. El historial no se tocó: este rollback también se puede revertir con otro rollback.`,
  };
}

async function appManage(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(appManageSchema, input);
  await requireApp(context, data.slug);

  if (data.action === 'duplicate') {
    const existing = await getRadarApp(context.teamId, data.new_slug);
    if (existing) {
      throw new Error(`Ya existe una app con el slug "${data.new_slug}" en este equipo: elegí otro new_slug (whatspro_radar_app_list muestra los tomados).`);
    }
    const result = await duplicateRadarApp({
      teamId: context.teamId,
      userId: context.userId,
      slug: data.slug,
      newSlug: data.new_slug,
      ...(data.name !== undefined ? { name: data.name } : {}),
    });
    await audit(context, 'GROK_RADAR_ENGINE_APP_DUPLICATED', `${data.slug}→${data.new_slug}`);
    return {
      success: true,
      action: 'duplicate' as const,
      source_slug: data.slug,
      app: result,
      note: `La copia "${data.new_slug}" nació como borrador sin publicar. Adaptala (ownerUserId, filtros, textos) con whatspro_radar_ui_patch y publicala con whatspro_radar_app_publish.`,
    };
  }

  const result = await archiveRadarApp({ teamId: context.teamId, userId: context.userId, slug: data.slug });
  await audit(context, 'GROK_RADAR_ENGINE_APP_ARCHIVED', data.slug);
  return {
    success: true,
    action: 'archive' as const,
    app: result,
    note: 'La app salió de circulación pero conserva su definición e historial: whatspro_radar_app_list(include_archived=true) la sigue mostrando.',
  };
}

async function userState(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(userStateSchema, input);

  if (data.action === 'get') {
    await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
    const state = await getRadarUserState(context.teamId, context.userId, data.app_slug);
    return {
      object: 'radar_user_state',
      app_slug: data.app_slug ?? null,
      state,
    };
  }

  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const patch = parseValue(radarUserStateSchema, data.state, 'state');
  const state = await setRadarUserState({
    teamId: context.teamId,
    userId: context.userId,
    ...(data.app_slug !== undefined ? { appSlug: data.app_slug } : {}),
    patch,
    ...(data.replace !== undefined ? { replace: data.replace } : {}),
  });
  await audit(context, 'GROK_RADAR_ENGINE_STATE_SET', data.app_slug ?? 'global');
  return {
    success: true,
    app_slug: data.app_slug ?? null,
    replaced: data.replace === true,
    state,
  };
}

async function insightManage(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(insightManageSchema, input);

  if (data.action === 'create') {
    // Los args MCP van en snake_case (convención de todo el conector); el
    // contrato del engine usa camelCase: acá se traduce una sola vez.
    const insightInput = parseValue(radarInsightInputSchema, {
      title: data.title,
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.severity !== undefined ? { severity: data.severity } : {}),
      ...(data.confidence !== undefined ? { confidence: data.confidence } : {}),
      ...(data.contact_id !== undefined ? { contactId: data.contact_id } : {}),
      ...(data.app_slug !== undefined ? { appSlug: data.app_slug } : {}),
      ...(data.source !== undefined ? { source: data.source } : {}),
      ...(data.evidence !== undefined ? { evidence: data.evidence } : {}),
      ...(data.recommended_action !== undefined ? { recommendedAction: data.recommended_action } : {}),
      ...(data.expires_at !== undefined ? { expiresAt: data.expires_at } : {}),
    }, 'insight');

    const insight = await createRadarInsight({
      teamId: context.teamId,
      userId: context.userId,
      input: insightInput,
    });
    await audit(context, 'GROK_RADAR_ENGINE_INSIGHT_CREATED', insight?.id ?? data.title.slice(0, 45));
    return { success: true, action: 'create' as const, insight };
  }

  const insight = await updateRadarInsightStatus({
    teamId: context.teamId,
    userId: context.userId,
    id: data.id,
    status: data.status,
  });
  await audit(context, 'GROK_RADAR_ENGINE_INSIGHT_STATUS', data.id);
  return { success: true, action: 'update_status' as const, status: data.status, insight };
}

async function transactionApply(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(transactionApplySchema, input);

  const app = await requireApp(context, data.slug);
  let definition = cloneDefinition(app.definition);

  // Todas las operaciones se aplican en memoria, en orden, sobre la MISMA
  // definición. Cualquier throw corta acá y no se escribe nada: la promesa de
  // atomicidad es que hay UN solo applyRadarApp al final, o ninguno.
  const appliedOps: { index: number; tool: string; detail: string }[] = [];
  for (const [index, operation] of data.operations.entries()) {
    try {
      if (operation.tool === 'ui_patch') {
        const ops = parseValue<RadarPatchOp[]>(radarPatchSchema, operation.data.ops, 'ops');
        definition = applyJsonPatch(definition, ops);
        appliedOps.push({ index, tool: operation.tool, detail: `${ops.length} op(s) de patch` });
      } else if (operation.tool === 'view_manage') {
        const op = parse(viewOperationSchema, operation.data);
        applyViewOperation(definition, op);
        appliedOps.push({ index, tool: operation.tool, detail: `${op.action}${op.view_slug ? ` (${op.view_slug})` : ''}` });
      } else {
        const op = parse(componentOperationSchema, operation.data);
        applyComponentOperation(definition, op);
        appliedOps.push({ index, tool: operation.tool, detail: `${op.action} en ${op.view_slug}` });
      }
    } catch (error) {
      throw new Error(
        `Transacción ABORTADA en la operación #${index} (${operation.tool}): ${error instanceof Error ? error.message : String(error)}. NO se escribió NADA: la app "${data.slug}" quedó exactamente como estaba (versión ${app.version}). Corregí esa operación y reenviá la transacción completa.`,
      );
    }
  }

  const result = await applyRadarApp({
    teamId: context.teamId,
    userId: context.userId,
    slug: data.slug,
    definition,
    expectedVersion: data.expected_version ?? app.version,
    ...(data.publish !== undefined ? { publish: data.publish } : {}),
    summary: data.summary ?? `transacción de ${data.operations.length} operación(es)`,
  });
  if (result.applied) await audit(context, 'GROK_RADAR_ENGINE_TRANSACTION_APPLIED', `${data.slug}:${data.operations.length}ops`);
  return {
    ...describeApplyResult(result, undefined),
    operations: appliedOps,
    ...(result.applied
      ? { note: `Las ${appliedOps.length} operaciones se guardaron como UNA sola versión nueva: un rollback a la versión ${app.version} las deshace todas juntas.` }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                           */
/* ------------------------------------------------------------------ */

export async function executeRadarEngineTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
): Promise<unknown> {
  if (name === 'whatspro_radar_engine_catalog') return engineCatalog(input, context);
  if (name === 'whatspro_radar_app_list') return appList(input, context);
  if (name === 'whatspro_radar_app_get') return appGet(input, context);
  if (name === 'whatspro_radar_app_versions') return appVersions(input, context);
  if (name === 'whatspro_radar_datasource_preview') return datasourcePreview(input, context);
  if (name === 'whatspro_radar_query') return adHocQuery(input, context);
  if (name === 'whatspro_radar_metric_preview') return metricPreview(input, context);
  if (name === 'whatspro_radar_insight_list') return insightList(input, context);
  if (name === 'whatspro_radar_validate') return validateDefinition(input, context);
  if (name === 'whatspro_radar_app_apply') return appApply(input, context);
  if (name === 'whatspro_radar_ui_patch') return uiPatch(input, context);
  if (name === 'whatspro_radar_view_manage') return viewManage(input, context);
  if (name === 'whatspro_radar_component_manage') return componentManage(input, context);
  if (name === 'whatspro_radar_app_publish') return appPublish(input, context);
  if (name === 'whatspro_radar_app_rollback') return appRollback(input, context);
  if (name === 'whatspro_radar_app_manage') return appManage(input, context);
  if (name === 'whatspro_radar_user_state') return userState(input, context);
  if (name === 'whatspro_radar_insight_manage') return insightManage(input, context);
  if (name === 'whatspro_radar_transaction_apply') return transactionApply(input, context);
  throw new Error(`Unknown Radar Engine tool: ${name}`);
}
