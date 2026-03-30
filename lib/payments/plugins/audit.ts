import { PaymentAuditLogger } from './types';

export const consolePaymentAuditLogger: PaymentAuditLogger = {
  async recordStatusChange(event) {
    console.info({
      scope: 'payments.audit',
      action: 'record_status_change',
      ...event,
    });
  },
};
