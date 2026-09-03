import 'server-only';

import crypto from 'crypto';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { readOnlyApiTokens } from '@/lib/db/schema';

export const READ_ONLY_TOKEN_PREFIX = 'ro_live_';
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const usageBuckets = new Map<number, { startedAt: number; count: number }>();

export type ReadOnlyApiContext = {
  teamId: number;
  tokenId: number;
  tokenName: string;
  scopes: string[];
  rateLimit: { limit: number; remaining: number; resetAt: number };
};

export function hashReadOnlyToken(token: string) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createReadOnlyTokenSecret() {
  return `${READ_ONLY_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

function consumeRateLimit(tokenId: number) {
  const now = Date.now();
  let bucket = usageBuckets.get(tokenId);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
  }
  bucket.count += 1;
  usageBuckets.set(tokenId, bucket);
  return {
    allowed: bucket.count <= RATE_LIMIT,
    limit: RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - bucket.count),
    resetAt: Math.ceil((bucket.startedAt + RATE_WINDOW_MS) / 1000),
  };
}

export async function authenticateReadOnlyApi(authorization: string | null): Promise<
  | { ok: true; context: ReadOnlyApiContext }
  | { ok: false; status: 401 | 429; code: string; message: string; rateLimit?: ReadOnlyApiContext['rateLimit'] }
> {
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, status: 401, code: 'missing_token', message: 'Use Authorization: Bearer ro_live_…' };
  }

  const secret = authorization.slice(7).trim();
  if (!secret.startsWith(READ_ONLY_TOKEN_PREFIX) || secret.length < 40) {
    return { ok: false, status: 401, code: 'invalid_token', message: 'The read-only API token is invalid.' };
  }

  const now = new Date();
  const [token] = await db
    .select()
    .from(readOnlyApiTokens)
    .where(
      and(
        eq(readOnlyApiTokens.tokenHash, hashReadOnlyToken(secret)),
        isNull(readOnlyApiTokens.revokedAt),
        or(isNull(readOnlyApiTokens.expiresAt), gt(readOnlyApiTokens.expiresAt, now)),
      ),
    )
    .limit(1);

  if (!token) {
    return { ok: false, status: 401, code: 'invalid_token', message: 'The token is unknown, revoked, or expired.' };
  }

  const rate = consumeRateLimit(token.id);
  const rateLimit = { limit: rate.limit, remaining: rate.remaining, resetAt: rate.resetAt };
  if (!rate.allowed) {
    return { ok: false, status: 429, code: 'rate_limit_exceeded', message: 'Try again after the rate-limit window resets.', rateLimit };
  }

  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 5 * 60_000) {
    void db
      .update(readOnlyApiTokens)
      .set({ lastUsedAt: now, updatedAt: now })
      .where(and(eq(readOnlyApiTokens.id, token.id), or(isNull(readOnlyApiTokens.lastUsedAt), lt(readOnlyApiTokens.lastUsedAt, new Date(Date.now() - 5 * 60_000)))))
      .catch((error) => console.error('[readonly-api] Could not update token usage', error));
  }

  return {
    ok: true,
    context: {
      teamId: token.teamId,
      tokenId: token.id,
      tokenName: token.name,
      scopes: token.scopes,
      rateLimit,
    },
  };
}

export function readOnlyRateLimitHeaders(rateLimit: ReadOnlyApiContext['rateLimit']) {
  return {
    'X-RateLimit-Limit': String(rateLimit.limit),
    'X-RateLimit-Remaining': String(rateLimit.remaining),
    'X-RateLimit-Reset': String(rateLimit.resetAt),
  };
}
