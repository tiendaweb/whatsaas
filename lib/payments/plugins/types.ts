import { teams } from '@/lib/db/schema';

export type CheckoutInput = {
  team: typeof teams.$inferSelect | null;
  priceId: string;
};

export type PaymentPlugin = {
  id: 'stripe' | 'manual' | 'mercadopago';
  createCheckout(input: CheckoutInput): Promise<void>;
  createCustomerPortal?(team: typeof teams.$inferSelect): Promise<string | null>;
};
