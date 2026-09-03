'use server';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { activityLogs, readOnlyApiTokens } from '@/lib/db/schema';
import {
  getReadOnlyApiManager,
  isReadOnlyApiDocsUnlocked,
  lockReadOnlyApiDocs,
  unlockReadOnlyApiDocs,
} from '@/lib/readonly-api/access';
import { createReadOnlyTokenSecret, hashReadOnlyToken, READ_ONLY_TOKEN_PREFIX } from '@/lib/readonly-api/auth';

const tokenInput = z.object({
  name: z.string().trim().min(3).max(120),
  expiresInDays: z.number().int().min(1).max(365).nullable(),
});

async function requireUnlockedManager() {
  const manager = await getReadOnlyApiManager();
  if (!manager) throw new Error('forbidden');
  if (!(await isReadOnlyApiDocsUnlocked(manager.user.id))) throw new Error('docs_locked');
  return manager;
}

export async function unlockDocumentation(code: string) {
  const manager = await getReadOnlyApiManager();
  if (!manager) return { ok: false as const, error: 'forbidden' };
  const ok = await unlockReadOnlyApiDocs(code, manager.user.id);
  if (!ok) return { ok: false as const, error: 'invalid_code' };
  revalidatePath('/settings/developers/read-only');
  return { ok: true as const };
}

export async function lockDocumentation() {
  const manager = await getReadOnlyApiManager();
  if (!manager) return { ok: false as const };
  await lockReadOnlyApiDocs();
  revalidatePath('/settings/developers/read-only');
  return { ok: true as const };
}

export async function getReadOnlyTokens() {
  const { team } = await requireUnlockedManager();
  return db
    .select({
      id: readOnlyApiTokens.id,
      name: readOnlyApiTokens.name,
      tokenPrefix: readOnlyApiTokens.tokenPrefix,
      tokenLastFour: readOnlyApiTokens.tokenLastFour,
      scopes: readOnlyApiTokens.scopes,
      expiresAt: readOnlyApiTokens.expiresAt,
      lastUsedAt: readOnlyApiTokens.lastUsedAt,
      revokedAt: readOnlyApiTokens.revokedAt,
      createdAt: readOnlyApiTokens.createdAt,
    })
    .from(readOnlyApiTokens)
    .where(eq(readOnlyApiTokens.teamId, team.id))
    .orderBy(desc(readOnlyApiTokens.createdAt));
}

export async function createReadOnlyToken(input: { name: string; expiresInDays: number | null }) {
  const manager = await requireUnlockedManager();
  const parsed = tokenInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'invalid_token_input' };

  const secret = createReadOnlyTokenSecret();
  const now = new Date();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(now.getTime() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await db.transaction(async (tx) => {
    await tx.insert(readOnlyApiTokens).values({
      teamId: manager.team.id,
      createdBy: manager.user.id,
      name: parsed.data.name,
      tokenHash: hashReadOnlyToken(secret),
      tokenPrefix: READ_ONLY_TOKEN_PREFIX,
      tokenLastFour: secret.slice(-4),
      scopes: ['read:*'],
      expiresAt,
    });
    await tx.insert(activityLogs).values({
      teamId: manager.team.id,
      userId: manager.user.id,
      action: `readonly_api.token_created:${parsed.data.name}`,
    });
  });

  revalidatePath('/settings/developers/read-only');
  return { ok: true as const, token: secret };
}

export async function revokeReadOnlyToken(id: number) {
  const manager = await requireUnlockedManager();
  if (!Number.isInteger(id) || id < 1) return { ok: false as const, error: 'invalid_token_id' };

  const [token] = await db
    .select({ id: readOnlyApiTokens.id, name: readOnlyApiTokens.name })
    .from(readOnlyApiTokens)
    .where(and(eq(readOnlyApiTokens.id, id), eq(readOnlyApiTokens.teamId, manager.team.id), isNull(readOnlyApiTokens.revokedAt)))
    .limit(1);
  if (!token) return { ok: false as const, error: 'token_not_found' };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(readOnlyApiTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(readOnlyApiTokens.id, token.id), eq(readOnlyApiTokens.teamId, manager.team.id)));
    await tx.insert(activityLogs).values({
      teamId: manager.team.id,
      userId: manager.user.id,
      action: `readonly_api.token_revoked:${token.name}`,
    });
  });

  revalidatePath('/settings/developers/read-only');
  return { ok: true as const };
}
