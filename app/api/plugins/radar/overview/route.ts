import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { contacts } from '@/lib/db/schema';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';

export const dynamic = 'force-dynamic';

type RadarPriority = 'P1' | 'P2' | 'P3' | 'descartado';

const PRIORITY_RANK: Record<RadarPriority, number> = { P1: 0, P2: 1, P3: 2, descartado: 3 };

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

export async function GET() {
  const target = await getRadarTarget();
  if (!target) {
    return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
  }

  // Sin índice/columna dedicada para radar_* (vive en contacts.customData jsonb):
  // el volumen de contactos por team es acotado, así que se trae y filtra en memoria
  // en vez de escribir SQL jsonb frágil sin un patrón existente que copiar.
  const rows = await db.query.contacts.findMany({
    where: eq(contacts.teamId, target.teamId),
    columns: { id: true, name: true, customData: true },
    with: { chat: { columns: { remoteJid: true } } },
  });

  const priorityContacts: Array<{
    contactId: number;
    contactName: string;
    remoteJid: string | null;
    priority: RadarPriority | null;
    score: number | null;
    intencion: string | null;
    objecion: string | null;
    recuperabilidad: string | null;
    confianza: number | null;
    estrategia: string | null;
    fechaAnalisis: string | null;
    needsReview: boolean;
  }> = [];

  let lastAnalysisAt: string | null = null;

  for (const contact of rows) {
    const data = (contact.customData ?? {}) as Record<string, unknown>;
    const fechaAnalisis = toStringOrNull(data.radar_fecha_analisis);
    if (!fechaAnalisis) continue; // no analizado por RADAR: no entra al tablero

    if (!lastAnalysisAt || fechaAnalisis > lastAnalysisAt) lastAnalysisAt = fechaAnalisis;

    const priorityRaw = toStringOrNull(data.radar_prioridad);
    const priority: RadarPriority | null =
      priorityRaw === 'P1' || priorityRaw === 'P2' || priorityRaw === 'P3' || priorityRaw === 'descartado'
        ? priorityRaw
        : null;

    const confianza = toNumberOrNull(data.radar_confianza);
    const needsReview = confianza !== null && confianza < 70;

    priorityContacts.push({
      contactId: contact.id,
      contactName: contact.name,
      remoteJid: contact.chat?.remoteJid ?? null,
      priority,
      score: toNumberOrNull(data.radar_score),
      intencion: toStringOrNull(data.radar_intencion),
      objecion: toStringOrNull(data.radar_objecion),
      recuperabilidad: toStringOrNull(data.radar_recuperabilidad),
      confianza,
      estrategia: toStringOrNull(data.radar_estrategia),
      fechaAnalisis,
      needsReview,
    });
  }

  priorityContacts.sort((a, b) => {
    const rankA = a.priority ? PRIORITY_RANK[a.priority] : 4;
    const rankB = b.priority ? PRIORITY_RANK[b.priority] : 4;
    if (rankA !== rankB) return rankA - rankB;
    return (b.score ?? -1) - (a.score ?? -1);
  });

  const counts = {
    analyzed: priorityContacts.length,
    p1: priorityContacts.filter((c) => c.priority === 'P1').length,
    p2: priorityContacts.filter((c) => c.priority === 'P2').length,
    p3: priorityContacts.filter((c) => c.priority === 'P3').length,
    descartado: priorityContacts.filter((c) => c.priority === 'descartado').length,
    needsReview: priorityContacts.filter((c) => c.needsReview).length,
  };

  return NextResponse.json({ counts, lastAnalysisAt, priorityContacts });
}
