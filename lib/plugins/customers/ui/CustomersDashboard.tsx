'use client';

import { CustomersList } from './CustomersList';
import { CustomerDetail } from './CustomerDetail';

export function CustomersDashboard({ customerId }: { customerId?: number }) {
  if (customerId) {
    return <CustomerDetail customerId={customerId} />;
  }
  return <CustomersList />;
}
