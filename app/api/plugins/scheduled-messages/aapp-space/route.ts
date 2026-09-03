import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  evolutionInstances,
  teamAappConnections,
  teamAappRenewalCandidates,
  teamAappRenewalConfigs,
} from '@/lib/db/schema';
import { getAappRenewalRequestContext } from '@/lib/plugins/scheduled-messages/aapp-renewal-access';
import {
  ensureAappRenewalConfig,
  isValidTimeZone,
  listAappRenewalCandidates,
  materializeAappRenewalCandidates,
  auditAappRenewal,
  nextConfiguredSendAt,
} from '@/lib/plugins/scheduled-messages/aapp-renewals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ruleKey = z.enum(['before_30', 'before_14', 'before_3', 'expired']);
const templatesSchema = z.object({
  before_30: z.string().trim().min(1).max(4000),
  before_14: z.string().trim().min(1).max(4000),
  before_3: z.string().trim().min(1).max(4000),
  expired: z.string().trim().min(1).max(4000),
});
const configSchema = z.object({
  enabled: z.boolean(),
  instanceId: z.number().int().positive().nullable(),
  recipientSource: z.enum(['account', 'website', 'store']),
  sendHour: z.number().int().min(0).max(23),
  sendMinute: z.number().int().min(0).max(59),
  timezone: z.string().trim().min(1).max(100),
  templates: templatesSchema,
  enabledRuleKeys: z.array(ruleKey),
});

export async function GET(request: Request) {
  const ctx = await getAappRenewalRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const requestedTimezone = new URL(request.url).searchParams.get('timezone') || 'UTC';
  const config = await ensureAappRenewalConfig(ctx.team.id, ctx.user.id, requestedTimezone);
  if (!config) return NextResponse.json({ error: 'Could not load configuration' }, { status: 500 });
  // Pending notices are prepared even while delivery is disabled, so the team
  // can review the complete calendar before activating or approving anything.
  await materializeAappRenewalCandidates(ctx.team.id, ctx.user.id);
  const [candidates, connection] = await Promise.all([
    listAappRenewalCandidates(ctx.team.id),
    db.query.teamAappConnections.findFirst({
      where: eq(teamAappConnections.teamId, ctx.team.id),
      columns: { status: true, lastSyncedAt: true, lastSyncStatus: true, lastSyncError: true, apiKey: true },
    }),
  ]);
  return NextResponse.json({
    config,
    candidates,
    connection: {
      connected: Boolean(connection?.apiKey),
      status: connection?.status ?? 'disconnected',
      lastSyncedAt: connection?.lastSyncedAt ?? null,
      lastSyncStatus: connection?.lastSyncStatus ?? null,
      lastSyncError: connection?.lastSyncError ?? null,
    },
  });
}

export async function PATCH(request: Request) {
  const ctx = await getAappRenewalRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!isValidTimeZone(parsed.data.timezone)) return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
  if (parsed.data.instanceId) {
    const instance = await db.query.evolutionInstances.findFirst({
      where: and(eq(evolutionInstances.id, parsed.data.instanceId), eq(evolutionInstances.teamId, ctx.team.id)),
      columns: { id: true },
    });
    if (!instance) return NextResponse.json({ error: 'Invalid WhatsApp instance' }, { status: 400 });
  }
  const [config] = await db.insert(teamAappRenewalConfigs).values({
    teamId: ctx.team.id,
    ...parsed.data,
    createdBy: ctx.user.id,
    updatedBy: ctx.user.id,
  }).onConflictDoUpdate({
    target: teamAappRenewalConfigs.teamId,
    set: { ...parsed.data, updatedBy: ctx.user.id, updatedAt: new Date() },
  }).returning();
  if (!config.enabled) {
    await db.update(teamAappRenewalCandidates).set({
      status: 'pending', approvedAt: null, approvedBy: null, updatedAt: new Date(),
    }).where(and(
      eq(teamAappRenewalCandidates.teamId, ctx.team.id),
      eq(teamAappRenewalCandidates.status, 'approved'),
    ));
  } else {
    const approved = await db.select({ id: teamAappRenewalCandidates.id, dueDate: teamAappRenewalCandidates.dueDate })
      .from(teamAappRenewalCandidates)
      .where(and(eq(teamAappRenewalCandidates.teamId, ctx.team.id), eq(teamAappRenewalCandidates.status, 'approved')));
    for (const candidate of approved) {
      await db.update(teamAappRenewalCandidates).set({
        sendAt: nextConfiguredSendAt(config, candidate.dueDate),
        updatedAt: new Date(),
      }).where(and(eq(teamAappRenewalCandidates.id, candidate.id), eq(teamAappRenewalCandidates.teamId, ctx.team.id)));
    }
  }
  const materialized = await materializeAappRenewalCandidates(ctx.team.id, ctx.user.id, { refreshPending: true });
  await auditAappRenewal(ctx.team.id, ctx.user.id, 'config_updated', {
    enabled: config.enabled,
    recipientSource: config.recipientSource,
    timezone: config.timezone,
  });
  return NextResponse.json({ config, materialized });
}
