/**
 * Corrige la moneda de las membresías importadas de AAPP SPACE (equipo 2).
 *
 * AAPP etiqueta todo como USD; ninguna venta fue en dólares. Regla (lib/aapp/currency.ts):
 * país de facturación de las transacciones del cliente → prefijo del teléfono →
 * nombre del plan → ARS. Los planes toman la moneda mayoritaria de sus suscripciones.
 *
 *   npx tsx scripts/fix-membership-currency.ts            # simulación
 *   npx tsx scripts/fix-membership-currency.ts --apply    # escribe y audita
 */
import 'dotenv/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, contacts, teamCustomerTransactions, teamCustomers, teamMembershipPlans, teamMembershipSubscriptions } from '@/lib/db/schema';
import { resolveAappCurrency, type AappCurrency } from '@/lib/aapp/currency';

const TEAM_ID = Number(process.env.TEAM_ID ?? 2);
const APPLY = process.argv.includes('--apply');

function billingCountry(externalData: Record<string, unknown> | null): string | null {
  const raw = externalData?.invoice_details;
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return typeof parsed?.to_billing_country === 'string' ? parsed.to_billing_country : null;
  } catch {
    return null;
  }
}

async function main() {
  const [subs, plans, customers, txs] = await Promise.all([
    db.select().from(teamMembershipSubscriptions).where(eq(teamMembershipSubscriptions.teamId, TEAM_ID)),
    db.select().from(teamMembershipPlans).where(eq(teamMembershipPlans.teamId, TEAM_ID)),
    db.select({ id: teamCustomers.id, phone: teamCustomers.phone, externalId: teamCustomers.externalId, externalData: teamCustomers.externalData }).from(teamCustomers).where(eq(teamCustomers.teamId, TEAM_ID)),
    db.select({ customerId: teamCustomerTransactions.customerId, externalData: teamCustomerTransactions.externalData }).from(teamCustomerTransactions).where(eq(teamCustomerTransactions.teamId, TEAM_ID)),
  ]);

  // Transacciones → cliente: por customer_id, o por user_id numérico de AAPP contra external_data.id del cliente.
  const customerByAappUserId = new Map<string, number>();
  for (const c of customers) {
    const uid = String((c.externalData as Record<string, unknown> | null)?.id ?? '');
    if (uid) customerByAappUserId.set(uid, c.id);
  }
  const countriesByCustomer = new Map<number, string[]>();
  let txLinked = 0;
  for (const tx of txs) {
    const ext = tx.externalData as Record<string, unknown> | null;
    const customerId = tx.customerId ?? customerByAappUserId.get(String(ext?.user_id ?? '')) ?? null;
    if (!customerId) continue;
    txLinked++;
    const country = billingCountry(ext);
    if (country) countriesByCustomer.set(customerId, [...(countriesByCustomer.get(customerId) ?? []), country]);
  }

  const contactIds = subs.map((s) => s.contactId).filter((id): id is number => typeof id === 'number');
  const contactRows = contactIds.length
    ? await db.select({ id: contacts.id, remoteJid: chats.remoteJid }).from(contacts).innerJoin(chats, eq(chats.id, contacts.chatId)).where(inArray(contacts.id, contactIds))
    : [];
  const jidByContact = new Map(contactRows.map((r) => [r.id, r.remoteJid]));
  const phoneByCustomer = new Map(customers.map((c) => [c.id, c.phone]));
  const planById = new Map(plans.map((p) => [p.id, p]));

  const changes: Array<{ id: number; from: string; to: AappCurrency; reason: string }> = [];
  const byReason: Record<string, number> = {};
  const result: Record<string, number> = {};
  const planVotes = new Map<number, Map<AappCurrency, number>>();
  for (const s of subs) {
    const decision = resolveAappCurrency({
      countries: s.customerId ? countriesByCustomer.get(s.customerId) : [],
      phones: [s.contactId ? jidByContact.get(s.contactId) : null, s.customerId ? phoneByCustomer.get(s.customerId) : null],
      planName: s.planNameSnapshot || (s.planId ? planById.get(s.planId)?.name : null),
    });
    byReason[decision.reason] = (byReason[decision.reason] ?? 0) + 1;
    result[decision.currency] = (result[decision.currency] ?? 0) + 1;
    if (s.planId) {
      const votes = planVotes.get(s.planId) ?? new Map();
      votes.set(decision.currency, (votes.get(decision.currency) ?? 0) + 1);
      planVotes.set(s.planId, votes);
    }
    if (s.currency !== decision.currency) changes.push({ id: s.id, from: s.currency, to: decision.currency, reason: decision.reason });
  }

  const planChanges: Array<{ id: number; name: string; from: string; to: AappCurrency }> = [];
  for (const p of plans) {
    const votes = planVotes.get(p.id);
    const to: AappCurrency = votes ? [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0] : resolveAappCurrency({ planName: p.name }).currency;
    if (p.currency !== to) planChanges.push({ id: p.id, name: p.name, from: p.currency, to });
  }

  console.log(`transacciones vinculadas a cliente: ${txLinked}/${txs.length} · clientes con país de facturación: ${countriesByCustomer.size}`);
  console.log('suscripciones por motivo:', byReason);
  console.log('suscripciones — moneda final:', result);
  console.log(`cambios en suscripciones: ${changes.length}/${subs.length}`);
  console.log(`cambios en planes: ${planChanges.length}/${plans.length}`);
  for (const p of planChanges) console.log(`  plan ${p.id} ${p.name}: ${p.from} → ${p.to}`);
  const toUsd = changes.filter((c) => c.to === 'USD');
  if (toUsd.length) console.log('⚠ quedarían en USD:', toUsd);

  if (!APPLY) {
    console.log('\nSimulación. Correr con --apply para escribir.');
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const c of changes) {
      await tx.update(teamMembershipSubscriptions).set({ currency: c.to, updatedAt: new Date() }).where(and(eq(teamMembershipSubscriptions.id, c.id), eq(teamMembershipSubscriptions.teamId, TEAM_ID)));
    }
    for (const p of planChanges) {
      await tx.update(teamMembershipPlans).set({ currency: p.to, updatedAt: new Date() }).where(and(eq(teamMembershipPlans.id, p.id), eq(teamMembershipPlans.teamId, TEAM_ID)));
    }
    await tx.insert(activityLogs).values({
      teamId: TEAM_ID,
      userId: null,
      action: 'MEMBERSHIPS_CURRENCY_BACKFILL',
      metadata: { subscriptions: changes.length, plans: planChanges.length, byReason, result, planChanges, subscriptionChanges: changes.slice(0, 500) },
    });
  });
  const after = await db.execute(sql`select currency, count(*)::int as n from team_membership_subscriptions where team_id = ${TEAM_ID} group by 1`);
  console.log('\nAplicado. Suscripciones por moneda ahora:', after);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
