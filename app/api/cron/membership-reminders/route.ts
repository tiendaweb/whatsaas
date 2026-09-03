import { NextResponse } from 'next/server';
import { and, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  evolutionInstances,
  teamCustomerContacts,
  teamMembershipReminderRules,
  teamMembershipSubscriptions,
  type MembershipReminderLog,
} from '@/lib/db/schema';
import { triggerAutomationManually } from '@/lib/automation/engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';

// ─── Helpers de fecha ────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// endDate + offsetDays (offsetDays negativo = antes del vencimiento).
function targetDateStr(endDate: string, offsetDays: number): string {
  const d = new Date(`${endDate}T00:00:00`);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function toPhoneNumber(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');
}

// ─── Envío por Evolution API ─────────────────────────────────────────────────

async function sendText(instanceName: string, apiKey: string, jid: string, text: string) {
  await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: toPhoneNumber(jid), text }),
  });
}

async function sendMedia(instanceName: string, apiKey: string, jid: string, mediaUrl: string, caption: string) {
  await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: toPhoneNumber(jid), mediatype: 'image', media: mediaUrl, caption }),
  });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/membership-reminders] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayStr();

  // Reglas activas de todos los equipos, agrupadas por equipo.
  const rules = await db
    .select()
    .from(teamMembershipReminderRules)
    .where(eq(teamMembershipReminderRules.isActive, true));

  if (!rules.length) return NextResponse.json({ ok: true, sent: 0 });

  const rulesByTeam = new Map<number, typeof rules>();
  for (const rule of rules) {
    const list = rulesByTeam.get(rule.teamId) ?? [];
    list.push(rule);
    rulesByTeam.set(rule.teamId, list);
  }

  const instanceCache = new Map<number, { accessToken: string | null; instanceName: string } | null>();
  async function getInstance(id: number) {
    if (instanceCache.has(id)) return instanceCache.get(id)!;
    const inst = await db.query.evolutionInstances.findFirst({
      where: eq(evolutionInstances.id, id),
      columns: { accessToken: true, instanceName: true },
    });
    instanceCache.set(id, inst ?? null);
    return inst ?? null;
  }

  let sent = 0;
  const errors: Array<{ subscriptionId: number; ruleId: number; error: string }> = [];

  for (const [teamId, teamRules] of rulesByTeam) {
    // Suscripciones activas con vencimiento del equipo.
    const subs = await db.query.teamMembershipSubscriptions.findMany({
      where: and(
        eq(teamMembershipSubscriptions.teamId, teamId),
        eq(teamMembershipSubscriptions.status, 'active'),
        or(
          isNull(teamMembershipSubscriptions.externalSource),
          ne(teamMembershipSubscriptions.externalSource, 'aapp_space'),
        ),
        isNotNull(teamMembershipSubscriptions.endDate),
      ),
      with: {
        contact: {
          columns: { id: true, chatId: true },
          with: { chat: { columns: { id: true, remoteJid: true, instanceId: true } } },
        },
      },
    });

    for (const sub of subs) {
      if (!sub.endDate) continue;
      let chat = sub.contact?.chat;
      if ((!chat?.remoteJid || !chat.instanceId) && sub.customerId) {
        const linked = await db
          .select({ id: chats.id, remoteJid: chats.remoteJid, instanceId: chats.instanceId })
          .from(teamCustomerContacts)
          .innerJoin(contacts, eq(teamCustomerContacts.contactId, contacts.id))
          .innerJoin(chats, eq(contacts.chatId, chats.id))
          .where(and(eq(teamCustomerContacts.teamId, teamId), eq(teamCustomerContacts.customerId, sub.customerId)))
          .limit(1);
        chat = linked[0];
      }
      if (!chat?.remoteJid || !chat.instanceId) continue;

      const alreadySent = new Set((sub.remindersSent ?? []).map((r) => r.ruleId));
      const newLogs: MembershipReminderLog[] = [];

      for (const rule of teamRules) {
        if (alreadySent.has(rule.id)) continue;
        if (targetDateStr(sub.endDate, rule.offsetDays) !== today) continue;

        try {
          if (rule.actionType === 'automation' && rule.automationId) {
            await triggerAutomationManually(teamId, chat.id, chat.remoteJid, chat.instanceId, {
              automationId: rule.automationId,
            });
          } else if (rule.actionType === 'message' && rule.message.trim()) {
            const instanceId = rule.instanceId ?? chat.instanceId;
            const instance = await getInstance(instanceId);
            if (!instance?.accessToken) continue;
            if (rule.mediaUrl) {
              await sendMedia(instance.instanceName, instance.accessToken, chat.remoteJid, rule.mediaUrl, rule.message);
            } else {
              await sendText(instance.instanceName, instance.accessToken, chat.remoteJid, rule.message);
            }
          } else {
            continue;
          }

          newLogs.push({ ruleId: rule.id, offsetDays: rule.offsetDays, sentAt: new Date().toISOString() });
          sent++;
        } catch (err) {
          console.error(`[cron/membership-reminders] sub ${sub.id} rule ${rule.id}:`, err);
          errors.push({ subscriptionId: sub.id, ruleId: rule.id, error: String(err) });
        }
      }

      if (newLogs.length) {
        await db
          .update(teamMembershipSubscriptions)
          .set({
            remindersSent: [...(sub.remindersSent ?? []), ...newLogs],
            updatedAt: new Date(),
          })
          .where(eq(teamMembershipSubscriptions.id, sub.id));
      }
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length ? errors : undefined });
}
