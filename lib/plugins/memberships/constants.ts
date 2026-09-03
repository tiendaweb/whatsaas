// Constantes y helpers compartidos del plugin de membresías.

export const BILLING_TYPES = [
  'free',
  'monthly',
  'annual',
  'lifetime',
  'setup_maintenance',
  'custom',
] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export const PLAN_VISIBILITIES = ['public', 'private'] as const;
export type PlanVisibility = (typeof PLAN_VISIBILITIES)[number];

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  free: 'Gratis',
  monthly: 'Mensual',
  annual: 'Anual',
  lifetime: 'De por vida',
  setup_maintenance: 'Pago inicial + mantenimiento',
  custom: 'Personalizado',
};

export function billingTypeLabel(type: string, billingLabel?: string | null): string {
  if (type === 'custom' && billingLabel?.trim()) return billingLabel.trim();
  return BILLING_TYPE_LABELS[type as BillingType] ?? type;
}

// Tipos de característica de un plan.
export const FEATURE_TYPES = ['included', 'excluded', 'quantity', 'custom'] as const;
export type FeatureType = (typeof FEATURE_TYPES)[number];

export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  included: 'Incluida',
  excluded: 'No incluida',
  quantity: 'Cantidad',
  custom: 'Personalizada',
};

export const SUBSCRIPTION_STATUS = ['active', 'pending', 'expired', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Activa',
  pending: 'Pendiente',
  expired: 'Vencida',
  cancelled: 'Cancelada',
};

export const PAYMENT_STATUS = ['paid', 'pending', 'overdue'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: 'Pagado',
  pending: 'Pendiente',
  overdue: 'Vencido',
};

// Los tipos de cobro que no generan vencimiento (endDate = null).
export const NON_EXPIRING_BILLING_TYPES: readonly BillingType[] = ['free', 'lifetime'];

/**
 * Calcula la fecha de vencimiento por defecto a partir de la fecha de inicio y el
 * tipo de cobro. Devuelve null para planes gratis / de por vida. El usuario puede
 * sobreescribir el valor manualmente en el formulario.
 *
 * @param startDate ISO date (YYYY-MM-DD)
 */
export function computeDefaultEndDate(
  startDate: string,
  billingType: string,
  maintenanceIntervalMonths?: number | null,
): string | null {
  if (!startDate) return null;
  if (NON_EXPIRING_BILLING_TYPES.includes(billingType as BillingType)) return null;

  const base = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;

  let months = 1;
  if (billingType === 'monthly') months = 1;
  else if (billingType === 'annual') months = 12;
  else if (billingType === 'setup_maintenance' || billingType === 'custom') {
    months = maintenanceIntervalMonths && maintenanceIntervalMonths > 0 ? maintenanceIntervalMonths : 1;
  }

  const result = new Date(base);
  result.setMonth(result.getMonth() + months);
  return result.toISOString().slice(0, 10);
}
