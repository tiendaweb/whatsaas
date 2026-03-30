import { PaymentAuditLogger } from './types';
import { db } from '@/lib/db/drizzle';
import { activityLogs } from '@/lib/db/schema';

export const consolePaymentAuditLogger: PaymentAuditLogger = {
  async recordStatusChange(event) {
    const teamId =
      typeof event.metadata?.teamId === 'number'
        ? event.metadata.teamId
        : typeof event.metadata?.teamId === 'string'
          ? Number(event.metadata.teamId)
          : null;

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
