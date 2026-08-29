/**
 * Contrato de la vista Clientes · Empresas del Command Center. Lo cumplen
 * `server/accounts.ts`, las rutas `app/api/plugins/sales-ops/accounts/*` y la
 * UI `ui/clientes/*`. Tipos puros: sin imports de servidor.
 */
import type { Gate } from './taxonomy';

export const ACCOUNT_KINDS = ['customers', 'companies'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_TABS = ['en_venta', 'privadas', 'vencidas', 'ocultas', 'todas'] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];

export const VISIBILITIES = ['visible', 'private', 'hidden'] as const;
/**
 * visible: aparece en "En venta" si tiene membresía activa (default).
 * private: sólo en "Privadas", no molesta entre las vigentes en venta.
 * hidden:  no aparece salvo en "Ocultas" / "Mostrar ocultas".
 */
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_TARGETS = ['subscription', 'customer', 'company'] as const;
export type VisibilityTarget = (typeof VISIBILITY_TARGETS)[number];

export type AccountContact = {
  contactId: number;
  chatId: number | null;
  name: string;
  phoneMasked: string | null;
  gate: Gate | null;
};

export type AccountRow = {
  kind: AccountKind;
  id: number;
  name: string;
  avatarUrl: string | null;
  website: string | null;
  email: string | null;
  phoneMasked: string | null;
  industry: string | null;
  status: string;
  visibility: Visibility;
  subscriptions: {
    active: number;
    expired: number;
    pending: number;
    /** Sólo las activas y visibles. Normalizado a mes y a USD con el fx del plugin. */
    totalMonthlyUsd: number | null;
    /** Cuántas quedaron afuera del conteo por ser privadas u ocultas. */
    privateCount: number;
    hiddenCount: number;
  };
  links: { stores: number; domains: number };
  contacts: AccountContact[];
  lastPaidAt: string | null;
  since: string | null;
};

export type AccountsListQuery = {
  kind: AccountKind;
  tab: AccountTab;
  q?: string;
  cursor?: string | null;
  limit?: number;
};

export type AccountsListPayload = {
  rows: AccountRow[];
  total: number;
  nextCursor: string | null;
  counts: Record<AccountTab, number>;
};

export type AccountSubscription = {
  id: number;
  number: string;
  planName: string;
  price: number;
  currency: string;
  billingType: string;
  status: string;
  paymentStatus: string;
  startDate: string;
  endDate: string | null;
  daysLeft: number | null;
  visibility: Visibility;
  contactId: number | null;
  contactName: string | null;
  companyName: string | null;
  customerName: string | null;
  notes: string;
};

export type AccountStore = {
  id: number;
  cardType: string | null;
  title: string | null;
  url: string | null;
  customDomain: string | null;
  status: string | null;
  profileImage: string | null;
};

export type AccountDomain = { id: number; name: string; status: string; expiresAt: string | null };

export type AccountSale = { id: number; number: string; status: string; total: number; currency: string; paidAt: string | null };

export type AccountDetail = {
  account: AccountRow & { notes: string };
  subscriptions: AccountSubscription[];
  stores: AccountStore[];
  domains: AccountDomain[];
  contacts: AccountContact[];
  sales: AccountSale[];
  moneyByCurrency: {
    paid: Record<string, number>;
    pending: Record<string, number>;
    activeSubscriptions: Record<string, number>;
  };
};

export type SetVisibilityInput = { target: VisibilityTarget; id: number; visibility: Visibility };
export type SetVisibilityPayload = { ok: true; target: VisibilityTarget; id: number; visibility: Visibility };
