import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamEventParticipants } from '@/lib/db/schema';

export const participantInputSchema = z.object({
  userId: z.number().int().positive().nullable().optional(),
  contactId: z.number().int().positive().nullable().optional(),
  role: z.string().trim().max(30).default('attendee'),
});

export type ParticipantInput = z.infer<typeof participantInputSchema>;

/**
 * Reemplaza la lista completa de participantes de un evento (borra los que ya
 * no vienen en `participants` y crea los nuevos). No toca `team_events.attendees`
 * (jsonb legacy) — team_event_participants es el reemplazo real.
 */
export async function syncEventParticipants(teamId: number, eventId: number, participants: ParticipantInput[]) {
  const rows = participants
    .filter((p) => p.userId || p.contactId)
    .map((p) => ({
      teamId,
      eventId,
      userId: p.userId ?? null,
      contactId: p.contactId ?? null,
      role: p.role || 'attendee',
    }));

  await db.transaction(async (tx) => {
    await tx.delete(teamEventParticipants).where(and(eq(teamEventParticipants.eventId, eventId), eq(teamEventParticipants.teamId, teamId)));
    if (rows.length > 0) {
      await tx.insert(teamEventParticipants).values(rows);
    }
  });
}

export async function getEventParticipants(teamId: number, eventId: number) {
  return db
    .select()
    .from(teamEventParticipants)
    .where(and(eq(teamEventParticipants.eventId, eventId), eq(teamEventParticipants.teamId, teamId)));
}
