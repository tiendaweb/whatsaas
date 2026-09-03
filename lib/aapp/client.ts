const AAPP_BASE_URL = process.env.AAPP_SPACE_API_URL || 'https://aapp.space/api/gobiz/v1';

type AappMeta = {
  current_page?: number;
  last_page?: number;
  next_page_url?: string | null;
};

type AappEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: AappMeta;
  message?: string;
};

export class AappError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'AappError';
  }
}

export async function aappFetch<T>(
  apiKey: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<AappEnvelope<T>> {
  const url = new URL(`${AAPP_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as { message?: unknown }).message || response.statusText)
      : response.statusText;
    throw new AappError(message || 'AAPP SPACE request failed', response.status, payload);
  }

  const envelope = payload as AappEnvelope<T>;
  if (!envelope || envelope.success === false) {
    throw new AappError(envelope?.message || 'AAPP SPACE rejected the request', response.status, payload);
  }
  return envelope;
}

export async function aappFetchAllPages<T>(apiKey: string, path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  while (true) {
    const response = await aappFetch<T[]>(apiKey, path, { page, per_page: 100 });
    if (Array.isArray(response.data)) items.push(...response.data);
    const current = Number(response.meta?.current_page ?? page);
    const last = Number(response.meta?.last_page ?? current);
    if (current >= last) break;
    page = current + 1;
  }
  return items;
}

export function storeUrl(store: { custom_domain?: unknown; card_url?: unknown }): string | null {
  const domain = String(store.custom_domain ?? '').trim();
  if (domain) return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const slug = String(store.card_url ?? '').trim().replace(/^\/+/, '');
  return slug ? `https://aapp.space/${slug}` : null;
}
