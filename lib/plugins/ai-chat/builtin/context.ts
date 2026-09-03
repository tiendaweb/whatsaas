import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, teamMemberPlugins, teamMembers } from '@/lib/db/schema';
import { getRegisteredPlugins, resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { createSystemMessage } from '@/lib/db/system-messages';
import { pusherServer } from '@/lib/pusher-server';
import { isValidTimeZone, zonedDateTimeToUtc } from '@/lib/plugins/scheduled-messages/aapp-renewals';
import type { BuiltinToolContext } from './types';

export type ChatContactBundle = {
  chat: typeof chats.$inferSelect;
  contact: typeof contacts.$inferSelect;
  /** Teléfono sin formato (dígitos), derivado del JID de WhatsApp. */
  phone: string;
  displayName: string;
};

/**
 * Chat + contacto de la conversación en curso. Si el contacto todavía no
 * existe se crea, igual que hacen las herramientas manuales: el bot no puede
 * registrar nada "sobre nadie".
 */
export async function resolveChatContact(context: BuiltinToolContext): Promise<ChatContactBundle | null> {
  const chat = await db.query.chats.findFirst({ where: eq(chats.id, context.chatId) });
  if (!chat) return null;

  let contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, context.teamId), eq(contacts.chatId, context.chatId)),
  });

  if (!contact) {
    const contactName = chat.name || chat.pushName || 'New Contact';
    const [created] = await db
      .insert(contacts)
      .values({ teamId: context.teamId, chatId: context.chatId, name: contactName })
      .returning();
    contact = created;
    await createSystemMessage(context.teamId, context.chatId, `@@syslog_contact_auto_created|name=${contactName}`);
  }

  const phone = (chat.remoteJid || '').split('@')[0].replace(/\D/g, '');
  return {
    chat,
    contact,
    phone,
    displayName: contact.name || chat.name || chat.pushName || phone,
  };
}

/** Deja rastro en el chat de lo que hizo el bot y refresca la ficha en vivo. */
export async function logBotAction(context: BuiltinToolContext, bundle: ChatContactBundle, syslog: string, extra: Record<string, unknown> = {}) {
  await createSystemMessage(context.teamId, context.chatId, syslog);
  await pusherServer.trigger(`team-${context.teamId}`, 'contact-update', {
    chatId: context.chatId,
    remoteJid: bundle.chat.remoteJid,
    contactId: bundle.contact.id,
    ...extra,
  });
}

/**
 * Zona horaria en la que habla el cliente. No hay TZ por equipo en `teams`
 * todavía: se toma `AI_CHAT_TIMEZONE`, si no `TZ`, y si no la del producto.
 */
const FALLBACK_TZ = 'America/Argentina/Buenos_Aires';
export const CHAT_TIMEZONE = [process.env.AI_CHAT_TIMEZONE, process.env.TZ, FALLBACK_TZ]
  .find((tz): tz is string => Boolean(tz && isValidTimeZone(tz))) ?? FALLBACK_TZ;

const NAIVE_ISO = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Fecha/hora dicha por el cliente. Si viene sin zona ("2026-09-03T15:00") se
 * interpreta en CHAT_TIMEZONE, no en UTC: es la trampa clásica de `new Date`.
 */
export function parseDateInput(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const naive = raw.match(NAIVE_ISO);
  if (naive && !HAS_OFFSET.test(raw)) {
    const [, day, hh, mm] = naive;
    return zonedDateTimeToUtc(day, hh === undefined ? 12 : Number(hh), mm === undefined ? 0 : Number(mm), CHAT_TIMEZONE);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatZoned(date: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) {
  return new Intl.DateTimeFormat('es-AR', { ...opts, timeZone: CHAT_TIMEZONE }).format(date);
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Usuario en cuyo nombre escribe el bot. Los servicios de `lib/**` piden un
 * actor para `createdBy`/auditoría: usamos el agente asignado al contacto y,
 * si no hay, el dueño del equipo (o el primer miembro).
 */
export async function resolveActorUserId(teamId: number, contact?: { assignedUserId: number | null } | null): Promise<number | null> {
  if (contact?.assignedUserId) return contact.assignedUserId;
  const members = await db.query.teamMembers.findMany({
    where: eq(teamMembers.teamId, teamId),
    columns: { userId: true, role: true },
  });
  if (members.length === 0) return null;
  return (members.find((m) => m.role === 'owner') ?? members[0]).userId;
}

/** Los importes se guardan en centavos; el cliente habla en unidades. */
export function toCents(amount: number) {
  return Math.round(amount * 100);
}
export function fromCents(cents: number | null | undefined) {
  return Math.round(Number(cents ?? 0)) / 100;
}

/**
 * Apps que cuentan como activas para el bot. El resolver del registro sin
 * usuario ignora las apps de modo "por usuario" (Soporte, Financiero,
 * Documentos, Sitios): para el agente valen si algún miembro del equipo las
 * encendió, porque el bot no pertenece a nadie en particular.
 */
export async function resolveBotActivePluginIds(teamId: number): Promise<Set<string>> {
  const [active, manifests, memberRows] = await Promise.all([
    resolveActivePluginsForTeam(teamId),
    getRegisteredPlugins(),
    db
      .select({ pluginId: teamMemberPlugins.pluginId })
      .from(teamMemberPlugins)
      .where(and(eq(teamMemberPlugins.teamId, teamId), eq(teamMemberPlugins.enabled, true))),
  ]);
  const ids = new Set(active.map((p) => p.pluginId));
  const perUser = new Set(
    manifests.filter((m) => m.activationMode === 'user' || m.activationMode === 'hybrid').map((m) => m.id),
  );
  for (const row of memberRows) {
    if (perUser.has(row.pluginId)) ids.add(row.pluginId);
  }
  return ids;
}
