import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { socialAccounts, socialPosts, socialPostTargets } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { validatePostForPlatform, type SocialPlatform } from '@/lib/social/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<{ id: string }> };

async function findTeamPost(postId: number, teamId: number) {
  return db.query.socialPosts.findFirst({
    where: and(eq(socialPosts.id, postId), eq(socialPosts.teamId, teamId)),
    with: {
      targets: {
        with: {
          account: {
            columns: { id: true, platform: true, name: true, username: true, pictureUrl: true, status: true },
          },
        },
      },
    },
  });
}

// ─── GET: detalle ─────────────────────────────────────────────────────────────

export async function GET(_request: Request, context: RouteContext) {
  const ctx = await getPluginRequestContext('socialPublisherRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await context.params;
  const postId = parseInt(id, 10);
  if (isNaN(postId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const post = await findTeamPost(postId, ctx.team.id);
  if (!post) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });

  return NextResponse.json(post);
}

// ─── PATCH: editar borrador/programado ────────────────────────────────────────

const mediaItemSchema = z.object({
  url: z.string().url(),
  type: z.enum(['image', 'video']),
  order: z.number().int().min(0),
});

const updateSchema = z.object({
  caption: z.string().max(63206).nullable().optional(),
  link: z.string().url().nullable().optional(),
  format: z.enum(['post', 'reel', 'story']).optional(),
  mediaItems: z.array(mediaItemSchema).max(10).optional(),
  accountIds: z.array(z.number().int()).min(1).optional(),
  mode: z.enum(['now', 'scheduled', 'draft']).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const ctx = await getPluginRequestContext('socialPublisherWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await context.params;
  const postId = parseInt(id, 10);
  if (isNaN(postId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const post = await findTeamPost(postId, ctx.team.id);
  if (!post) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
  if (!['draft', 'scheduled'].includes(post.status)) {
    return NextResponse.json({ error: 'Solo se pueden editar borradores o publicaciones programadas' }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Resolver cuentas destino (las nuevas si cambian, las actuales si no)
  let targetAccounts;
  if (d.accountIds) {
    const accounts = await db.select().from(socialAccounts).where(inArray(socialAccounts.id, d.accountIds));
    targetAccounts = accounts.filter((a) => a.teamId === ctx.team.id);
    if (targetAccounts.length !== d.accountIds.length) {
      return NextResponse.json({ error: 'Alguna cuenta destino no existe o no pertenece al equipo' }, { status: 400 });
    }
  } else {
    targetAccounts = post.targets.map((t) => t.account);
  }

  const format = d.format ?? post.format;
  const caption = d.caption !== undefined ? d.caption : post.caption;
  const link = d.link !== undefined ? d.link : post.link;
  const mediaItems = d.mediaItems ?? post.mediaItems;

  const validationErrors: string[] = [];
  for (const account of targetAccounts) {
    const errors = validatePostForPlatform({
      platform: account.platform as SocialPlatform,
      format: format as any,
      caption,
      link,
      mediaItems,
    });
    validationErrors.push(...errors.map((e) => `${account.name}: ${e}`));
  }
  if (validationErrors.length) {
    return NextResponse.json({ error: validationErrors.join(' · ') }, { status: 422 });
  }

  let status = post.status;
  let scheduledAt = post.scheduledAt;
  if (d.mode === 'now') {
    status = 'publishing';
    scheduledAt = null;
  } else if (d.mode === 'scheduled') {
    const when = d.scheduledAt ? new Date(d.scheduledAt) : post.scheduledAt;
    if (!when || when.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'La fecha programada debe ser futura' }, { status: 400 });
    }
    status = 'scheduled';
    scheduledAt = when;
  } else if (d.mode === 'draft') {
    status = 'draft';
  } else if (d.scheduledAt !== undefined) {
    scheduledAt = d.scheduledAt ? new Date(d.scheduledAt) : null;
  }

  const [updated] = await db
    .update(socialPosts)
    .set({
      status,
      format,
      caption,
      link,
      mediaItems,
      scheduledAt,
      timezone: d.timezone !== undefined ? d.timezone : post.timezone,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, post.id))
    .returning();

  if (d.accountIds) {
    await db.delete(socialPostTargets).where(eq(socialPostTargets.postId, post.id));
    await db.insert(socialPostTargets).values(
      targetAccounts.map((account) => ({
        postId: post.id,
        socialAccountId: account.id,
        platform: account.platform,
      })),
    );
  }

  return NextResponse.json(updated);
}

// ─── POST: acciones (retry) ───────────────────────────────────────────────────

export async function POST(request: Request, context: RouteContext) {
  const ctx = await getPluginRequestContext('socialPublisherWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await context.params;
  const postId = parseInt(id, 10);
  if (isNaN(postId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'retry') {
    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  }

  const post = await findTeamPost(postId, ctx.team.id);
  if (!post) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
  if (!['failed', 'partially_published'].includes(post.status)) {
    return NextResponse.json({ error: 'Solo se pueden reintentar publicaciones fallidas' }, { status: 409 });
  }

  const now = new Date();
  await db
    .update(socialPostTargets)
    .set({ status: 'pending', attemptCount: 0, errorMessage: null, igContainerId: null, updatedAt: now })
    .where(and(eq(socialPostTargets.postId, post.id), eq(socialPostTargets.status, 'failed')));

  await db
    .update(socialPosts)
    .set({ status: 'publishing', updatedAt: now })
    .where(eq(socialPosts.id, post.id));

  return NextResponse.json({ success: true });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(_request: Request, context: RouteContext) {
  const ctx = await getPluginRequestContext('socialPublisherWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await context.params;
  const postId = parseInt(id, 10);
  if (isNaN(postId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [deleted] = await db
    .delete(socialPosts)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.teamId, ctx.team.id)))
    .returning({ id: socialPosts.id });

  if (!deleted) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });

  return NextResponse.json({ success: true });
}
