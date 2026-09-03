import { PaymentAuditLogger } from './types';
import { db } from '@/lib/db/drizzle';
import { activityLogs, paymentAuditEvents } from '@/lib/db/schema';

export const consolePaymentAuditLogger: PaymentAuditLogger = {
  async recordStatusChange(event) {
    const teamId =
      typeof event.metadata?.teamId === 'number'
        ? event.metadata.teamId
        : typeof event.metadata?.teamId === 'string'
          ? Number(event.metadata.teamId)
          : null;
    const resellerId =
      typeof event.metadata?.resellerId === 'number'
        ? event.metadata.resellerId
        : typeof event.metadata?.resellerId === 'string'
          ? Number(event.metadata.resellerId)
          : null;

    await db.insert(paymentAuditEvents).values({
      resellerId: resellerId && Number.isFinite(resellerId) ? resellerId : null,
      teamId: teamId && Number.isFinite(teamId) ? teamId : null,
      provider: event.provider,
      paymentReference: event.paymentReference,
      previousStatus: event.previousStatus,
      nextStatus: event.nextStatus,
      actor: event.actor,
      metadata: event.metadata ?? {},
    });

    if (teamId && Number.isFinite(teamId)) {
      await db.insert(activityLogs).values({
        teamId,
        userId: null,
        action: `payment.${event.provider}.${event.nextStatus}.${event.actor}`,
        ipAddress: event.paymentReference,
      });
    }

    console.info({
      scope: 'payments.audit',
      action: 'record_status_change',
      ...event,
    });
  },
};
