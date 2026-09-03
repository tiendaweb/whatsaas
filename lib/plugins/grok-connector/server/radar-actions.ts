import 'server-only';

import { and, desc, eq, like } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { contacts, messages, teamCustomerContacts, teamCustomers, teamMembers, teamRadarReports } from '@/lib/db/schema';
import { createDocument, updateDocument } from '@/lib/plugins/documents/server/documents';
import { markdownToProseMirror } from '@/lib/plugins/documents/shared/markdown';
import {
  assertPermission,
  audit,
  parse,
  writeInternalNote,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';
import {
  getRadarClientPanel,
  getRadarOverview,
  listRadarClients,
  type RadarBoardPriority,
} from '@/lib/plugins/radar/server/board';
import {
  RADAR_NOTE_PREFIX,
  parseRadarNote,
  radarNoteToBlocks,
} from '@/lib/plugins/radar/server/note-parser';
import {
  ensureContactReportFolder,
  ensureRadarExtraReportFolder,
  ensureRadarReportFolders,
} from '@/lib/plugins/radar/server/reports';
import { linkRadarReport, listLinkedRadarReports, unlinkRadarReport } from '@/lib/plugins/radar/server/report-links';
import { RADAR_ANALYST_FIELD_KEYS } from '@/lib/plugins/radar/shared/constants';
import {
  createRadarCustomSection,
  deleteRadarCustomSection,
  getRadarAppearance,
  reorderRadarSections,
  resolveRadarSections,
  setRadarAppearance,
  setRadarSectionHidden,
  updateRadarCustomSection,
  type SetRadarAppearanceInput,
} from '@/lib/plugins/radar/server/appearance';
import {
  archiveRadarWidget,
  duplicateRadarWidget,
  getRadarWidget,
  listRadarWidgets,
  patchRadarWidget,
  purgeRadarWidget,
  reassignRadarWidgetsSection,
  reorderRadarWidgets,
  restoreRadarWidget,
  upsertRadarWidget,
  type PatchRadarWidgetFields,
} from '@/lib/plugins/radar/server/widgets';
import {
  RADAR_BLOCK_CATALOG,
  RADAR_BLOCK_DEFAULT_ICON,
  RADAR_ICONS,
  RADAR_SECTIONS,
  RADAR_SECTION_ICON,
  RADAR_SECTION_ID_REGEX,
  RADAR_SECTION_LABEL,
  RADAR_TONES,
  RADAR_WIDGET_PER_ROW,
  RADAR_WIDGET_SIZES,
  RADAR_WIDGET_SPAN,
  RADAR_WIDGET_SURFACES,
  isBuiltinRadarSection,
  radarBlockSchema,
  radarWidgetInputSchema,
  type RadarBlock,
  type RadarIcon,
  type RadarSection,
} from '@/lib/plugins/radar/shared/blocks';

const RADAR_PLUGIN = 'radar';

/** Categorías de informe que Radar sabe archivar y volver a listar. */
const REPORT_CATEGORIES = ['clientes', 'equipo', 'generales', 'mejoras', 'trabajos'] as const;
type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/* ------------------------------------------------------------------ */
/* Guía de iconos                                                      */
/* ------------------------------------------------------------------ */

/**
 * Los 103 iconos de RADAR_ICONS agrupados por familia y con el "para qué" de
 * cada grupo. La lista plana no le alcanza a una IA para elegir con criterio:
 * sin familias termina poniendo `Sparkles` en todo. El tipo `RadarIcon` obliga
 * a que cada nombre exista de verdad en la lista cerrada, así que un icono mal
 * escrito acá no compila.
 */
const RADAR_ICON_FAMILIES: { family: string; useFor: string; icons: RadarIcon[] }[] = [
  {
    family: 'medicion',
    useFor: 'Medición, rendimiento y tendencia: scores, KPIs, cosas que suben o bajan.',
    icons: ['Radar', 'Sparkles', 'Target', 'TrendingUp', 'TrendingDown', 'Gauge', 'Activity'],
  },
  {
    family: 'estado',
    useFor: 'Estado y alerta: qué está bien, qué falló, qué hay que mirar, qué está frenado.',
    icons: ['CheckCircle2', 'XCircle', 'AlertTriangle', 'AlertOctagon', 'CircleHelp', 'Info', 'Ban', 'Pause'],
  },
  {
    family: 'tiempo',
    useFor: 'Tiempo, vencimientos, agenda e historial.',
    icons: ['Clock', 'Timer', 'Hourglass', 'CalendarClock', 'CalendarDays', 'History', 'CalendarCheck'],
  },
  {
    family: 'gente',
    useFor: 'Personas, clientes, equipo, y cómo se sienten con lo que ofrecés.',
    icons: ['Users', 'UserRound', 'UserCheck', 'UserX', 'UserPlus', 'IdCard', 'Handshake', 'Heart', 'ThumbsUp', 'ThumbsDown'],
  },
  {
    family: 'conversacion',
    useFor: 'Conversaciones y avisos: chats, llamadas, audios, mails, notificaciones.',
    icons: ['MessageSquareText', 'MessagesSquare', 'Reply', 'Inbox', 'Phone', 'PhoneCall', 'Mic', 'Mail', 'Send', 'Bell', 'BellRing'],
  },
  {
    family: 'dinero',
    useFor: 'Plata y ventas: facturación, cobros, medios de pago, carrito, local.',
    icons: ['CircleDollarSign', 'BadgeDollarSign', 'Wallet', 'CreditCard', 'Receipt', 'ShoppingCart', 'Store'],
  },
  {
    family: 'documentos',
    useFor: 'Documentos e informes: reportes, checklists, notas, carpetas.',
    icons: ['FileText', 'FileCode2', 'ScrollText', 'ClipboardList', 'ClipboardCheck', 'ListChecks', 'ListTodo', 'FormInput', 'SquarePen', 'Notebook', 'BookOpen', 'FolderOpen'],
  },
  {
    family: 'destacados',
    useFor: 'Oportunidad y destaque: ideas, cosas calientes, logros, lo premium.',
    icons: ['Lightbulb', 'Flame', 'Zap', 'Rocket', 'Star', 'Award', 'Crown', 'Gem'],
  },
  {
    family: 'analisis',
    useFor: 'Análisis y observación: búsquedas, filtros, comparaciones, lo que se mira o se deja de mirar.',
    icons: ['Search', 'Filter', 'Eye', 'EyeOff', 'Scale', 'Brain'],
  },
  {
    family: 'navegacion',
    useFor: 'Recorrido y dirección: etapas del embudo, rutas, hitos, hacia dónde va cada cosa.',
    icons: ['Map', 'MapPin', 'Compass', 'Route', 'Milestone', 'Flag', 'ArrowUpRight', 'ArrowDownRight', 'ArrowRight', 'GitBranch', 'Workflow'],
  },
  {
    family: 'estructura',
    useFor: 'Estructura y catálogo: bloques, productos, empresas, sitios.',
    icons: ['Layers', 'LayoutGrid', 'Boxes', 'Package', 'Building2', 'Globe2', 'FolderKanban', 'Kanban', 'Briefcase'],
  },
  {
    family: 'herramientas',
    useFor: 'Herramientas y automatización: configuración, arreglos, bots, tareas repetitivas.',
    icons: ['Wrench', 'Settings2', 'Hammer', 'Bug', 'Puzzle', 'Bot', 'Cpu', 'Scissors', 'Repeat', 'RefreshCcw', 'Undo2'],
  },
  {
    family: 'vinculos',
    useFor: 'Vínculos y seguridad: enlaces, integraciones, permisos, riesgos.',
    icons: ['Share2', 'Link2', 'Paperclip', 'Tag', 'Tags', 'Anchor', 'Shield', 'ShieldAlert', 'Lock'],
  },
  {
    family: 'clima',
    useFor: 'Metáforas de clima: leads fríos, rachas buenas, panoramas feos.',
    icons: ['Snowflake', 'Sun', 'CloudRain'],
  },
];

/* ------------------------------------------------------------------ */
/* Herramientas de lectura                                             */
/* ------------------------------------------------------------------ */

export const radarReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_radar_block_catalog',
    description:
      'Devuelve el catálogo completo de bloques que Radar sabe dibujar (card, kpi, score, progress, meter, barChart, lineChart, areaChart, pieChart, radarChart, funnel, sparkline, heatmap, table, timeline, list, steps, callout, quote, stat, text, markdown, html, contacts, documents, divider, image, tiles, columns, tasks, checklist, resources, tags, replies, form), cada uno con para qué sirve y un ejemplo JSON listo para copiar, más las listas cerradas de iconos y tonos, las SECCIONES REALES del menú de este equipo (builtins + personalizadas, con sus ids para el campo "section"), los tamaños de widget con cuántos entran por fila (widgetSizes), las superficies, los iconos agrupados por familia (iconGuide), el icono efectivo de cada sección (sectionIcons, con los cambios que el equipo haya hecho) para no repetirlo, y el icono que recibe por defecto un widget según su primer bloque (blockDefaultIcons). LLAMALA ANTES DE CREAR O EDITAR UN WIDGET DE RADAR con whatspro_radar_upsert_widget: es la única forma de saber qué bloques existen, qué campos lleva cada uno y qué nombres de icono/tono son válidos. Los iconos y tonos son listas cerradas: si inventás uno, el bloque se descarta. No tiene parámetros y no toca la base de datos.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_radar_list_widgets',
    description:
      'Lista los widgets vivos del tablero Radar del equipo, con su key, título, sección, superficie, tamaño, posición, origen (ai/user/system) y los bloques que tienen guardados. Usala antes de un upsert para ver si ya existe un widget con esa key (y así actualizarlo en vez de duplicar el tema), para reordenar posiciones sin pisar otro widget, o para responder "¿qué hay hoy en el tablero de Radar?". Ejemplo: filtrar section="prioridades" para ver qué se está mostrando en la sección Prioridades antes de agregar un gráfico nuevo.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'Sección del menú a la que pertenece el widget. Puede ser una sección builtin (resumen, clientes, prioridades, informes, seguimiento, mejoras, trabajos) o el id de una sección personalizada del equipo; la lista real la devuelve whatspro_radar_block_catalog en "sections", y las personalizadas se crean con whatspro_radar_manage_section.' },
        surface: { type: 'string', enum: [...RADAR_WIDGET_SURFACES], description: 'dashboard = tablero de Radar; chat = panel Radar dentro de un chat; both = ambos.' },
        contact_id: { type: ['integer', 'null'], minimum: 1, description: 'Si se indica, solo los widgets fijados a la ficha de ese contacto. Pasá null para los widgets generales (sin contacto).' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa a contact_id: el id del cliente del CRM (resource="customers"). Se resuelve solo al contacto vinculado de ese cliente. Si el cliente no tiene contacto vinculado, o tiene más de uno, la herramienta falla diciendo qué hacer — no adivina.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_list_reports',
    description:
      'Lista los informes HTML/markdown ya publicados y vinculados a Radar, con id de documento, título, emoji, formato, fecha de actualización, categoría, contacto y usuario asignado. Usala para no volver a escribir un informe que ya existe, para citar informes previos de un cliente antes de redactar el nuevo, o para armar un bloque de tipo "documents" dentro de un widget con los informes de la sección. Ejemplo: category="clientes" + contact_id=12 devuelve todos los diagnósticos de ese cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: [...REPORT_CATEGORIES], description: 'clientes = informes por cliente; equipo = informes del equipo; generales = informes transversales; mejoras = análisis de mejora; trabajos = reportes de trabajo.' },
        contact_id: { type: ['integer', 'null'], minimum: 1, description: 'Filtra por el contacto al que está vinculado el informe.' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa a contact_id: el id del cliente del CRM (resource="customers"). Se resuelve solo al contacto vinculado de ese cliente. Si el cliente no tiene contacto vinculado, o tiene más de uno, la herramienta falla diciendo qué hacer — no adivina.' },
        assigned_user_id: { type: ['integer', 'null'], minimum: 1, description: 'Filtra por el usuario del equipo al que se le asignó el informe. Los informes sin asignar tienen este campo en null.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_overview',
    description:
      'El TABLERO de Radar en una llamada: contadores (analizados, P1, P2, P3, descartado, necesita revisión), fecha del último análisis y los contactos analizados ordenados por prioridad y score, cada uno con sus campos radar_* (intención, objeción, recuperabilidad, confianza, estrategia). Es la primera tool que hay que llamar para responder "¿qué tengo hoy en Radar?" o para decidir qué dibujar con whatspro_radar_upsert_widget. Un contacto entra al tablero cuando tiene radar_fecha_analisis: los que no aparecen acá todavía no fueron analizados (analizalos con whatspro_radar_save_analysis).',
    inputSchema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['P1', 'P2', 'P3', 'descartado'], description: 'Devuelve solo los contactos de esa prioridad.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: 'Cuántos contactos devolver (los contadores son siempre sobre el total).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_list_clients',
    description:
      'El panel de CLIENTES de Radar: los contactos analizados con su prioridad, score y campos radar_*, más reportCount (cuántos informes tienen), openTaskCount (tareas abiertas) y lastNoteAt (fecha de la última nota 🎯 RADAR). Filtrable por texto, prioridad y "solo con informes". Es la tool para preguntas del tipo "mostrame los P1 con informe y sin tarea abierta" o "¿a qué cliente analizado le falta el informe?". Para la ficha completa de UN cliente usá whatspro_radar_get_client.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', maxLength: 120, description: 'Búsqueda por nombre del contacto.' },
        priority: { type: 'string', enum: ['P1', 'P2', 'P3', 'descartado'], description: 'Solo los de esa prioridad.' },
        only_with_reports: { type: 'boolean', description: 'true = solo los clientes que ya tienen al menos un informe.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: 'Cuántos clientes devolver (los contadores son siempre sobre el total).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_get_client',
    description:
      'La FICHA Radar completa de un contacto: los nueve campos radar_* resueltos, el encabezado y los bloques de su última nota 🎯 RADAR, el historial de notas (últimas 5), sus tareas con proyecto y columna, sus informes (de carpeta y vinculados, deduplicados) y los widgets fijados a su chat. Es la tool para "traeme todo lo de Mano a Mano antes de llamarla" o para revisar qué se diagnosticó antes de reanalizar. Acepta contact_id o customer_id (se resuelve al contacto vinculado del cliente).',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'integer', minimum: 1, description: 'ID del contacto del CRM.' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa a contact_id: el id del cliente (resource="customers"). Se resuelve solo al contacto vinculado; si no hay o hay varios, la herramienta falla diciendo qué hacer.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_list_bank',
    description:
      'Lista el BANCO de widgets de Radar: los archivados con whatspro_radar_delete_widget, el último archivado primero, con sus bloques completos. El banco funciona como biblioteca de plantillas: desde acá se elige qué restaurar (whatspro_radar_manage_widget action="restore") o qué duplicar como base de un widget nuevo (action="duplicate"). Un widget archivado no aparece en ningún tablero pero conserva todo su contenido.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'Solo los archivados que pertenecían a esa sección.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 30, description: 'Cuántos devolver.' },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Herramientas de acción                                              */
/* ------------------------------------------------------------------ */

const BLOCKS_SCHEMA_DESCRIPTION = [
  'Array de bloques a dibujar, en el orden en que se van a ver de arriba hacia abajo.',
  'Cada ítem es un objeto JSON con una propiedad obligatoria "type" (card, kpi, score, progress, meter, barChart, lineChart, areaChart, pieChart, radarChart, funnel, sparkline, heatmap, table, timeline, list, steps, callout, quote, stat, text, markdown, html, contacts, documents, divider, image, tiles, columns, tasks, checklist, resources, tags, replies, form) más los campos propios de ese tipo.',
  'Los campos exactos de cada tipo, con ejemplos completos listos para copiar, los devuelve whatspro_radar_block_catalog: llamala antes de armar este array.',
  'Los valores de "icon" y "tone" salen de listas cerradas (también en el catálogo); si inventás un nombre, ese bloque se descarta.',
  'La validación fina la hace el servidor bloque por bloque: los bloques válidos se guardan y la respuesta te dice cuántos se aceptaron, cuántos se descartaron y por qué.',
].join(' ');

export const radarActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_radar_upsert_widget',
    description:
      'Crea o actualiza un widget vivo del tablero Radar. El widget se identifica por "key": si esa key ya existe en el equipo se sobreescribe con el nuevo contenido (no se duplica), y si no existe se crea. Es la herramienta para "dibujar" en Radar: pasás un array de bloques (gráficos, KPIs, tablas, cronologías, avisos) y la UI los renderiza tal cual. Ejemplos de uso: "Creá un widget con un gráfico de barras horizontal de las objeciones más frecuentes y fijalo en la sección Prioridades" (key="objeciones-frecuentes", section="prioridades", blocks=[{type:"barChart",...}]); "Armá una ficha del cliente Mano a Mano con su score, sus señales de compra y la evidencia" (contact_id=12, surface="chat", blocks=[{type:"score"},{type:"card"},{type:"timeline"}]); "Actualizá el tablero de resumen con los KPIs de esta semana" (misma key de siempre, blocks nuevos). IMPORTANTE: llamá primero a whatspro_radar_block_catalog para saber qué bloques y qué iconos/tonos existen, y a whatspro_radar_list_widgets si querés reusar una key existente. Si el widget YA EXISTE y sólo querés cambiarle el icono, el tono, el título, la sección, el tamaño o la posición, NO uses esta herramienta: usá whatspro_radar_patch_widget, que hace el cambio sin obligarte a regenerar los bloques.',
    inputSchema: {
      type: 'object',
      required: ['key', 'title', 'blocks'],
      properties: {
        key: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$',
          description: 'Slug estable del widget dentro del equipo (letras, números, guion y guion bajo). Reenviar la misma key ACTUALIZA el widget en vez de duplicarlo. Ej.: "objeciones-frecuentes", "resumen-semanal", "cliente-12-diagnostico".',
        },
        title: { type: 'string', minLength: 1, maxLength: 160, description: 'Título visible del widget. Ej.: "Objeciones más frecuentes".' },
        blocks: {
          type: 'array',
          minItems: 1,
          maxItems: 60,
          items: { type: 'object' },
          description: BLOCKS_SCHEMA_DESCRIPTION,
        },
        description: { type: 'string', maxLength: 400, description: 'Bajada opcional que se muestra debajo del título.' },
        icon: { type: 'string', enum: [...RADAR_ICONS], description: 'Icono del encabezado (lista cerrada de lucide-react; ver whatspro_radar_block_catalog).' },
        tone: { type: 'string', enum: [...RADAR_TONES], description: 'Tono semántico del widget. Nunca colores en hex.' },
        section: { type: 'string', description: 'Sección del menú donde vive el widget. Por defecto, resumen. Puede ser una sección builtin (resumen, clientes, prioridades, informes, seguimiento, mejoras, trabajos) o el id de una sección personalizada del equipo; la lista real la devuelve whatspro_radar_block_catalog en "sections", y las personalizadas se crean con whatspro_radar_manage_section.' },
        surface: { type: 'string', enum: [...RADAR_WIDGET_SURFACES], description: 'dashboard = solo el tablero de Radar; chat = solo el panel Radar dentro de un chat; both = ambos.' },
        size: { type: 'string', enum: [...RADAR_WIDGET_SIZES], description: `Ancho en la grilla de 12 columnas: ${RADAR_WIDGET_SIZES.map((size) => `${size}=${RADAR_WIDGET_SPAN[size]}`).join(', ')}. En móvil todos ocupan el ancho completo.` },
        position: { type: 'integer', minimum: 0, maximum: 9999, description: 'Orden dentro de la sección; menor número aparece primero.' },
        contact_id: { type: ['integer', 'null'], minimum: 1, description: 'Si se indica, el widget solo aparece en la ficha/el chat de ese contacto. null o ausente = widget general del equipo.' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa a contact_id: el id del cliente del CRM (resource="customers"). Se resuelve solo al contacto vinculado de ese cliente. Si el cliente no tiene contacto vinculado, o tiene más de uno, la herramienta falla diciendo qué hacer — no adivina.' },
        enabled: { type: 'boolean', description: 'false lo deja guardado pero oculto en la UI, sin borrar los bloques.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_patch_widget',
    description:
      'Cambia el ASPECTO o los metadatos de un widget de Radar que YA EXISTE, sin tocar sus bloques. ES LA FORMA CORRECTA de cambiarle el icono, el tono, el título, la bajada, la sección, la superficie, el tamaño, la posición o el enabled a un widget existente: se identifica por "key" y NO hace falta reenviar los bloques (los deja exactamente como estaban). whatspro_radar_upsert_widget es sólo para CREAR un widget nuevo o para REEMPLAZAR su contenido: usarlo para cambiar un icono te obliga a regenerar todos los bloques y es la forma segura de romper un widget que estaba bien. Los campos que no mandás no se tocan. Ejemplos: "Ponele el icono de llama al widget de leads calientes" (key="leads-calientes", icon="Flame"); "Movelo a Prioridades y hacelo ancho" (section="prioridades", size="lg"); "Ocultá el widget de objeciones por ahora" (enabled=false); "Cambiale el título" (title="..."). Si no sabés la key exacta, pedila con whatspro_radar_list_widgets. Mirá whatspro_radar_block_catalog (iconGuide/sectionIcons) para elegir el icono con criterio.',
    inputSchema: {
      type: 'object',
      required: ['key'],
      properties: {
        key: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          description: 'Key exacta del widget a modificar, tal como la devuelve whatspro_radar_list_widgets. Tiene que existir: esta herramienta NO crea widgets.',
        },
        icon: { type: 'string', enum: [...RADAR_ICONS], description: 'Icono nuevo del encabezado (lista cerrada de lucide-react; ver iconGuide en whatspro_radar_block_catalog). Ausente = se deja el que tenía.' },
        tone: { type: 'string', enum: [...RADAR_TONES], description: 'Tono semántico nuevo. Nunca colores en hex. Ausente = se deja el que tenía.' },
        title: { type: 'string', minLength: 1, maxLength: 160, description: 'Título visible nuevo. Ausente = se deja el que tenía.' },
        description: { type: ['string', 'null'], maxLength: 400, description: 'Bajada debajo del título. Mandá null (o cadena vacía) para sacarla; ausente = se deja la que tenía.' },
        section: { type: 'string', description: 'Mueve el widget a otra sección del menú. Puede ser una sección builtin (resumen, clientes, prioridades, informes, seguimiento, mejoras, trabajos) o el id de una sección personalizada del equipo; la lista real la devuelve whatspro_radar_block_catalog en "sections", y las personalizadas se crean con whatspro_radar_manage_section.' },
        surface: { type: 'string', enum: [...RADAR_WIDGET_SURFACES], description: 'dashboard = solo el tablero de Radar; chat = solo el panel Radar dentro de un chat; both = ambos.' },
        size: { type: 'string', enum: [...RADAR_WIDGET_SIZES], description: `Ancho en la grilla de 12 columnas: ${RADAR_WIDGET_SIZES.map((size) => `${size}=${RADAR_WIDGET_SPAN[size]}`).join(', ')}.` },
        position: { type: 'integer', minimum: 0, maximum: 9999, description: 'Orden dentro de la sección; menor número aparece primero.' },
        enabled: { type: 'boolean', description: 'false lo deja guardado pero oculto en la UI, sin borrar los bloques; true lo vuelve a mostrar.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_set_appearance',
    description:
      'Cambia el ICONO, la ETIQUETA y el TONO de una SECCIÓN del menú lateral de Radar (Resumen, Clientes, Prioridades, Informes, Seguimiento, Análisis de mejora, Reportes de trabajo). OJO, no confundir con whatspro_radar_patch_widget: aquella cambia el icono de UN WIDGET (una tarjeta del tablero); ésta cambia el icono de la ENTRADA DEL MENÚ que agrupa esos widgets, o sea lo que se ve en la barra de la izquierda y en el título de la pantalla. El cambio es por EQUIPO y queda guardado: no es una preferencia de esta conversación. Mandá sections=[{section, icon?, label?, tone?}] con una entrada por sección a cambiar; lo que no mandás no se toca. Ejemplos: "Poné un embudo en la sección Prioridades" (sections=[{section:"prioridades", icon:"Filter"}]); "Renombrá Seguimiento a Pendientes y ponelo en ámbar" (sections=[{section:"seguimiento", label:"Pendientes", tone:"amber"}]); "Volvé Informes a como estaba" (sections=[{section:"informes", reset:true}]). En el menú colapsado el icono es lo ÚNICO que queda visible, así que no le pongas el mismo icono a dos secciones. Los nombres de icono y tono salen de las listas cerradas de whatspro_radar_block_catalog (iconGuide y tones); un valor inventado se descarta. Esta herramienta sólo RETOCA las siete secciones del sistema: para CREAR secciones nuevas del menú, reordenarlas, ocultarlas o borrarlas está whatspro_radar_manage_section.',
    inputSchema: {
      type: 'object',
      required: ['sections'],
      properties: {
        sections: {
          type: 'array',
          minItems: 1,
          maxItems: RADAR_SECTIONS.length,
          description: 'Una entrada por sección a cambiar. Las secciones que no aparecen quedan como están.',
          items: {
            type: 'object',
            required: ['section'],
            properties: {
              section: { type: 'string', enum: [...RADAR_SECTIONS], description: `Sección del menú lateral: ${RADAR_SECTIONS.map((section) => `${section}=${RADAR_SECTION_LABEL[section]}`).join(', ')}.` },
              icon: { type: 'string', enum: [...RADAR_ICONS], description: 'Icono nuevo de la sección (lista cerrada de lucide-react; ver iconGuide en whatspro_radar_block_catalog). Ausente = se deja el que tenía.' },
              label: { type: 'string', minLength: 1, maxLength: 40, description: 'Nombre visible de la sección en el menú y en el título de la pantalla. Ausente = se deja el que tenía.' },
              tone: { type: 'string', enum: [...RADAR_TONES], description: 'Tono semántico de la card del menú. Nunca colores en hex. Ausente = se deja el que tenía.' },
              reset: { type: 'boolean', description: 'true borra TODO lo personalizado de esa sección (icono, etiqueta y tono) y la devuelve al default del sistema. Se ignora icon/label/tone si mandás reset.' },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_manage_section',
    description:
      'Administra las ENTRADAS DEL MENÚ lateral de Radar: crear secciones nuevas, reordenar el menú completo, ocultar/mostrar secciones y borrar las personalizadas. Es la herramienta que convierte a Radar en una UI construible: una sección personalizada es una pantalla nueva cuyo contenido son los widgets que le asignes con whatspro_radar_upsert_widget (section=<id>). Seis acciones: action="create" crea una sección personalizada (id=slug estable, label, icon, tone, hint) y aparece al final del menú; action="update" cambia label/icon/tone/hint de una sección (personalizada o builtin); action="reorder" reordena el menú entero mandando order=[ids] — podés mandar una lista parcial con lo que va arriba y el resto conserva su orden; action="hide" saca una sección del menú SIN borrar nada (widgets y personalización quedan; es reversible); action="show" la vuelve a mostrar; action="delete" borra una sección PERSONALIZADA del menú y mueve sus widgets a move_widgets_to (por defecto "resumen") — las builtin no se borran, se ocultan. Ejemplos: "Creá una sección Cobranzas con icono de billetera" (action="create", id="cobranzas", label="Cobranzas", icon="Wallet", tone="amber"); "Poné Prioridades primero" (action="reorder", order=["prioridades"]); "Sacá del menú la sección Trabajos" (action="hide", id="trabajos"). OJO: para cambiar el icono de UN WIDGET usá whatspro_radar_patch_widget; esta herramienta toca el MENÚ. La lista actual de secciones (con ids, iconos y ocultas) la devuelve whatspro_radar_block_catalog en "sections".',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'reorder', 'hide', 'show', 'delete'],
          description: 'create = sección personalizada nueva (usa id + label); update = cambiar label/icon/tone/hint (usa id); reorder = reordenar el menú (usa order); hide/show = ocultar o mostrar una sección (usa id); delete = borrar una personalizada y mudar sus widgets (usa id, opcional move_widgets_to).',
        },
        id: {
          type: 'string',
          minLength: 2,
          maxLength: 40,
          description: 'Id de la sección. En create: slug nuevo en minúsculas (letras, números y guion, 2-32), p. ej. "cobranzas" o "postventa". En update/hide/show/delete: el id exacto que devuelve whatspro_radar_block_catalog en "sections" (builtin o personalizada).',
        },
        label: { type: 'string', minLength: 1, maxLength: 40, description: 'Nombre visible en el menú y en el título de la pantalla. Obligatorio en create; opcional en update.' },
        icon: { type: 'string', enum: [...RADAR_ICONS], description: 'Icono de la card del menú (lista cerrada de lucide-react; ver iconGuide en whatspro_radar_block_catalog). En el menú colapsado es lo ÚNICO visible: no repitas el de otra sección.' },
        tone: { type: 'string', enum: [...RADAR_TONES], description: 'Tono semántico de la card del menú. Nunca colores en hex.' },
        hint: { type: 'string', minLength: 1, maxLength: 120, description: 'Renglón chico bajo el título de la card del menú, p. ej. "Facturas y cobros pendientes".' },
        order: {
          type: 'array',
          minItems: 1,
          maxItems: 24,
          items: { type: 'string', minLength: 1, maxLength: 40 },
          description: 'SÓLO para action="reorder": ids de sección en el orden deseado, de arriba hacia abajo. Los ids que no mandes quedan después, en su orden actual; los desconocidos se ignoran.',
        },
        move_widgets_to: {
          type: 'string',
          minLength: 2,
          maxLength: 40,
          description: 'SÓLO para action="delete": sección (builtin o personalizada) que hereda los widgets de la borrada. Por defecto "resumen". Los widgets nunca se pierden al borrar una sección.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_delete_widget',
    description:
      'Saca un widget del tablero Radar y lo guarda en el BANCO de widgets (no lo borra: desde el banco se puede restaurar, duplicar como plantilla o borrar definitivamente). Usala solo cuando el usuario pide sacar ese widget de la vista; si lo único que querés es ocultarlo temporalmente, es mejor un whatspro_radar_patch_widget con enabled=false, que lo deja en su sección sin tocar los bloques. Devuelve archived=false si esa key no existía en el equipo. Un whatspro_radar_upsert_widget con la misma key lo desarchiva.',
    inputSchema: {
      type: 'object',
      required: ['key'],
      properties: {
        key: { type: 'string', minLength: 1, maxLength: 80, description: 'Key exacta del widget, tal como la devuelve whatspro_radar_list_widgets.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_publish_report',
    description:
      'Publica un informe como documento en la app Documentos, lo archiva en la carpeta correcta de "Radar · Informes" y lo deja vinculado a Radar para que aparezca en la sección Informes. Mandá el informe en "html" (recomendado: se guarda como documento HTML y se ve con el diseño tal cual lo escribiste) o en "markdown" (se convierte al editor de Documentos). Las carpetas se eligen solas según la categoría: clientes va a la subcarpeta del contacto (por eso contact_id es obligatorio ahí), equipo a "Equipo", generales a "Generales", mejoras a "Mejoras" y trabajos a "Trabajos". Ejemplos: "Publicá el diagnóstico del cliente Mano a Mano" (category="clientes", contact_id=12, html=...); "Dejá el informe semanal del equipo asignado a Noelia" (category="equipo", assigned_user_id=3); "Guardá el análisis de mejora del embudo" (category="mejoras"). Podés dejarlo sin asignar (assigned_user_id ausente) o asignárselo a un usuario del equipo.',
    inputSchema: {
      type: 'object',
      required: ['title', 'category'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 300, description: 'Título del informe. Ej.: "Diagnóstico Mano a Mano · agosto 2026".' },
        category: { type: 'string', enum: [...REPORT_CATEGORIES], description: 'clientes = informe de un cliente puntual (requiere contact_id); equipo = informe del equipo; generales = informe transversal; mejoras = análisis de mejora; trabajos = reporte de trabajo.' },
        html: { type: 'string', minLength: 1, maxLength: 400000, description: 'Informe en HTML autocontenido (sin scripts ni recursos externos). Es la opción recomendada para informes con tablas, secciones y estilos. Obligatorio si no mandás markdown.' },
        markdown: { type: 'string', minLength: 1, maxLength: 400000, description: 'Informe en markdown; se convierte al formato del editor de Documentos. Obligatorio si no mandás html. Si mandás los dos, gana html.' },
        contact_id: { type: 'integer', minimum: 1, description: 'Contacto al que pertenece el informe. OBLIGATORIO cuando category="clientes"; en las demás categorías es opcional y sirve para poder filtrar después.' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa a contact_id: el id del cliente del CRM (resource="customers"). Se resuelve solo al contacto vinculado de ese cliente. Si el cliente no tiene contacto vinculado, o tiene más de uno, la herramienta falla diciendo qué hacer — no adivina.' },
        assigned_user_id: { type: 'integer', minimum: 1, description: 'Usuario del equipo responsable del informe. Omitilo para dejar el informe sin asignar.' },
        summary: { type: 'string', maxLength: 600, description: 'Resumen de una o dos líneas que se muestra en el listado de informes de Radar.' },
        emoji: { type: 'string', maxLength: 8, description: 'Emoji del documento en Documentos. Ej.: "📊".' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_manage_widget',
    description:
      'Ciclo de vida de los widgets de Radar: lo que no hacen ni el upsert ni el patch. Cuatro acciones en una sola herramienta. action="reorder": reacomoda VARIOS widgets de una, mandando items=[{key, position, size?, section?}] — es la forma de ordenar una sección entera sin hacer una llamada por widget; menor position aparece primero, así que conviene mandar todos los widgets de la sección con posiciones consecutivas (0,1,2,3…) para no dejar empates. action="restore": saca un widget del BANCO (donde lo dejó whatspro_radar_delete_widget) y lo vuelve a poner en el tablero, opcionalmente en otra section. action="duplicate": copia un widget a uno nuevo con new_key distinta, para usar uno del banco como plantilla; el original queda como estaba y la copia nace activa. action="purge": BORRA el widget de la base para siempre, sin banco y sin vuelta atrás; exige confirm=true. OJO: para cambiarle el icono, el tono, el título, la bajada, la sección, el tamaño, la posición o el enabled a UN widget que ya existe, esta NO es la herramienta: usá whatspro_radar_patch_widget. Y para cambiarle los bloques, whatspro_radar_upsert_widget. Las keys salen de whatspro_radar_list_widgets (que muestra sólo las del tablero: las del banco hay que recordarlas de cuando se archivaron).',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['reorder', 'restore', 'duplicate', 'purge'],
          description: 'reorder = mover/redimensionar varios widgets en lote (usa items); restore = sacar uno del banco (usa key); duplicate = copiarlo con otra key (usa key + new_key); purge = borrarlo definitivamente (usa key + confirm=true).',
        },
        key: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          description: 'Key exacta del widget sobre el que se actúa. Obligatoria en restore, duplicate y purge; en reorder no se usa (ahí cada key va adentro de items).',
        },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 60,
          description: 'SÓLO para action="reorder": la nueva grilla. Cada ítem mueve un widget existente. Las keys que no existan en el equipo se informan en "missing" y el resto se aplica igual.',
          items: {
            type: 'object',
            required: ['key', 'position'],
            properties: {
              key: { type: 'string', minLength: 1, maxLength: 80, description: 'Key del widget a mover, tal como la devuelve whatspro_radar_list_widgets.' },
              position: { type: 'integer', minimum: 0, maximum: 9999, description: 'Orden dentro de la sección; menor número aparece primero.' },
              size: { type: 'string', enum: [...RADAR_WIDGET_SIZES], description: `Ancho nuevo en la grilla de 12 columnas: ${RADAR_WIDGET_SIZES.map((size) => `${size}=${RADAR_WIDGET_SPAN[size]}`).join(', ')}. Ausente = se deja el que tenía.` },
              section: { type: 'string', description: 'Si viene, además de moverlo lo pasa a esa sección (builtin o personalizada). Ausente = se queda donde estaba.' },
            },
            additionalProperties: false,
          },
        },
        new_key: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$',
          description: 'SÓLO para action="duplicate": key de la copia. Tiene que ser distinta de key y no puede estar tomada por otro widget del equipo.',
        },
        title: { type: 'string', minLength: 1, maxLength: 160, description: 'SÓLO para action="duplicate": título de la copia. Ausente = se copia el del original.' },
        section: { type: 'string', description: 'En restore, sección en la que reaparece el widget; en duplicate, sección de la copia (builtin o personalizada). Ausente = la que tenía el original.' },
        confirm: { type: 'boolean', description: 'SÓLO para action="purge": tenés que mandar true para confirmar el borrado definitivo. Sin esto la llamada falla a propósito.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_note_to_widget',
    description:
      'Convierte una nota "🎯 RADAR" ya escrita en el chat de un contacto en un widget DIBUJADO de Radar, sin que tengas que armar los bloques a mano: el servidor parsea la nota (secciones "TÍTULO: contenido", viñetas, riesgos, objeciones, señales…) y genera las tarjetas y avisos con el icono y el tono que corresponde a cada sección. Es el atajo para "pasá el análisis de este cliente al panel de su chat". Por defecto toma la ÚLTIMA nota interna del contacto que empiece con "🎯 RADAR"; si querés convertir un texto que todavía no está guardado, mandalo en note_text. El widget queda fijado a la ficha de ese contacto (surface="chat" por defecto, o sea el panel Radar dentro de la conversación) con la key "cliente-<id>", así que volver a llamarla después de un análisis nuevo ACTUALIZA el mismo widget en vez de duplicarlo. Si la nota no produce ningún bloque válido no se guarda nada y la respuesta te lo dice. Para armar bloques a mano (gráficos, KPIs, tablas) usá whatspro_radar_upsert_widget; para retocar después el icono o el título de este widget, whatspro_radar_patch_widget.',
    inputSchema: {
      type: 'object',
      anyOf: [{ required: ['contact_id'] }, { required: ['customer_id'] }],
      properties: {
        contact_id: { type: 'integer', minimum: 1, description: 'Contacto dueño de la nota. El widget queda fijado a su ficha.' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa a contact_id: el id del cliente del CRM (resource="customers"). Se resuelve solo al contacto vinculado de ese cliente. Si el cliente no tiene contacto vinculado, o tiene más de uno, la herramienta falla diciendo qué hacer — no adivina.' },
        key: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$',
          description: 'Key del widget. Por defecto "cliente-<contact_id>", que es lo que hace que el próximo análisis del mismo cliente pise el widget anterior en vez de acumular copias.',
        },
        title: { type: 'string', minLength: 1, maxLength: 160, description: 'Título visible. Por defecto "Radar · <nombre del contacto>".' },
        section: { type: 'string', description: 'Sección del menú de Radar (builtin o personalizada). Por defecto "clientes".' },
        surface: { type: 'string', enum: [...RADAR_WIDGET_SURFACES], description: 'dashboard = solo el tablero de Radar; chat = solo el panel Radar dentro del chat del contacto; both = ambos. Por defecto "chat".' },
        size: { type: 'string', enum: [...RADAR_WIDGET_SIZES], description: `Ancho en la grilla de 12 columnas: ${RADAR_WIDGET_SIZES.map((size) => `${size}=${RADAR_WIDGET_SPAN[size]}`).join(', ')}. Por defecto md.` },
        note_text: {
          type: 'string',
          minLength: 1,
          maxLength: 40000,
          description: 'Texto de la nota a convertir. Si lo mandás, se usa éste y NO se busca la última nota del contacto. Ideá para dibujar un análisis recién escrito. Conviené que arranque con "🎯 RADAR <fecha> · <P1|P2|P3> · score <n>" y siga con secciones "TÍTULO: contenido".',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_save_analysis',
    description:
      'Guarda el ANÁLISIS Radar completo de un contacto en UNA SOLA llamada: escribe los campos radar_* en su ficha (score, prioridad, intención, objeción, recuperabilidad, confianza, estrategia, oportunidad secundaria, fecha de análisis), deja la nota interna 🎯 RADAR con el formato canónico en su chat, y opcionalmente dibuja el widget de la ficha (equivale a llamar después whatspro_radar_note_to_widget). Antes esto costaba 10+ llamadas (nueve whatspro_set_custom_fields + la nota + el widget); ahora es una. Es la herramienta central del flujo de análisis: "analizá los 40 contactos de Propuesta y dejá el diagnóstico en cada ficha" = una llamada por contacto. El cuerpo de la nota (note_body) es texto libre organizado en secciones "TÍTULO: contenido" (QUÉ BUSCA:, OBJECIÓN:, SEÑALES:, ESTRATEGIA:, PRÓXIMO PASO:…) — el encabezado 🎯 RADAR lo arma el servidor con la fecha, la prioridad y el score, no lo escribas vos. Con create_widget=true el análisis queda además dibujado en el panel Radar del chat del contacto. Reanalizar al mismo contacto pisa los campos y agrega una nota nueva (el historial de notas se conserva). Verificá el resultado con whatspro_radar_get_client(contact_id).',
    inputSchema: {
      type: 'object',
      required: ['score', 'prioridad'],
      anyOf: [{ required: ['contact_id'] }, { required: ['customer_id'] }],
      properties: {
        contact_id: { type: 'integer', minimum: 1, description: 'Contacto a analizar.' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa a contact_id: el id del cliente del CRM (resource="customers"). Se resuelve solo al contacto vinculado; si no hay o hay varios, la herramienta falla diciendo qué hacer.' },
        score: { type: 'integer', minimum: 0, maximum: 100, description: 'Score de oportunidad 0-100.' },
        prioridad: { type: 'string', enum: ['P1', 'P2', 'P3', 'descartado', 'Revisar'], description: 'P1 = atender ya; P2 = esta semana; P3 = cuando se pueda; descartado = no califica; Revisar = el análisis necesita revisión humana.' },
        intencion: { type: 'string', maxLength: 300, description: 'Qué busca o qué quiere comprar, en una frase.' },
        objecion: { type: 'string', maxLength: 300, description: 'La objeción o el freno principal.' },
        recuperabilidad: { type: 'string', maxLength: 300, description: 'Qué tan recuperable es y por qué (ej. "alta: pidió precio hace 3 días").' },
        confianza: { type: 'integer', minimum: 0, maximum: 100, description: 'Confianza del análisis 0-100. Menos de 70 marca el contacto como "necesita revisión".' },
        estrategia: { type: 'string', maxLength: 400, description: 'La jugada recomendada, en una o dos frases accionables.' },
        oportunidad_2: { type: 'string', maxLength: 300, description: 'Oportunidad secundaria si la hay (venta cruzada, otro servicio).' },
        fecha_analisis: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Fecha del análisis YYYY-MM-DD. Por defecto, hoy.' },
        note_body: { type: 'string', maxLength: 20000, description: 'Cuerpo de la nota 🎯 RADAR: secciones "TÍTULO: contenido" separadas por líneas en blanco. NO incluyas la primera línea "🎯 RADAR …": la arma el servidor. Si no lo mandás, la nota se genera con los campos del análisis.' },
        create_widget: { type: 'boolean', description: 'true = además dibuja el widget de la ficha en el panel Radar del chat (key "cliente-<contact_id>", como whatspro_radar_note_to_widget).' },
        idempotency_key: { type: 'string', minLength: 1, maxLength: 120, description: 'Clave estable del análisis (ej. "radar-2026-08-28-contacto-12"): reintentar con la misma clave no duplica la nota.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_update_report',
    description:
      'ACTUALIZA un informe de Radar ya publicado, en lugar de crear uno nuevo: whatspro_radar_publish_report SIEMPRE crea un documento, así que reescribir el informe semanal con publish genera un duplicado por semana — para eso está esta herramienta. Reemplaza el contenido (html o markdown) y/o el título, el emoji, el resumen y el usuario asignado del vínculo Radar, conservando la categoría y el contacto del informe. Usa control de versión optimista: si mandás version y alguien guardó en el medio, falla con 409 en vez de pisar. El document_id sale de whatspro_radar_list_reports o de whatspro_radar_get_client.',
    inputSchema: {
      type: 'object',
      required: ['document_id'],
      properties: {
        document_id: { type: 'integer', minimum: 1, description: 'ID del documento del informe (whatspro_radar_list_reports).' },
        html: { type: 'string', minLength: 1, maxLength: 400000, description: 'Contenido HTML nuevo (para informes format="html").' },
        markdown: { type: 'string', minLength: 1, maxLength: 400000, description: 'Contenido markdown nuevo (para informes format="markdown").' },
        title: { type: 'string', minLength: 1, maxLength: 300, description: 'Título nuevo.' },
        emoji: { type: 'string', maxLength: 8, description: 'Emoji nuevo del documento.' },
        summary: { type: 'string', maxLength: 600, description: 'Resumen nuevo del vínculo Radar (se ve en el listado de informes).' },
        assigned_user_id: { type: ['integer', 'null'], minimum: 1, description: 'Usuario del equipo asignado al informe. null lo desasigna.' },
        version: { type: 'integer', minimum: 0, description: 'Versión actual del documento (control optimista). Leela con whatspro_get_record(resource="documents").' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_radar_unlink_report',
    description:
      'Saca un informe del panel de Radar SIN borrar el documento: elimina el vínculo (categoría, contacto, resumen) pero el documento sigue existiendo en la app Documentos. Es la forma correcta de limpiar el listado de informes de Radar. Para borrar el documento de verdad usá whatspro_delete_record(type="document", confirm=true). Para volver a vincularlo, publicá o vinculá de nuevo con whatspro_radar_publish_report o whatspro_radar_update_report.',
    inputSchema: {
      type: 'object',
      required: ['document_id'],
      properties: {
        document_id: { type: 'integer', minimum: 1, description: 'ID del documento cuyo vínculo con Radar se elimina.' },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Schemas de entrada                                                  */
/* ------------------------------------------------------------------ */

/** Campos que whatspro_radar_patch_widget sabe tocar, sin contar la key. */
const PATCHABLE_WIDGET_FIELDS = [
  'icon', 'tone', 'title', 'description', 'section', 'surface', 'size', 'position', 'enabled',
] as const;

const sectionEnum = z.enum(RADAR_SECTIONS);
/**
 * Sección de un WIDGET: builtin o slug de una sección personalizada. Acá sólo
 * se valida la forma; que exista de verdad en el equipo lo chequea
 * `assertSectionExists`, que es quien puede leer la apariencia y devolver la
 * lista real en el error.
 */
const sectionIdSchema = z.string().trim().min(2).max(40).refine(
  (value) => isBuiltinRadarSection(value) || RADAR_SECTION_ID_REGEX.test(value),
  'sección inválida: usá una builtin o el slug (minúsculas, números y guion) de una sección personalizada',
);
const surfaceEnum = z.enum(RADAR_WIDGET_SURFACES);
const sizeEnum = z.enum(RADAR_WIDGET_SIZES);
const iconEnum = z.enum(RADAR_ICONS);
const toneEnum = z.enum(RADAR_TONES);
const categoryEnum = z.enum(REPORT_CATEGORIES);

const boardPriorityEnum = z.enum(['P1', 'P2', 'P3', 'descartado']);

const overviewSchema = z.object({
  priority: boardPriorityEnum.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const listClientsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  priority: boardPriorityEnum.optional(),
  only_with_reports: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const getClientSchema = z.object({
  contact_id: z.number().int().positive().optional(),
  customer_id: z.number().int().positive().optional(),
}).refine((value) => value.contact_id != null || value.customer_id != null, 'mandá contact_id o customer_id');

const listBankSchema = z.object({
  section: sectionIdSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const saveAnalysisSchema = z.object({
  contact_id: z.number().int().positive().optional(),
  customer_id: z.number().int().positive().optional(),
  score: z.number().int().min(0).max(100),
  prioridad: z.enum(['P1', 'P2', 'P3', 'descartado', 'Revisar']),
  intencion: z.string().trim().max(300).optional(),
  objecion: z.string().trim().max(300).optional(),
  recuperabilidad: z.string().trim().max(300).optional(),
  confianza: z.number().int().min(0).max(100).optional(),
  estrategia: z.string().trim().max(400).optional(),
  oportunidad_2: z.string().trim().max(300).optional(),
  fecha_analisis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note_body: z.string().trim().max(20000).optional(),
  create_widget: z.boolean().optional(),
  idempotency_key: z.string().trim().min(1).max(120).optional(),
}).refine((value) => value.contact_id != null || value.customer_id != null, 'mandá contact_id o customer_id');

const updateReportSchema = z.object({
  document_id: z.number().int().positive(),
  html: z.string().min(1).max(400000).optional(),
  markdown: z.string().min(1).max(400000).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  emoji: z.string().trim().max(8).optional(),
  summary: z.string().trim().max(600).optional(),
  assigned_user_id: z.number().int().positive().nullable().optional(),
  version: z.number().int().min(0).optional(),
}).refine(
  (value) => value.html !== undefined || value.markdown !== undefined || value.title !== undefined
    || value.emoji !== undefined || value.summary !== undefined || value.assigned_user_id !== undefined,
  'mandá al menos un campo a cambiar (html, markdown, title, emoji, summary o assigned_user_id)',
);

const unlinkReportSchema = z.object({
  document_id: z.number().int().positive(),
});

const listWidgetsSchema = z.object({
  section: sectionIdSchema.optional(),
  surface: surfaceEnum.optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().optional(),
});

const listReportsSchema = z.object({
  category: categoryEnum.optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().optional(),
  assigned_user_id: z.number().int().positive().nullable().optional(),
});

const upsertWidgetSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i, 'usa letras, números, guion y guion bajo'),
  title: z.string().trim().min(1).max(160),
  blocks: z.array(z.unknown()).min(1).max(60),
  description: z.string().trim().max(400).optional(),
  icon: iconEnum.optional(),
  tone: toneEnum.optional(),
  section: sectionIdSchema.optional(),
  surface: surfaceEnum.optional(),
  size: sizeEnum.optional(),
  position: z.number().int().min(0).max(9999).optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
});

const patchWidgetSchema = z.object({
  key: z.string().trim().min(1).max(80),
  icon: iconEnum.optional(),
  tone: toneEnum.optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  section: sectionIdSchema.optional(),
  surface: surfaceEnum.optional(),
  size: sizeEnum.optional(),
  position: z.number().int().min(0).max(9999).optional(),
  enabled: z.boolean().optional(),
}).refine(
  (value) => PATCHABLE_WIDGET_FIELDS.some((field) => value[field] !== undefined),
  `mandá al menos uno de los campos a cambiar (${PATCHABLE_WIDGET_FIELDS.join(', ')}) además de key`,
);

const deleteWidgetSchema = z.object({
  key: z.string().trim().min(1).max(80),
});

const setAppearanceSchema = z.object({
  sections: z
    .array(
      z
        .object({
          section: sectionEnum,
          icon: iconEnum.optional(),
          label: z.string().trim().min(1).max(40).optional(),
          tone: toneEnum.optional(),
          reset: z.boolean().optional(),
        })
        .refine(
          (value) => value.reset === true || value.icon !== undefined || value.label !== undefined || value.tone !== undefined,
          'mandá icon, label o tone (o reset:true) además de section',
        ),
    )
    .min(1)
    .max(RADAR_SECTIONS.length),
});

/**
 * Unión discriminada por `action`, mismo criterio que `manageWidgetSchema`:
 * cada acción exige exactamente lo suyo y el error de validación lo dice.
 */
const manageSectionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    id: z.string().trim().toLowerCase().regex(RADAR_SECTION_ID_REGEX, 'slug en minúsculas: letras, números y guion (2 a 32)'),
    label: z.string().trim().min(1).max(40),
    icon: iconEnum.optional(),
    tone: toneEnum.optional(),
    hint: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    action: z.literal('update'),
    id: sectionIdSchema,
    label: z.string().trim().min(1).max(40).optional(),
    icon: iconEnum.optional(),
    tone: toneEnum.optional(),
    hint: z.string().trim().min(1).max(120).optional(),
  }).refine(
    (value) => value.label !== undefined || value.icon !== undefined || value.tone !== undefined || value.hint !== undefined,
    'mandá al menos label, icon, tone o hint además de id',
  ),
  z.object({
    action: z.literal('reorder'),
    order: z.array(z.string().trim().min(1).max(40)).min(1).max(24),
  }),
  z.object({ action: z.literal('hide'), id: sectionIdSchema }),
  z.object({ action: z.literal('show'), id: sectionIdSchema }),
  z.object({
    action: z.literal('delete'),
    id: sectionIdSchema,
    move_widgets_to: sectionIdSchema.optional(),
  }),
]);

/** Un ítem de la grilla en un reorder: qué widget va a qué lugar. */
const reorderItemSchema = z.object({
  key: z.string().trim().min(1).max(80),
  position: z.number().int().min(0).max(9999),
  size: sizeEnum.optional(),
  section: sectionIdSchema.optional(),
});

/**
 * Unión discriminada por `action`: cada acción exige exactamente lo suyo, así
 * un `duplicate` sin `new_key` o un `purge` sin `key` fallan en la validación
 * con un mensaje claro en vez de llegar a la base.
 */
const manageWidgetSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reorder'),
    items: z.array(reorderItemSchema).min(1).max(60),
  }),
  z.object({
    action: z.literal('restore'),
    key: z.string().trim().min(1).max(80),
    section: sectionIdSchema.optional(),
  }),
  z.object({
    action: z.literal('duplicate'),
    key: z.string().trim().min(1).max(80),
    new_key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i, 'usa letras, números, guion y guion bajo'),
    title: z.string().trim().min(1).max(160).optional(),
    section: sectionIdSchema.optional(),
  }),
  z.object({
    action: z.literal('purge'),
    key: z.string().trim().min(1).max(80),
    // Se valida a mano en la implementación para poder explicar en el error que
    // el borrado es irreversible y cuál es la alternativa reversible.
    confirm: z.boolean().optional(),
  }),
]);

const noteToWidgetSchema = z.object({
  contact_id: z.number().int().positive().optional(),
  customer_id: z.number().int().positive().optional(),
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i, 'usa letras, números, guion y guion bajo').optional(),
  title: z.string().trim().min(1).max(160).optional(),
  section: sectionIdSchema.optional(),
  surface: surfaceEnum.optional(),
  size: sizeEnum.optional(),
  note_text: z.string().min(1).max(40000).optional(),
}).refine((value) => value.contact_id != null || value.customer_id != null, 'mandá contact_id o customer_id');

const publishReportSchema = z.object({
  title: z.string().trim().min(1).max(300),
  category: categoryEnum,
  html: z.string().min(1).max(400000).optional(),
  markdown: z.string().min(1).max(400000).optional(),
  contact_id: z.number().int().positive().optional(),
  customer_id: z.number().int().positive().optional(),
  assigned_user_id: z.number().int().positive().optional(),
  summary: z.string().trim().max(600).optional(),
  emoji: z.string().trim().max(8).optional(),
})
  .refine((value) => Boolean(value.html || value.markdown), 'html o markdown es obligatorio')
  .refine(
    (value) => value.category !== 'clientes' || value.contact_id != null || value.customer_id != null,
    'con category="clientes" hace falta contact_id (o customer_id, que se resuelve al contacto vinculado)',
  );

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function ownedContact(context: GrokActionContext, contactId: number) {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, context.teamId)),
    columns: { id: true, name: true, chatId: true },
  });
  if (!contact) throw new Error('Contact not found.');
  return contact;
}

/**
 * Radar cuelga sus fichas e informes del CONTACTO (team_radar_widgets.contact_id),
 * pero el usuario y las demás herramientas hablan de "cliente" — que en el CRM es
 * `team_customers` y puede tener varios contactos, o ninguno.
 *
 * Esto traduce customer_id → contact_id usando el vínculo real. Si el cliente no
 * tiene contacto vinculado, o tiene más de uno, NO adivina: falla diciendo
 * exactamente qué hacer. Un widget colgado del contacto equivocado no da error en
 * ningún lado, simplemente aparece en la ficha de otra persona.
 */
async function resolveContactFromCustomer(context: GrokActionContext, customerId: number) {
  const customer = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, context.teamId)),
    columns: { id: true, name: true },
  });
  if (!customer) {
    throw new Error(`No existe el cliente ${customerId} en este equipo. Buscalo con whatspro_list_records(resource="customers").`);
  }
  const links = await db
    .select({ contactId: teamCustomerContacts.contactId, name: contacts.name })
    .from(teamCustomerContacts)
    .innerJoin(contacts, eq(contacts.id, teamCustomerContacts.contactId))
    .where(and(
      eq(teamCustomerContacts.teamId, context.teamId),
      eq(teamCustomerContacts.customerId, customerId),
    ));
  if (!links.length) {
    throw new Error(
      `El cliente ${customerId} (${customer.name}) no tiene ningún contacto del CRM vinculado, y las fichas e informes de Radar se cuelgan del contacto. `
      + 'Vinculá uno con whatspro_link_customer_contact(customer_id, contact_id) y volvé a intentar; si el cliente no tiene conversación de WhatsApp, dejá el análisis en su bitácora con whatspro_customer_notes(action="add").',
    );
  }
  if (links.length > 1) {
    throw new Error(
      `El cliente ${customerId} (${customer.name}) tiene ${links.length} contactos vinculados: `
      + links.map((link) => `${link.contactId} (${link.name})`).join(', ')
      + '. Elegí uno y mandá contact_id en vez de customer_id.',
    );
  }
  return links[0].contactId;
}

/**
 * Puerta de entrada única de las herramientas de Radar que trabajan sobre un
 * cliente: acepta contact_id o customer_id y devuelve siempre el contact_id.
 */
async function resolveRadarContactId(
  context: GrokActionContext,
  data: { contact_id?: number | null; customer_id?: number | null },
) {
  if (data.contact_id != null) return data.contact_id;
  if (data.customer_id != null) return resolveContactFromCustomer(context, data.customer_id);
  return data.contact_id;
}

/**
 * La forma del id la valida zod; acá se chequea que la sección EXISTA en este
 * equipo (builtin o personalizada). Sin esto, un widget asignado a un slug
 * inventado se guardaría pero no aparecería en ninguna pantalla — el peor tipo
 * de error, el silencioso.
 */
async function assertSectionExists(context: GrokActionContext, sectionId: string | undefined) {
  if (!sectionId || isBuiltinRadarSection(sectionId)) return;
  const sections = resolveRadarSections(await getRadarAppearance(context.teamId));
  if (sections.some((section) => section.section === sectionId)) return;
  throw new Error(
    `La sección "${sectionId}" no existe en este equipo. Las secciones válidas son: ${sections
      .map((section) => `${section.section} (${section.label})`)
      .join(', ')}. Para crear una sección nueva del menú usá whatspro_radar_manage_section con action="create".`,
  );
}

async function assertTeamMember(context: GrokActionContext, userId: number) {
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, context.teamId), eq(teamMembers.userId, userId)),
    columns: { userId: true },
  });
  if (!member) throw new Error('Assigned user is not a member of this team.');
}

type RejectedBlock = { index: number; type: string; reason: string };

/**
 * Valida bloque por bloque en vez de todo o nada: un widget con 9 bloques
 * buenos y 1 roto se guarda igual, pero la respuesta dice exactamente cuál se
 * cayó y por qué, así la IA lo corrige en el siguiente intento.
 */
function splitBlocks(candidates: unknown[]) {
  const accepted: RadarBlock[] = [];
  const rejected: RejectedBlock[] = [];
  candidates.forEach((candidate, index) => {
    const parsed = radarBlockSchema.safeParse(candidate);
    if (parsed.success) {
      accepted.push(parsed.data);
      return;
    }
    const rawType = candidate && typeof candidate === 'object' && 'type' in candidate
      ? String((candidate as { type: unknown }).type)
      : '(sin type)';
    rejected.push({
      index,
      type: rawType,
      reason: parsed.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.join('.') || 'bloque'}: ${issue.message}`)
        .join('; '),
    });
  });
  return { accepted, rejected };
}

/* ------------------------------------------------------------------ */
/* Implementaciones                                                    */
/* ------------------------------------------------------------------ */

async function blockCatalog(_input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  // Los iconos de sección que se ven HOY en el menú de este equipo, no las
  // constantes: si alguien los cambió con whatspro_radar_set_appearance, la IA
  // tiene que evitar el icono real, no el de fábrica.
  const resolvedSections = resolveRadarSections(await getRadarAppearance(context.teamId));
  return {
    object: 'radar_block_catalog',
    howTo: [
      'Cada widget de Radar es un array de bloques que se dibujan de arriba hacia abajo.',
      'Elegí el tipo de bloque por lo que querés mostrar y copiá el "example" cambiando los datos.',
      'icon y tone son listas cerradas: usá exactamente uno de los valores de icons/tones.',
      'Elegí el icono por familia mirando "iconGuide", no repitas siempre el mismo.',
      'Guardá el widget con whatspro_radar_upsert_widget usando una key estable para poder actualizarlo después.',
      'Para cambiarle después sólo el icono, el tono o el título a un widget que ya existe, usá whatspro_radar_patch_widget: no hace falta reenviar los bloques.',
      'Para maquetar DENTRO de un widget usá el bloque "columns" (2 a 4 columnas con bloques adentro); para controlar cuánto ancho ocupa el widget EN LA GRILLA usá su "size" (ver widgetSizes).',
      'El menú lateral también se construye: whatspro_radar_manage_section crea secciones nuevas, las reordena, las oculta o las borra — los ids válidos para "section" de un widget están en "sections" acá abajo.',
      'Si lo que vas a producir es un INFORME (documento largo, con formato), no lo metas en un widget: publicalo con whatspro_radar_publish_report y va a quedar en la sección Informes; después podés referenciarlo desde un widget con un bloque "documents".',
      'FICHA DE CLIENTE PERSONALIZADA: armala como un widget fijado al contacto (contact_id + surface "chat" o "both") combinando score + stat (datos y campos personalizados) + tags (etiquetas) + tasks (sus tareas) + timeline (últimos movimientos) + replies (respuestas recomendadas) + form (brief o datos que faltan pedir) + resources (documentos, archivos y links del cliente).',
      'Para vincular elementos del sistema usá los bloques dedicados: tasks (tareas con estado), resources (documentos/proyectos/workspaces/personas/archivos/links), tags (etiquetas), checklist (pasos con hecho/pendiente real): los datos van embebidos, leelos antes con las tools del sistema (whatspro_tasks_board, whatspro_get_record, etc.).',
    ].join(' '),
    iconStyleNote: [
      'Mandá SIEMPRE icon y tone al crear un widget.',
      'Si no los mandás, el servidor le pone el icono que corresponde a su PRIMER bloque (ver blockDefaultIcons) y el tono de su sección: sirve como red de seguridad, pero dos widgets que empiezan con el mismo tipo de bloque van a salir iguales.',
      'Elegí el icono por lo que muestra el widget (mirá "iconGuide" y su "useFor"), y evitá el icono que ya usa la sección donde lo vas a poner (está en "sectionIcons"): si el widget repite el icono de su propia sección, no aporta ninguna información nueva.',
      'El tono es semántico, no decorativo: rose/amber para problemas y urgencias, emerald para lo que va bien, sky/indigo/violet para informativo, slate/neutral para contexto de fondo.',
    ].join(' '),
    blocks: RADAR_BLOCK_CATALOG,
    icons: RADAR_ICONS,
    iconGuide: RADAR_ICON_FAMILIES,
    tones: RADAR_TONES,
    // El menú REAL de este equipo, en su orden actual: builtins (renombradas o
    // no) + secciones personalizadas. `value` es lo que va en el campo
    // "section" de un widget. Las ocultas siguen aceptando widgets.
    sections: resolvedSections.map((section) => ({
      value: section.section,
      label: section.label,
      custom: section.custom,
      hidden: section.hidden,
      ...(section.hint ? { hint: section.hint } : {}),
    })),
    sectionsNote:
      'Estas son TODAS las secciones válidas para el campo "section" de un widget, en el orden real del menú. Para crear una sección nueva, reordenarlas, ocultarlas o borrarlas usá whatspro_radar_manage_section; para retocar icono/etiqueta/tono de una que ya existe, whatspro_radar_set_appearance (builtins) o whatspro_radar_manage_section action="update" (cualquiera).',
    // El icono EFECTIVO de cada sección (con los overrides del equipo ya
    // aplicados): sirve para NO repetirlo en un widget que vive adentro de esa
    // misma sección.
    sectionIcons: resolvedSections.map((section) => ({
      section: section.section,
      label: section.label,
      icon: section.icon,
      /** true = el equipo lo personalizó (override de builtin o sección propia). */
      customized: section.overridden,
      ...(isBuiltinRadarSection(section.section)
        ? { defaultIcon: RADAR_SECTION_ICON[section.section], defaultLabel: RADAR_SECTION_LABEL[section.section] }
        : {}),
      note: `Evitá "${section.icon}" como icono de un widget de la sección ${section.label}: ya lo usa la sección. Para cambiar el icono DE LA SECCIÓN usá whatspro_radar_set_appearance o whatspro_radar_manage_section.`,
    })),
    // Qué icono recibe un widget que se crea SIN icon: sale del primer bloque.
    blockDefaultIcons: Object.entries(RADAR_BLOCK_DEFAULT_ICON).map(([type, icon]) => ({ type, icon })),
    blockDefaultIconNote:
      'Si creás un widget sin "icon", el servidor le pone el icono que le corresponde al PRIMER bloque según blockDefaultIcons (y sólo si el widget no tiene ningún bloque, el de la sección). Mandá igual un icon propio cuando el widget tenga un tema más específico que su primer bloque.',
    widgetSizes: RADAR_WIDGET_SIZES.map((size) => ({
      value: size,
      columns: RADAR_WIDGET_SPAN[size],
      perRow: RADAR_WIDGET_PER_ROW[size],
    })),
    widgetSizesNote:
      'El tamaño es el ancho del widget en la grilla de 12 columnas de escritorio: xs entra 4 por fila, sm 3 por fila, md 2 por fila, lg ocupa dos tercios y full la fila entera. Combinalos para componer la pantalla (p. ej. cuatro xs de KPIs arriba + un lg con gráfico y un xs de lista abajo). En móvil todos ocupan el ancho completo. El usuario también puede cambiarlos a mano desde "Editar widgets".',
    widgetSurfaces: RADAR_WIDGET_SURFACES,
    limits: { maxBlocksPerWidget: 60, keyPattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$', maxCustomSections: 12 },
  };
}

async function listWidgets(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(listWidgetsSchema, input);
  const contactId = await resolveRadarContactId(context, data);
  const widgets = await listRadarWidgets({
    teamId: context.teamId,
    ...(data.section !== undefined ? { section: data.section } : {}),
    ...(data.surface !== undefined ? { surface: data.surface } : {}),
    ...(contactId !== undefined ? { contactId } : {}),
  });
  return { object: 'radar_widgets', count: widgets.length, widgets };
}

async function listReports(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(listReportsSchema, input);
  const contactId = await resolveRadarContactId(context, data);
  // `listLinkedRadarReports` filtra por igualdad, así que un `null` explícito
  // (que en el JSON Schema significa "sin contacto") no es un filtro válido:
  // se ignora igual que si no hubiera venido.
  const reports = await listLinkedRadarReports({
    teamId: context.teamId,
    ...(data.category !== undefined ? { category: data.category } : {}),
    ...(typeof contactId === 'number' ? { contactId } : {}),
    ...(typeof data.assigned_user_id === 'number' ? { assignedUserId: data.assigned_user_id } : {}),
  });
  return { object: 'radar_reports', count: reports.length, reports };
}

async function upsertWidget(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(upsertWidgetSchema, input);
  const contactId = await resolveRadarContactId(context, data);
  if (contactId != null) await ownedContact(context, contactId);
  await assertSectionExists(context, data.section);

  const { accepted, rejected } = splitBlocks(data.blocks);
  if (!accepted.length) {
    throw new Error(
      `Ningún bloque es válido (${rejected.length} descartados). Revisá el catálogo con whatspro_radar_block_catalog. Detalle: ${rejected
        .map((block) => `#${block.index} (${block.type}) → ${block.reason}`)
        .join(' | ')}`,
    );
  }

  const widgetInput = parse(radarWidgetInputSchema, {
    key: data.key,
    title: data.title,
    blocks: accepted,
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.icon !== undefined ? { icon: data.icon } : {}),
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    ...(data.section !== undefined ? { section: data.section } : {}),
    ...(data.surface !== undefined ? { surface: data.surface } : {}),
    ...(data.size !== undefined ? { size: data.size } : {}),
    ...(data.position !== undefined ? { position: data.position } : {}),
    ...(contactId !== undefined ? { contactId } : {}),
    ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
  } as Record<string, unknown>);

  const widget = await upsertRadarWidget({
    teamId: context.teamId,
    userId: context.userId,
    source: 'ai',
    input: widgetInput,
  });
  await audit(context, 'GROK_RADAR_WIDGET_UPSERTED', widget.id);

  return {
    success: true,
    widget,
    blocks: {
      received: data.blocks.length,
      accepted: accepted.length,
      discarded: rejected.length,
      discardedDetail: rejected,
      ...(rejected.length
        ? { note: 'Los bloques descartados no se guardaron. Corregilos mirando whatspro_radar_block_catalog y reenviá el widget con la misma key.' }
        : {}),
    },
  };
}

/**
 * Update parcial: cambia el aspecto de un widget sin obligar a la IA a
 * regenerar los bloques (que es lo que pasaba cuando la única herramienta de
 * escritura era el upsert). Lo ausente no se pisa.
 */
async function patchWidget(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(patchWidgetSchema, input);
  await assertSectionExists(context, data.section);

  // Sólo se arma el campo si vino: `patchRadarWidget` distingue ausente de null.
  const fields: PatchRadarWidgetFields = {
    ...(data.icon !== undefined ? { icon: data.icon } : {}),
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.section !== undefined ? { section: data.section } : {}),
    ...(data.surface !== undefined ? { surface: data.surface } : {}),
    ...(data.size !== undefined ? { size: data.size } : {}),
    ...(data.position !== undefined ? { position: data.position } : {}),
    ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
  };

  const widget = await patchRadarWidget({
    teamId: context.teamId,
    userId: context.userId,
    key: data.key,
    fields,
  });
  if (!widget) {
    throw new Error(
      `No existe ningún widget con la key "${data.key}" en este equipo. Llamá a whatspro_radar_list_widgets para ver las keys reales y reintentá con una de ésas; si el widget todavía no existe, creálo con whatspro_radar_upsert_widget (esa sí necesita los bloques).`,
    );
  }
  await audit(context, 'GROK_RADAR_WIDGET_PATCHED', widget.id);

  return {
    success: true,
    widget,
    patched: Object.keys(fields),
    note: 'Los bloques del widget quedaron intactos; sólo se cambiaron los campos listados en "patched".',
  };
}

/**
 * Apariencia de las SECCIONES del menú lateral. Es lo que `patchWidget` no
 * puede tocar: aquél cambia una tarjeta del tablero, éste cambia la entrada del
 * menú que las agrupa. Se guarda por equipo en los settings del plugin.
 */
async function setAppearance(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(setAppearanceSchema, input);

  const sections: SetRadarAppearanceInput['sections'] = {};
  for (const entry of data.sections) {
    // `reset` gana sobre todo lo demás: el objeto vacío es lo que borra el
    // override y devuelve la sección al default del código.
    if (entry.reset) {
      sections[entry.section] = {};
      continue;
    }
    sections[entry.section] = {
      ...(sections[entry.section] ?? {}),
      ...(entry.icon !== undefined ? { icon: entry.icon } : {}),
      ...(entry.label !== undefined ? { label: entry.label } : {}),
      ...(entry.tone !== undefined ? { tone: entry.tone } : {}),
    };
  }

  const touched = Object.keys(sections) as RadarSection[];
  const appearance = await setRadarAppearance({
    teamId: context.teamId,
    userId: context.userId,
    sections,
  });
  await audit(context, 'GROK_RADAR_APPEARANCE_SET', touched.join(','));

  return {
    success: true,
    updated: touched,
    appearance,
    // Cómo queda el menú de verdad: defaults del código + overrides del equipo.
    sections: resolveRadarSections(appearance),
    note: 'Esto cambió la ENTRADA DEL MENÚ, no los widgets. Para el icono de un widget suelto usá whatspro_radar_patch_widget.',
  };
}

/**
 * Entradas del menú: crear, reordenar, ocultar/mostrar y borrar secciones.
 * `setAppearance` retoca una sección que ya existe; esto cambia CUÁLES
 * secciones hay y en qué orden. Los widgets nunca se pierden por acá: borrar
 * una sección los muda, ocultarla los deja donde están.
 */
async function manageSection(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(manageSectionSchema, input);
  const base = { teamId: context.teamId, userId: context.userId };

  if (data.action === 'create') {
    const appearance = await createRadarCustomSection({
      ...base,
      id: data.id,
      label: data.label,
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      ...(data.tone !== undefined ? { tone: data.tone } : {}),
      ...(data.hint !== undefined ? { hint: data.hint } : {}),
    });
    await audit(context, 'GROK_RADAR_SECTION_CREATED', data.id);
    return {
      success: true,
      action: 'create' as const,
      section: data.id,
      sections: resolveRadarSections(appearance),
      next: `La sección "${data.label}" ya está en el menú, vacía. Llenala creando widgets con whatspro_radar_upsert_widget(section="${data.id}"); para moverla de lugar usá action="reorder".`,
    };
  }

  if (data.action === 'update') {
    const fields = {
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      ...(data.tone !== undefined ? { tone: data.tone } : {}),
      ...(data.hint !== undefined ? { hint: data.hint } : {}),
    };
    // Builtin y personalizada se guardan distinto (override vs entrada propia),
    // pero para quien llama es el mismo gesto: cambiar cómo se ve una sección.
    const appearance = isBuiltinRadarSection(data.id)
      ? await setRadarAppearance({ ...base, sections: { [data.id]: fields } })
      : await updateRadarCustomSection({ ...base, id: data.id, fields });
    await audit(context, 'GROK_RADAR_SECTION_UPDATED', data.id);
    return {
      success: true,
      action: 'update' as const,
      section: data.id,
      patched: Object.keys(fields),
      sections: resolveRadarSections(appearance),
    };
  }

  if (data.action === 'reorder') {
    const appearance = await reorderRadarSections({ ...base, order: data.order });
    await audit(context, 'GROK_RADAR_SECTIONS_REORDERED', data.order.join(','));
    return {
      success: true,
      action: 'reorder' as const,
      sections: resolveRadarSections(appearance),
      note: 'Los ids que no mandaste quedaron después de los tuyos, en su orden anterior.',
    };
  }

  if (data.action === 'hide' || data.action === 'show') {
    const hidden = data.action === 'hide';
    // No dejar un menú vacío: ocultar la última sección visible dejaría al
    // usuario mirando una pantalla sin navegación.
    if (hidden) {
      const visible = resolveRadarSections(await getRadarAppearance(context.teamId)).filter(
        (section) => !section.hidden,
      );
      if (visible.length <= 1 && visible.some((section) => section.section === data.id)) {
        throw new Error('No se puede ocultar la última sección visible del menú: mostrá otra antes.');
      }
    }
    const appearance = await setRadarSectionHidden({ ...base, id: data.id, hidden });
    await audit(context, hidden ? 'GROK_RADAR_SECTION_HIDDEN' : 'GROK_RADAR_SECTION_SHOWN', data.id);
    return {
      success: true,
      action: data.action,
      section: data.id,
      sections: resolveRadarSections(appearance),
      note: hidden
        ? 'La sección salió del menú pero conserva sus widgets y su personalización: action="show" la devuelve tal cual estaba.'
        : 'La sección volvió al menú con todo lo que tenía.',
    };
  }

  // delete: sólo personalizadas; las builtin se ocultan, no se borran.
  if (isBuiltinRadarSection(data.id)) {
    throw new Error(
      `"${data.id}" es una sección del sistema y no se puede borrar. Si querés sacarla del menú usá action="hide", que es reversible.`,
    );
  }
  const destination = data.move_widgets_to ?? 'resumen';
  await assertSectionExists(context, destination);
  if (destination === data.id) {
    throw new Error('move_widgets_to no puede ser la misma sección que se está borrando.');
  }
  const moved = await reassignRadarWidgetsSection({ teamId: context.teamId, from: data.id, to: destination });
  const appearance = await deleteRadarCustomSection({ ...base, id: data.id });
  await audit(context, 'GROK_RADAR_SECTION_DELETED', data.id);
  return {
    success: true,
    action: 'delete' as const,
    section: data.id,
    widgets_moved: moved,
    moved_to: destination,
    sections: resolveRadarSections(appearance),
    note: `Se borró la entrada del menú; sus ${moved} widget(s) ahora viven en "${destination}". Volver a crear una sección con el mismo id NO los recupera solos: habría que moverlos de vuelta con whatspro_radar_patch_widget.`,
  };
}

async function deleteWidget(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(deleteWidgetSchema, input);
  // Archiva en vez de borrar: el borrado definitivo es una acción manual del
  // banco, no algo que una IA pueda hacer sin querer.
  const widget = await archiveRadarWidget({ teamId: context.teamId, userId: context.userId, key: data.key });
  if (widget) await audit(context, 'GROK_RADAR_WIDGET_ARCHIVED', data.key);
  return { success: true, archived: Boolean(widget), key: data.key };
}

/**
 * Ciclo de vida de la grilla y del banco: reorder / restore / duplicate /
 * purge. Todo lo que cambia el ASPECTO de un widget suelto vive en
 * `patchWidget`, y lo que cambia su CONTENIDO en `upsertWidget`: acá sólo
 * está lo que ninguna de esas dos sabe hacer.
 */
async function manageWidget(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(manageWidgetSchema, input);

  if (data.action === 'reorder') {
    // Una sección de destino inexistente en cualquiera de los ítems tumba el
    // lote entero ANTES de mover nada: mover la mitad y perder la otra mitad
    // en una sección invisible sería peor que fallar.
    for (const item of data.items) await assertSectionExists(context, item.section);
    // Validación parcial en vez de todo o nada: las keys que existen se mueven
    // igual y la respuesta dice cuáles no existían. Se listan también los
    // deshabilitados y los archivados porque `reorderRadarWidgets` los toca por
    // key sin mirar ese estado: si no, "missing" mentiría.
    const before = await listRadarWidgets({
      teamId: context.teamId,
      includeDisabled: true,
      includeArchived: true,
    });
    const known = new Set(before.map((widget) => widget.key));
    const items = data.items.filter((item) => known.has(item.key));
    const missing = data.items.filter((item) => !known.has(item.key)).map((item) => item.key);
    if (!items.length) {
      throw new Error(
        `Ninguna de las keys existe en este equipo (${missing.join(', ')}). Pedí las keys reales con whatspro_radar_list_widgets y reintentá.`,
      );
    }

    const updated = await reorderRadarWidgets({
      teamId: context.teamId,
      items: items.map((item) => ({
        key: item.key,
        position: item.position,
        ...(item.size !== undefined ? { size: item.size } : {}),
        ...(item.section !== undefined ? { section: item.section } : {}),
      })),
    });
    await audit(context, 'GROK_RADAR_WIDGETS_REORDERED', items.map((item) => item.key).join(','));

    // Se relee la grilla para devolver cómo quedó de verdad, no cómo se pidió.
    const moved = new Set(items.map((item) => item.key));
    const after = await listRadarWidgets({
      teamId: context.teamId,
      includeDisabled: true,
      includeArchived: true,
    });

    return {
      success: true,
      action: 'reorder' as const,
      requested: data.items.length,
      updated,
      widgets: after
        .filter((widget) => moved.has(widget.key))
        .map((widget) => ({
          key: widget.key,
          title: widget.title,
          section: widget.section,
          size: widget.size,
          position: widget.position,
        })),
      ...(missing.length
        ? { missing, note: 'Esas keys no existen en el equipo: el resto del lote se aplicó igual. Verificalas con whatspro_radar_list_widgets.' }
        : {}),
    };
  }

  if (data.action === 'restore') {
    await assertSectionExists(context, data.section);
    const before = await getRadarWidget(context.teamId, data.key);
    if (!before) {
      throw new Error(
        `No existe ningún widget con la key "${data.key}" en este equipo. La key tiene que ser exactamente la que tenía cuando lo archivaste con whatspro_radar_delete_widget; si el widget nunca existió, creálo con whatspro_radar_upsert_widget.`,
      );
    }
    const widget = await restoreRadarWidget({
      teamId: context.teamId,
      key: data.key,
      ...(data.section !== undefined ? { section: data.section } : {}),
    });
    if (!widget) throw new Error(`No se pudo restaurar el widget "${data.key}".`);
    await audit(context, 'GROK_RADAR_WIDGET_RESTORED', widget.id);

    return {
      success: true,
      action: 'restore' as const,
      widget,
      was_archived: Boolean(before.archivedAt),
      note: before.archivedAt
        ? `Salió del banco y volvió al tablero, en la sección "${widget.section}".`
        : `Ese widget no estaba en el banco: seguía vivo en el tablero${data.section ? ` y se movió a "${widget.section}"` : ', así que no cambió nada'}.`,
    };
  }

  if (data.action === 'duplicate') {
    await assertSectionExists(context, data.section);
    const widget = await duplicateRadarWidget({
      teamId: context.teamId,
      userId: context.userId,
      key: data.key,
      newKey: data.new_key,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.section !== undefined ? { section: data.section } : {}),
    });
    await audit(context, 'GROK_RADAR_WIDGET_DUPLICATED', widget.id);

    return {
      success: true,
      action: 'duplicate' as const,
      widget,
      source_key: data.key,
      note: 'La copia queda activa y con source="user" (no la pisa una regeneración automática). El widget original quedó tal cual estaba: si estaba en el banco, sigue en el banco.',
    };
  }

  // purge: borrado físico. El confirm se chequea ANTES de tocar la base.
  if (data.confirm !== true) {
    throw new Error(
      `purge BORRA el widget "${data.key}" de la base de forma definitiva e irreversible: no queda en el banco y no se puede restaurar. Si lo que querés es sacarlo del tablero conservándolo, usá whatspro_radar_delete_widget (lo manda al banco, y desde ahí se restaura o se duplica). Si el usuario pidió explícitamente el borrado definitivo, repetí esta llamada con confirm=true.`,
    );
  }
  const doomed = await getRadarWidget(context.teamId, data.key);
  if (!doomed) {
    throw new Error(`No existe ningún widget con la key "${data.key}" en este equipo, así que no hay nada que borrar.`);
  }
  const purged = await purgeRadarWidget({ teamId: context.teamId, key: data.key });
  await audit(context, 'GROK_RADAR_WIDGET_PURGED', data.key);

  return {
    success: true,
    action: 'purge' as const,
    purged,
    key: data.key,
    title: doomed.title,
    blocks_lost: doomed.blocks.length,
    note: 'Borrado definitivo: la fila ya no existe. Si hacía falta conservarlo, hay que volver a crearlo con whatspro_radar_upsert_widget.',
  };
}

/**
 * Nota 🎯 RADAR → widget dibujado. El parseo lo hace `radarNoteToBlocks`,
 * que es el MISMO que usa el panel Radar del chat: así lo que se guarda es
 * idéntico a lo que la ficha del contacto ya muestra en vivo.
 */
async function noteToWidget(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(noteToWidgetSchema, input);
  const contact = await ownedContact(context, (await resolveRadarContactId(context, data))!);
  await assertSectionExists(context, data.section);

  let noteText = data.note_text?.trim() ?? '';
  let noteSource: 'note_text' | 'ultima_nota_del_chat' = 'note_text';
  let noteDate: string | null = null;

  if (!noteText) {
    // Las notas de Radar no tienen tabla propia: son mensajes internos del chat
    // que arrancan con el prefijo. Mismo criterio que el panel Radar del chat.
    const row = await db.query.messages.findFirst({
      where: and(
        eq(messages.chatId, contact.chatId),
        eq(messages.isInternal, true),
        like(messages.text, `${RADAR_NOTE_PREFIX}%`),
      ),
      orderBy: [desc(messages.timestamp)],
      columns: { text: true, timestamp: true },
    });
    if (!row?.text) {
      throw new Error(
        `El contacto #${contact.id} (${contact.name}) no tiene ninguna nota interna que empiece con "${RADAR_NOTE_PREFIX}". Escribí primero el análisis con whatspro_add_internal_note (arrancando el texto con "${RADAR_NOTE_PREFIX} <fecha> · <P1|P2|P3> · score <n>"), o pasá el texto directo en note_text.`,
      );
    }
    noteText = row.text;
    noteSource = 'ultima_nota_del_chat';
    noteDate = row.timestamp.toISOString();
  }

  const blocks = radarNoteToBlocks(noteText);
  if (!blocks.length) {
    throw new Error(
      'Esa nota no produjo ningún bloque válido, así que no se guardó ningún widget (un widget vacío no sirve para nada). El parser espera un cuerpo organizado en secciones del estilo "TÍTULO: contenido" (una por línea, con viñetas opcionales debajo). Reescribí la nota con ese formato, o armá los bloques a mano con whatspro_radar_upsert_widget mirando whatspro_radar_block_catalog.',
    );
  }
  const { header } = parseRadarNote(noteText);

  const widgetInput = parse(radarWidgetInputSchema, {
    key: data.key ?? `cliente-${contact.id}`,
    title: data.title ?? `Radar · ${contact.name}`.slice(0, 160),
    blocks,
    section: data.section ?? 'clientes',
    surface: data.surface ?? 'chat',
    contactId: contact.id,
    ...(data.size !== undefined ? { size: data.size } : {}),
  } as Record<string, unknown>);

  const widget = await upsertRadarWidget({
    teamId: context.teamId,
    userId: context.userId,
    source: 'ai',
    input: widgetInput,
  });
  await audit(context, 'GROK_RADAR_NOTE_TO_WIDGET', widget.id);

  // Cuántos bloques y de qué tipo: es lo que le permite a la IA decidir si la
  // nota se dibujó entera o si le faltó estructura.
  const byType = new Map<string, number>();
  for (const block of blocks) byType.set(block.type, (byType.get(block.type) ?? 0) + 1);

  return {
    success: true,
    widget,
    contact: { id: contact.id, name: contact.name },
    note: {
      source: noteSource,
      date: noteDate,
      chars: noteText.length,
      header,
    },
    blocks: {
      generated: blocks.length,
      types: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
    },
    next: `Mirá cómo quedó con whatspro_radar_list_widgets(contact_id=${contact.id}); para cambiarle el icono, el tono o el título usá whatspro_radar_patch_widget(key="${widget.key}").`,
  };
}

async function resolveReportFolderId(
  context: GrokActionContext,
  category: ReportCategory,
  contact: { id: number; name: string } | null,
) {
  if (category === 'mejoras' || category === 'trabajos') {
    const folder = await ensureRadarExtraReportFolder({ teamId: context.teamId, userId: context.userId, category });
    return folder.id;
  }
  if (category === 'clientes' && contact) {
    const folder = await ensureContactReportFolder({
      teamId: context.teamId,
      userId: context.userId,
      contactId: contact.id,
      contactName: contact.name,
    });
    return folder.id;
  }
  const folders = await ensureRadarReportFolders(context.teamId, context.userId);
  if (category === 'equipo') return folders.equipo.id;
  if (category === 'generales') return folders.generales.id;
  return folders.clientes.id;
}

async function publishReport(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsWrite', RADAR_PLUGIN);
  const data = parse(publishReportSchema, input);
  const contactId = await resolveRadarContactId(context, data);
  const contact = contactId != null ? await ownedContact(context, contactId) : null;
  if (data.assigned_user_id != null) await assertTeamMember(context, data.assigned_user_id);

  const folderId = await resolveReportFolderId(context, data.category, contact);
  const isHtml = Boolean(data.html);
  const document = await createDocument({
    teamId: context.teamId,
    userId: context.userId,
    title: data.title,
    emoji: data.emoji ?? null,
    folderId,
    ...(isHtml
      ? { format: 'html' as const, htmlContent: data.html }
      : { content: markdownToProseMirror(data.markdown!) }),
  });

  const link = await linkRadarReport({
    teamId: context.teamId,
    userId: context.userId,
    documentId: document.id,
    category: data.category,
    contactId: contact?.id ?? null,
    assignedUserId: data.assigned_user_id ?? null,
    summary: data.summary ?? null,
  });
  await audit(context, 'GROK_RADAR_REPORT_PUBLISHED', document.id);

  return {
    success: true,
    document,
    link,
    category: data.category,
    folder_id: folderId,
    contact_id: contact?.id ?? null,
    assigned_user_id: data.assigned_user_id ?? null,
    format: isHtml ? 'html' : 'markdown',
  };
}

async function overview(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(overviewSchema, input);
  const board = await getRadarOverview(context.teamId);
  const limit = data.limit ?? 50;
  const filtered = data.priority
    ? board.priorityContacts.filter((c) => c.priority === data.priority)
    : board.priorityContacts;
  return {
    object: 'radar_overview',
    counts: board.counts,
    lastAnalysisAt: board.lastAnalysisAt,
    contacts: filtered.slice(0, limit),
    total: filtered.length,
    omitted: Math.max(0, filtered.length - limit),
  };
}

async function listClients(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(listClientsSchema, input);
  const result = await listRadarClients(context.teamId, {
    ...(data.q ? { q: data.q } : {}),
    ...(data.priority ? { priority: data.priority as RadarBoardPriority } : {}),
    ...(data.only_with_reports !== undefined ? { onlyWithReports: data.only_with_reports } : {}),
  });
  const limit = data.limit ?? 50;
  return {
    object: 'radar_clients',
    total: result.total,
    counts: result.counts,
    clients: result.clients.slice(0, limit),
    omitted: Math.max(0, result.clients.length - limit),
  };
}

async function getClient(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(getClientSchema, input);
  const contactId = (await resolveRadarContactId(context, data))!;
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, context.teamId)),
    columns: { id: true, name: true, chatId: true, customData: true },
  });
  if (!contact) throw new Error('Contact not found.');
  const panel = await getRadarClientPanel({ teamId: context.teamId, userId: context.userId, contact });
  return { object: 'radar_client', ...panel };
}

async function listBank(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'intelligenceRead', RADAR_PLUGIN);
  const data = parse(listBankSchema, input);
  const widgets = await listRadarWidgets({
    teamId: context.teamId,
    onlyArchived: true,
    includeDisabled: true,
    ...(data.section !== undefined ? { section: data.section } : {}),
  });
  const limit = data.limit ?? 30;
  return {
    object: 'radar_bank',
    count: widgets.length,
    widgets: widgets.slice(0, limit),
    omitted: Math.max(0, widgets.length - limit),
    next: 'Restaurá uno con whatspro_radar_manage_widget(action="restore", key=...) o usalo de plantilla con action="duplicate".',
  };
}

/** Secciones canónicas del cuerpo de la nota 🎯 RADAR cuando la IA no manda note_body. */
function buildAnalysisNoteBody(data: {
  intencion?: string;
  objecion?: string;
  recuperabilidad?: string;
  estrategia?: string;
  oportunidad_2?: string;
}) {
  const sections: string[] = [];
  if (data.intencion) sections.push(`QUÉ BUSCA: ${data.intencion}`);
  if (data.objecion) sections.push(`OBJECIÓN: ${data.objecion}`);
  if (data.recuperabilidad) sections.push(`RECUPERABILIDAD: ${data.recuperabilidad}`);
  if (data.estrategia) sections.push(`ESTRATEGIA: ${data.estrategia}`);
  if (data.oportunidad_2) sections.push(`OPORTUNIDAD 2: ${data.oportunidad_2}`);
  return sections.join('\n\n');
}

async function saveAnalysis(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts', RADAR_PLUGIN);
  const data = parse(saveAnalysisSchema, input);
  const contactId = (await resolveRadarContactId(context, data))!;
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, context.teamId)),
    columns: { id: true, name: true, chatId: true, customData: true },
    with: { chat: { columns: { remoteJid: true } } },
  });
  if (!contact) throw new Error('Contact not found.');

  const fecha = data.fecha_analisis ?? new Date().toISOString().slice(0, 10);

  // 1) Los nueve campos radar_* directo sobre customData. Se escriben acá y no
  // vía whatspro_set_custom_fields porque las claves radar_* son del sistema
  // (RADAR_ANALYST_FIELD_KEYS) y no necesitan definición previa en custom_fields.
  const fields: Record<string, string> = {
    radar_score: String(data.score),
    radar_prioridad: data.prioridad,
    radar_fecha_analisis: fecha,
    ...(data.intencion ? { radar_intencion: data.intencion } : {}),
    ...(data.objecion ? { radar_objecion: data.objecion } : {}),
    ...(data.recuperabilidad ? { radar_recuperabilidad: data.recuperabilidad } : {}),
    ...(data.confianza !== undefined ? { radar_confianza: String(data.confianza) } : {}),
    ...(data.estrategia ? { radar_estrategia: data.estrategia } : {}),
    ...(data.oportunidad_2 ? { radar_oportunidad_2: data.oportunidad_2 } : {}),
  };
  const merged = { ...((contact.customData ?? {}) as Record<string, unknown>), ...fields };
  await db.update(contacts).set({ customData: merged, updatedAt: new Date() })
    .where(and(eq(contacts.id, contact.id), eq(contacts.teamId, context.teamId)));

  // 2) La nota 🎯 RADAR con el encabezado canónico que el parser sabe leer.
  const headerParts = [`${RADAR_NOTE_PREFIX} ${fecha}`, data.prioridad, `score ${data.score}`];
  if (data.confianza !== undefined) headerParts.push(`confianza ${data.confianza}`);
  const body = data.note_body?.trim() || buildAnalysisNoteBody(data);
  const noteText = body ? `${headerParts.join(' · ')}\n\n${body}` : headerParts.join(' · ');

  const { note, created } = await writeInternalNote(
    context,
    contact,
    noteText,
    data.idempotency_key ? `radar_analysis:${data.idempotency_key}` : undefined,
  );

  // 3) El widget de la ficha, opcional: misma key estable que note_to_widget
  // para que el próximo análisis lo pise en vez de acumular copias.
  let widget = null;
  let widgetBlocks = 0;
  if (data.create_widget) {
    const blocks = radarNoteToBlocks(noteText);
    if (blocks.length) {
      const widgetInput = parse(radarWidgetInputSchema, {
        key: `cliente-${contact.id}`,
        title: `Radar · ${contact.name}`.slice(0, 160),
        blocks,
        section: 'clientes',
        surface: 'chat',
        contactId: contact.id,
      } as Record<string, unknown>);
      widget = await upsertRadarWidget({
        teamId: context.teamId,
        userId: context.userId,
        source: 'ai',
        input: widgetInput,
      });
      widgetBlocks = blocks.length;
    }
  }

  await audit(context, 'GROK_RADAR_ANALYSIS_SAVED', contact.id);

  return {
    success: true,
    contact: { id: contact.id, name: contact.name },
    fields_written: Object.keys(fields),
    fecha_analisis: fecha,
    needs_review: data.prioridad === 'Revisar' || (data.confianza !== undefined && data.confianza < 70),
    note: { id: note.id, already_created: !created, chars: noteText.length },
    widget: widget ? { key: widget.key, id: widget.id, blocks: widgetBlocks } : null,
    next: `Verificá la ficha con whatspro_radar_get_client(contact_id=${contact.id})`
      + (data.create_widget && !widget ? '. OJO: la nota no produjo bloques válidos, el widget NO se creó — revisá el formato "TÍTULO: contenido" de note_body.' : '.'),
  };
}

async function updateReport(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsWrite', RADAR_PLUGIN);
  const data = parse(updateReportSchema, input);

  // El vínculo existente manda: conserva categoría y contacto del informe.
  const link = await db.query.teamRadarReports.findFirst({
    where: and(eq(teamRadarReports.teamId, context.teamId), eq(teamRadarReports.documentId, data.document_id)),
  });
  if (!link) {
    throw new Error(
      `El documento ${data.document_id} no está vinculado a Radar como informe. Listá los informes con whatspro_radar_list_reports, o publicá uno nuevo con whatspro_radar_publish_report.`,
    );
  }
  if (data.assigned_user_id != null) await assertTeamMember(context, data.assigned_user_id);

  const document = await updateDocument({
    teamId: context.teamId,
    userId: context.userId,
    id: data.document_id,
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.emoji !== undefined ? { emoji: data.emoji } : {}),
    ...(data.html !== undefined
      ? { format: 'html' as const, htmlContent: data.html }
      : data.markdown !== undefined
        ? { format: 'markdown' as const, content: markdownToProseMirror(data.markdown) }
        : {}),
    ...(data.version !== undefined ? { version: data.version } : {}),
  });

  let updatedLink = link;
  if (data.summary !== undefined || data.assigned_user_id !== undefined) {
    updatedLink = await linkRadarReport({
      teamId: context.teamId,
      userId: context.userId,
      documentId: data.document_id,
      category: link.category as ReportCategory,
      contactId: link.contactId,
      assignedUserId: data.assigned_user_id !== undefined ? data.assigned_user_id : link.assignedUserId,
      summary: data.summary !== undefined ? data.summary : link.summary,
    });
  }
  await audit(context, 'GROK_RADAR_REPORT_UPDATED', data.document_id);

  return {
    success: true,
    document,
    link: updatedLink,
    content_replaced: data.html !== undefined || data.markdown !== undefined,
  };
}

async function unlinkReport(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsWrite', RADAR_PLUGIN);
  const data = parse(unlinkReportSchema, input);
  const removed = await unlinkRadarReport({ teamId: context.teamId, documentId: data.document_id });
  if (!removed) {
    throw new Error(
      `El documento ${data.document_id} no estaba vinculado a Radar. Los vinculados se listan con whatspro_radar_list_reports.`,
    );
  }
  await audit(context, 'GROK_RADAR_REPORT_UNLINKED', data.document_id);
  return {
    success: true,
    document_id: data.document_id,
    note: 'El vínculo con Radar se eliminó; el documento sigue existiendo en la app Documentos.',
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export async function executeRadarTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_radar_block_catalog') return blockCatalog(input, context);
  if (name === 'whatspro_radar_overview') return overview(input, context);
  if (name === 'whatspro_radar_list_clients') return listClients(input, context);
  if (name === 'whatspro_radar_get_client') return getClient(input, context);
  if (name === 'whatspro_radar_list_bank') return listBank(input, context);
  if (name === 'whatspro_radar_save_analysis') return saveAnalysis(input, context);
  if (name === 'whatspro_radar_update_report') return updateReport(input, context);
  if (name === 'whatspro_radar_unlink_report') return unlinkReport(input, context);
  if (name === 'whatspro_radar_list_widgets') return listWidgets(input, context);
  if (name === 'whatspro_radar_list_reports') return listReports(input, context);
  if (name === 'whatspro_radar_upsert_widget') return upsertWidget(input, context);
  if (name === 'whatspro_radar_patch_widget') return patchWidget(input, context);
  if (name === 'whatspro_radar_set_appearance') return setAppearance(input, context);
  if (name === 'whatspro_radar_manage_section') return manageSection(input, context);
  if (name === 'whatspro_radar_delete_widget') return deleteWidget(input, context);
  if (name === 'whatspro_radar_manage_widget') return manageWidget(input, context);
  if (name === 'whatspro_radar_note_to_widget') return noteToWidget(input, context);
  if (name === 'whatspro_radar_publish_report') return publishReport(input, context);
  throw new Error(`Unknown Radar tool: ${name}`);
}
