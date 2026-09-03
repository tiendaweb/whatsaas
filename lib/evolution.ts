export async function parseEvolutionResponse(response: Response, instanceName: string) {
  const responseText = await response.text();
  if (!responseText) return { data: null, parseError: null };

  try {
    return { data: JSON.parse(responseText), parseError: null };
  } catch {
    const parseError = `Evolution API returned non-JSON for ${instanceName} (HTTP ${response.status}): ${responseText.slice(0, 300)}`;
    console.error(parseError);
    return { data: null, parseError };
  }
}

type EvolutionRequestOptions = {
  url: string;
  instanceName: string;
  accessToken: string;
  payload: unknown;
  timeoutMs?: number;
};

export type EvolutionRequestResult = {
  response: Response;
  data: any;
  parseError: string | null;
  retried: boolean;
  connectionClosed: boolean;
};

const recoveryPromises = new Map<string, Promise<void>>();

function containsConnectionClosed(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return /connection\s+closed/i.test(value);
  if (Array.isArray(value)) return value.some(containsConnectionClosed);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(containsConnectionClosed);
  return false;
}

export function isEvolutionConnectionClosed(data: unknown, parseError?: string | null) {
  return containsConnectionClosed(data) || containsConnectionClosed(parseError);
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function recoverEvolutionConnection({
  url,
  instanceName,
  accessToken,
  timeoutMs,
}: Omit<EvolutionRequestOptions, 'payload'>) {
  const existingRecovery = recoveryPromises.get(instanceName);
  if (existingRecovery) {
    await existingRecovery;
    return;
  }

  const recovery = (async () => {
    const baseUrl = new URL(url).origin;
    try {
      const response = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
        method: 'GET',
        headers: { apikey: accessToken },
        signal: AbortSignal.timeout(timeoutMs ?? 10000),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        console.warn(`Evolution recovery request failed for ${instanceName} (HTTP ${response.status}): ${detail}`);
      }
    } catch (error: any) {
      console.warn(`Evolution recovery request failed for ${instanceName}: ${error?.message || 'Unknown error'}`);
    }

    // Evolution can expose state=open before the internal Baileys socket is ready.
    await wait(1200);
  })().finally(() => {
    recoveryPromises.delete(instanceName);
  });

  recoveryPromises.set(instanceName, recovery);
  await recovery;
}

export async function sendEvolutionRequestWithRetry({
  url,
  instanceName,
  accessToken,
  payload,
  timeoutMs = 10000,
}: EvolutionRequestOptions): Promise<EvolutionRequestResult> {
  const execute = async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: accessToken,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed = await parseEvolutionResponse(response, instanceName);
    return { response, ...parsed };
  };

  const first = await execute();
  const connectionClosed = isEvolutionConnectionClosed(first.data, first.parseError);

  if (!connectionClosed || first.data?.key?.id) {
    return { ...first, retried: false, connectionClosed };
  }

  console.warn(`Evolution connection closed for ${instanceName}; attempting one safe recovery and retry.`);
  await recoverEvolutionConnection({ url, instanceName, accessToken, timeoutMs });
  const second = await execute();

  return {
    ...second,
    retried: true,
    connectionClosed: isEvolutionConnectionClosed(second.data, second.parseError),
  };
}

function normalizeEvolutionMessage(value: unknown): string | null {
  if (value == null) return null;

  if (Array.isArray(value)) {
    const parts = value.map(normalizeEvolutionMessage).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    const message = (value as { message?: unknown }).message;
    if (message) return normalizeEvolutionMessage(message);

    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return null;
}

export function getEvolutionErrorMessage({
  data,
  parseError,
  response,
  instanceName,
}: {
  data: any;
  parseError: string | null;
  response: Response;
  instanceName: string;
}) {
  if (parseError) return parseError;

  const rawMessage =
    data?.response?.message ??
    data?.data?.message ??
    data?.message ??
    data?.error;
  const message = normalizeEvolutionMessage(rawMessage);

  return message
    ? `Evolution API error for ${instanceName} (HTTP ${response.status}): ${message}`
    : `Evolution API error for ${instanceName} (HTTP ${response.status})`;
}

export function getEvolutionRecipientNumber(remoteJid: string) {
  const value = remoteJid.trim();
  if (!value) return '';

  if (value.endsWith('@g.us')) {
    return value;
  }

  return value
    .replace(/@(s\.whatsapp\.net|c\.us)$/i, '')
    .replace(/\D/g, '');
}
