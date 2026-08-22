import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocumentFolders } from '@/lib/db/schema';
import { createFolder } from '@/lib/plugins/documents/server/folders';
import { listDocuments, type DocumentSummary } from '@/lib/plugins/documents/server/documents';

export const RADAR_REPORTS_ROOT_FOLDER = 'Radar · Informes';
export const RADAR_REPORTS_CLIENTS_FOLDER = 'Clientes';
export const RADAR_REPORTS_TEAM_FOLDER = 'Equipo';
export const RADAR_REPORTS_GENERAL_FOLDER = 'Generales';

export type RadarReportCategory = 'clientes' | 'equipo' | 'generales';

async function findFolderByName(teamId: number, name: string, parentId: number | null) {
  const [row] = await db
    .select()
    .from(teamDocumentFolders)
    .where(
      and(
        eq(teamDocumentFolders.teamId, teamId),
        eq(teamDocumentFolders.name, name),
        parentId === null ? isNull(teamDocumentFolders.parentId) : eq(teamDocumentFolders.parentId, parentId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Get-or-create por nombre exacto, nunca duplica — mismo patrón que
 * `getOrCreateMeetingsProject` en lib/plugins/notes/server/meeting-notes.ts.
 */
async function getOrCreateFolder(input: { teamId: number; userId: number; name: string; parentId: number | null }) {
  const existing = await findFolderByName(input.teamId, input.name, input.parentId);
  if (existing) return existing;
  return createFolder({ teamId: input.teamId, userId: input.userId, name: input.name, parentId: input.parentId });
}

/**
 * Devuelve (creando si falta) el árbol fijo de carpetas de Radar:
 * "Radar · Informes" > Clientes / Equipo / Generales.
 */
export async function ensureRadarReportFolders(teamId: number, userId: number) {
  const root = await getOrCreateFolder({ teamId, userId, name: RADAR_REPORTS_ROOT_FOLDER, parentId: null });
  const [clientes, equipo, generales] = await Promise.all([
    getOrCreateFolder({ teamId, userId, name: RADAR_REPORTS_CLIENTS_FOLDER, parentId: root.id }),
    getOrCreateFolder({ teamId, userId, name: RADAR_REPORTS_TEAM_FOLDER, parentId: root.id }),
    getOrCreateFolder({ teamId, userId, name: RADAR_REPORTS_GENERAL_FOLDER, parentId: root.id }),
  ]);
  return { root, clientes, equipo, generales };
}

/** Subcarpeta de un contacto puntual dentro de "Clientes", get-or-create. */
export async function ensureContactReportFolder(input: {
  teamId: number;
  userId: number;
  contactId: number;
  contactName: string;
}) {
  const { clientes } = await ensureRadarReportFolders(input.teamId, input.userId);
  const name = `${input.contactName.trim() || 'Sin nombre'} · #${input.contactId}`;
  return getOrCreateFolder({ teamId: input.teamId, userId: input.userId, name, parentId: clientes.id });
}

/**
 * Lista los informes de una categoría. Para 'clientes' con `contactId`, solo
 * la subcarpeta de ese contacto (si no existe todavía, no la crea — devuelve
 * vacío, no hace falta la carpeta hasta que alguien guarde el primer informe).
 */
export async function listRadarReports(input: {
  teamId: number;
  userId: number;
  category: RadarReportCategory;
  contactId?: number;
  contactName?: string;
}): Promise<DocumentSummary[]> {
  const { root, clientes, equipo, generales } = await ensureRadarReportFolders(input.teamId, input.userId);

  let folderId: number | null = null;
  if (input.category === 'equipo') folderId = equipo.id;
  else if (input.category === 'generales') folderId = generales.id;
  else if (input.category === 'clientes') {
    if (input.contactId) {
      const name = `${(input.contactName ?? '').trim() || 'Sin nombre'} · #${input.contactId}`;
      const folder = await findFolderByName(input.teamId, name, clientes.id);
      folderId = folder?.id ?? null;
      if (!folderId) return [];
    } else {
      folderId = clientes.id;
    }
  }

  if (folderId === null) return [];

  const all = await listDocuments(input.teamId);
  return all.filter((doc) => doc.folderId === folderId);
}
