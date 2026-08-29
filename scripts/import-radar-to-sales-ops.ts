/**
 * Importa los contactos con `customData.radar_*` (análisis Radar previo, 81 en el
 * equipo 2) como versión 0 de team_commercial_analysis, reason 'import'.
 *
 * Mapeo provisorio: P1→G7, P2→G5, P3→G4, descartado→GX; confidence 40; status
 * en_proceso; analyzedBy 'claude' (el Radar lo hizo un conector). No pisa análisis
 * con version > 0. Idempotente: re-correrlo actualiza priorRadar de las filas v0.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/import-radar-to-sales-ops.ts [teamId]
 */
import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, teamCommercialAnalysis, teamCommercialAnalysisVersions } from '@/lib/db/schema';
import { DEFAULT_SPEED_BY_GATE, type Gate } from '@/lib/plugins/sales-ops/shared/taxonomy';

const TEAM_ID = Number(process.argv[2] ?? process.env.SALES_OPS_TEAM ?? 2);

const GATE_BY_PRIORIDAD: Record<string, Gate> = { P1: 'G7', P2: 'G5', P3: 'G4', descartado: 'GX' };

function radarFields(customData: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(customData)) if (k.startsWith('radar_')) out[k] = v;
  return out;
}

async function main() {
  const rows = await db
    .select({
      contactId: contacts.id,
      chatId: contacts.chatId,
      customData: contacts.customData,
      remoteJid: chats.remoteJid,
      lastCustomerInteraction: chats.lastCustomerInteraction,
      lastMessageTimestamp: chats.lastMessageTimestamp,
    })
    .from(contacts)
    .innerJoin(chats, eq(chats.id, contacts.chatId))
    .where(and(eq(contacts.teamId, TEAM_ID), sql`${contacts.customData} ? 'radar_prioridad'`));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let groups = 0;
  const now = new Date();

  for (const row of rows) {
    if (row.remoteJid.endsWith('@g.us')) {
      groups += 1;
      continue;
    }
    const customData = (row.customData ?? {}) as Record<string, unknown>;
    const prioridad = String(customData.radar_prioridad ?? '');
    const gate = GATE_BY_PRIORIDAD[prioridad] ?? 'G4';
    const fecha = typeof customData.radar_fecha_analisis === 'string' ? customData.radar_fecha_analisis : null;
    const analyzedAt = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T12:00:00Z`) : now;
    const priorRadar = { ...radarFields(customData), importedAt: now.toISOString(), mappedGate: gate };

    const existing = await db.query.teamCommercialAnalysis.findFirst({
      where: and(eq(teamCommercialAnalysis.teamId, TEAM_ID), eq(teamCommercialAnalysis.chatId, row.chatId)),
      columns: { id: true, version: true },
    });
    if (existing && existing.version > 0) {
      // Ya hay un análisis real: sólo se conserva el radar previo como referencia.
      await db.update(teamCommercialAnalysis).set({ priorRadar }).where(eq(teamCommercialAnalysis.id, existing.id));
      skipped += 1;
      continue;
    }

    const values = {
      teamId: TEAM_ID,
      chatId: row.chatId,
      contactId: row.contactId,
      version: 0,
      fingerprint: null,
      stale: true,
      lastCustomerMessageAt: row.lastCustomerInteraction ?? null,
      lastTeamMessageAt: row.lastMessageTimestamp ?? null,
      currentGate: gate,
      maxGate: gate,
      dropGate: gate,
      dropReason: gate === 'GX' ? 'rechazo_explicito' : 'desconocido',
      confidence: 40,
      evidence: {},
      need: 'indefinida',
      objectionType: 'ninguna',
      intent: 'ninguna',
      intentScore: 0,
      temperature: 'cold',
      recoveryProbability: 0,
      potentialValueUsd: 0,
      collectionSpeed: DEFAULT_SPEED_BY_GATE[gate],
      priorityScore: 0,
      status: 'en_proceso',
      statusReason: `Importado del Radar (${prioridad || 'sin prioridad'}); pendiente de clasificación real`,
      recommendedAction: typeof customData.radar_estrategia === 'string' ? customData.radar_estrategia.slice(0, 400) : null,
      recommendedOwner: 'nadie',
      notesForHuman: typeof customData.radar_oportunidad_2 === 'string' ? `Oportunidad 2 (Radar): ${customData.radar_oportunidad_2}` : null,
      priorRadar,
      analyzedAt,
      analyzedBy: 'claude',
      provider: 'radar-import',
      updatedAt: now,
    } as const;

    let analysisId: number;
    if (existing) {
      await db.update(teamCommercialAnalysis).set({ ...values }).where(eq(teamCommercialAnalysis.id, existing.id));
      analysisId = existing.id;
      updated += 1;
    } else {
      const [inserted] = await db.insert(teamCommercialAnalysis).values({ ...values }).returning({ id: teamCommercialAnalysis.id });
      analysisId = inserted.id;
      created += 1;
    }
    await db
      .insert(teamCommercialAnalysisVersions)
      .values({
        teamId: TEAM_ID,
        analysisId,
        chatId: row.chatId,
        version: 0,
        reason: 'import',
        snapshot: { ...values, analyzedAt: analyzedAt.toISOString(), updatedAt: now.toISOString(), lastCustomerMessageAt: row.lastCustomerInteraction?.toISOString() ?? null, lastTeamMessageAt: row.lastMessageTimestamp?.toISOString() ?? null, _meta: { engine: 'import', source: 'customData.radar_*' } },
        evidence: {},
        diff: null,
        analyzedBy: 'claude',
        createdAt: analyzedAt,
      })
      .onConflictDoNothing();
  }

  console.log(JSON.stringify({ teamId: TEAM_ID, contactosConRadar: rows.length, created, updated, skippedConAnalisisReal: skipped, grupos: groups }));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
