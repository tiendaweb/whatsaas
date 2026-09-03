// Cliente para la Meta Marketing API (Ads).
// Reusa el cliente Graph de social-publisher: mismo host, misma versión y —lo que más
// importa— el mismo mapeo de errores (MetaGraphError.isTransient / .isTokenError).
// Docs: https://developers.facebook.com/docs/marketing-api/insights

import { MetaGraphError, graphFetch, type GraphParams } from '@/lib/social/meta-graph';

export type MetaAdAccount = {
  id: string; // "act_1174566750575798"
  account_id: string; // "1174566750575798"
  name: string;
  account_status: number;
  currency: string;
  timezone_name?: string;
  amount_spent?: string;
  business?: { id: string; name: string };
};

export type MetaCampaignRaw = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  buying_type?: string;
  created_time?: string;
  start_time?: string;
  stop_time?: string;
  updated_time?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};

export type MetaActionEntry = { action_type: string; value: string };

export type MetaInsightRow = {
  campaign_id: string;
  campaign_name?: string;
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  frequency?: string;
  actions?: MetaActionEntry[];
  cost_per_action_type?: MetaActionEntry[];
};

type Paged<T> = { data: T[]; paging?: { cursors?: { after?: string }; next?: string } };

/** Meta usa la unidad mínima (centavos) para presupuestos. OJO: `spend` de insights NO. */
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'JPY', 'KRW', 'VND', 'PYG', 'ISK']);

export function minorToMajor(value: string | number | null | undefined, currency: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? amount : amount / 100;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sólo reintenta errores transitorios (rate limit / servicio). Un token inválido falla ya. */
async function graphFetchRetry<T>(
  path: string,
  opts: { token: string; params?: GraphParams },
  attempts = 3,
): Promise<T> {
  const backoff = [2_000, 8_000, 20_000];

  for (let attempt = 0; ; attempt++) {
    try {
      return await graphFetch<T>(path, opts);
    } catch (error) {
      const isLast = attempt >= attempts - 1;
      if (isLast || !(error instanceof MetaGraphError) || !error.isTransient) throw error;
      await sleep(backoff[Math.min(attempt, backoff.length - 1)]);
    }
  }
}

async function fetchAllPages<T>(path: string, token: string, params: GraphParams, maxPages = 25): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const response = await graphFetchRetry<Paged<T>>(path, {
      token,
      params: { ...params, ...(after ? { after } : {}) },
    });

    if (Array.isArray(response.data)) items.push(...response.data);

    after = response.paging?.cursors?.after;
    if (!after || !response.paging?.next) break;
  }

  return items;
}

export async function listAdAccounts(token: string): Promise<MetaAdAccount[]> {
  return fetchAllPages<MetaAdAccount>('/me/adaccounts', token, {
    fields: 'id,account_id,name,account_status,currency,timezone_name,amount_spent,business{id,name}',
    limit: 100,
  });
}

/** El token de Meta no tiene introspección útil para ads: se valida usándolo. */
export async function validateAdsToken(token: string): Promise<{ accounts: MetaAdAccount[] }> {
  return { accounts: await listAdAccounts(token) };
}

export async function listCampaigns(accountId: string, token: string): Promise<MetaCampaignRaw[]> {
  return fetchAllPages<MetaCampaignRaw>(`/act_${accountId}/campaigns`, token, {
    fields:
      'id,name,status,effective_status,objective,buying_type,created_time,start_time,stop_time,updated_time,daily_budget,lifetime_budget',
    limit: 200,
  });
}

/**
 * Una fila por campaña y día. Usamos time_range explícito y no date_preset porque el
 * backfill y el re-sync necesitan rangos deterministas.
 */
export async function listCampaignInsightsDaily(
  accountId: string,
  token: string,
  range: { since: string; until: string },
): Promise<MetaInsightRow[]> {
  return fetchAllPages<MetaInsightRow>(`/act_${accountId}/insights`, token, {
    level: 'campaign',
    time_increment: 1,
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    fields:
      'campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,frequency,actions,cost_per_action_type',
    limit: 500,
  });
}
