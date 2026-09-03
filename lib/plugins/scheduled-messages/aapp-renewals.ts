import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  chats,
  evolutionInstances,
  messages,
  teamAappRenewalCandidates,
  teamAappRenewalConfigs,
  teamCustomerStores,
  teamCustomers,
  teamMembershipPlans,
  teamMembershipSubscriptions,
  type AappRenewalRecipientSource,
  type AappRenewalRuleKey,
  type AappRenewalTemplates,
  type TeamAappRenewalConfig,
} from '@/lib/db/schema';
import { pusherServer } from '@/lib/pusher-server';

export const AAPP_RENEWAL_RULES: Array<{ key: AappRenewalRuleKey; offsetDays: number }> = [
  { key: 'before_30', offsetDays: -30 },
  { key: 'before_14', offsetDays: -14 },
  { key: 'before_3', offsetDays: -3 },
  { key: 'expired', offsetDays: 1 },
];

export const DEFAULT_AAPP_RENEWAL_TEMPLATES: AappRenewalTemplates = {
  before_30: 'Hola {nombre}, te recordamos que tu servicio {plan} vence el {fecha_vencimiento}. Si querés renovarlo, respondé este mensaje y te ayudamos.',
  before_14: 'Hola {nombre}, faltan 2 semanas para el vencimiento de tu servicio {plan}, el {fecha_vencimiento}. ¿Querés que gestionemos la renovación?',
  before_3: 'Hola {nombre}, tu servicio {plan} vence el {fecha_vencimiento}, dentro de 3 días. Respondé este mensaje para renovarlo y evitar interrupciones.',
  expired: 'Hola {nombre}, tu servicio {plan} venció el {fecha_vencimiento}. Podemos ayudarte a renovarlo; respondé este mensaje para continuar.',
};

export const DEFAULT_AAPP_RENEWAL_RULE_KEYS = AAPP_RENEWAL_RULES.map((rule) => rule.key);

export type AappRenewalConfigInput = {
  enabled: boolean;
  instanceId: number | null;
  recipientSource: AappRenewalRecipientSource;
  sendHour: number;
  sendMinute: number;
  timezone: string;
  templates: AappRenewalTemplates;
  enabledRuleKeys: AappRenewalRuleKey[];
};

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localDateString(date: Date, timeZone: string) {
  const p = dateParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function zonedDateTimeToUtc(dateString: string, hour: number, minute: number, timeZone: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = desired;
  for (let iteration = 0; iteration < 3; iteration++) {
    const actual = dateParts(new Date(guess), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, 0);
    guess += desired - represented;
  }
  return new Date(guess);
}

export function nextConfiguredSendAt(config: Pick<TeamAappRenewalConfig, 'sendHour' | 'sendMinute' | 'timezone'>, dueDate: string, now = new Date()) {
  const due = zonedDateTimeToUtc(dueDate, config.sendHour, config.sendMinute, config.timezone);
  if (due > now) return due;
  const today = localDateString(now, config.timezone);
  const todaySlot = zonedDateTimeToUtc(today, config.sendHour, config.sendMinute, config.timezone);
  return todaySlot > now
    ? todaySlot
    : zonedDateTimeToUtc(addDays(today, 1), config.sendHour, config.sendMinute, config.timezone);
}

export function renderAappRenewalTemplate(template: string, values: { name: string; plan: string; expirationDate: string }) {
  const formattedDate = values.expirationDate.split('-').reverse().join('/');
  return template
    .replaceAll('{nombre}', values.name)
    .replaceAll('{plan}', values.plan)
    .replaceAll('{fecha_vencimiento}', formattedDate);
}

export async function ensureAappRenewalConfig(teamId: number, userId?: number | null, timezone = 'UTC') {
  const existing = await db.query.teamAappRenewalConfigs.findFirst({ where: eq(teamAappRenewalConfigs.teamId, teamId) });
  if (existing) return existing;
  const safeTimezone = isValidTimeZone(timezone) ? timezone : 'UTC';
  const [created] = await db.insert(teamAappRenewalConfigs).values({
    teamId,
    timezone: safeTimezone,
    templates: DEFAULT_AAPP_RENEWAL_TEMPLATES,
    enabledRuleKeys: DEFAULT_AAPP_RENEWAL_RULE_KEYS,
    createdBy: userId ?? null,
    updatedBy: userId ?? null,
  }).onConflictDoNothing().returning();
  return created ?? db.query.teamAappRenewalConfigs.findFirst({ where: eq(teamAappRenewalConfigs.teamId, teamId) });
}

export async function auditAappRenewal(teamId: number, userId: number | null, action: string, details?: Record<string, unknown>) {
  await db.insert(activityLogs).values({
    teamId,
    userId,
    action: JSON.stringify({ source: 'aapp_space_renewals', action, ...details }),
  });
}

function normalizePhone(value: string | null | undefined) {
  const phone = String(value ?? '').replace(/\D/g, '').replace(/^00/, '');
  return phone.length >= 7 ? phone : '';
}

function publicStoreUrl(cardUrl: string | null) {
  const value = String(cardUrl ?? '').trim();
  if (!value) return null;
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://aapp.space/${value.replace(/^\/+/, '')}`);
  if (url.protocol !== 'https:' || (url.hostname !== 'aapp.space' && !url.hostname.endsWith('.aapp.space'))) return null;
  return url.toString();
}

function extractWhatsappPhone(html: string) {
  const decoded = html.replaceAll('&amp;', '&');
  const patterns = [
    /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp\.com\/send\/?\?phone=)(\+?[\d\s().-]{7,25})/gi,
    /[?&]phone=(\+?\d{7,20})/gi,
  ];
  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern)) {
      const phone = normalizePhone(match[1]);
      if (phone.length >= 7) return phone;
    }
  }
  return null;
}

export async function refreshAappStorePhones(teamId: number) {
  const stores = await db.select({
    id: teamCustomerStores.id,
    cardUrl: teamCustomerStores.cardUrl,
  }).from(teamCustomerStores).where(eq(teamCustomerStores.teamId, teamId)).orderBy(asc(teamCustomerStores.id));
  let resolved = 0;
  let checked = 0;
  for (let index = 0; index < stores.length; index += 12) {
    const batch = stores.slice(index, index + 12);
    await Promise.all(batch.map(async (store) => {
      const url = publicStoreUrl(store.cardUrl);
      if (!url) return;
      checked++;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: 'follow' });
        if (!response.ok) return;
        const phone = extractWhatsappPhone(await response.text());
        await db.update(teamCustomerStores).set({
          whatsappPhone: phone,
          whatsappPhoneResolvedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(eq(teamCustomerStores.id, store.id), eq(teamCustomerStores.teamId, teamId)));
        if (phone) resolved++;
      } catch (error) {
        console.warn(`[aapp-renewals] Could not inspect store ${store.id}`, error);
      }
    }));
  }
  return { checked, resolved };
}

type RecipientResolution = {
  phone: string | null;
  requestedSource: AappRenewalRecipientSource;
  resolvedSource: AappRenewalRecipientSource | null;
  storeId: number | null;
  usedAccountFallback: boolean;
};

export type AappRenewalRecipientOption = {
  key: string;
  source: AappRenewalRecipientSource;
  phone: string;
  storeId: number | null;
  title: string | null;
  url: string | null;
};

export async function listAappRenewalRecipientOptions(
  teamId: number,
  customerId: number | null,
): Promise<AappRenewalRecipientOption[]> {
  if (!customerId) return [];
  const customer = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, teamId)),
    columns: { phone: true },
  });
  if (!customer) return [];

  const options: AappRenewalRecipientOption[] = [];
  const accountPhone = normalizePhone(customer.phone);
  if (accountPhone) {
    options.push({
      key: 'account',
      source: 'account',
      phone: accountPhone,
      storeId: null,
      title: null,
      url: null,
    });
  }

  const stores = await db.select({
    id: teamCustomerStores.id,
    cardType: teamCustomerStores.cardType,
    title: teamCustomerStores.title,
    cardUrl: teamCustomerStores.cardUrl,
    customDomain: teamCustomerStores.customDomain,
    phone: teamCustomerStores.whatsappPhone,
  }).from(teamCustomerStores).where(and(
    eq(teamCustomerStores.teamId, teamId),
    eq(teamCustomerStores.customerId, customerId),
  )).orderBy(asc(teamCustomerStores.id));

  for (const store of stores) {
    const phone = normalizePhone(store.phone);
    if (!phone) continue;
    options.push({
      key: `store:${store.id}`,
      source: store.cardType === 'store' ? 'store' : 'website',
      phone,
      storeId: store.id,
      title: store.title?.trim() || null,
      url: store.customDomain?.trim() || store.cardUrl?.trim() || null,
    });
  }
  return options;
}

export async function resolveAappRenewalRecipientOption(
  teamId: number,
  customerId: number | null,
  optionKey: string,
): Promise<RecipientResolution> {
  const options = await listAappRenewalRecipientOptions(teamId, customerId);
  const option = options.find((candidate) => candidate.key === optionKey);
  if (!option) throw new Error('El número seleccionado ya no está disponible para este cliente');
  return {
    phone: option.phone,
    requestedSource: option.source,
    resolvedSource: option.source,
    storeId: option.storeId,
    usedAccountFallback: false,
  };
}

export async function resolveAappRenewalRecipient(teamId: number, customerId: number | null, source: AappRenewalRecipientSource): Promise<RecipientResolution> {
  if (!customerId) return { phone: null, requestedSource: source, resolvedSource: null, storeId: null, usedAccountFallback: false };
  const customer = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, teamId)),
    columns: { phone: true },
  });
  const accountPhone = normalizePhone(customer?.phone);
  if (source === 'account') {
    return { phone: accountPhone || null, requestedSource: source, resolvedSource: accountPhone ? 'account' : null, storeId: null, usedAccountFallback: false };
  }
  const cardTypeCondition = source === 'website'
    ? or(eq(teamCustomerStores.cardType, 'vcard'), isNull(teamCustomerStores.cardType), ne(teamCustomerStores.cardType, 'store'))
    : eq(teamCustomerStores.cardType, 'store');
  const stores = await db.select({ id: teamCustomerStores.id, phone: teamCustomerStores.whatsappPhone })
    .from(teamCustomerStores)
    .where(and(
      eq(teamCustomerStores.teamId, teamId),
      eq(teamCustomerStores.customerId, customerId),
      cardTypeCondition,
    ))
    .orderBy(asc(teamCustomerStores.id));
  const store = stores.find((row) => normalizePhone(row.phone));
  if (store) {
    return { phone: normalizePhone(store.phone), requestedSource: source, resolvedSource: source, storeId: store.id, usedAccountFallback: false };
  }
  return {
    phone: accountPhone || null,
    requestedSource: source,
    resolvedSource: accountPhone ? 'account' : null,
    storeId: null,
    usedAccountFallback: Boolean(accountPhone),
  };
}

export async function materializeAappRenewalCandidates(
  teamId: number,
  actorUserId: number | null = null,
  options: { refreshPending?: boolean } = {},
) {
  const config = await ensureAappRenewalConfig(teamId, actorUserId);
  if (!config) throw new Error('Could not create AAPP Space renewal configuration');

  const subscriptions = await db.select({
    id: teamMembershipSubscriptions.id,
    customerId: teamMembershipSubscriptions.customerId,
    status: teamMembershipSubscriptions.status,
    endDate: teamMembershipSubscriptions.endDate,
    planName: teamMembershipSubscriptions.planNameSnapshot,
    customerName: teamCustomers.name,
    planFallback: teamMembershipPlans.name,
  }).from(teamMembershipSubscriptions)
    .leftJoin(teamCustomers, eq(teamMembershipSubscriptions.customerId, teamCustomers.id))
    .leftJoin(teamMembershipPlans, eq(teamMembershipSubscriptions.planId, teamMembershipPlans.id))
    .where(and(
      eq(teamMembershipSubscriptions.teamId, teamId),
      eq(teamMembershipSubscriptions.externalSource, 'aapp_space'),
      isNotNull(teamMembershipSubscriptions.endDate),
      inArray(teamMembershipSubscriptions.status, ['active', 'expired']),
    ));

  const subscriptionIds = subscriptions.map((subscription) => subscription.id);
  const existingByKey = new Map<string, string>();
  if (subscriptionIds.length) {
    const currentExpirations = new Map(subscriptions.map((subscription) => [subscription.id, subscription.endDate!]));
    const existing = await db.select({
      id: teamAappRenewalCandidates.id,
      subscriptionId: teamAappRenewalCandidates.subscriptionId,
      ruleKey: teamAappRenewalCandidates.ruleKey,
      expirationDate: teamAappRenewalCandidates.expirationDate,
      status: teamAappRenewalCandidates.status,
    }).from(teamAappRenewalCandidates).where(and(
      eq(teamAappRenewalCandidates.teamId, teamId),
      inArray(teamAappRenewalCandidates.subscriptionId, subscriptionIds),
    ));
    for (const candidate of existing) {
      existingByKey.set(`${candidate.subscriptionId}:${candidate.ruleKey}:${candidate.expirationDate}`, candidate.status);
    }
    const obsoleteIds = existing
      .filter((candidate) =>
        ['pending', 'approved', 'rejected', 'failed'].includes(candidate.status)
        && currentExpirations.get(candidate.subscriptionId) !== candidate.expirationDate,
      )
      .map((candidate) => candidate.id);
    if (obsoleteIds.length) {
      await db.update(teamAappRenewalCandidates).set({ status: 'cancelled', updatedAt: new Date() })
        .where(inArray(teamAappRenewalCandidates.id, obsoleteIds));
    }
  }

  const today = localDateString(new Date(), config.timezone);
  let created = 0;
  let updated = 0;
  for (const subscription of subscriptions) {
    if (!subscription.endDate) continue;
    const isExpired = subscription.endDate < today || subscription.status === 'expired';
    const rules = AAPP_RENEWAL_RULES.filter((rule) => {
      if (!config.enabledRuleKeys.includes(rule.key)) return false;
      if (isExpired) return rule.key === 'expired';
      return addDays(subscription.endDate!, rule.offsetDays) >= today;
    }).filter((rule) => {
      const status = existingByKey.get(`${subscription.id}:${rule.key}:${subscription.endDate}`);
      return !status || (options.refreshPending === true && status === 'pending');
    });
    if (!rules.length) continue;
    const recipient = await resolveAappRenewalRecipient(teamId, subscription.customerId, config.recipientSource);
    for (const rule of rules) {
      const dueDate = addDays(subscription.endDate, rule.offsetDays);
      const message = renderAappRenewalTemplate(config.templates[rule.key], {
        name: subscription.customerName || 'cliente',
        plan: subscription.planName || subscription.planFallback || 'AAPP Space',
        expirationDate: subscription.endDate,
      });
      const [candidate] = await db.insert(teamAappRenewalCandidates).values({
        teamId,
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        ruleKey: rule.key,
        expirationDate: subscription.endDate,
        dueDate,
        sendAt: zonedDateTimeToUtc(dueDate, config.sendHour, config.sendMinute, config.timezone),
        requestedRecipientSource: config.recipientSource,
        resolvedRecipientSource: recipient.resolvedSource,
        recipientPhone: recipient.phone,
        recipientStoreId: recipient.storeId,
        usedAccountFallback: recipient.usedAccountFallback,
        message,
        instanceId: config.instanceId,
      }).onConflictDoNothing().returning({ id: teamAappRenewalCandidates.id });
      if (candidate) {
        created++;
      } else if (options.refreshPending) {
        await db.update(teamAappRenewalCandidates).set({
          requestedRecipientSource: config.recipientSource,
          resolvedRecipientSource: recipient.resolvedSource,
          recipientPhone: recipient.phone,
          recipientStoreId: recipient.storeId,
          usedAccountFallback: recipient.usedAccountFallback,
          message,
          instanceId: config.instanceId,
          sendAt: zonedDateTimeToUtc(dueDate, config.sendHour, config.sendMinute, config.timezone),
          updatedAt: new Date(),
        }).where(and(
          eq(teamAappRenewalCandidates.teamId, teamId),
          eq(teamAappRenewalCandidates.subscriptionId, subscription.id),
          eq(teamAappRenewalCandidates.ruleKey, rule.key),
          eq(teamAappRenewalCandidates.expirationDate, subscription.endDate),
          eq(teamAappRenewalCandidates.status, 'pending'),
        ));
        updated++;
      }
    }
  }
  if (created || updated) await auditAappRenewal(teamId, actorUserId, 'materialized', { created, updated });
  return { created, updated, subscriptions: subscriptions.length };
}

export async function listAappRenewalCandidates(teamId: number) {
  return db.select({
    id: teamAappRenewalCandidates.id,
    subscriptionId: teamAappRenewalCandidates.subscriptionId,
    customerId: teamAappRenewalCandidates.customerId,
    customerName: teamCustomers.name,
    planName: teamMembershipSubscriptions.planNameSnapshot,
    ruleKey: teamAappRenewalCandidates.ruleKey,
    expirationDate: teamAappRenewalCandidates.expirationDate,
    dueDate: teamAappRenewalCandidates.dueDate,
    sendAt: teamAappRenewalCandidates.sendAt,
    status: teamAappRenewalCandidates.status,
    requestedRecipientSource: teamAappRenewalCandidates.requestedRecipientSource,
    resolvedRecipientSource: teamAappRenewalCandidates.resolvedRecipientSource,
    recipientPhone: teamAappRenewalCandidates.recipientPhone,
    usedAccountFallback: teamAappRenewalCandidates.usedAccountFallback,
    message: teamAappRenewalCandidates.message,
    instanceId: teamAappRenewalCandidates.instanceId,
    messageId: teamAappRenewalCandidates.messageId,
    error: teamAappRenewalCandidates.error,
    approvedAt: teamAappRenewalCandidates.approvedAt,
    rejectedAt: teamAappRenewalCandidates.rejectedAt,
    sentAt: teamAappRenewalCandidates.sentAt,
    createdAt: teamAappRenewalCandidates.createdAt,
    updatedAt: teamAappRenewalCandidates.updatedAt,
  }).from(teamAappRenewalCandidates)
    .leftJoin(teamCustomers, eq(teamAappRenewalCandidates.customerId, teamCustomers.id))
    .leftJoin(teamMembershipSubscriptions, eq(teamAappRenewalCandidates.subscriptionId, teamMembershipSubscriptions.id))
    .where(eq(teamAappRenewalCandidates.teamId, teamId))
    .orderBy(asc(teamAappRenewalCandidates.sendAt), asc(teamAappRenewalCandidates.id));
}

export async function applyAappRenewalAction(args: {
  teamId: number;
  userId: number;
  ids: number[];
  action: 'approve' | 'reject' | 'revoke' | 'reopen' | 'retry';
}) {
  const config = await ensureAappRenewalConfig(args.teamId, args.userId);
  if (!config) throw new Error('AAPP Space renewal configuration not found');
  const transitions = {
    approve: { from: ['pending'], to: 'approved' },
    reject: { from: ['pending'], to: 'rejected' },
    revoke: { from: ['approved'], to: 'pending' },
    reopen: { from: ['rejected'], to: 'pending' },
    retry: { from: ['failed'], to: 'approved' },
  } as const;
  const transition = transitions[args.action];
  const approving = args.action === 'approve' || args.action === 'retry';
  if (approving && !config.enabled) return { changed: 0, skipped: args.ids.length };
  const candidates = await db.select().from(teamAappRenewalCandidates).where(and(
    eq(teamAappRenewalCandidates.teamId, args.teamId),
    inArray(teamAappRenewalCandidates.id, args.ids),
    inArray(teamAappRenewalCandidates.status, [...transition.from]),
  ));
  let changed = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    if (approving && (!candidate.recipientPhone || !candidate.instanceId)) {
      skipped++;
      continue;
    }
    const values: Partial<typeof teamAappRenewalCandidates.$inferInsert> = {
      status: transition.to,
      error: null,
      updatedAt: new Date(),
    };
    if (approving) {
      values.sendAt = nextConfiguredSendAt(config, candidate.dueDate);
      values.approvedBy = args.userId;
      values.approvedAt = new Date();
    } else if (args.action === 'reject') {
      values.rejectedBy = args.userId;
      values.rejectedAt = new Date();
    } else {
      values.approvedBy = null;
      values.approvedAt = null;
      if (args.action === 'reopen') {
        values.rejectedBy = null;
        values.rejectedAt = null;
      }
    }
    const updated = await db.update(teamAappRenewalCandidates).set(values).where(and(
      eq(teamAappRenewalCandidates.id, candidate.id),
      eq(teamAappRenewalCandidates.teamId, args.teamId),
      eq(teamAappRenewalCandidates.status, candidate.status),
    )).returning({ id: teamAappRenewalCandidates.id });
    changed += updated.length;
  }
  await auditAappRenewal(args.teamId, args.userId, args.action, { ids: args.ids, changed });
  return { changed, skipped };
}

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';

async function safePusherTrigger(channel: string, event: string, data: unknown) {
  try { await pusherServer.trigger(channel, event, data); }
  catch (error) { console.error(`[aapp-renewals] Pusher ${channel}/${event}`, error); }
}

async function sendCandidate(candidate: typeof teamAappRenewalCandidates.$inferSelect) {
  const config = await db.query.teamAappRenewalConfigs.findFirst({
    where: and(eq(teamAappRenewalConfigs.teamId, candidate.teamId), eq(teamAappRenewalConfigs.enabled, true)),
    columns: { id: true },
  });
  if (!config) throw new Error('La secuencia de renovaciones de AAPP Space está desactivada');
  if (!candidate.instanceId) throw new Error('No hay una instancia de WhatsApp configurada');
  const phone = normalizePhone(candidate.recipientPhone);
  if (!phone) throw new Error('El cliente no tiene un número de WhatsApp disponible');
  const instance = await db.query.evolutionInstances.findFirst({
    where: and(eq(evolutionInstances.id, candidate.instanceId), eq(evolutionInstances.teamId, candidate.teamId)),
    columns: { id: true, accessToken: true, instanceName: true },
  });
  if (!instance?.accessToken) throw new Error('La instancia de WhatsApp no está disponible');
  const remoteJid = `${phone}@s.whatsapp.net`;
  let chat = await db.query.chats.findFirst({
    where: and(eq(chats.teamId, candidate.teamId), eq(chats.instanceId, instance.id), eq(chats.remoteJid, remoteJid)),
    columns: { id: true },
  });
  if (!chat) {
    const [created] = await db.insert(chats).values({
      teamId: candidate.teamId,
      instanceId: instance.id,
      remoteJid,
      name: phone,
    }).onConflictDoNothing().returning({ id: chats.id });
    chat = created ?? await db.query.chats.findFirst({
      where: and(eq(chats.teamId, candidate.teamId), eq(chats.instanceId, instance.id), eq(chats.remoteJid, remoteJid)),
      columns: { id: true },
    });
  }
  if (!chat) throw new Error('No se pudo crear el chat del destinatario');
  const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance.instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: instance.accessToken },
    body: JSON.stringify({ number: phone, text: candidate.message }),
    signal: AbortSignal.timeout(10000),
  });
  const responseData = await response.json().catch(() => null);
  const messageId = responseData?.key?.id as string | undefined;
  if (!response.ok || !messageId) throw new Error(responseData?.message || `Evolution returned ${response.status}`);
  const timestamp = new Date();
  const scheduledMessage = {
    id: messageId,
    chatId: chat.id,
    fromMe: true,
    messageType: 'scheduled_aapp_space',
    text: candidate.message,
    timestamp,
    status: 'sent' as const,
    isInternal: false,
    isAi: false,
    isAutomation: false,
  };
  const [savedMessage] = await db.insert(messages).values(scheduledMessage).onConflictDoUpdate({
    target: messages.id,
    set: { chatId: chat.id, fromMe: true, messageType: 'scheduled_aapp_space', text: candidate.message, status: 'sent' },
  }).returning();
  await db.update(chats).set({
    lastMessageText: candidate.message,
    lastMessageTimestamp: timestamp,
    lastMessageFromMe: true,
    lastMessageStatus: 'sent',
    unreadCount: 0,
  }).where(eq(chats.id, chat.id));
  const channel = `team-${candidate.teamId}`;
  await safePusherTrigger(channel, 'new-message', {
    ...(savedMessage ?? scheduledMessage),
    timestamp: timestamp.toISOString(),
    remoteJid,
    instance: instance.instanceName,
    instanceId: instance.id,
  });
  await safePusherTrigger(channel, 'message-origin-update', { messageId, messageType: 'scheduled_aapp_space' });
  await safePusherTrigger(channel, 'chat-list-update', {
    id: chat.id,
    remoteJid,
    instanceId: instance.id,
    lastMessageText: candidate.message,
    lastMessageTimestamp: timestamp.toISOString(),
    lastMessageFromMe: true,
    lastMessageStatus: 'sent',
    unreadCount: 0,
  });
  return { messageId, timestamp };
}

export async function processDueAappRenewals(now = new Date()) {
  const due = await db.select().from(teamAappRenewalCandidates).where(and(
    eq(teamAappRenewalCandidates.status, 'approved'),
    isNotNull(teamAappRenewalCandidates.sendAt),
    lte(teamAappRenewalCandidates.sendAt, now),
  )).orderBy(asc(teamAappRenewalCandidates.sendAt)).limit(100);
  let processed = 0;
  const errors: Array<{ id: number; error: string }> = [];
  for (const candidate of due) {
    const [claimed] = await db.update(teamAappRenewalCandidates).set({ status: 'sending', updatedAt: new Date() })
      .where(and(eq(teamAappRenewalCandidates.id, candidate.id), eq(teamAappRenewalCandidates.status, 'approved')))
      .returning();
    if (!claimed) continue;
    try {
      const result = await sendCandidate(claimed);
      await db.update(teamAappRenewalCandidates).set({
        status: 'sent',
        sentAt: result.timestamp,
        messageId: result.messageId,
        error: null,
        updatedAt: new Date(),
      }).where(and(eq(teamAappRenewalCandidates.id, claimed.id), eq(teamAappRenewalCandidates.status, 'sending')));
      await auditAappRenewal(claimed.teamId, null, 'sent', { candidateId: claimed.id, messageId: result.messageId });
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(teamAappRenewalCandidates).set({ status: 'failed', error: message, updatedAt: new Date() })
        .where(and(eq(teamAappRenewalCandidates.id, claimed.id), eq(teamAappRenewalCandidates.status, 'sending')));
      await auditAappRenewal(claimed.teamId, null, 'failed', { candidateId: claimed.id, error: message });
      errors.push({ id: claimed.id, error: message });
    }
  }
  return { processed, errors };
}
