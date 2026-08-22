import 'server-only';

import { and, desc, eq, isNull, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, readOnlyApiTokens, teamMemberPlugins } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { createReadOnlyTokenSecret, hashReadOnlyToken, READ_ONLY_TOKEN_PREFIX } from '@/lib/readonly-api/auth';

export const CLAUDE_CODE_CONNECTOR_PLUGIN_ID = 'claude-code-connector';
export const CLAUDE_CODE_TARGET_EMAIL = 'noelia@whatspro.uno';
const TOKEN_NAME = 'Claude Code Connector';
const TOKEN_TTL_MS = 90 * 24 * 60 * 60_000;

export type ClaudeCodeTarget = { teamId: number; userId: number; email: string };

export function requestOrigin(request: Request) {
  const configuredOrigin = process.env.BASE_URL?.trim();
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, '');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin;
}

export async function getClaudeCodeTarget(): Promise<ClaudeCodeTarget | null> {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user || user.email.trim().toLowerCase() !== CLAUDE_CODE_TARGET_EMAIL) return null;

  const [access] = await db
    .select({ enabled: teamMemberPlugins.enabled })
    .from(teamMemberPlugins)
    .where(and(
      eq(teamMemberPlugins.teamId, team.id),
      eq(teamMemberPlugins.userId, user.id),
      eq(teamMemberPlugins.pluginId, CLAUDE_CODE_CONNECTOR_PLUGIN_ID),
    ))
    .limit(1);

  if (access?.enabled !== true) return null;
  return { teamId: team.id, userId: user.id, email: user.email };
}

export async function listClaudeCodeTokens(target: ClaudeCodeTarget) {
  return db
    .select({
      id: readOnlyApiTokens.id,
      tokenPrefix: readOnlyApiTokens.tokenPrefix,
      tokenLastFour: readOnlyApiTokens.tokenLastFour,
      expiresAt: readOnlyApiTokens.expiresAt,
      lastUsedAt: readOnlyApiTokens.lastUsedAt,
      revokedAt: readOnlyApiTokens.revokedAt,
      createdAt: readOnlyApiTokens.createdAt,
    })
    .from(readOnlyApiTokens)
    .where(and(
      eq(readOnlyApiTokens.teamId, target.teamId),
      eq(readOnlyApiTokens.createdBy, target.userId),
      like(readOnlyApiTokens.name, `${TOKEN_NAME}%`),
    ))
    .orderBy(desc(readOnlyApiTokens.createdAt));
}

export async function createClaudeCodeToken(target: ClaudeCodeTarget) {
  const secret = createReadOnlyTokenSecret();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(readOnlyApiTokens).values({
      teamId: target.teamId,
      createdBy: target.userId,
      name: TOKEN_NAME,
      tokenHash: hashReadOnlyToken(secret),
      tokenPrefix: READ_ONLY_TOKEN_PREFIX,
      tokenLastFour: secret.slice(-4),
      scopes: ['read:*'],
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
    });
    await tx.insert(activityLogs).values({
      teamId: target.teamId,
      userId: target.userId,
      action: 'claude_code_connector.token_created',
    });
  });

  return secret;
}

export async function revokeClaudeCodeToken(target: ClaudeCodeTarget, tokenId: number) {
  const [token] = await db
    .select({ id: readOnlyApiTokens.id })
    .from(readOnlyApiTokens)
    .where(and(
      eq(readOnlyApiTokens.id, tokenId),
      eq(readOnlyApiTokens.teamId, target.teamId),
      eq(readOnlyApiTokens.createdBy, target.userId),
      like(readOnlyApiTokens.name, `${TOKEN_NAME}%`),
      isNull(readOnlyApiTokens.revokedAt),
    ))
    .limit(1);

  if (!token) return false;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(readOnlyApiTokens).set({ revokedAt: now, updatedAt: now }).where(eq(readOnlyApiTokens.id, token.id));
    await tx.insert(activityLogs).values({
      teamId: target.teamId,
      userId: target.userId,
      action: 'claude_code_connector.token_revoked',
    });
  });
  return true;
}
