import 'server-only';

/**
 * El tablero de Radar como funciones puras de servidor con firma `(teamId, …)`.
 *
 * Esta lógica vivía inline en tres route handlers (`radar/overview`,
 * `radar/clients`, `radar/client/[contactId]`) atada a `getRadarTarget()`, que
 * lee cookies — desde el conector MCP era inalcanzable. Las routes ahora
 * consumen estas funciones y el conector también: una sola implementación,
 * dos puertas.
 */
import { and, desc, eq, like, inArray, max, ne, or } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { contacts, messages, teamTaskItems, teamTaskRelations } from '@/lib/db/schema';
import {
  RADAR_NOTE_PREFIX,
  parseRadarNote,
  radarNoteToBlocks,
} from '@/lib/plugins/radar/server/note-parser';
import { countReportsByContact, listLinkedRadarReports } from '@/lib/plugins/radar/server/report-links';
import { listRadarReports } from '@/lib/plugins/radar/server/reports';
import { listRadarWidgets } from '@/lib/plugins/radar/server/widgets';
import { RADAR_ANALYST_FIELD_KEYS } from '@/lib/plugins/radar/shared/constants';
import { listContactTasks } from '@/lib/plugins/tasks/server/contact-tasks';

export type RadarBoardPriority = 'P1' | 'P2' | 'P3' | 'descartado';

const PRIORITY_RANK: Record<RadarBoardPriority, number> = { P1: 0, P2: 1, P3: 2, descartado: 3 };

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPriority(value: unknown): RadarBoardPriority | null {
  return value === 'P1' || value === 'P2' || value === 'P3' || value === 'descartado' ? value : null;
}

export type RadarOverviewContact = {
  contactId: number;
  contactName: string;
  remoteJid: string | null;
  priority: RadarBoardPriority | null;
  score: number | null;
  intencion: string | null;
  objecion: string | null;
  recuperabilidad: string | null;
  confianza: number | null;
  estrategia: string | null;
  fechaAnalisis: string | null;
  needsReview: boolean;
};

export type RadarOverview = {
  counts: {
    analyzed: number;
    p1: number;
    p2: number;
    p3: number;
    descartado: number;
    needsReview: number;
  };
  lastAnalysisAt: string | null;
  priorityContacts: RadarOverviewContact[];
};

export async function getRadarOverview(teamId: number): Promise<RadarOverview> {
  // Sin índice/columna dedicada para radar_* (vive en contacts.customData jsonb):
  // el volumen de contactos por team es acotado, así que se trae y filtra en memoria
  // en vez de escribir SQL jsonb frágil sin un patrón existente que copiar.
  const rows = await db.query.contacts.findMany({
    where: eq(contacts.teamId, teamId),
    columns: { id: true, name: true, customData: true },
    with: { chat: { columns: { remoteJid: true } } },
  });

  const priorityContacts: RadarOverviewContact[] = [];
  let lastAnalysisAt: string | null = null;

  for (const contact of rows) {
    const data = (contact.customData ?? {}) as Record<string, unknown>;
    const fechaAnalisis = toStringOrNull(data.radar_fecha_analisis);
    if (!fechaAnalisis) continue; // no analizado por RADAR: no entra al tablero

    if (!lastAnalysisAt || fechaAnalisis > lastAnalysisAt) lastAnalysisAt = fechaAnalisis;

    const confianza = toNumberOrNull(data.radar_confianza);

    priorityContacts.push({
      contactId: contact.id,
      contactName: contact.name,
      remoteJid: contact.chat?.remoteJid ?? null,
      priority: toPriority(toStringOrNull(data.radar_prioridad)),
      score: toNumberOrNull(data.radar_score),
      intencion: toStringOrNull(data.radar_intencion),
      objecion: toStringOrNull(data.radar_objecion),
      recuperabilidad: toStringOrNull(data.radar_recuperabilidad),
      confianza,
      estrategia: toStringOrNull(data.radar_estrategia),
      fechaAnalisis,
      needsReview: confianza !== null && confianza < 70,
    });
  }

  priorityContacts.sort((a, b) => {
    const rankA = a.priority ? PRIORITY_RANK[a.priority] : 4;
    const rankB = b.priority ? PRIORITY_RANK[b.priority] : 4;
    if (rankA !== rankB) return rankA - rankB;
    return (b.score ?? -1) - (a.score ?? -1);
  });

  return {
    counts: {
      analyzed: priorityContacts.length,
      p1: priorityContacts.filter((c) => c.priority === 'P1').length,
      p2: priorityContacts.filter((c) => c.priority === 'P2').length,
      p3: priorityContacts.filter((c) => c.priority === 'P3').length,
      descartado: priorityContacts.filter((c) => c.priority === 'descartado').length,
      needsReview: priorityContacts.filter((c) => c.needsReview).length,
    },
    lastAnalysisAt,
    priorityContacts,
  };
}

/**
 * Tareas abiertas por contacto, en 2 queries en vez de una por cliente.
 * La relación tarea↔contacto puede estar guardada en cualquiera de los dos
 * sentidos (task→contact o contact→task), por eso el `or`.
 */
async function openTaskCountByContact(teamId: number, contactIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!contactIds.length) return out;

  const relations = await db
    .select({
      sourceType: teamTaskRelations.sourceType,
      sourceId: teamTaskRelations.sourceId,
      targetId: teamTaskRelations.targetId,
    })
    .from(teamTaskRelations)
    .where(
      and(
        eq(teamTaskRelations.teamId, teamId),
        or(
          and(
            eq(teamTaskRelations.sourceType, 'task'),
            eq(teamTaskRelations.targetType, 'contact'),
            inArray(teamTaskRelations.targetId, contactIds),
          ),
          and(
            eq(teamTaskRelations.sourceType, 'contact'),
            eq(teamTaskRelations.targetType, 'task'),
            inArray(teamTaskRelations.sourceId, contactIds),
          ),
        ),
      ),
    );

  if (!relations.length) return out;

  const pairs = relations.map((rel) =>
    rel.sourceType === 'task'
      ? { taskId: rel.sourceId, contactId: rel.targetId }
      : { taskId: rel.targetId, contactId: rel.sourceId },
  );

  const openTasks = await db
    .select({ id: teamTaskItems.id })
    .from(teamTaskItems)
    .where(
      and(
        eq(teamTaskItems.teamId, teamId),
        inArray(teamTaskItems.id, Array.from(new Set(pairs.map((p) => p.taskId)))),
        ne(teamTaskItems.status, 'done'),
      ),
    );

  const openIds = new Set(openTasks.map((t) => t.id));
  const seen = new Set<string>();
  for (const pair of pairs) {
    if (!openIds.has(pair.taskId)) continue;
    const dedupeKey = `${pair.contactId}:${pair.taskId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.set(pair.contactId, (out.get(pair.contactId) ?? 0) + 1);
  }
  return out;
}

/** Fecha de la última nota 🎯 RADAR por chat, en un solo GROUP BY por columna. */
async function lastNoteAtByChat(chatIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!chatIds.length) return out;

  const rows = await db
    .select({ chatId: messages.chatId, lastAt: max(messages.timestamp) })
    .from(messages)
    .where(
      and(
        inArray(messages.chatId, chatIds),
        eq(messages.isInternal, true),
        like(messages.text, `${RADAR_NOTE_PREFIX}%`),
      ),
    )
    .groupBy(messages.chatId);

  for (const row of rows) {
    if (row.lastAt) out.set(row.chatId, new Date(row.lastAt).toISOString());
  }
  return out;
}

export type RadarClientRow = {
  contactId: number;
  contactName: string;
  remoteJid: string | null;
  instanceId: number | null;
  priority: RadarBoardPriority | null;
  score: number | null;
  intencion: string | null;
  objecion: string | null;
  recuperabilidad: string | null;
  confianza: number | null;
  estrategia: string | null;
  fechaAnalisis: string;
  needsReview: boolean;
  reportCount: number;
  hasReports: boolean;
  openTaskCount: number;
  lastNoteAt: string | null;
};

export type ListRadarClientsOptions = {
  q?: string;
  onlyWithReports?: boolean;
  priority?: RadarBoardPriority;
};

export async function listRadarClients(teamId: number, options: ListRadarClientsOptions = {}) {
  const q = (options.q ?? '').trim().toLowerCase();

  const rows = await db.query.contacts.findMany({
    where: eq(contacts.teamId, teamId),
    columns: { id: true, name: true, chatId: true, customData: true },
    with: { chat: { columns: { remoteJid: true, instanceId: true } } },
  });

  type WorkingRow = RadarClientRow & { chatId: number };
  const analyzed: WorkingRow[] = [];

  for (const contact of rows) {
    const data = (contact.customData ?? {}) as Record<string, unknown>;
    const fechaAnalisis = toStringOrNull(data.radar_fecha_analisis);
    if (!fechaAnalisis) continue; // no analizado por RADAR: no entra al panel

    if (q && !(contact.name ?? '').toLowerCase().includes(q)) continue;

    const priority = toPriority(toStringOrNull(data.radar_prioridad));
    if (options.priority && priority !== options.priority) continue;

    const confianza = toNumberOrNull(data.radar_confianza);

    analyzed.push({
      contactId: contact.id,
      contactName: contact.name,
      // El JID y la instancia van crudos: la URL del chat la arma la UI.
      remoteJid: contact.chat?.remoteJid ?? null,
      instanceId: contact.chat?.instanceId ?? null,
      priority,
      score: toNumberOrNull(data.radar_score),
      intencion: toStringOrNull(data.radar_intencion),
      objecion: toStringOrNull(data.radar_objecion),
      recuperabilidad: toStringOrNull(data.radar_recuperabilidad),
      confianza,
      estrategia: toStringOrNull(data.radar_estrategia),
      fechaAnalisis,
      needsReview: confianza !== null && confianza < 70,
      reportCount: 0,
      hasReports: false,
      openTaskCount: 0,
      lastNoteAt: null,
      chatId: contact.chatId,
    });
  }

  const contactIds = analyzed.map((c) => c.contactId);
  const chatIds = Array.from(new Set(analyzed.map((c) => c.chatId)));

  const [reportCounts, taskCounts, lastNotes] = await Promise.all([
    countReportsByContact(teamId),
    openTaskCountByContact(teamId, contactIds),
    lastNoteAtByChat(chatIds),
  ]);

  for (const row of analyzed) {
    row.reportCount = reportCounts.get(row.contactId) ?? 0;
    row.hasReports = row.reportCount > 0;
    row.openTaskCount = taskCounts.get(row.contactId) ?? 0;
    row.lastNoteAt = lastNotes.get(row.chatId) ?? null;
  }

  const clients = analyzed
    .filter((row) => !options.onlyWithReports || row.hasReports)
    .sort((a, b) => {
      const rankA = a.priority ? PRIORITY_RANK[a.priority] : 4;
      const rankB = b.priority ? PRIORITY_RANK[b.priority] : 4;
      if (rankA !== rankB) return rankA - rankB;
      return (b.score ?? -1) - (a.score ?? -1);
    })
    .map(({ chatId: _chatId, ...rest }) => rest satisfies RadarClientRow);

  return {
    total: clients.length,
    counts: {
      p1: clients.filter((c) => c.priority === 'P1').length,
      p2: clients.filter((c) => c.priority === 'P2').length,
      p3: clients.filter((c) => c.priority === 'P3').length,
      descartado: clients.filter((c) => c.priority === 'descartado').length,
      needsReview: clients.filter((c) => c.needsReview).length,
      withReports: clients.filter((c) => c.hasReports).length,
    },
    clients,
  };
}

/** Cuántas notas RADAR se devuelven para el historial de la ficha. */
const NOTE_HISTORY_LIMIT = 5;

export type RadarClientPanelContact = {
  id: number;
  name: string | null;
  chatId: number;
  customData: unknown;
};

/**
 * La ficha completa de un cliente analizado. Recibe el contacto YA AUTORIZADO:
 * cada puerta (route con sesión, tool MCP) hace su propio control de acceso
 * antes de llamar.
 */
export async function getRadarClientPanel(args: {
  teamId: number;
  userId: number;
  contact: RadarClientPanelContact;
}) {
  const { teamId, userId, contact } = args;

  const customData = (contact.customData ?? {}) as Record<string, unknown>;
  const fields: Record<string, string | null> = {};
  for (const key of RADAR_ANALYST_FIELD_KEYS) {
    const value = customData[key];
    fields[key] = typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  const analyzed = Boolean(fields.radar_fecha_analisis);
  const contactName = contact.name ?? '';

  const [noteRows, tasks, linkedReports, folderReports, widgets] = await Promise.all([
    // Las notas 🎯 RADAR viven como mensajes internos del chat, no en una
    // tabla propia: por eso se buscan por prefijo de texto.
    db.query.messages.findMany({
      where: and(
        eq(messages.chatId, contact.chatId),
        eq(messages.isInternal, true),
        like(messages.text, `${RADAR_NOTE_PREFIX}%`),
      ),
      orderBy: [desc(messages.timestamp)],
      limit: NOTE_HISTORY_LIMIT,
      columns: { text: true, timestamp: true },
    }),
    listContactTasks(teamId, contact.id),
    listLinkedRadarReports({ teamId, contactId: contact.id }),
    listRadarReports({
      teamId,
      userId,
      category: 'clientes',
      contactId: contact.id,
      contactName,
    }),
    listRadarWidgets({ teamId, surface: 'chat', contactId: contact.id }),
  ]);

  const latestNote = noteRows[0]?.text ?? null;
  const parsed = latestNote ? parseRadarNote(latestNote) : null;

  // Informes de la carpeta del contacto + los vinculados explícitamente,
  // deduplicados por id: un mismo documento puede estar en las dos listas.
  const reportById = new Map<number, { id: number; title: string; emoji: string | null; format: 'markdown' | 'html'; updatedAt: string; linked: boolean; summary: string | null }>();
  for (const doc of folderReports) {
    reportById.set(doc.id, {
      id: doc.id,
      title: doc.title,
      emoji: doc.emoji,
      format: doc.format,
      updatedAt: doc.updatedAt,
      linked: false,
      summary: null,
    });
  }
  for (const link of linkedReports) {
    reportById.set(link.documentId, {
      id: link.document.id,
      title: link.document.title,
      emoji: link.document.emoji,
      format: link.document.format,
      updatedAt: link.document.updatedAt,
      linked: true,
      summary: link.summary,
    });
  }

  return {
    contact: { id: contact.id, name: contact.name, chatId: contact.chatId },
    fields,
    analyzed,
    noteHeader: parsed?.header ?? null,
    noteBlocks: latestNote ? radarNoteToBlocks(latestNote) : [],
    notes: noteRows.map((row) => ({ text: row.text, date: row.timestamp })),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      projectName: task.projectName,
      columnName: task.columnName,
    })),
    reports: Array.from(reportById.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    documents: linkedReports,
    widgets,
  };
}
