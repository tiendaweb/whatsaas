import 'server-only';

import crypto from 'crypto';
import { and, desc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  grokConnectorCredentials,
  grokConnectorOAuthClients,
  teamMemberPlugins,
  teamMembers,
  users,
} from '@/lib/db/schema';

export const GROK_CONNECTOR_PLUGIN_ID = 'grok-connector';
export const CHATGPT_CONNECTOR_PLUGIN_ID = 'chatgpt-connector';
export const CLAUDE_CONNECTOR_PLUGIN_ID = 'claude-code-connector';
export const GROK_READ_SCOPE = 'whatspro:read';
export const GROK_WRITE_SCOPE = 'whatspro:write';
export const APP_MAKER_READ_SCOPE = 'appmaker:read';
export const APP_MAKER_WRITE_SCOPE = 'appmaker:write';
export const APP_MAKER_PUBLISH_SCOPE = 'appmaker:publish';
export const APP_MAKER_MEDIA_SCOPE = 'appmaker:media';
export const APP_MAKER_SCOPES = [APP_MAKER_READ_SCOPE, APP_MAKER_WRITE_SCOPE, APP_MAKER_PUBLISH_SCOPE, APP_MAKER_MEDIA_SCOPE] as const;
export const GROK_SCOPE = GROK_READ_SCOPE;
export const GROK_TARGET_EMAIL = 'noelia@whatspro.uno';
const ACCESS_TOKEN_TTL_MS = 60 * 60_000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;
const AUTH_CODE_TTL_MS = 5 * 60_000;
const LINK_CODE_TTL_MS = 10 * 60_000;
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const usageBuckets = new Map<number, { startedAt: number; count: number }>();

export type GrokTarget = { teamId: number; userId: number; email: string };

export function requestOrigin(request: Request) {
  const configuredOrigin = process.env.BASE_URL?.trim();
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, '');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin;
}

export type OAuthConnectorId = typeof GROK_CONNECTOR_PLUGIN_ID | typeof CHATGPT_CONNECTOR_PLUGIN_ID | typeof CLAUDE_CONNECTOR_PLUGIN_ID;

export function mcpResource(origin: string, connectorId: OAuthConnectorId = GROK_CONNECTOR_PLUGIN_ID) {
  return `${origin.replace(/\/$/, '')}/api/plugins/${connectorId}/mcp`;
}

export function scopesForResource(resource: string) {
  return [GROK_READ_SCOPE, GROK_WRITE_SCOPE, ...APP_MAKER_SCOPES];
}

function connectorIdForResource(resource: string) {
  if (resource.includes(`/plugins/${CLAUDE_CONNECTOR_PLUGIN_ID}/`)) return CLAUDE_CONNECTOR_PLUGIN_ID;
  return resource.includes(`/plugins/${CHATGPT_CONNECTOR_PLUGIN_ID}/`)
    ? CHATGPT_CONNECTOR_PLUGIN_ID
    : GROK_CONNECTOR_PLUGIN_ID;
}

async function isConnectorEnabledForResource(teamId: number, userId: number, resource: string) {
  const assignment = await db.query.teamMemberPlugins.findFirst({
    where: and(
      eq(teamMemberPlugins.teamId, teamId),
      eq(teamMemberPlugins.userId, userId),
      eq(teamMemberPlugins.pluginId, connectorIdForResource(resource)),
      eq(teamMemberPlugins.enabled, true),
    ),
    columns: { id: true },
  });
  return Boolean(assignment);
}

export function hashCredential(secret: string) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function opaqueSecret(prefix: string) {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
}

function timingSafeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyPkce(verifier: string, challenge: string) {
  const computed = crypto.createHash('sha256').update(verifier, 'utf8').digest('base64url');
  return timingSafeEqualText(computed, challenge);
}

export async function resolveGrokTarget(): Promise<GrokTarget | null> {
  const [row] = await db
    .select({ userId: users.id, email: users.email, teamId: teamMembers.teamId, enabled: teamMemberPlugins.enabled })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .innerJoin(
      teamMemberPlugins,
      and(
        eq(teamMemberPlugins.teamId, teamMembers.teamId),
        eq(teamMemberPlugins.userId, users.id),
        inArray(teamMemberPlugins.pluginId, [GROK_CONNECTOR_PLUGIN_ID, CHATGPT_CONNECTOR_PLUGIN_ID, CLAUDE_CONNECTOR_PLUGIN_ID]),
      ),
    )
    .where(and(eq(users.email, GROK_TARGET_EMAIL), eq(teamMemberPlugins.enabled, true)))
    .limit(1);

  if (!row?.enabled) return null;
  return { teamId: row.teamId, userId: row.userId, email: row.email };
}

export async function assertDashboardAccess(teamId: number, userId: number, email: string) {
  if (email.toLowerCase() !== GROK_TARGET_EMAIL) return false;
  const [override] = await db
    .select({ enabled: teamMemberPlugins.enabled })
    .from(teamMemberPlugins)
    .where(
      and(
        eq(teamMemberPlugins.teamId, teamId),
        eq(teamMemberPlugins.userId, userId),
        eq(teamMemberPlugins.pluginId, GROK_CONNECTOR_PLUGIN_ID),
      ),
    )
    .limit(1);
  return override?.enabled === true;
}

export async function registerOAuthClient(input: {
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
}) {
  const target = await resolveGrokTarget();
  if (!target) throw new Error('connector_unavailable');
  const clientId = opaqueSecret('grok_client_');
  const [client] = await db
    .insert(grokConnectorOAuthClients)
    .values({
      ...target,
      clientId,
      clientName: input.clientName,
      redirectUris: input.redirectUris,
      grantTypes: input.grantTypes,
      responseTypes: input.responseTypes,
      tokenEndpointAuthMethod: 'none',
    })
    .returning();
  return client;
}

export async function getOAuthClient(clientId: string) {
  const [client] = await db
    .select()
    .from(grokConnectorOAuthClients)
    .where(eq(grokConnectorOAuthClients.clientId, clientId))
    .limit(1);
  if (!client) return null;
  const target = await resolveGrokTarget();
  if (!target || target.teamId !== client.teamId || target.userId !== client.userId) return null;
  return client;
}

export async function createLinkCode(target: GrokTarget) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let index = 0; index < 8; index += 1) code += alphabet[crypto.randomInt(alphabet.length)];
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await db.insert(grokConnectorCredentials).values({
    ...target,
    kind: 'link_code',
    secretHash: hashCredential(code),
    expiresAt,
  });
  await db.insert(activityLogs).values({
    teamId: target.teamId,
    userId: target.userId,
    action: 'GROK_LINK_CODE_CREATED',
    ipAddress: 'Dashboard',
  });
  return { code, expiresAt };
}

export async function consumeLinkCodeAndIssueAuthorization(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scopes: string[];
}) {
  const client = await getOAuthClient(input.clientId);
  if (!client || !client.redirectUris.includes(input.redirectUri)) throw new Error('invalid_client');
  if (!(await isConnectorEnabledForResource(client.teamId, client.userId, input.resource))) throw new Error('invalid_client');
  const normalizedCode = input.code.replace(/[\s-]/g, '').toUpperCase();
  const now = new Date();
  const [linkCode] = await db
    .select()
    .from(grokConnectorCredentials)
    .where(
      and(
        eq(grokConnectorCredentials.teamId, client.teamId),
        eq(grokConnectorCredentials.userId, client.userId),
        eq(grokConnectorCredentials.kind, 'link_code'),
        eq(grokConnectorCredentials.secretHash, hashCredential(normalizedCode)),
        isNull(grokConnectorCredentials.revokedAt),
        gt(grokConnectorCredentials.expiresAt, now),
      ),
    )
    .limit(1);
  if (!linkCode) throw new Error('invalid_link_code');

  const authorizationBinding = {
    authorizationClientId: client.clientId,
    authorizationRedirectUri: input.redirectUri,
    authorizationCodeChallenge: input.codeChallenge,
    authorizationResource: input.resource,
  };

  const authorizationCode = opaqueSecret('grok_code_');
  await db.transaction(async (tx) => {
    const consumed = await tx
      .update(grokConnectorCredentials)
      .set({ usedAt: now, updatedAt: now, metadata: authorizationBinding })
      .where(and(eq(grokConnectorCredentials.id, linkCode.id), isNull(grokConnectorCredentials.usedAt)))
      .returning({ id: grokConnectorCredentials.id });
    if (!consumed.length) throw new Error('invalid_link_code');

    await tx.insert(grokConnectorCredentials).values({
      teamId: client.teamId,
      userId: client.userId,
      clientId: client.clientId,
      kind: 'authorization_code',
      secretHash: hashCredential(authorizationCode),
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      resource: input.resource,
      scopes: input.scopes,
      metadata: { linkCodeId: linkCode.id },
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    });
    await tx.insert(activityLogs).values({
      teamId: client.teamId,
      userId: client.userId,
      action: 'GROK_CONNECTION_GRANTED',
      ipAddress: client.clientName,
    });
  });
  return authorizationCode;
}

async function createTokenPair(input: { teamId: number; userId: number; clientId: string; resource: string; scopes: string[]; familyId?: string }) {
  const accessToken = opaqueSecret('grok_access_');
  const refreshToken = opaqueSecret('grok_refresh_');
  const familyId = input.familyId || crypto.randomUUID();
  const now = Date.now();
  await db.insert(grokConnectorCredentials).values([
    {
      ...input,
      familyId,
      kind: 'access_token',
      scopes: input.scopes,
      secretHash: hashCredential(accessToken),
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
    },
    {
      ...input,
      familyId,
      kind: 'refresh_token',
      scopes: input.scopes,
      secretHash: hashCredential(refreshToken),
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    },
  ]);
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_MS / 1000, scopes: input.scopes };
}

export async function exchangeAuthorizationCode(input: {
  clientId: string;
  code: string;
  redirectUri: string;
  verifier: string;
  resource: string;
}) {
  const client = await getOAuthClient(input.clientId);
  if (!client) throw new Error('invalid_client');
  const now = new Date();
  const [credential] = await db
    .select()
    .from(grokConnectorCredentials)
    .where(
      and(
        eq(grokConnectorCredentials.kind, 'authorization_code'),
        eq(grokConnectorCredentials.clientId, input.clientId),
        eq(grokConnectorCredentials.secretHash, hashCredential(input.code)),
        isNull(grokConnectorCredentials.usedAt),
        isNull(grokConnectorCredentials.revokedAt),
        gt(grokConnectorCredentials.expiresAt, now),
      ),
    )
    .limit(1);
  if (
    !credential ||
    credential.redirectUri !== input.redirectUri ||
    credential.resource !== input.resource ||
    !credential.codeChallenge ||
    !verifyPkce(input.verifier, credential.codeChallenge)
  ) throw new Error('invalid_grant');

  const consumed = await db
    .update(grokConnectorCredentials)
    .set({ usedAt: now, updatedAt: now })
    .where(and(eq(grokConnectorCredentials.id, credential.id), isNull(grokConnectorCredentials.usedAt)))
    .returning({ id: grokConnectorCredentials.id });
  if (!consumed.length) throw new Error('invalid_grant');
  return createTokenPair({
    teamId: credential.teamId,
    userId: credential.userId,
    clientId: input.clientId,
    resource: input.resource,
    scopes: credential.scopes,
  });
}

export async function exchangeRefreshToken(input: { clientId: string; refreshToken: string; resource: string }) {
  const client = await getOAuthClient(input.clientId);
  if (!client) throw new Error('invalid_client');
  const now = new Date();
  const [credential] = await db
    .select()
    .from(grokConnectorCredentials)
    .where(
      and(
        eq(grokConnectorCredentials.kind, 'refresh_token'),
        eq(grokConnectorCredentials.clientId, input.clientId),
        eq(grokConnectorCredentials.secretHash, hashCredential(input.refreshToken)),
        isNull(grokConnectorCredentials.usedAt),
        isNull(grokConnectorCredentials.revokedAt),
        gt(grokConnectorCredentials.expiresAt, now),
      ),
    )
    .limit(1);
  if (!credential || credential.resource !== input.resource) throw new Error('invalid_grant');
  const rotated = await db
    .update(grokConnectorCredentials)
    .set({ usedAt: now, updatedAt: now })
    .where(and(eq(grokConnectorCredentials.id, credential.id), isNull(grokConnectorCredentials.usedAt)))
    .returning({ id: grokConnectorCredentials.id });
  if (!rotated.length) throw new Error('invalid_grant');
  return createTokenPair({
    teamId: credential.teamId,
    userId: credential.userId,
    clientId: input.clientId,
    resource: input.resource,
    scopes: credential.scopes,
    familyId: credential.familyId || undefined,
  });
}

function consumeRateLimit(id: number) {
  const now = Date.now();
  let bucket = usageBuckets.get(id);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) bucket = { startedAt: now, count: 0 };
  bucket.count += 1;
  usageBuckets.set(id, bucket);
  return { allowed: bucket.count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - bucket.count), resetAt: Math.ceil((bucket.startedAt + RATE_WINDOW_MS) / 1000) };
}

export async function authenticateMcp(authorization: string | null, resource: string) {
  if (!authorization?.startsWith('Bearer ')) return { ok: false as const, status: 401, code: 'missing_token' };
  const secret = authorization.slice(7).trim();
  if (!secret.startsWith('grok_access_')) return { ok: false as const, status: 401, code: 'invalid_token' };
  const now = new Date();
  const [credential] = await db
    .select()
    .from(grokConnectorCredentials)
    .where(
      and(
        eq(grokConnectorCredentials.kind, 'access_token'),
        eq(grokConnectorCredentials.secretHash, hashCredential(secret)),
        eq(grokConnectorCredentials.resource, resource),
        isNull(grokConnectorCredentials.revokedAt),
        gt(grokConnectorCredentials.expiresAt, now),
      ),
    )
    .limit(1);
  if (!credential) return { ok: false as const, status: 401, code: 'invalid_token' };
  const target = await resolveGrokTarget();
  if (!target || target.teamId !== credential.teamId || target.userId !== credential.userId) {
    return { ok: false as const, status: 401, code: 'connector_disabled' };
  }
  if (!(await isConnectorEnabledForResource(credential.teamId, credential.userId, resource))) {
    return { ok: false as const, status: 401, code: 'connector_disabled' };
  }
  const rate = consumeRateLimit(credential.id);
  if (!rate.allowed) return { ok: false as const, status: 429, code: 'rate_limit_exceeded', rate };
  if (!credential.lastUsedAt || Date.now() - credential.lastUsedAt.getTime() > 5 * 60_000) {
    void db.update(grokConnectorCredentials)
      .set({ lastUsedAt: now, updatedAt: now })
      .where(and(eq(grokConnectorCredentials.id, credential.id), or(isNull(grokConnectorCredentials.lastUsedAt), lt(grokConnectorCredentials.lastUsedAt, new Date(Date.now() - 5 * 60_000)))))
      .catch((error) => console.error('[grok-connector] Could not update usage', error));
  }
  return { ok: true as const, teamId: credential.teamId, userId: credential.userId, tokenId: credential.id, scopes: credential.scopes, rate };
}

export async function listConnections(target: GrokTarget, resource?: string) {
  const credentials = await db
    .select()
    .from(grokConnectorCredentials)
    .where(
      and(
        eq(grokConnectorCredentials.teamId, target.teamId),
        eq(grokConnectorCredentials.userId, target.userId),
        eq(grokConnectorCredentials.kind, 'refresh_token'),
        isNull(grokConnectorCredentials.revokedAt),
        isNull(grokConnectorCredentials.usedAt),
        gt(grokConnectorCredentials.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(grokConnectorCredentials.createdAt));
  const seen = new Set<string>();
  const result: Array<{ clientId: string; clientName: string; createdAt: Date; lastUsedAt: Date | null; expiresAt: Date; scopes: string[] }> = [];
  for (const credential of credentials) {
    if (resource && credential.resource !== resource) continue;
    if (!credential.clientId || seen.has(credential.clientId)) continue;
    seen.add(credential.clientId);
    const client = await getOAuthClient(credential.clientId);
    if (!client) continue;
    result.push({
      clientId: credential.clientId,
      clientName: client.clientName,
      createdAt: credential.createdAt,
      lastUsedAt: credential.lastUsedAt,
      expiresAt: credential.expiresAt,
      scopes: credential.scopes,
    });
  }
  return result;
}

export async function revokeConnection(target: GrokTarget, clientId: string) {
  const now = new Date();
  const revoked = await db
    .update(grokConnectorCredentials)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(grokConnectorCredentials.teamId, target.teamId),
        eq(grokConnectorCredentials.userId, target.userId),
        eq(grokConnectorCredentials.clientId, clientId),
        isNull(grokConnectorCredentials.revokedAt),
      ),
    )
    .returning({ id: grokConnectorCredentials.id });
  if (revoked.length) {
    await db.insert(activityLogs).values({
      teamId: target.teamId,
      userId: target.userId,
      action: 'GROK_CONNECTION_REVOKED',
      ipAddress: 'Dashboard',
    });
  }
  return revoked.length;
}

export async function revokeToken(secret: string) {
  const [credential] = await db
    .select()
    .from(grokConnectorCredentials)
    .where(eq(grokConnectorCredentials.secretHash, hashCredential(secret)))
    .limit(1);
  if (!credential) return;
  const now = new Date();
  if (credential.familyId) {
    await db.update(grokConnectorCredentials).set({ revokedAt: now, updatedAt: now }).where(eq(grokConnectorCredentials.familyId, credential.familyId));
  } else {
    await db.update(grokConnectorCredentials).set({ revokedAt: now, updatedAt: now }).where(eq(grokConnectorCredentials.id, credential.id));
  }
}
