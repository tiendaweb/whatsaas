import { NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { socialAccounts, socialPosts, socialPostTargets } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { enforceFeature } from '@/lib/limits';
import { validatePostForPlatform, type SocialPlatform } from '@/lib/social/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const mediaItemSchema = z.object({
  url: z.string().url(),
  type: z.enum(['image', 'video']),
  order: z.number().int().min(0),
});

const createSchema = z.object({
  caption: z.string().max(63206).nullable().optional(),
  link: z.string().url().nullable().optional(),
  format: z.enum(['post', 'reel', 'story']).default('post'),
  mediaItems: z.array(mediaItemSchema).max(10).default([]),
  accountIds: z.array(z.number().int()).min(1),
  // 'now' publica de inmediato; 'scheduled' requiere scheduledAt futuro; 'draft' guarda borrador
  mode: z.enum(['now', 'scheduled', 'draft']).default('draft'),
  scheduledAt: z.string().datetime().nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
});

// ─── GET: lista de posts con sus destinos ─────────────────────────────────────

export async function GET() {
  const ctx = await getPluginRequestContext('socialPublisherRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const posts = await db.query.socialPosts.findMany({
    where: eq(socialPosts.teamId, ctx.team.id),
    orderBy: [desc(socialPosts.createdAt)],
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

  return NextResponse.json(posts);
}

// ─── POST: crear publicación (borrador, programada o inmediata) ───────────────

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('socialPublisherWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  try {
    await enforceFeature(ctx.team.id, 'isSocialPublisherEnabled');
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  // Las cuentas destino deben pertenecer al equipo
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(inArray(socialAccounts.id, d.accountIds));
  const teamAccounts = accounts.filter((a) => a.teamId === ctx.team.id);
  if (teamAccounts.length !== d.accountIds.length) {
    return NextResponse.json({ error: 'Alguna cuenta destino no existe o no pertenece al equipo' }, { status: 400 });
  }

  // Validación de formato por plataforma destino
  const validationErrors: string[] = [];
  for (const account of teamAccounts) {
    const errors = validatePostForPlatform({
      platform: account.platform as SocialPlatform,
      format: d.format,
      caption: d.caption,
      link: d.link,
      mediaItems: d.mediaItems,
    });
    validationErrors.push(...errors.map((e) => `${account.name}: ${e}`));
  }
  if (validationErrors.length) {
    return NextResponse.json({ error: validationErrors.join(' · ') }, { status: 422 });
  }

  let scheduledAt: Date | null = null;
  if (d.mode === 'scheduled') {
    scheduledAt = d.scheduledAt ? new Date(d.scheduledAt) : null;
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'La fecha programada debe ser futura' }, { status: 400 });
    }
  }

  const status = d.mode === 'now' ? 'publishing' : d.mode === 'scheduled' ? 'scheduled' : 'draft';

  const [post] = await db
    .insert(socialPosts)
    .values({
      teamId: ctx.team.id,
      status,
      format: d.format,
      caption: d.caption ?? null,
      link: d.link ?? null,
      mediaItems: d.mediaItems,
      scheduledAt,
      timezone: d.timezone ?? null,
      createdBy: ctx.user.id,
    })
    .returning();

  await db.insert(socialPostTargets).values(
    teamAccounts.map((account) => ({
      postId: post.id,
      socialAccountId: account.id,
      platform: account.platform,
    })),
  );

  // En modo 'now' el cron (cada minuto) recoge el post en estado publishing.
  return NextResponse.json(post, { status: 201 });
}
