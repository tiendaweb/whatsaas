import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { socialAccounts } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { enforceFeature } from '@/lib/limits';
import { listUserPages } from '@/lib/social/meta-graph';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─── GET: cuentas conectadas del equipo ───────────────────────────────────────

export async function GET() {
  const ctx = await getPluginRequestContext('socialPublisherRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const accounts = await db
    .select({
      id: socialAccounts.id,
      platform: socialAccounts.platform,
      externalId: socialAccounts.externalId,
      name: socialAccounts.name,
      username: socialAccounts.username,
      pictureUrl: socialAccounts.pictureUrl,
      status: socialAccounts.status,
      linkedFacebookPageId: socialAccounts.linkedFacebookPageId,
      createdAt: socialAccounts.createdAt,
    })
    .from(socialAccounts)
    .where(eq(socialAccounts.teamId, ctx.team.id))
    .orderBy(asc(socialAccounts.platform), asc(socialAccounts.name));

  return NextResponse.json(accounts);
}

// ─── POST: conectar con token manual → discovery de Pages e IG ────────────────

const connectSchema = z.object({
  userToken: z.string().min(20),
});

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('socialPublisherWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  try {
    await enforceFeature(ctx.team.id, 'isSocialPublisherEnabled');
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  let pages;
  try {
    pages = await listUserPages(parsed.data.userToken);
  } catch (error: any) {
    return NextResponse.json(
      { error: `No se pudieron obtener las páginas de Meta: ${error.message}` },
      { status: 422 },
    );
  }

  if (!pages.length) {
    return NextResponse.json(
      { error: 'El token no tiene páginas de Facebook asociadas. Verifica los permisos (pages_show_list, pages_manage_posts).' },
      { status: 422 },
    );
  }

  const now = new Date();
  const connected: Array<{ platform: string; name: string }> = [];

  for (const page of pages) {
    // Página de Facebook (con su Page Access Token, que no expira si el token origen es long-lived)
    await db
      .insert(socialAccounts)
      .values({
        teamId: ctx.team.id,
        platform: 'facebook_page',
        externalId: page.id,
        name: page.name,
        pictureUrl: page.picture?.data?.url ?? null,
        accessToken: page.access_token,
        status: 'active',
        connectedBy: ctx.user.id,
      })
      .onConflictDoUpdate({
        target: [socialAccounts.teamId, socialAccounts.platform, socialAccounts.externalId],
        set: {
          name: page.name,
          pictureUrl: page.picture?.data?.url ?? null,
          accessToken: page.access_token,
          status: 'active',
          updatedAt: now,
        },
      });
    connected.push({ platform: 'facebook_page', name: page.name });

    // Cuenta de Instagram Business vinculada (usa el token de la Page)
    const ig = page.instagram_business_account;
    if (ig?.id) {
      await db
        .insert(socialAccounts)
        .values({
          teamId: ctx.team.id,
          platform: 'instagram',
          externalId: ig.id,
          name: ig.username ? `@${ig.username}` : `Instagram (${page.name})`,
          username: ig.username ?? null,
          pictureUrl: ig.profile_picture_url ?? null,
          accessToken: page.access_token,
          linkedFacebookPageId: page.id,
          status: 'active',
          connectedBy: ctx.user.id,
        })
        .onConflictDoUpdate({
          target: [socialAccounts.teamId, socialAccounts.platform, socialAccounts.externalId],
          set: {
            name: ig.username ? `@${ig.username}` : `Instagram (${page.name})`,
            username: ig.username ?? null,
            pictureUrl: ig.profile_picture_url ?? null,
            accessToken: page.access_token,
            linkedFacebookPageId: page.id,
            status: 'active',
            updatedAt: now,
          },
        });
      connected.push({ platform: 'instagram', name: ig.username ? `@${ig.username}` : page.name });
    }
  }

  return NextResponse.json({ connected }, { status: 201 });
}

// ─── DELETE: desconectar una cuenta ───────────────────────────────────────────

export async function DELETE(request: Request) {
  const ctx = await getPluginRequestContext('socialPublisherWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get('id') || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const [deleted] = await db
    .delete(socialAccounts)
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.teamId, ctx.team.id)))
    .returning({ id: socialAccounts.id });

  if (!deleted) {
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
