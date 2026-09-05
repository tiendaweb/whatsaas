import { normalizeCurrency } from '@/lib/format/money';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  teamPlugins,
  chats,
  contacts,
  customFields,
  teamAappConnections,
  teamCustomerContacts,
  teamCustomers,
  teamCustomerStores,
  teamCustomerTransactions,
  teamMembershipCompanies,
  teamMembershipPlans,
  teamMembershipSubscriptions,
  type MembershipFeature,
} from '@/lib/db/schema';
import { AappError, aappFetchAllPages } from './client';

type Row = Record<string, unknown>;

/**
 * La API de AAPP devuelve, en algunas transacciones, el nombre de la acción
 * dentro de `currency` ("enable_disable_nfc_card_order_website"). Guardarlo tal
 * cual dejaba filas que después tumbaban cualquier pantalla que las formateara
 * con `Intl`. Lo que no tiene forma de ISO-4217 no se guarda.
 */

/**
 * Moneda de las membresías importadas.
 *
 * La API de AAPP SPACE devuelve `plan_price` y NINGÚN campo de moneda —
 * verificado contra `/plans`. El código anterior hacía `|| 'USD'`, así que las
 * 225 suscripciones importadas quedaron etiquetadas en dólares con importes que
 * son pesos: "Sitio Web Profesional, 200.000 USD" cuando el cliente pagó
 * $200.000 ARS por Personal Pay. Cualquier total por moneda —el panel del chat,
 * el conector, Finanzas— sumaba pesos en la columna de dólares.
 *
 * Ahora sale de la configuración del plugin de membresías del equipo, que es
 * editable y auditable, y sólo si no hay nada configurado cae a ARS: la
 * plataforma y sus pasarelas de cobro son argentinas. El literal 'USD' no
 * vuelve, porque era una suposición disfrazada de default.
 */
async function membershipCurrency(teamId: number) {
  const [fila] = await db
    .select({ settings: teamPlugins.settings })
    .from(teamPlugins)
    .where(and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, 'memberships')))
    .limit(1);
  const configurada = (fila?.settings as Record<string, unknown> | null)?.defaultCurrency;
  if (typeof configurada === 'string' && /^[A-Za-z]{3}$/.test(configurada)) return configurada.toUpperCase();
  return 'ARS';
}

export type AappSyncSummary = { plans: number; customers: number; linkedContacts: number; subscriptions: number; stores: number; transactions: number };

const value = (row: Row, ...keys: string[]) => keys.map((key) => row[key]).find((item) => item !== undefined && item !== null);
const stringValue = (row: Row, ...keys: string[]) => String(value(row, ...keys) ?? '').trim();
const externalId = (row: Row, ...keys: string[]) => stringValue(row, ...keys);
const validDate = (input: unknown): string | null => {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const timestamp = (input: unknown): Date | null => {
  const date = new Date(String(input ?? ''));
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalizePhone = (input: unknown) => String(input ?? '').replace(/\D/g, '').replace(/^00/, '');

function billing(validityInput: unknown) {
  const validity = Number(validityInput ?? 0);
  if (validity >= 3650) return { billingType: 'lifetime', billingLabel: null };
  if (validity >= 330 && validity <= 400) return { billingType: 'annual', billingLabel: null };
  if (validity >= 25 && validity <= 35) return { billingType: 'monthly', billingLabel: null };
  return { billingType: 'custom', billingLabel: validity > 0 ? `${validity} días` : null };
}

function planFeatures(row: Row): MembershipFeature[] {
  const definitions: Array<[string[], string]> = [
    [['no_of_stores', 'stores'], 'Tiendas'],
    [['no_of_vcards', 'vcards'], 'vCards'],
    [['custom_domain'], 'Dominio personalizado'],
    [['pwa'], 'Aplicación PWA'],
    [['ai_credits'], 'Créditos de IA'],
  ];
  const features: MembershipFeature[] = [];
  for (const [keys, label] of definitions) {
    const raw = value(row, ...keys);
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw === 'boolean' || ['0', '1', 'true', 'false', 'yes', 'no'].includes(String(raw).toLowerCase())) {
      const enabled = raw === true || ['1', 'true', 'yes'].includes(String(raw).toLowerCase());
      features.push({ label, type: enabled ? 'included' : 'excluded' });
    } else {
      features.push({ label, type: 'quantity', value: String(raw) });
    }
  }
  return features;
}

function customerStatus(raw: unknown): string {
  const status = String(raw ?? '').toLowerCase();
  if (['inactive', 'disabled', 'suspended', '0'].includes(status)) return 'inactive';
  if (['archived', 'deleted'].includes(status)) return 'archived';
  return 'active';
}

function subscriptionStatus(raw: unknown, endDate: string | null): 'active' | 'pending' | 'expired' | 'cancelled' {
  const status = String(raw ?? '').toLowerCase();
  if (['cancelled', 'canceled', 'deleted'].includes(status)) return 'cancelled';
  if (['pending', 'inactive', 'disabled', 'suspended', '0'].includes(status)) return 'pending';
  if (endDate && endDate < new Date().toISOString().slice(0, 10)) return 'expired';
  return 'active';
}

async function loadStores(apiKey: string) {
  const load = async (path: string) => {
    try { return await aappFetchAllPages<Row>(apiKey, path); }
    catch (error) { if (error instanceof AappError && error.status === 404) return []; throw error; }
  };
  const [stores, cards] = await Promise.all([load('/stores'), load('/cards')]);
  const unique = new Map<string, Row>();
  for (const row of [...stores, ...cards]) {
    const id = externalId(row, 'card_id', 'store_id', 'id');
    if (id) unique.set(id, row);
  }
  return Array.from(unique.values());
}

export async function syncTeamAapp(teamId: number, apiKey: string): Promise<AappSyncSummary> {
  const summary: AappSyncSummary = { plans: 0, customers: 0, linkedContacts: 0, subscriptions: 0, stores: 0, transactions: 0 };
  const now = new Date();
  try {
    const [plans, users, stores, transactions] = await Promise.all([
      aappFetchAllPages<Row>(apiKey, '/plans'),
      aappFetchAllPages<Row>(apiKey, '/users'),
      loadStores(apiKey),
      aappFetchAllPages<Row>(apiKey, '/transactions'),
    ]);

    const [company] = await db.insert(teamMembershipCompanies).values({
      teamId, name: 'AAPP SPACE', description: 'Clientes y membresías sincronizados desde AAPP SPACE.',
      website: 'https://aapp.space', externalSource: 'aapp_space', externalId: 'aapp_space', updatedAt: now,
    }).onConflictDoUpdate({
      target: [teamMembershipCompanies.teamId, teamMembershipCompanies.externalSource, teamMembershipCompanies.externalId],
      set: { name: 'AAPP SPACE', website: 'https://aapp.space', status: 'active', updatedAt: now },
    }).returning();

    const monedaEquipo = await membershipCurrency(teamId);
    const planIds = new Map<string, number>();
    const planSnapshots = new Map<string, { name: string; price: number; currency: string; billingType: string }>();
    for (const row of plans) {
      const id = externalId(row, 'plan_id', 'id');
      if (!id) continue;
      const mappedBilling = billing(value(row, 'validity', 'plan_validity'));
      const price = Math.round(Number(value(row, 'plan_price', 'price') ?? 0) * 100) || 0;
      const planName = stringValue(row, 'plan_name', 'name') || `Plan ${id}`;
      // Mismo caso que las transacciones: la API mete texto que no es ISO-4217
      // en `currency`. Acá además la columna es varchar(3), así que un valor
      // largo no ensucia una fila: hace fallar el sync ENTERO del equipo.
      const currency = normalizeCurrency(stringValue(row, 'currency')) ?? monedaEquipo;
      const [plan] = await db.insert(teamMembershipPlans).values({
        teamId, companyId: company.id, name: planName,
        description: stringValue(row, 'description'), price, currency,
        billingType: mappedBilling.billingType, billingLabel: mappedBilling.billingLabel,
        features: planFeatures(row), externalSource: 'aapp_space', externalId: id, updatedAt: now,
      }).onConflictDoUpdate({
        target: [teamMembershipPlans.teamId, teamMembershipPlans.externalSource, teamMembershipPlans.externalId],
        set: { companyId: company.id, name: planName, description: stringValue(row, 'description'), price,
          currency, billingType: mappedBilling.billingType, billingLabel: mappedBilling.billingLabel,
          features: planFeatures(row), status: 'active', updatedAt: now },
      }).returning({ id: teamMembershipPlans.id });
      planIds.set(id, plan.id);
      planSnapshots.set(id, { name: planName, price, currency, billingType: mappedBilling.billingType });
      summary.plans++;
    }

    const [contactRows, emailFields] = await Promise.all([
      db.select({ id: contacts.id, remoteJid: chats.remoteJid, customData: contacts.customData }).from(contacts)
        .innerJoin(chats, eq(contacts.chatId, chats.id)).where(eq(contacts.teamId, teamId)),
      db.select({ key: customFields.key, name: customFields.name }).from(customFields).where(eq(customFields.teamId, teamId)),
    ]);
    const contactsByPhone = new Map(contactRows.map((row) => [normalizePhone(row.remoteJid.split('@')[0]), row.id]));
    const emailKeys = new Set(
      emailFields
        .filter((field) => /(^|[^a-z])(e_?mail|correo)([^a-z]|$)/i.test(`${field.key} ${field.name}`))
        .map((field) => field.key),
    );
    const contactsByEmail = new Map<string, number>();
    for (const contact of contactRows) {
      const data = (contact.customData ?? {}) as Record<string, unknown>;
      for (const [key, raw] of Object.entries(data)) {
        if (!emailKeys.has(key) && !/(e_?mail|correo)/i.test(key)) continue;
        const email = String(raw ?? '').trim().toLowerCase();
        if (email && !contactsByEmail.has(email)) contactsByEmail.set(email, contact.id);
      }
    }
    const customerIds = new Map<string, number>();
    for (const row of users) {
      const id = externalId(row, 'user_id', 'id');
      if (!id) continue;
      const [customer] = await db.insert(teamCustomers).values({
        teamId, name: stringValue(row, 'name') || stringValue(row, 'email') || `Cliente ${id}`,
        email: stringValue(row, 'email') || null, phone: stringValue(row, 'mobile_number', 'phone') || null,
        source: 'aapp_space', externalId: id, externalData: row, profileImage: stringValue(row, 'profile_image') || null,
        status: customerStatus(value(row, 'status')), lastSyncedAt: now, updatedAt: now,
      }).onConflictDoUpdate({
        target: [teamCustomers.teamId, teamCustomers.source, teamCustomers.externalId],
        set: { name: stringValue(row, 'name') || stringValue(row, 'email') || `Cliente ${id}`, email: stringValue(row, 'email') || null,
          phone: stringValue(row, 'mobile_number', 'phone') || null, externalData: row, profileImage: stringValue(row, 'profile_image') || null,
          status: customerStatus(value(row, 'status')), lastSyncedAt: now, updatedAt: now },
      }).returning({ id: teamCustomers.id });
      customerIds.set(id, customer.id); summary.customers++;

      const phoneContactId = contactsByPhone.get(normalizePhone(value(row, 'mobile_number', 'phone')));
      const emailContactId = contactsByEmail.get(stringValue(row, 'email').toLowerCase());
      const contactId = phoneContactId ?? emailContactId;
      if (contactId) {
        await db.insert(teamCustomerContacts).values({ teamId, customerId: customer.id, contactId }).onConflictDoNothing();
        summary.linkedContacts++;
      }

      const planExternalId = externalId(row, 'plan_id');
      const planId = planIds.get(planExternalId) ?? null;
      const planSnapshot = planSnapshots.get(planExternalId);
      if (planExternalId || planId) {
        const startDate = validDate(value(row, 'plan_activation_date')) || now.toISOString().slice(0, 10);
        const endDate = validDate(value(row, 'plan_validity'));
        const matchingContactId = contactId ?? null;
        await db.insert(teamMembershipSubscriptions).values({
          teamId, subscriptionNumber: `AAPP-${id}`, planId, companyId: company.id, customerId: customer.id, contactId: matchingContactId,
          externalSource: 'aapp_space', externalId: id, planNameSnapshot: planSnapshot?.name ?? '',
          price: planSnapshot?.price ?? 0, currency: planSnapshot?.currency ?? monedaEquipo, billingType: planSnapshot?.billingType ?? 'custom',
          status: subscriptionStatus(value(row, 'status'), endDate), paymentStatus: 'paid', startDate, endDate, updatedAt: now,
        }).onConflictDoUpdate({
          target: [teamMembershipSubscriptions.teamId, teamMembershipSubscriptions.externalSource, teamMembershipSubscriptions.externalId],
          set: { planId, companyId: company.id, customerId: customer.id, contactId: matchingContactId,
            planNameSnapshot: planSnapshot?.name ?? '', price: planSnapshot?.price ?? 0, currency: planSnapshot?.currency ?? monedaEquipo,
            billingType: planSnapshot?.billingType ?? 'custom', startDate, endDate,
            status: subscriptionStatus(value(row, 'status'), endDate), updatedAt: now },
        });
        summary.subscriptions++;
      }
    }

    for (const row of stores) {
      const id = externalId(row, 'card_id', 'store_id', 'id');
      if (!id) continue;
      const customerId = customerIds.get(externalId(row, 'user_id')) ?? null;
      await db.insert(teamCustomerStores).values({
        teamId, customerId, externalId: id, cardType: stringValue(row, 'card_type', 'type') || null,
        title: stringValue(row, 'title') || null, subTitle: stringValue(row, 'sub_title', 'subtitle') || null,
        cardUrl: stringValue(row, 'card_url') || null, customDomain: stringValue(row, 'custom_domain') || null,
        profileImage: stringValue(row, 'profile', 'profile_image') || null, status: stringValue(row, 'status') || null,
        externalData: row, updatedAt: now,
      }).onConflictDoUpdate({ target: [teamCustomerStores.teamId, teamCustomerStores.externalId], set: {
        customerId, cardType: stringValue(row, 'card_type', 'type') || null, title: stringValue(row, 'title') || null,
        subTitle: stringValue(row, 'sub_title', 'subtitle') || null, cardUrl: stringValue(row, 'card_url') || null,
        customDomain: stringValue(row, 'custom_domain') || null, profileImage: stringValue(row, 'profile', 'profile_image') || null,
        status: stringValue(row, 'status') || null, externalData: row, updatedAt: now,
      }}); summary.stores++;
    }

    const transactionExternalIds = transactions.map((row) => externalId(row, 'gobiz_transaction_id', 'transaction_id', 'id')).filter(Boolean);
    const oldTransactions = transactionExternalIds.length ? await db.select({ externalId: teamCustomerTransactions.externalId, paymentStatus: teamCustomerTransactions.paymentStatus })
      .from(teamCustomerTransactions).where(and(eq(teamCustomerTransactions.teamId, teamId), inArray(teamCustomerTransactions.externalId, transactionExternalIds))) : [];
    const oldStatuses = new Map(oldTransactions.map((row) => [row.externalId, row.paymentStatus]));
    for (const row of transactions) {
      const id = externalId(row, 'gobiz_transaction_id', 'transaction_id', 'id');
      if (!id) continue;
      const customerId = customerIds.get(externalId(row, 'user_id')) ?? null;
      const paymentStatus = stringValue(row, 'payment_status', 'status') || null;
      await db.insert(teamCustomerTransactions).values({ teamId, customerId, externalId: id,
        planExternalId: stringValue(row, 'plan_id') || null, amount: stringValue(row, 'transaction_amount', 'amount', 'total') || null,
        currency: normalizeCurrency(stringValue(row, 'transaction_currency', 'currency')), paymentStatus,
        gateway: stringValue(row, 'payment_gateway_name', 'gateway', 'payment_method') || null,
        transactionDate: timestamp(value(row, 'transaction_date', 'created_at', 'date')), externalData: row,
      }).onConflictDoUpdate({ target: [teamCustomerTransactions.teamId, teamCustomerTransactions.externalId], set: {
        customerId, planExternalId: stringValue(row, 'plan_id') || null, amount: stringValue(row, 'transaction_amount', 'amount', 'total') || null,
        currency: normalizeCurrency(stringValue(row, 'transaction_currency', 'currency')), paymentStatus,
        gateway: stringValue(row, 'payment_gateway_name', 'gateway', 'payment_method') || null,
        transactionDate: timestamp(value(row, 'transaction_date', 'created_at', 'date')), externalData: row,
      }});
      if (oldStatuses.has(id) && oldStatuses.get(id) !== paymentStatus) {
        await db.insert(activityLogs).values({ teamId, action: `aapp_space.payment_status_changed:${id}:${oldStatuses.get(id) ?? ''}->${paymentStatus ?? ''}` });
      }
      summary.transactions++;
    }

    await db.update(teamAappConnections).set({ companyId: company.id, status: 'connected', lastSyncedAt: now, lastSyncStatus: 'success', lastSyncError: null, updatedAt: now })
      .where(eq(teamAappConnections.teamId, teamId));
    await db.insert(activityLogs).values({ teamId, action: `aapp_space.sync_completed:${JSON.stringify(summary)}` });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    await db.update(teamAappConnections).set({ status: 'error', lastSyncStatus: 'error', lastSyncError: message.slice(0, 2000), updatedAt: new Date() })
      .where(eq(teamAappConnections.teamId, teamId));
    console.error('[aapp-space/sync]', { teamId, error });
    throw error;
  }
}
