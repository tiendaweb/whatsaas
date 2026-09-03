import 'server-only';

import { evaluateFormula, formulaIdentifiers } from '@/lib/plugins/radar/shared/formula';

/**
 * Motor de DATOS del Radar Engine: nada de SQL libre.
 *
 * Cada "source" es un recurso REAL de WhatsPro con una whitelist campo→columna.
 * Las IA declaran datasources/queries contra estos sources (contrato en
 * `shared/engine.ts`) y acá se traducen a SQL parametrizado: el nombre de campo
 * se resuelve contra la whitelist, el valor SIEMPRE viaja como bind y todo
 * filtra por `teamId` (directo o por join a una tabla que lo tiene). Un campo u
 * operador inválido tira un Error descriptivo — el caller (resolve.ts, tools
 * MCP) lo captura por componente, así un datasource roto nunca rompe la vista.
 *
 * Los mensajes de error los va a leer una IA: dicen qué estuvo mal y qué
 * valores son válidos, para que el próximo intento salga bien.
 */
import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  campaigns,
  chats,
  contacts,
  funnelStages,
  messages,
  tags,
  teamCustomers,
  teamEvents,
  teamNotes,
  teamSales,
  teamTaskColumns,
  teamTaskItems,
  teamTaskProjects,
  users,
} from '@/lib/db/schema';
import {
  radarQuerySchema,
  type RadarCondition,
  type RadarDatasource,
  type RadarMetric,
  type RadarQuery,
} from '@/lib/plugins/radar/shared/engine';

/* ------------------------------------------------------------------ */
/* Contrato público                                                     */
/* ------------------------------------------------------------------ */

export type RadarSourceField = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  description?: string;
};

export type RadarSourceDescriptor = {
  source: string;
  description: string;
  fields: RadarSourceField[];
};

type RadarFieldType = RadarSourceField['type'];

/* ------------------------------------------------------------------ */
/* Registro de sources                                                  */
/* ------------------------------------------------------------------ */

type FieldSpec = {
  type: RadarFieldType;
  /** Expresión para WHERE/ORDER/GROUP. Columna o SQL con joins ya resueltos. */
  expr: SQL | AnyColumn;
  /** Expresión para el SELECT cuando difiere (p. ej. texto truncado). */
  selectExpr?: SQL;
  description?: string;
};

type SourceSpec = {
  source: string;
  description: string;
  from: typeof contacts | typeof chats | typeof messages | typeof teamTaskItems
    | typeof teamCustomers | typeof teamSales | typeof teamEvents | typeof teamNotes
    | typeof funnelStages | typeof tags | typeof campaigns;
  /** Cláusulas JOIN completas, en orden. */
  joins?: SQL[];
  /** Aislamiento por equipo: SIEMPRE entra al WHERE, no es opcional. */
  teamFilter: (teamId: number) => SQL;
  fields: Record<string, FieldSpec>;
  defaultSelect: string[];
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  /** Columna jsonb para campos `custom.<clave>` (hoy solo contacts.customData). */
  customColumn?: AnyColumn;
  /** Campos custom conocidos, solo para documentar en el descriptor. */
  customFieldDocs?: RadarSourceField[];
};

/**
 * Los sources del sistema. El orden es el del catálogo que leen las IA; la
 * descripción de cada campo ES la documentación, así que va concreta.
 */
const SOURCES: Record<string, SourceSpec> = {
  contacts: {
    source: 'contacts',
    description:
      'Contactos del CRM (uno por chat de WhatsApp). Traen la etapa del embudo, el usuario asignado y los campos custom.<clave> de customData — ahí viven los análisis del Radar (custom.radar_score, custom.radar_prioridad, custom.radar_intencion…). Las comparaciones numéricas sobre custom castean solas.',
    from: contacts,
    joins: [
      sql`inner join ${chats} on ${chats.id} = ${contacts.chatId}`,
      sql`left join ${funnelStages} on ${funnelStages.id} = ${contacts.funnelStageId}`,
      sql`left join ${users} on ${users.id} = ${contacts.assignedUserId}`,
    ],
    teamFilter: (teamId) => sql`${contacts.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: contacts.id, description: 'Id del contacto' },
      name: { type: 'string', expr: contacts.name, description: 'Nombre del contacto' },
      phone: {
        type: 'string',
        expr: sql`nullif(split_part(${chats.remoteJid}, '@', 1), '')`,
        description: 'Número de teléfono (la parte local del JID de WhatsApp)',
      },
      remoteJid: { type: 'string', expr: chats.remoteJid, description: 'JID crudo del chat (para el bloque contacts)' },
      chatId: { type: 'number', expr: contacts.chatId, description: 'Id del chat asociado' },
      instanceId: { type: 'number', expr: chats.instanceId, description: 'Id de la instancia de WhatsApp del chat' },
      stage: { type: 'string', expr: funnelStages.name, description: 'Nombre de la etapa del embudo (null si no tiene)' },
      stageId: { type: 'number', expr: contacts.funnelStageId, description: 'Id de la etapa del embudo' },
      assignedUserId: { type: 'number', expr: contacts.assignedUserId, description: 'Id del usuario asignado' },
      assignedUserName: { type: 'string', expr: users.name, description: 'Nombre del usuario asignado' },
      unreadCount: { type: 'number', expr: chats.unreadCount, description: 'Mensajes sin leer del chat' },
      lastMessageAt: { type: 'date', expr: chats.lastMessageTimestamp, description: 'Fecha del último mensaje del chat' },
      createdAt: { type: 'date', expr: contacts.createdAt, description: 'Alta del contacto' },
      updatedAt: { type: 'date', expr: contacts.updatedAt, description: 'Última modificación del contacto' },
    },
    defaultSelect: [
      'id', 'name', 'remoteJid', 'instanceId', 'stage', 'assignedUserName', 'lastMessageAt',
      'custom.radar_score', 'custom.radar_prioridad',
    ],
    defaultSort: { field: 'lastMessageAt', dir: 'desc' },
    customColumn: contacts.customData,
    customFieldDocs: [
      { name: 'custom.radar_score', type: 'number', description: 'Score 0-100 del análisis Radar' },
      { name: 'custom.radar_prioridad', type: 'string', description: 'P1 | P2 | P3 | descartado | Revisar' },
      { name: 'custom.radar_intencion', type: 'string', description: 'Intención detectada (compra activa, consulta…)' },
      { name: 'custom.radar_objecion', type: 'string', description: 'Objeción principal del contacto' },
      { name: 'custom.radar_recuperabilidad', type: 'string', description: 'Qué tan recuperable es el lead' },
      { name: 'custom.radar_confianza', type: 'number', description: 'Confianza 0-100 del análisis' },
      { name: 'custom.radar_fecha_analisis', type: 'date', description: 'Cuándo se corrió el último análisis' },
      { name: 'custom.radar_estrategia', type: 'string', description: 'Estrategia sugerida por el análisis' },
    ],
  },

  chats: {
    source: 'chats',
    description:
      'Chats de WhatsApp del equipo, con el texto y la fecha del último mensaje y los no leídos. contactId enlaza con el source contacts.',
    from: chats,
    joins: [sql`left join ${contacts} on ${contacts.chatId} = ${chats.id}`],
    teamFilter: (teamId) => sql`${chats.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: chats.id, description: 'Id del chat' },
      contactId: { type: 'number', expr: contacts.id, description: 'Id del contacto del CRM (null si no se creó)' },
      name: { type: 'string', expr: sql`coalesce(${chats.name}, ${chats.pushName})`, description: 'Nombre del chat (o pushName)' },
      remoteJid: { type: 'string', expr: chats.remoteJid, description: 'JID crudo de WhatsApp' },
      instanceId: { type: 'number', expr: chats.instanceId, description: 'Id de la instancia de WhatsApp' },
      lastMessageText: {
        type: 'string',
        expr: chats.lastMessageText,
        selectExpr: sql`left(${chats.lastMessageText}, 300)`,
        description: 'Texto del último mensaje (truncado a 300)',
      },
      lastMessageAt: { type: 'date', expr: chats.lastMessageTimestamp, description: 'Fecha del último mensaje' },
      lastCustomerInteraction: { type: 'date', expr: chats.lastCustomerInteraction, description: 'Último mensaje DEL CLIENTE (para medir silencio)' },
      lastMessageFromMe: { type: 'boolean', expr: chats.lastMessageFromMe, description: 'true si el último mensaje lo mandamos nosotros' },
      unreadCount: { type: 'number', expr: chats.unreadCount, description: 'Mensajes sin leer' },
    },
    defaultSelect: ['id', 'contactId', 'name', 'remoteJid', 'lastMessageText', 'lastMessageAt', 'unreadCount'],
    defaultSort: { field: 'lastMessageAt', dir: 'desc' },
  },

  messages: {
    source: 'messages',
    description:
      'Mensajes individuales de los chats del equipo. El texto sale truncado a 300 caracteres y el límite duro es 100 filas: es para muestras y conteos, no para exportar conversaciones.',
    from: messages,
    joins: [
      sql`inner join ${chats} on ${chats.id} = ${messages.chatId}`,
      sql`left join ${contacts} on ${contacts.chatId} = ${chats.id}`,
    ],
    teamFilter: (teamId) => sql`${chats.teamId} = ${teamId}`,
    fields: {
      id: { type: 'string', expr: messages.id, description: 'Id del mensaje (texto)' },
      chatId: { type: 'number', expr: messages.chatId, description: 'Id del chat' },
      contactId: { type: 'number', expr: contacts.id, description: 'Id del contacto del chat (null si no existe)' },
      text: {
        type: 'string',
        expr: messages.text,
        selectExpr: sql`left(${messages.text}, 300)`,
        description: 'Texto del mensaje (truncado a 300)',
      },
      messageType: { type: 'string', expr: messages.messageType, description: 'Tipo (conversation, audioMessage, imageMessage…)' },
      fromMe: { type: 'boolean', expr: messages.fromMe, description: 'true si lo mandamos nosotros' },
      isInternal: { type: 'boolean', expr: messages.isInternal, description: 'true si es una nota interna (no la vio el cliente)' },
      isAi: { type: 'boolean', expr: messages.isAi, description: 'true si lo generó la IA' },
      timestamp: { type: 'date', expr: messages.timestamp, description: 'Fecha y hora del mensaje' },
    },
    defaultSelect: ['id', 'chatId', 'text', 'fromMe', 'timestamp'],
    defaultSort: { field: 'timestamp', dir: 'desc' },
  },

  tasks: {
    source: 'tasks',
    description:
      'Tareas de Tareas OS (team_task_items), con su proyecto, columna del tablero y responsable. status es texto libre del equipo: los valores típicos son "open" y "done".',
    from: teamTaskItems,
    joins: [
      sql`left join ${teamTaskProjects} on ${teamTaskProjects.id} = ${teamTaskItems.projectId}`,
      sql`left join ${teamTaskColumns} on ${teamTaskColumns.id} = ${teamTaskItems.columnId}`,
      sql`left join ${users} on ${users.id} = ${teamTaskItems.assigneeId}`,
    ],
    teamFilter: (teamId) => sql`${teamTaskItems.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: teamTaskItems.id, description: 'Id de la tarea' },
      title: { type: 'string', expr: teamTaskItems.title, description: 'Título de la tarea' },
      status: { type: 'string', expr: teamTaskItems.status, description: 'Estado (típicamente "open" o "done")' },
      dueDate: { type: 'date', expr: teamTaskItems.dueDate, description: 'Vencimiento (null si no tiene)' },
      startDate: { type: 'date', expr: teamTaskItems.startDate, description: 'Inicio planificado' },
      completedAt: { type: 'date', expr: teamTaskItems.completedAt, description: 'Cuándo se completó' },
      assigneeId: { type: 'number', expr: teamTaskItems.assigneeId, description: 'Id del responsable' },
      assignee: { type: 'string', expr: users.name, description: 'Nombre del responsable' },
      projectId: { type: 'number', expr: teamTaskItems.projectId, description: 'Id del proyecto' },
      projectName: { type: 'string', expr: teamTaskProjects.name, description: 'Nombre del proyecto' },
      columnName: { type: 'string', expr: teamTaskColumns.title, description: 'Columna del tablero donde está la tarea' },
      createdAt: { type: 'date', expr: teamTaskItems.createdAt, description: 'Alta de la tarea' },
    },
    defaultSelect: ['id', 'title', 'status', 'dueDate', 'assignee', 'projectName', 'columnName'],
    defaultSort: { field: 'dueDate', dir: 'asc' },
  },

  customers: {
    source: 'customers',
    description: 'Clientes reales del equipo (team_customers): la entidad que comparten CRM e integraciones como aapp.space.',
    from: teamCustomers,
    teamFilter: (teamId) => sql`${teamCustomers.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: teamCustomers.id, description: 'Id del cliente' },
      name: { type: 'string', expr: teamCustomers.name, description: 'Nombre del cliente' },
      email: { type: 'string', expr: teamCustomers.email, description: 'Email (puede ser null)' },
      phone: { type: 'string', expr: teamCustomers.phone, description: 'Teléfono (puede ser null)' },
      status: { type: 'string', expr: teamCustomers.status, description: 'Estado (active…)' },
      source: { type: 'string', expr: teamCustomers.source, description: 'Origen del alta (manual, integración…)' },
      createdAt: { type: 'date', expr: teamCustomers.createdAt, description: 'Alta del cliente' },
    },
    defaultSelect: ['id', 'name', 'email', 'phone', 'status', 'createdAt'],
    defaultSort: { field: 'createdAt', dir: 'desc' },
  },

  sales: {
    source: 'sales',
    description:
      'Ventas del equipo (team_sales). Los montos (total, subtotal) son números enteros en la moneda de currency; status arranca en "draft".',
    from: teamSales,
    teamFilter: (teamId) => sql`${teamSales.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: teamSales.id, description: 'Id de la venta' },
      saleNumber: { type: 'string', expr: teamSales.saleNumber, description: 'Número de venta visible' },
      status: { type: 'string', expr: teamSales.status, description: 'Estado (draft, paid…)' },
      total: { type: 'number', expr: teamSales.total, description: 'Monto total de la venta' },
      subtotal: { type: 'number', expr: teamSales.subtotal, description: 'Subtotal antes de descuentos e impuestos' },
      currency: { type: 'string', expr: teamSales.currency, description: 'Moneda ISO de 3 letras' },
      contactId: { type: 'number', expr: teamSales.contactId, description: 'Contacto del CRM asociado (puede ser null)' },
      dueDate: { type: 'date', expr: teamSales.dueDate, description: 'Vencimiento del cobro' },
      paidAt: { type: 'date', expr: teamSales.paidAt, description: 'Cuándo se cobró (null = impaga)' },
      createdAt: { type: 'date', expr: teamSales.createdAt, description: 'Alta de la venta' },
    },
    defaultSelect: ['id', 'saleNumber', 'status', 'total', 'currency', 'contactId', 'createdAt'],
    defaultSort: { field: 'createdAt', dir: 'desc' },
  },

  calendar_events: {
    source: 'calendar_events',
    description: 'Reuniones y llamadas de la agenda del equipo (team_events). kind es "meeting" o "call".',
    from: teamEvents,
    teamFilter: (teamId) => sql`${teamEvents.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: teamEvents.id, description: 'Id del evento' },
      title: { type: 'string', expr: teamEvents.title, description: 'Título del evento' },
      kind: { type: 'string', expr: teamEvents.kind, description: '"meeting" o "call"' },
      subtype: { type: 'string', expr: teamEvents.subtype, description: 'Detalle del tipo (comercial, soporte, entrante…)' },
      status: { type: 'string', expr: teamEvents.status, description: 'Estado (scheduled…)' },
      startAt: { type: 'date', expr: teamEvents.startsAt, description: 'Inicio' },
      endAt: { type: 'date', expr: teamEvents.endsAt, description: 'Fin' },
      userId: { type: 'number', expr: teamEvents.relatedUserId, description: 'Usuario del equipo relacionado' },
      contactId: { type: 'number', expr: teamEvents.contactId, description: 'Contacto del CRM asociado' },
      customerId: { type: 'number', expr: teamEvents.customerId, description: 'Cliente asociado' },
      createdAt: { type: 'date', expr: teamEvents.createdAt, description: 'Alta del evento' },
    },
    defaultSelect: ['id', 'title', 'kind', 'status', 'startAt', 'endAt', 'userId'],
    defaultSort: { field: 'startAt', dir: 'desc' },
  },

  notes: {
    source: 'notes',
    description: 'Notas del equipo (team_notes), incluidas las meeting notes. El contenido sale truncado a 300 caracteres.',
    from: teamNotes,
    teamFilter: (teamId) => sql`${teamNotes.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: teamNotes.id, description: 'Id de la nota' },
      title: { type: 'string', expr: teamNotes.title, description: 'Título de la nota' },
      content: {
        type: 'string',
        expr: teamNotes.content,
        selectExpr: sql`left(${teamNotes.content}, 300)`,
        description: 'Contenido (truncado a 300)',
      },
      status: { type: 'string', expr: teamNotes.status, description: 'Estado (todo…)' },
      pinned: { type: 'boolean', expr: teamNotes.pinned, description: 'true si está fijada' },
      dueDate: { type: 'date', expr: teamNotes.dueDate, description: 'Vencimiento (null si no tiene)' },
      createdAt: { type: 'date', expr: teamNotes.createdAt, description: 'Alta de la nota' },
    },
    defaultSelect: ['id', 'title', 'content', 'status', 'createdAt'],
    defaultSort: { field: 'createdAt', dir: 'desc' },
  },

  funnel_stages: {
    source: 'funnel_stages',
    description: 'Etapas del embudo del CRM, en su orden. stage de contacts enlaza acá por nombre; stageId por id.',
    from: funnelStages,
    teamFilter: (teamId) => sql`${funnelStages.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: funnelStages.id, description: 'Id de la etapa' },
      name: { type: 'string', expr: funnelStages.name, description: 'Nombre de la etapa' },
      emoji: { type: 'string', expr: funnelStages.emoji, description: 'Emoji de la etapa' },
      position: { type: 'number', expr: funnelStages.order, description: 'Orden de la etapa en el embudo' },
      groupId: { type: 'number', expr: funnelStages.groupId, description: 'Grupo de etapas (null si no tiene)' },
      createdAt: { type: 'date', expr: funnelStages.createdAt, description: 'Alta de la etapa' },
    },
    defaultSelect: ['id', 'name', 'emoji', 'position'],
    defaultSort: { field: 'position', dir: 'asc' },
  },

  tags: {
    source: 'tags',
    description: 'Etiquetas del equipo para contactos.',
    from: tags,
    teamFilter: (teamId) => sql`${tags.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: tags.id, description: 'Id de la etiqueta' },
      name: { type: 'string', expr: tags.name, description: 'Nombre de la etiqueta' },
      color: { type: 'string', expr: tags.color, description: 'Color (gray, red…)' },
      createdAt: { type: 'date', expr: tags.createdAt, description: 'Alta de la etiqueta' },
    },
    defaultSelect: ['id', 'name', 'color'],
    defaultSort: { field: 'name', dir: 'asc' },
  },

  campaigns: {
    source: 'campaigns',
    description: 'Campañas de envío masivo de WhatsApp, con sus contadores de envíos.',
    from: campaigns,
    teamFilter: (teamId) => sql`${campaigns.teamId} = ${teamId}`,
    fields: {
      id: { type: 'number', expr: campaigns.id, description: 'Id de la campaña' },
      name: { type: 'string', expr: campaigns.name, description: 'Nombre de la campaña' },
      status: { type: 'string', expr: campaigns.status, description: 'Estado (DRAFT, RUNNING…)' },
      totalLeads: { type: 'number', expr: campaigns.totalLeads, description: 'Destinatarios totales' },
      sentCount: { type: 'number', expr: campaigns.sentCount, description: 'Enviados' },
      failedCount: { type: 'number', expr: campaigns.failedCount, description: 'Fallidos' },
      scheduledAt: { type: 'date', expr: campaigns.scheduledAt, description: 'Programada para (null = manual)' },
      createdAt: { type: 'date', expr: campaigns.createdAt, description: 'Alta de la campaña' },
    },
    defaultSelect: ['id', 'name', 'status', 'totalLeads', 'sentCount', 'failedCount', 'createdAt'],
    defaultSort: { field: 'createdAt', dir: 'desc' },
  },
};

/* ------------------------------------------------------------------ */
/* Catálogo                                                             */
/* ------------------------------------------------------------------ */

/** El catálogo que leen las IA: qué sources existen y qué campos admite cada uno. */
export function listRadarSources(): RadarSourceDescriptor[] {
  return Object.values(SOURCES).map((spec) => ({
    source: spec.source,
    description: spec.description,
    fields: [
      ...Object.entries(spec.fields).map(([name, field]) => ({
        name,
        type: field.type,
        ...(field.description ? { description: field.description } : {}),
      })),
      ...(spec.customFieldDocs ?? []),
    ],
  }));
}

/* ------------------------------------------------------------------ */
/* Resolución de campos                                                 */
/* ------------------------------------------------------------------ */

function validSourceNames(): string {
  return Object.keys(SOURCES).join(', ');
}

function getSource(name: string): SourceSpec {
  const spec = SOURCES[name];
  if (!spec) {
    throw new Error(`No existe el source "${name}". Sources válidos: ${validSourceNames()}.`);
  }
  return spec;
}

function validFieldNames(spec: SourceSpec): string {
  const base = Object.keys(spec.fields).join(', ');
  return spec.customColumn ? `${base} — y campos custom.<clave> del jsonb customData` : base;
}

const CUSTOM_PREFIX = 'custom.';
const CUSTOM_KEY_REGEX = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,59}$/;

function customKey(spec: SourceSpec, field: string): string {
  const key = field.slice(CUSTOM_PREFIX.length);
  if (!spec.customColumn) {
    throw new Error(
      `El source "${spec.source}" no soporta campos custom.<clave> (solo contacts los tiene). Campos válidos: ${validFieldNames(spec)}.`,
    );
  }
  if (!CUSTOM_KEY_REGEX.test(key)) {
    throw new Error(`La clave custom "${key}" no es válida: letras, números, punto, guion y guion bajo (máximo 60).`);
  }
  return key;
}

/** Texto crudo del jsonb: null si la clave no existe en la fila. */
function customTextExpr(column: AnyColumn, key: string): SQL {
  return sql`(${column} ->> ${key})`;
}

/**
 * Cast numérico DEFENSIVO del jsonb: las filas sin la clave (o con basura tipo
 * "N/A") caen a null en vez de reventar la query entera con un cast error.
 */
function customNumericExpr(column: AnyColumn, key: string): SQL {
  const text = customTextExpr(column, key);
  return sql`(case when ${text} ~ '^-?[0-9]+(\\.[0-9]+)?$' then ${text}::numeric else null end)`;
}

/** Ídem para fechas guardadas como texto ISO (radar_fecha_analisis). */
function customDateExpr(column: AnyColumn, key: string): SQL {
  const text = customTextExpr(column, key);
  return sql`(case when ${text} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then ${text}::timestamptz else null end)`;
}

function isCustomField(field: string): boolean {
  return field.startsWith(CUSTOM_PREFIX);
}

type ResolvedField = { expr: SQL | AnyColumn; type: RadarFieldType; custom: boolean };

/**
 * Resuelve un nombre de campo a su expresión SQL. Para custom.<clave> el tipo
 * lo decide el contexto (`hint`): numérico para agregaciones y comparaciones
 * con números, fecha para within_days/older_than_days, texto para el resto.
 */
function resolveField(spec: SourceSpec, field: string, hint: RadarFieldType = 'string'): ResolvedField {
  if (isCustomField(field)) {
    const key = customKey(spec, field);
    const column = spec.customColumn as AnyColumn;
    if (hint === 'number') return { expr: customNumericExpr(column, key), type: 'number', custom: true };
    if (hint === 'date') return { expr: customDateExpr(column, key), type: 'date', custom: true };
    return { expr: customTextExpr(column, key), type: 'string', custom: true };
  }
  const fs = spec.fields[field];
  if (!fs) {
    throw new Error(`El campo "${field}" no existe en el source "${spec.source}". Campos válidos: ${validFieldNames(spec)}.`);
  }
  return { expr: fs.expr, type: fs.type, custom: false };
}

/** Expresión para el SELECT (usa la versión truncada si el campo la define). */
function selectExprFor(spec: SourceSpec, field: string): SQL | AnyColumn {
  if (isCustomField(field)) return resolveField(spec, field).expr;
  const fs = spec.fields[field];
  if (!fs) {
    throw new Error(`El campo "${field}" del select no existe en el source "${spec.source}". Campos válidos: ${validFieldNames(spec)}.`);
  }
  return fs.selectExpr ?? fs.expr;
}

/* ------------------------------------------------------------------ */
/* Condiciones                                                          */
/* ------------------------------------------------------------------ */

const OPS_BY_TYPE: Record<RadarFieldType, readonly RadarCondition['op'][]> = {
  string: ['eq', 'neq', 'contains', 'starts_with', 'in', 'not_in', 'is_null', 'not_null'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'is_null', 'not_null'],
  boolean: ['eq', 'neq', 'is_null', 'not_null'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'within_days', 'older_than_days', 'is_null', 'not_null'],
};

/** Escapa los comodines de ILIKE para que el valor sea texto literal. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function opError(spec: SourceSpec, cond: RadarCondition, type: RadarFieldType): Error {
  return new Error(
    `El operador "${cond.op}" no aplica al campo "${cond.field}" (${type}) del source "${spec.source}". Operadores válidos para ${type}: ${OPS_BY_TYPE[type].join(', ')}.`,
  );
}

function requireValue(spec: SourceSpec, cond: RadarCondition): NonNullable<RadarCondition['value']> {
  if (cond.value === undefined) {
    throw new Error(`El operador "${cond.op}" sobre "${cond.field}" (source "${spec.source}") necesita un value.`);
  }
  return cond.value;
}

function parseDateValue(spec: SourceSpec, cond: RadarCondition): Date {
  const value = requireValue(spec, cond);
  const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(
      `El campo "${cond.field}" (source "${spec.source}") es una fecha: el value de "${cond.op}" tiene que ser una fecha ISO tipo "2026-08-01".`,
    );
  }
  return date;
}

function parseNumberValue(spec: SourceSpec, cond: RadarCondition): number {
  const value = requireValue(spec, cond);
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`El value de "${cond.op}" sobre "${cond.field}" (source "${spec.source}") tiene que ser un número.`);
  }
  return num;
}

/**
 * Para custom.<clave> el tipo real no está en la whitelist: se infiere del
 * operador y del value, para que "(custom_data->>'radar_score')::numeric > 80"
 * castee y "custom.radar_prioridad = 'P1'" compare texto.
 */
function customHint(cond: RadarCondition): RadarFieldType {
  if (cond.op === 'within_days' || cond.op === 'older_than_days') return 'date';
  const value = cond.value;
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'number')) return 'number';
  return 'string';
}

function buildCondition(spec: SourceSpec, cond: RadarCondition): SQL {
  const field = cond.field.trim();
  const resolved = isCustomField(field)
    ? resolveField(spec, field, customHint(cond))
    : resolveField(spec, field);
  const { expr, type } = resolved;

  // Un op fuera de la tabla del tipo se rechaza ANTES de armar SQL: el mensaje
  // le dice a la IA exactamente qué operadores le quedan para ese campo.
  if (!OPS_BY_TYPE[type].includes(cond.op)) throw opError(spec, cond, type);

  switch (cond.op) {
    case 'is_null':
      return sql`${expr} is null`;
    case 'not_null':
      return sql`${expr} is not null`;
    case 'contains':
    case 'starts_with': {
      const value = requireValue(spec, cond);
      if (typeof value !== 'string') {
        throw new Error(`El value de "${cond.op}" sobre "${cond.field}" (source "${spec.source}") tiene que ser texto.`);
      }
      const pattern = cond.op === 'contains' ? `%${escapeLike(value)}%` : `${escapeLike(value)}%`;
      return sql`${expr} ilike ${pattern}`;
    }
    case 'in':
    case 'not_in': {
      const value = requireValue(spec, cond);
      const items = Array.isArray(value) ? value : [value];
      if (!items.length) {
        throw new Error(`El operador "${cond.op}" sobre "${cond.field}" (source "${spec.source}") necesita una lista con al menos un valor.`);
      }
      const list = sql.join(items.map((item) => sql`${item}`), sql`, `);
      return cond.op === 'in' ? sql`${expr} in (${list})` : sql`(${expr} is null or ${expr} not in (${list}))`;
    }
    case 'within_days': {
      const days = parseNumberValue(spec, cond);
      // `n * interval '1 day'` mantiene N como bind: nada de interpolar texto.
      return sql`${expr} >= now() - (${days}::int * interval '1 day')`;
    }
    case 'older_than_days': {
      const days = parseNumberValue(spec, cond);
      return sql`${expr} < now() - (${days}::int * interval '1 day')`;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const bound = type === 'date' ? parseDateValue(spec, cond) : parseNumberValue(spec, cond);
      const op = cond.op === 'gt' ? sql`>` : cond.op === 'gte' ? sql`>=` : cond.op === 'lt' ? sql`<` : sql`<=`;
      return sql`${expr} ${op} ${bound}`;
    }
    case 'eq':
    case 'neq': {
      const raw = requireValue(spec, cond);
      let bound: unknown = raw;
      if (type === 'date') bound = parseDateValue(spec, cond);
      else if (type === 'number') bound = parseNumberValue(spec, cond);
      else if (type === 'boolean') {
        if (typeof raw !== 'boolean') {
          throw new Error(`El campo "${cond.field}" (source "${spec.source}") es boolean: usá true o false como value.`);
        }
      } else bound = String(raw);
      // neq incluye los null: "distinto de X" también son las filas sin valor.
      return cond.op === 'eq' ? sql`${expr} = ${bound}` : sql`(${expr} is null or ${expr} <> ${bound})`;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Armado y ejecución de queries                                        */
/* ------------------------------------------------------------------ */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit), MAX_LIMIT));
}

function buildOrderBy(
  spec: SourceSpec,
  sort: RadarQuery['sort'],
  resolveExpr: (field: string) => SQL | AnyColumn,
): SQL | null {
  const items = sort?.length ? sort : [spec.defaultSort];
  const parts = items.map((item) => {
    const expr = resolveExpr(item.field);
    // La dirección nunca sale del value: es un literal de esta whitelist.
    return item.dir === 'desc' ? sql`${expr} desc nulls last` : sql`${expr} asc`;
  });
  return parts.length ? sql.join(parts, sql`, `) : null;
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  return value;
}

function sanitizeRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) out[key] = sanitizeValue(value);
    return out;
  });
}

async function runRows(query: SQL): Promise<Array<Record<string, unknown>>> {
  // postgres.js devuelve la lista de filas directamente, sin `.rows`.
  const result = await db.execute(query);
  return sanitizeRows(result as unknown as Array<Record<string, unknown>>);
}

/** SELECT ... FROM ... JOIN ... WHERE — la parte común de filas y conteo. */
function baseQuery(spec: SourceSpec, selectList: SQL, where: SQL): SQL {
  const parts: SQL[] = [sql`select ${selectList} from ${spec.from}`];
  for (const join of spec.joins ?? []) parts.push(join);
  parts.push(sql`where ${where}`);
  return sql.join(parts, sql` `);
}

function aggregateExpr(spec: SourceSpec, aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max', field?: string): SQL {
  if (aggregation === 'count') {
    if (!field) return sql`count(*)::int`;
    const resolved = resolveField(spec, field, 'number');
    return sql`count(${resolved.expr})::int`;
  }
  if (!field) {
    throw new Error(`La agregación "${aggregation}" necesita un field numérico del source "${spec.source}" (count es la única que no).`);
  }
  const resolved = resolveField(spec, field, 'number');
  if (resolved.type !== 'number') {
    const numeric = Object.entries(spec.fields)
      .filter(([, fs]) => fs.type === 'number')
      .map(([name]) => name)
      .join(', ');
    throw new Error(
      `La agregación "${aggregation}" solo acepta campos numéricos; "${field}" es ${resolved.type} en "${spec.source}". Campos numéricos: ${numeric || '(ninguno)'}${spec.customColumn ? ' — o custom.<clave> con contenido numérico' : ''}.`,
    );
  }
  const fn = aggregation === 'sum' ? sql`sum` : aggregation === 'avg' ? sql`avg` : aggregation === 'min' ? sql`min` : sql`max`;
  return sql`coalesce(${fn}(${resolved.expr}), 0)::float8`;
}

function metricAlias(metric: NonNullable<RadarQuery['metrics']>[number], index: number): string {
  if (metric.as) return metric.as.replace(/[^a-zA-Z0-9_.]/g, '_');
  if (metric.field) return `${metric.aggregation}_${metric.field.replace(/[^a-zA-Z0-9_.]/g, '_')}`;
  return index === 0 ? metric.aggregation : `${metric.aggregation}_${index}`;
}

/**
 * Ejecuta una query del DSL (whatspro_radar_query y las métricas): filtros +
 * agrupación + agregaciones, siempre contra la whitelist del source y siempre
 * aislada por equipo.
 *
 * `count`: en queries planas es el TOTAL de filas que matchean (sin limit),
 * para que un badge pueda decir "mostrando 20 de 300"; en queries agrupadas o
 * agregadas es la cantidad de filas devueltas.
 */
export async function executeRadarQuery(
  teamId: number,
  query: RadarQuery,
): Promise<{ rows: Array<Record<string, unknown>>; count: number }> {
  const parsed = radarQuerySchema.safeParse(query);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`).join('; ');
    throw new Error(`Query inválida: ${detail}`);
  }
  const q = parsed.data;
  const spec = getSource(q.source);

  const conditions: SQL[] = [spec.teamFilter(teamId), ...(q.where ?? []).map((cond) => buildCondition(spec, cond))];
  const where = sql.join(conditions, sql` and `);
  const limit = clampLimit(q.limit);

  if (q.groupBy?.length || q.metrics?.length) {
    return executeGrouped(spec, q, where, limit);
  }

  const selectFields = q.select?.length ? q.select : spec.defaultSelect;
  const selectList = sql.join(
    selectFields.map((name) => sql`${selectExprFor(spec, name)} as ${sql.identifier(name)}`),
    sql`, `,
  );

  const orderBy = buildOrderBy(spec, q.sort, (field) => resolveField(spec, field).expr);
  const rowsQuery = sql.join(
    [baseQuery(spec, selectList, where), ...(orderBy ? [sql`order by ${orderBy}`] : []), sql`limit ${limit}`],
    sql` `,
  );

  const [rows, countRows] = await Promise.all([
    runRows(rowsQuery),
    runRows(baseQuery(spec, sql`count(*)::int as ${sql.identifier('count')}`, where)),
  ]);

  const count = Number(countRows[0]?.count ?? rows.length);
  return { rows, count: Number.isFinite(count) ? count : rows.length };
}

/**
 * Query agrupada/agregada. TRAMPA CONOCIDA DEL REPO: `date_trunc` con la
 * granularidad como bind param rompe el GROUP BY en runtime (pasa el build).
 * Acá la granularidad es SIEMPRE el literal 'day' escrito en el template — un
 * campo fecha en groupBy agrupa por día, formateado YYYY-MM-DD.
 */
async function executeGrouped(
  spec: SourceSpec,
  q: RadarQuery,
  where: SQL,
  limit: number,
): Promise<{ rows: Array<Record<string, unknown>>; count: number }> {
  const selectParts: SQL[] = [];
  const groupExprs: SQL[] = [];
  /** Campos por los que se puede ordenar: los del groupBy y los alias de métricas. */
  const orderables = new Map<string, SQL | AnyColumn>();

  for (const name of q.groupBy ?? []) {
    const resolved = resolveField(spec, name);
    const expr = resolved.type === 'date'
      ? sql`to_char(date_trunc('day', ${resolved.expr}), 'YYYY-MM-DD')`
      : resolved.expr;
    groupExprs.push(expr as SQL);
    selectParts.push(sql`${expr} as ${sql.identifier(name)}`);
    orderables.set(name, expr);
  }

  const metricsList = q.metrics?.length ? q.metrics : [{ aggregation: 'count' as const }];
  for (const [index, metric] of metricsList.entries()) {
    const alias = metricAlias(metric, index);
    const expr = aggregateExpr(spec, metric.aggregation, metric.field);
    selectParts.push(sql`${expr} as ${sql.identifier(alias)}`);
    orderables.set(alias, expr);
  }

  const selectList = sql.join(selectParts, sql`, `);
  const pieces: SQL[] = [baseQuery(spec, selectList, where)];
  if (groupExprs.length) pieces.push(sql`group by ${sql.join(groupExprs, sql`, `)}`);

  // En una query agrupada solo se puede ordenar por lo que la query devuelve.
  if (q.sort?.length) {
    const parts = q.sort.map((item) => {
      const expr = orderables.get(item.field);
      if (!expr) {
        throw new Error(
          `En una query agrupada solo se puede ordenar por los campos del groupBy o los alias de las métricas: ${[...orderables.keys()].join(', ')}.`,
        );
      }
      return item.dir === 'desc' ? sql`${expr} desc nulls last` : sql`${expr} asc`;
    });
    pieces.push(sql`order by ${sql.join(parts, sql`, `)}`);
  } else if (groupExprs.length) {
    // Default útil: los grupos más grandes primero (la primera métrica manda).
    const firstMetric = orderables.get(metricAlias(metricsList[0], 0));
    if (firstMetric) pieces.push(sql`order by ${firstMetric} desc nulls last`);
  }

  if (groupExprs.length) pieces.push(sql`limit ${limit}`);

  const rows = await runRows(sql.join(pieces, sql` `));
  return { rows, count: rows.length };
}

/**
 * Ejecuta un datasource declarado en una app. Es el mismo motor que
 * `executeRadarQuery` sin agrupación: filtros, orden, select y limit sobre la
 * whitelist del source — más los CAMPOS COMPUTADOS (`compute`), que se
 * calculan en memoria después de traer las filas con el evaluador seguro de
 * shared/formula.ts (nada de SQL ni eval).
 */
export async function executeRadarDatasource(
  teamId: number,
  ds: RadarDatasource,
): Promise<{ rows: Array<Record<string, unknown>>; count: number }> {
  const computed = ds.compute ?? [];
  const computedNames = new Set(computed.map((entry) => entry.as));

  // Un sort por campo computado no puede bajar a SQL: se ordena en memoria.
  // Para que el top-N no quede sesgado por el LIMIT de SQL, en ese caso se
  // traen hasta 100 filas y se recorta DESPUÉS de ordenar.
  const memorySort = (ds.sort ?? []).some((entry) => computedNames.has(entry.field));
  const limit = ds.limit ?? 20;

  const base = await executeRadarQuery(teamId, {
    source: ds.source,
    where: ds.where,
    sort: memorySort ? undefined : ds.sort,
    limit: memorySort ? 100 : ds.limit,
    select: ds.select,
  });

  if (!computed.length) return base;

  // Cada fórmula se evalúa fila a fila; un error de sintaxis tira UNA vez con
  // el nombre del campo (para que la IA lo corrija), un valor faltante da null.
  const rows = base.rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    for (const entry of computed) {
      try {
        next[entry.as] = evaluateFormula(entry.formula, (name) => next[name]);
      } catch (error) {
        throw new Error(
          `El campo computado "${entry.as}" tiene una fórmula inválida: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return next;
  });

  if (memorySort) {
    const entries = ds.sort ?? [];
    rows.sort((a, b) => {
      for (const entry of entries) {
        const direction = entry.dir === 'asc' ? 1 : -1;
        const left = Number(a[entry.field] ?? Number.NEGATIVE_INFINITY);
        const right = Number(b[entry.field] ?? Number.NEGATIVE_INFINITY);
        if (left !== right) return (left - right) * direction;
      }
      return 0;
    });
    return { rows: rows.slice(0, limit), count: base.count };
  }

  return { rows, count: base.count };
}

/* ------------------------------------------------------------------ */
/* Métricas                                                             */
/* ------------------------------------------------------------------ */

function formatMetricValue(value: number, format: RadarMetric['format'], currency?: string): string {
  switch (format ?? 'number') {
    case 'currency':
      return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: (currency ?? 'ARS').toUpperCase(),
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
      }).format(value);
    case 'percent':
      // El valor viene en escala 0-100 (score, conversión): no se re-multiplica.
      return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)}%`;
    case 'compact':
      return new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    default:
      return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
  }
}

/**
 * Resuelve el valor de una métrica de app.
 *
 * Métrica de datos: si `metric.source` es la key de un datasource del array
 * `datasources`, hereda su source y su where y le suma el where propio; si no,
 * se interpreta como un source del sistema.
 *
 * Métrica de FÓRMULA: `metric.formula` combina OTRAS métricas de `allMetrics`
 * por su key ("(cierres / pipeline) * 100"). Se resuelven recursivamente con
 * guarda de ciclos y profundidad máxima 5.
 */
export async function resolveRadarMetricValue(
  teamId: number,
  metric: RadarMetric,
  datasources?: RadarDatasource[],
  allMetrics?: RadarMetric[],
  stack: string[] = [],
): Promise<{ value: number; formatted: string }> {
  if (metric.formula) {
    if (stack.includes(metric.key)) {
      throw new Error(`La métrica "${metric.key}" se referencia a sí misma en un ciclo (${[...stack, metric.key].join(' → ')}).`);
    }
    if (stack.length >= 5) {
      throw new Error(`La fórmula de "${metric.key}" supera la profundidad máxima de 5 métricas encadenadas.`);
    }

    // Se resuelven primero TODAS las variables (en paralelo) y después se
    // evalúa: el evaluador es sincrónico a propósito.
    const names = formulaIdentifiers(metric.formula);
    const values = new Map<string, number | null>();
    await Promise.all(names.map(async (name) => {
      const referenced = allMetrics?.find((candidate) => candidate.key === name);
      if (!referenced) {
        throw new Error(
          `La fórmula de "${metric.key}" usa "${name}", que no es una métrica de la app (métricas disponibles: ${allMetrics?.map((m) => m.key).join(', ') || 'ninguna'}).`,
        );
      }
      const resolved = await resolveRadarMetricValue(teamId, referenced, datasources, allMetrics, [...stack, metric.key]);
      values.set(name, resolved.value);
    }));

    const result = evaluateFormula(metric.formula, (name) => values.get(name) ?? null);
    if (result === null || !Number.isFinite(result)) {
      throw new Error(`La fórmula de "${metric.key}" no produjo un número (¿división por cero o métrica sin datos?).`);
    }
    return { value: result, formatted: formatMetricValue(result, metric.format, metric.currency) };
  }

  // El schema garantiza source+aggregation cuando no hay formula; el chequeo
  // extra cubre definiciones viejas guardadas antes del refine.
  if (!metric.source || !metric.aggregation) {
    throw new Error(`La métrica "${metric.key}" no tiene ni formula ni source+aggregation.`);
  }

  const base = datasources?.find((ds) => ds.key === metric.source);
  const source = base ? base.source : metric.source;
  if (!base && !SOURCES[source]) {
    const dsKeys = datasources?.map((ds) => ds.key) ?? [];
    throw new Error(
      `La métrica "${metric.key}" apunta a "${metric.source}", que no es ni la key de un datasource de la app (${dsKeys.length ? dsKeys.join(', ') : 'no hay ninguno'}) ni un source del sistema (${validSourceNames()}).`,
    );
  }

  const { rows } = await executeRadarQuery(teamId, {
    source,
    where: [...(base?.where ?? []), ...(metric.where ?? [])],
    metrics: [{ aggregation: metric.aggregation, field: metric.field, as: 'value' }],
  });

  const raw = rows[0]?.value;
  const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
  if (!Number.isFinite(value)) {
    throw new Error(`La métrica "${metric.key}" no devolvió un número (llegó ${JSON.stringify(raw)}).`);
  }
  return { value, formatted: formatMetricValue(value, metric.format, metric.currency) };
}
