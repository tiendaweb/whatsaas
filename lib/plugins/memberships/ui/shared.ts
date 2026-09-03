import type { BillingType, FeatureType, PaymentStatus, PlanVisibility, SubscriptionStatus } from '../constants';

export const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
};

export const CURRENCIES = ['USD', 'MXN', 'EUR', 'ARS', 'COP', 'CLP', 'PEN'];

export function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
  }).format((cents ?? 0) / 100);
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Tipos compartidos ───────────────────────────────────────────────────────

export type MembershipFeature = { label: string; type: FeatureType; value?: string };

export type Company = {
  id: number;
  name: string;
  description: string;
  logoUrl: string | null;
  notes: string;
  status: 'active' | 'archived';
  position: number;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  externalSource?: string | null;
  externalId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  kpis?: { customers: number; activeMemberships: number; stores: number };
};

export type Plan = {
  id: number;
  companyId: number | null;
  company?: { id: number; name: string; logoUrl: string | null } | null;
  name: string;
  description: string;
  billingType: BillingType;
  price: number;
  setupFee: number;
  maintenanceAmount: number;
  maintenanceIntervalMonths: number | null;
  billingLabel: string | null;
  currency: string;
  features: MembershipFeature[];
  visibility: PlanVisibility;
  status: 'active' | 'archived';
  position: number;
};

export type Subscription = {
  id: number;
  subscriptionNumber: string;
  planId: number | null;
  companyId: number | null;
  customerId: number | null;
  contactId: number | null;
  planNameSnapshot: string;
  price: number;
  currency: string;
  billingType: BillingType;
  status: SubscriptionStatus;
  paymentStatus: PaymentStatus;
  startDate: string;
  endDate: string | null;
  notes: string;
  externalSource?: string | null;
  externalId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  plan?: { id: number; name: string } | null;
  company?: { id: number; name: string } | null;
  contact?: { id: number; name: string | null; chat?: { remoteJid: string | null } | null } | null;
  customer?: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    source: string;
    profileImage: string | null;
    externalId: string | null;
  } | null;
};

export type CompanyDetailData = Company & {
  createdAt: string;
  updatedAt: string;
  metrics: {
    plans: number;
    activePlans: number;
    subscriptions: number;
    activeSubscriptions: number;
    overdueSubscriptions: number;
    customers: number;
  };
  plans: Plan[];
  subscriptions: Array<
    Subscription & {
      customer?: { id: number; name: string; email: string | null; phone: string | null } | null;
      contact?: {
        id: number;
        name: string | null;
        chat?: { remoteJid: string | null } | null;
      } | null;
    }
  >;
};

export type CustomerOption = { id: number; name: string; phone: string | null; email: string | null; source: string };

export type ReminderRule = {
  id: number;
  name: string;
  offsetDays: number;
  actionType: 'message' | 'automation';
  message: string;
  mediaUrl: string | null;
  automationId: number | null;
  instanceId: number | null;
  isActive: boolean;
  position: number;
};

export type ContactOption = {
  id: number;
  name: string | null;
  phone: string | null;
  remoteJid?: string | null;
};

export type AutomationOption = { id: number; name: string; instanceId: number | null };
export type InstanceOption = { id: number; instanceName?: string; name?: string };
