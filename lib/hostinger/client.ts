const HOSTINGER_BASE_URL = process.env.HOSTINGER_API_URL || 'https://developers.hostinger.com/api';

export class HostingerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'HostingerError';
  }
}

export type HostingerDomain = {
  id: number;
  domain: string;
  type: string;
  status: string;
  created_at: string | null;
  expires_at: string | null;
};

async function hostingerFetch<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${HOSTINGER_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
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
    const message =
      typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message?: unknown }).message || response.statusText)
        : response.statusText;
    throw new HostingerError(message || 'Hostinger rechazó la petición', response.status, payload);
  }

  return payload as T;
}

export async function listHostingerDomains(token: string): Promise<HostingerDomain[]> {
  const payload = await hostingerFetch<HostingerDomain[]>(token, '/domains/v1/portfolio');
  return Array.isArray(payload) ? payload : [];
}

/**
 * El token de Hostinger no tiene endpoint de introspección: la única forma de
 * validarlo es usarlo. Pedimos el portfolio, que además nos sirve de preview.
 */
export async function validateHostingerToken(token: string): Promise<{ domains: number }> {
  const domains = await listHostingerDomains(token);
  return { domains: domains.length };
}
