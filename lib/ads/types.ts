// Contrato compartido entre /overview, la UI y el PDF: los tres muestran exactamente los
// mismos números porque salen de la misma respuesta.
//
// CONVENCIÓN DE DINERO: todos los campos monetarios (spend, costPerResult, cpc, cpm) son
// FINALES, con impuesto incluido. El neto que reporta Meta queda en `spendNet` como
// referencia. Ver lib/ads/tax.ts.

export type Granularity = 'day' | 'week' | 'month';

export type OverviewKpis = {
  /** Con impuesto. */
  spend: number;
  /** Lo que reporta Meta, sin impuesto. */
  spendNet: number;
  tax: number;
  results: number;
  /** Con impuesto. */
  costPerResult: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  /** Con impuesto. */
  cpc: number | null;
  /** Con impuesto. */
  cpm: number | null;
  frequency: number | null;
  reach: number;
  activeCampaigns: number;
};

export type OverviewSeriesPoint = {
  /** Inicio del período (día, semana o mes según la granularidad). */
  date: string;
  label: string;
  /** Con impuesto. */
  spend: number;
  spendNet: number;
  results: number;
  impressions: number;
  clicks: number;
  costPerResult: number | null;
};

export type OverviewCampaignRow = {
  id: number;
  campaignId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  objective: string | null;
  objectiveLabel: string;
  buyingType: string | null;
  resultActionType: string | null;
  resultLabel: string;
  /** Con impuesto. */
  spend: number;
  spendNet: number;
  results: number;
  /** Con impuesto. */
  costPerResult: number | null;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  /** Con impuesto. */
  cpc: number | null;
  /** Con impuesto. */
  cpm: number | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  createdTime: string | null;
  startTime: string | null;
  stopTime: string | null;
  activeDays: number;
};

export type OverviewAccount = {
  id: number;
  name: string;
  accountId: string;
  currency: string;
  timezoneName: string | null;
  taxRate: number;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
};

export type OverviewResponse = {
  account: OverviewAccount;
  range: { since: string; until: string };
  granularity: Granularity;
  kpis: OverviewKpis;
  previousKpis: OverviewKpis;
  series: OverviewSeriesPoint[];
  campaigns: OverviewCampaignRow[];
  /** Label de la columna Resultados: específico si todas comparten tipo, genérico si es mixto. */
  resultLabel: string;
};

export type CampaignDetailResponse = {
  account: OverviewAccount;
  range: { since: string; until: string };
  granularity: Granularity;
  campaign: OverviewCampaignRow;
  totals: OverviewKpis;
  series: OverviewSeriesPoint[];
  daily: Array<{
    date: string;
    spend: number;
    spendNet: number;
    results: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number | null;
    costPerResult: number | null;
  }>;
  actions: Array<{ actionType: string; label: string; value: number; costPerAction: number | null }>;
};
