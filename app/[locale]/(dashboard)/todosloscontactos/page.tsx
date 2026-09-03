import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { chats, evolutionInstances, messages } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { TodosLosContactosTable, type InstanceSummary, type TodoContactoRow } from './TodosLosContactosTable';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Todos los contactos',
  robots: {
    index: false,
    follow: false,
  },
};

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';

type PageProps = {
  params: Promise<{ locale: string }>;
};

type EvolutionItem = Record<string, any>;

type EligibleChat = {
  id: number;
  remoteJid: string;
  name: string | null;
  pushName: string | null;
  profilePicUrl: string | null;
  lastMessageText: string | null;
  lastMessageTimestamp: Date | null;
  lastCustomerInteraction: Date | null;
  instanceId: number | null;
  contact?: {
    id: number;
    name: string;
  } | null;
};

type LiveArrayResult = {
  ok: boolean;
  items: EvolutionItem[];
  error?: string;
};

function arrayFromEvolutionPayload(payload: unknown): EvolutionItem[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  const possibleKeys = ['data', 'contacts', 'chats', 'items', 'result'];

  for (const key of possibleKeys) {
    const value = record[key];
    if (Array.isArray(value)) return value as EvolutionItem[];
  }

  return [];
}

async function fetchEvolutionArray(
  instanceName: string,
  accessToken: string,
  endpoint: 'findChats' | 'findContacts',
): Promise<LiveArrayResult> {
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/chat/${endpoint}/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: accessToken,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = typeof body?.message === 'string' ? body.message : `Evolution API respondio ${response.status}`;
      return { ok: false, items: [], error: message };
    }

    return { ok: true, items: arrayFromEvolutionPayload(await response.json()) };
  } catch (error: any) {
    return { ok: false, items: [], error: error?.message || 'No se pudo consultar Evolution API' };
  }
}

function normalizeContactJid(rawJid: unknown): string | null {
  if (!rawJid) return null;

  const jid = String(rawJid).trim();
  if (!jid) return null;

  if (jid.includes('@s.whatsapp.net')) {
    const [user] = jid.split('@');
    const cleanUser = user.split(':')[0];
    return `${cleanUser}@s.whatsapp.net`;
  }

  if (jid.includes('@c.us')) {
    const [user] = jid.split('@');
    return `${user.split(':')[0]}@s.whatsapp.net`;
  }

  if (jid.includes('@')) return null;

  const numeric = jid.replace(/\D/g, '');
  if (numeric.length < 6) return null;

  return `${numeric}@s.whatsapp.net`;
}

function getRemoteJid(item: EvolutionItem): string | null {
  return normalizeContactJid(
    item.remoteJid ??
      item.jid ??
      item.id ??
      item.number ??
      item.key?.remoteJid ??
      item.contact?.remoteJid,
  );
}

function isAllowedContactJid(jid: string): boolean {
  return (
    jid.endsWith('@s.whatsapp.net') &&
    !jid.includes('@lid') &&
    !jid.includes('@broadcast') &&
    !jid.includes('@newsletter') &&
    jid !== 'status@broadcast'
  );
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function getDisplayName(live: EvolutionItem, local: EligibleChat, phone: string): string {
  return (
    firstText(
      local.contact?.name,
      live.pushName,
      live.name,
      live.verifiedName,
      live.notify,
      local.name,
      local.pushName,
    ) || phone
  );
}

function getProfilePic(live: EvolutionItem, local: EligibleChat): string | null {
  return firstText(
    live.profilePicUrl,
    live.profilePictureUrl,
    live.profilePicture,
    live.picture,
    local.profilePicUrl,
  );
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function contactKey(instanceId: number, jid: string): string {
  return `${instanceId}:${jid}`;
}

function mergeLiveItem(current: EvolutionItem | undefined, next: EvolutionItem): EvolutionItem {
  if (!current) return next;

  const merged = { ...current };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }

  return merged;
}

async function getEligibleChats(teamId: number): Promise<Map<string, EligibleChat>> {
  const inboundMessages = await db
    .select({ chatId: messages.chatId })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(chats.teamId, teamId), eq(messages.fromMe, false)))
    .groupBy(messages.chatId);

  const inboundChatIds = inboundMessages.map((message) => message.chatId);
  const interactionConditions = [
    isNotNull(chats.lastCustomerInteraction),
    eq(chats.lastMessageFromMe, false),
  ];

  if (inboundChatIds.length > 0) {
    interactionConditions.push(inArray(chats.id, inboundChatIds));
  }

  const rows = await db.query.chats.findMany({
    where: and(
      eq(chats.teamId, teamId),
      isNotNull(chats.instanceId),
      or(...interactionConditions),
    ),
    orderBy: [desc(chats.lastCustomerInteraction), desc(chats.lastMessageTimestamp)],
    columns: {
      id: true,
      remoteJid: true,
      name: true,
      pushName: true,
      profilePicUrl: true,
      lastMessageText: true,
      lastMessageTimestamp: true,
      lastCustomerInteraction: true,
      instanceId: true,
    },
    with: {
      contact: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  });

  const map = new Map<string, EligibleChat>();
  for (const row of rows) {
    if (!row.instanceId) continue;
    const jid = normalizeContactJid(row.remoteJid);
    if (!jid || !isAllowedContactJid(jid)) continue;
    map.set(contactKey(row.instanceId, jid), row);
  }

  return map;
}

async function loadInstanceContacts(
  instance: { id: number; instanceName: string; accessToken: string | null },
  eligibleChats: Map<string, EligibleChat>,
): Promise<{ rows: TodoContactoRow[]; summary: InstanceSummary }> {
  if (!instance.accessToken) {
    return {
      rows: [],
      summary: {
        id: instance.id,
        name: instance.instanceName,
        count: 0,
        status: 'skipped',
        message: 'Sin token de acceso',
      },
    };
  }

  const [contactsResult, chatsResult] = await Promise.all([
    fetchEvolutionArray(instance.instanceName, instance.accessToken, 'findContacts'),
    fetchEvolutionArray(instance.instanceName, instance.accessToken, 'findChats'),
  ]);

  if (!contactsResult.ok && !chatsResult.ok) {
    return {
      rows: [],
      summary: {
        id: instance.id,
        name: instance.instanceName,
        count: 0,
        status: 'error',
        message: contactsResult.error || chatsResult.error || 'No se pudo consultar Evolution API',
      },
    };
  }

  const liveByJid = new Map<string, EvolutionItem>();
  for (const item of [...contactsResult.items, ...chatsResult.items]) {
    const jid = getRemoteJid(item);
    if (!jid || !isAllowedContactJid(jid)) continue;
    liveByJid.set(jid, mergeLiveItem(liveByJid.get(jid), item));
  }

  const rows: TodoContactoRow[] = [];
  for (const [jid, live] of liveByJid.entries()) {
    const local = eligibleChats.get(contactKey(instance.id, jid));
    if (!local) continue;

    const phone = jid.split('@')[0];
    rows.push({
      id: `${instance.id}-${jid}`,
      instanceId: instance.id,
      instanceName: instance.instanceName,
      remoteJid: jid,
      phone,
      name: getDisplayName(live, local, phone),
      profilePicUrl: getProfilePic(live, local),
      chatId: local.id,
      savedContactId: local.contact?.id ?? null,
      lastMessageText: local.lastMessageText,
      lastMessageAt: toIso(local.lastMessageTimestamp),
      lastCustomerInteractionAt: toIso(local.lastCustomerInteraction),
      chatHref: `/dashboard/chat/${phone}?instanceId=${instance.id}`,
    });
  }

  rows.sort((a, b) => {
    const aTime = a.lastCustomerInteractionAt || a.lastMessageAt || '';
    const bTime = b.lastCustomerInteractionAt || b.lastMessageAt || '';
    return bTime.localeCompare(aTime);
  });

  return {
    rows,
    summary: {
      id: instance.id,
      name: instance.instanceName,
      count: rows.length,
      status: contactsResult.ok || chatsResult.ok ? 'ok' : 'error',
      message: !contactsResult.ok || !chatsResult.ok ? contactsResult.error || chatsResult.error : undefined,
    },
  };
}

export default async function TodosLosContactosPage({ params }: PageProps) {
  const { locale } = await params;
  const user = await getUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const team = await getTeamForUser();
  if (!team) {
    redirect(`/${locale}/sign-in`);
  }

  const instances = await db.query.evolutionInstances.findMany({
    where: eq(evolutionInstances.teamId, team.id),
    orderBy: [asc(evolutionInstances.instanceName)],
    columns: {
      id: true,
      instanceName: true,
      accessToken: true,
    },
  });

  const eligibleChats = await getEligibleChats(team.id);
  const loaded = await Promise.all(
    instances.map((instance) => loadInstanceContacts(instance, eligibleChats)),
  );

  const contacts = loaded.flatMap((item) => item.rows);
  contacts.sort((a, b) => {
    const aTime = a.lastCustomerInteractionAt || a.lastMessageAt || '';
    const bTime = b.lastCustomerInteractionAt || b.lastMessageAt || '';
    return bTime.localeCompare(aTime);
  });

  return (
    <TodosLosContactosTable
      contacts={contacts}
      instances={loaded.map((item) => item.summary)}
      fetchedAt={new Date().toISOString()}
    />
  );
}
