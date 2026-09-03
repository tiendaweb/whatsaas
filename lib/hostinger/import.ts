import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, hostingerAccounts, teamCustomerStores, teamDomains } from '@/lib/db/schema';
import { listHostingerDomains } from './client';

export type HostingerImportSummary = {
  total: number;
  created: number;
  updated: number;
  linked: number;
  unlinked: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** aapp.space guarda el dominio como lo cargó el cliente: con protocolo, www o barra final. */
export function normalizeDomain(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveStatus(remoteStatus: string, expiresAt: Date | null, notifyDaysBefore: number): string {
  const status = remoteStatus.toLowerCase();
  if (status.includes('expired')) return 'expired';
  if (status.includes('transfer')) return 'transferred';

  if (expiresAt) {
    const now = Date.now();
    if (expiresAt.getTime() < now) return 'expired';
    if (expiresAt.getTime() < now + notifyDaysBefore * DAY_MS) return 'expiring_soon';
  }

  return 'active';
}

/**
 * Importa el portfolio de una cuenta de Hostinger a la app de Dominios y, cuando el
 * dominio coincide con el dominio propio de una tienda de aapp.space, lo deja vinculado
 * al cliente dueño de esa tienda.
 */
export async function importHostingerDomains(
  teamId: number,
  accountId: number,
  userId: number,
): Promise<HostingerImportSummary> {
  const account = await db.query.hostingerAccounts.findFirst({
    where: and(eq(hostingerAccounts.id, accountId), eq(hostingerAccounts.teamId, teamId)),
  });
  if (!account) {
    throw new Error('La cuenta de Hostinger no existe.');
  }

  const now = new Date();

  try {
    const [remoteDomains, stores, existingDomains] = await Promise.all([
      listHostingerDomains(account.token),
      db
        .select({ customerId: teamCustomerStores.customerId, customDomain: teamCustomerStores.customDomain })
        .from(teamCustomerStores)
        .where(and(eq(teamCustomerStores.teamId, teamId), isNotNull(teamCustomerStores.customerId))),
      db
        .select({
          id: teamDomains.id,
          name: teamDomains.name,
          source: teamDomains.source,
          externalId: teamDomains.externalId,
          customerId: teamDomains.customerId,
          notifyDaysBefore: teamDomains.notifyDaysBefore,
        })
        .from(teamDomains)
        .where(eq(teamDomains.teamId, teamId)),
    ]);

    const customerByDomain = new Map<string, number>();
    for (const store of stores) {
      const domain = normalizeDomain(store.customDomain);
      if (domain && store.customerId && !customerByDomain.has(domain)) {
        customerByDomain.set(domain, store.customerId);
      }
    }

    const byExternalId = new Map(
      existingDomains
        .filter((row) => row.source === 'hostinger' && row.externalId)
        .map((row) => [row.externalId!, row]),
    );
    const byName = new Map(existingDomains.map((row) => [normalizeDomain(row.name), row]));

    const summary: HostingerImportSummary = { total: 0, created: 0, updated: 0, linked: 0, unlinked: 0 };

    for (const remote of remoteDomains) {
      const name = normalizeDomain(remote.domain);
      if (!name) continue;

      const externalId = String(remote.id);
      // Un dominio cargado a mano antes de conectar Hostinger se adopta en vez de duplicarse.
      const existing = byExternalId.get(externalId) ?? byName.get(name);
      const expiresAt = parseDate(remote.expires_at);
      const notifyDaysBefore = existing?.notifyDaysBefore ?? 30;
      const matchedCustomerId = customerByDomain.get(name) ?? null;

      summary.total++;
      if (matchedCustomerId) summary.linked++;
      else summary.unlinked++;

      const values = {
        name,
        registrar: 'Hostinger',
        expiresAt,
        registeredAt: parseDate(remote.created_at),
        status: resolveStatus(remote.status ?? '', expiresAt, notifyDaysBefore),
        source: 'hostinger',
        externalId,
        hostingerAccountId: account.id,
        updatedBy: userId,
        updatedAt: now,
      };

      if (existing) {
        await db
          .update(teamDomains)
          .set({
            ...values,
            // Un vínculo puesto a mano no se pisa cuando el match automático no encuentra nada.
            customerId: matchedCustomerId ?? existing.customerId,
          })
          .where(eq(teamDomains.id, existing.id));
        summary.updated++;
      } else {
        await db.insert(teamDomains).values({
          ...values,
          teamId,
          customerId: matchedCustomerId,
          createdBy: userId,
          createdAt: now,
        });
        summary.created++;
      }
    }

    await db
      .update(hostingerAccounts)
      .set({
        status: 'connected',
        lastSyncedAt: now,
        lastError: null,
        domainsCount: summary.total,
        updatedAt: now,
      })
      .where(eq(hostingerAccounts.id, account.id));

    await db.insert(activityLogs).values({
      teamId,
      userId,
      action: `hostinger.import_completed:${JSON.stringify(summary)}`,
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    await db
      .update(hostingerAccounts)
      .set({ status: 'error', lastError: message.slice(0, 2000), updatedAt: new Date() })
      .where(eq(hostingerAccounts.id, account.id));
    console.error('[hostinger/import]', { teamId, accountId, error });
    throw error;
  }
}
