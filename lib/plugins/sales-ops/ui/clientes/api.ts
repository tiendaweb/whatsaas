'use client';

/**
 * Cliente HTTP de Clientes · Empresas. Etiquetas en español rioplatense,
 * hardcodeadas (sin i18n en este plugin).
 */
import type { AccountKind, AccountTab, AccountsListPayload, AccountDetail, SetVisibilityInput, SetVisibilityPayload, Visibility } from '../../shared/accounts-types';
import { SALES_OPS_API, fetcher } from '../components/format';

export const KIND_LABELS: Record<AccountKind, string> = { customers: 'Clientes', companies: 'Empresas' };

export const TAB_LABELS: Record<AccountTab, string> = {
  en_venta: 'En venta',
  privadas: 'Privadas',
  vencidas: 'Vencidas',
  ocultas: 'Ocultas',
  todas: 'Todas',
};

export const VISIBILITY_LABELS: Record<Visibility, string> = { visible: 'Visible', private: 'Privada', hidden: 'Oculta' };

export const SUB_STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  expired: 'Vencida',
  pending: 'Pendiente',
  cancelled: 'Cancelada',
  paused: 'Pausada',
};

export const PAYMENT_LABELS: Record<string, string> = {
  paid: 'Pagada',
  pending: 'Pago pendiente',
  overdue: 'Pago atrasado',
  failed: 'Pago fallido',
  refunded: 'Reembolsada',
};

export const BILLING_LABELS: Record<string, string> = {
  monthly: 'por mes',
  annual: 'por año',
  lifetime: 'de por vida',
  custom: 'a medida',
  quarterly: 'por trimestre',
  weekly: 'por semana',
};

export const CARD_TYPE_LABELS: Record<string, string> = { store: 'Tienda', vcard: 'Sitio', site: 'Sitio', prosite: 'Sitio pro', html: 'HTML' };

export function accountsUrl(kind: AccountKind, tab: AccountTab, q: string, cursor: string | null): string {
  const p = new URLSearchParams();
  p.set('kind', kind);
  p.set('tab', tab);
  if (q.trim()) p.set('q', q.trim());
  p.set('limit', '50');
  if (cursor) p.set('cursor', cursor);
  return `${SALES_OPS_API}/accounts?${p.toString()}`;
}

export function detailUrl(kind: AccountKind, id: number): string {
  return `${SALES_OPS_API}/accounts/${kind}/${id}`;
}

export const fetchList = (url: string) => fetcher<AccountsListPayload>(url);
export const fetchDetail = (url: string) => fetcher<AccountDetail>(url);

export async function patchVisibility(input: SetVisibilityInput): Promise<SetVisibilityPayload> {
  const response = await fetch(`${SALES_OPS_API}/accounts/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = String(body.error);
    } catch {
      /* sin cuerpo */
    }
    throw new Error(message);
  }
  return response.json() as Promise<SetVisibilityPayload>;
}

/** "USD 400" desde centavos. Nunca tira. */
export function fmtCents(cents: number | null | undefined, currency: string): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const units = cents / 100;
  const prefix = currency === 'PYG' ? 'Gs' : currency;
  try {
    return `${prefix} ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: units % 1 === 0 ? 0 : 2 }).format(units)}`;
  } catch {
    return `${prefix} ${Math.round(units)}`;
  }
}

export function fmtUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  try {
    return `USD ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value)}`;
  } catch {
    return `USD ${Math.round(value)}`;
  }
}

export function venceTexto(daysLeft: number | null, status: string): string {
  if (daysLeft == null) return status === 'active' ? 'sin vencimiento' : '';
  if (daysLeft < 0) return `venció hace ${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? 'día' : 'días'}`;
  if (daysLeft === 0) return 'vence hoy';
  if (daysLeft === 1) return 'vence mañana';
  return `vence en ${daysLeft} días`;
}

/** Sólo el dominio, para mostrar un link sin el protocolo. */
export function hostDe(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}
