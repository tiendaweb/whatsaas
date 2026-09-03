import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  socialPosts,
  socialPostTargets,
  socialAccounts,
  type SocialPost,
} from '@/lib/db/schema';
import { and, eq, lte, sql } from 'drizzle-orm';
import { publishTarget, applyTargetOutcome, mapPublishError } from '@/lib/social/publisher';
import {
  getIgContainerStatus,
  publishIgContainer,
  getIgMediaPermalink,
} from '@/lib/social/meta-graph';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TARGETS_PER_TICK = 20;
const CONTAINER_TIMEOUT_MS = 30 * 60 * 1000; // contenedor IG sin terminar tras 30 min → failed

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/publish-social] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const summary = { promoted: 0, dispatched: 0, containersChecked: 0, postsClosed: 0 };

  try {
    // 1. Promover posts programados que ya vencieron
    const promoted = await db
      .update(socialPosts)
      .set({ status: 'publishing', updatedAt: now })
      .where(and(eq(socialPosts.status, 'scheduled'), lte(socialPosts.scheduledAt, now)))
      .returning({ id: socialPosts.id });
    summary.promoted = promoted.length;

    // 2. Despachar targets pendientes de posts en publishing
    const pendingTargets = await db
      .select({
        target: socialPostTargets,
        post: socialPosts,
        account: socialAccounts,
      })
      .from(socialPostTargets)
      .innerJoin(socialPosts, eq(socialPostTargets.postId, socialPosts.id))
      .innerJoin(socialAccounts, eq(socialPostTargets.socialAccountId, socialAccounts.id))
      .where(and(eq(socialPostTargets.status, 'pending'), eq(socialPosts.status, 'publishing')))
      .limit(TARGETS_PER_TICK);

    for (const { target, post, account } of pendingTargets) {
      await db
        .update(socialPostTargets)
        .set({
          status: 'publishing',
          attemptCount: sql`${socialPostTargets.attemptCount} + 1`,
          lastAttemptAt: now,
          updatedAt: now,
        })
        .where(eq(socialPostTargets.id, target.id));

      const outcome = await publishTarget({ ...target, attemptCount: target.attemptCount + 1 }, post, account);
      await applyTargetOutcome(target.id, outcome);
      summary.dispatched++;
    }

    // 3. Sondear contenedores de Instagram pendientes
    const awaiting = await db
      .select({
        target: socialPostTargets,
        post: socialPosts,
        account: socialAccounts,
      })
      .from(socialPostTargets)
      .innerJoin(socialPosts, eq(socialPostTargets.postId, socialPosts.id))
      .innerJoin(socialAccounts, eq(socialPostTargets.socialAccountId, socialAccounts.id))
      .where(eq(socialPostTargets.status, 'awaiting_container'));

    for (const { target, post, account } of awaiting) {
      summary.containersChecked++;
      try {
        if (!target.igContainerId) {
          await applyTargetOutcome(target.id, { status: 'failed', error: 'Contenedor de Instagram sin ID' });
          continue;
        }

        const elapsed = target.lastAttemptAt ? now.getTime() - target.lastAttemptAt.getTime() : 0;
        const containerStatus = await getIgContainerStatus(target.igContainerId, account.accessToken);

        if (containerStatus.status_code === 'FINISHED') {
          const published = await publishIgContainer(account.externalId, account.accessToken, target.igContainerId);
          const permalink = await getIgMediaPermalink(published.id, account.accessToken);
          await applyTargetOutcome(target.id, { status: 'published', externalId: published.id, permalink });
        } else if (containerStatus.status_code === 'ERROR' || containerStatus.status_code === 'EXPIRED') {
          await applyTargetOutcome(target.id, {
            status: 'failed',
            error: `Contenedor de Instagram en estado ${containerStatus.status_code}: ${containerStatus.status || ''}`,
          });
        } else if (elapsed > CONTAINER_TIMEOUT_MS) {
          await applyTargetOutcome(target.id, {
            status: 'failed',
            error: 'El contenedor de Instagram no se procesó en 30 minutos',
          });
        }
        // IN_PROGRESS dentro del plazo → esperar al próximo tick
      } catch (error: any) {
        const outcome = await mapPublishError(error, target, account);
        // En awaiting_container un error transitorio mantiene el estado para re-sondear
        if (outcome.status !== 'pending') {
          await applyTargetOutcome(target.id, outcome);
        }
      }
    }

    // 4. Cerrar posts sin targets activos
    const publishingPosts = await db.query.socialPosts.findMany({
      where: eq(socialPosts.status, 'publishing'),
      with: { targets: true },
    });

    for (const post of publishingPosts as Array<SocialPost & { targets: Array<{ status: string }> }>) {
      const active = post.targets.filter((t) =>
        ['pending', 'publishing', 'awaiting_container'].includes(t.status),
      );
      if (active.length > 0) continue;

      const published = post.targets.filter((t) => t.status === 'published').length;
      const finalStatus =
        published === post.targets.length ? 'published'
        : published > 0 ? 'partially_published'
        : 'failed';

      await db
        .update(socialPosts)
        .set({ status: finalStatus, publishedAt: published > 0 ? now : null, updatedAt: now })
        .where(eq(socialPosts.id, post.id));
      summary.postsClosed++;
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (error: any) {
    console.error('[cron/publish-social] Error:', error);
    return NextResponse.json({ error: error?.message || 'Internal error', ...summary }, { status: 500 });
  }
}
