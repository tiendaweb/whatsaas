// Orquestador de publicación por destino (target). Lo usa el cron publish-social.
// FB publica de forma síncrona; IG crea contenedores que el cron sondea después.

import { db } from '@/lib/db/drizzle';
import { socialAccounts, socialPostTargets, type SocialPost, type SocialPostTarget, type SocialAccount } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  MetaGraphError,
  publishPageTextOrLink,
  publishPagePhoto,
  publishPageMultiPhoto,
  publishPageVideo,
  publishPageReel,
  publishPagePhotoStory,
  publishPageVideoStory,
  getPagePostPermalink,
  createIgImageContainer,
  createIgVideoContainer,
  createIgStoryContainer,
  createIgCarouselContainer,
} from './meta-graph';

const MAX_ATTEMPTS = 3;

export type TargetOutcome =
  | { status: 'published'; externalId: string; permalink: string | null }
  | { status: 'awaiting_container'; containerId: string }
  | { status: 'pending' }   // error transitorio, reintentar en el próximo tick
  | { status: 'failed'; error: string };

async function publishToFacebookPage(
  post: SocialPost, account: SocialAccount,
): Promise<{ externalId: string; permalink: string | null }> {
  const pageId = account.externalId;
  const token = account.accessToken;
  const media = [...post.mediaItems].sort((a, b) => a.order - b.order);
  const images = media.filter((m) => m.type === 'image');
  const videos = media.filter((m) => m.type === 'video');

  let result: { id: string };

  if (post.format === 'reel') {
    result = await publishPageReel(pageId, token, { fileUrl: videos[0].url, description: post.caption || undefined });
  } else if (post.format === 'story') {
    result = media[0].type === 'video'
      ? await publishPageVideoStory(pageId, token, { fileUrl: media[0].url })
      : await publishPagePhotoStory(pageId, token, { url: media[0].url });
  } else if (videos.length === 1) {
    result = await publishPageVideo(pageId, token, { fileUrl: videos[0].url, description: post.caption || undefined });
  } else if (images.length > 1) {
    result = await publishPageMultiPhoto(pageId, token, { urls: images.map((m) => m.url), caption: post.caption || undefined });
  } else if (images.length === 1) {
    result = await publishPagePhoto(pageId, token, { url: images[0].url, caption: post.caption || undefined });
  } else {
    result = await publishPageTextOrLink(pageId, token, { message: post.caption || undefined, link: post.link || undefined });
  }

  const permalink = await getPagePostPermalink(result.id, token);
  return { externalId: result.id, permalink };
}

// Crea el/los contenedores de IG y devuelve el id del contenedor a sondear.
async function createInstagramContainer(post: SocialPost, account: SocialAccount): Promise<string> {
  const igUserId = account.externalId;
  const token = account.accessToken;
  const media = [...post.mediaItems].sort((a, b) => a.order - b.order);

  if (post.format === 'story') {
    const item = media[0];
    const res = await createIgStoryContainer(igUserId, token, { url: item.url, type: item.type });
    return res.id;
  }

  if (post.format === 'reel' || (media.length === 1 && media[0].type === 'video')) {
    const res = await createIgVideoContainer(igUserId, token, {
      videoUrl: media[0].url,
      caption: post.caption || undefined,
      shareToFeed: post.format === 'reel' ? true : undefined,
    });
    return res.id;
  }

  if (media.length === 1) {
    const res = await createIgImageContainer(igUserId, token, { imageUrl: media[0].url, caption: post.caption || undefined });
    return res.id;
  }

  // Carrusel: contenedores hijos secuenciales y luego el padre
  const childIds: string[] = [];
  for (const item of media) {
    const child = item.type === 'video'
      ? await createIgVideoContainer(igUserId, token, { videoUrl: item.url, isCarouselItem: true })
      : await createIgImageContainer(igUserId, token, { imageUrl: item.url, isCarouselItem: true });
    childIds.push(child.id);
  }
  const parent = await createIgCarouselContainer(igUserId, token, { childrenIds: childIds, caption: post.caption || undefined });
  return parent.id;
}

export async function publishTarget(
  target: SocialPostTarget, post: SocialPost, account: SocialAccount,
): Promise<TargetOutcome> {
  try {
    if (account.status !== 'active') {
      return { status: 'failed', error: `La cuenta "${account.name}" no está activa (${account.status})` };
    }

    if (target.platform === 'facebook_page') {
      const { externalId, permalink } = await publishToFacebookPage(post, account);
      return { status: 'published', externalId, permalink };
    }

    if (target.platform === 'instagram') {
      const containerId = await createInstagramContainer(post, account);
      return { status: 'awaiting_container', containerId };
    }

    return { status: 'failed', error: `Plataforma desconocida: ${target.platform}` };
  } catch (error: any) {
    return mapPublishError(error, target, account);
  }
}

export async function mapPublishError(
  error: any, target: SocialPostTarget, account: SocialAccount,
): Promise<TargetOutcome> {
  if (error instanceof MetaGraphError) {
    if (error.isTokenError) {
      await db.update(socialAccounts)
        .set({ status: 'token_expired', updatedAt: new Date() })
        .where(eq(socialAccounts.id, account.id));
      return { status: 'failed', error: `Token inválido o expirado: ${error.message}` };
    }
    if (error.isTransient && target.attemptCount < MAX_ATTEMPTS) {
      return { status: 'pending' };
    }
    return { status: 'failed', error: `Meta API (código ${error.code}): ${error.message}` };
  }
  // Errores de red u otros: reintentar si quedan intentos
  if (target.attemptCount < MAX_ATTEMPTS) {
    return { status: 'pending' };
  }
  return { status: 'failed', error: error?.message || 'Error desconocido al publicar' };
}

// Aplica el resultado de publishTarget sobre la fila del target.
export async function applyTargetOutcome(targetId: number, outcome: TargetOutcome) {
  const now = new Date();
  if (outcome.status === 'published') {
    await db.update(socialPostTargets).set({
      status: 'published',
      publishedExternalId: outcome.externalId,
      permalink: outcome.permalink,
      publishedAt: now,
      errorMessage: null,
      updatedAt: now,
    }).where(eq(socialPostTargets.id, targetId));
  } else if (outcome.status === 'awaiting_container') {
    await db.update(socialPostTargets).set({
      status: 'awaiting_container',
      igContainerId: outcome.containerId,
      updatedAt: now,
    }).where(eq(socialPostTargets.id, targetId));
  } else if (outcome.status === 'pending') {
    await db.update(socialPostTargets).set({
      status: 'pending',
      updatedAt: now,
    }).where(eq(socialPostTargets.id, targetId));
  } else {
    await db.update(socialPostTargets).set({
      status: 'failed',
      errorMessage: outcome.error,
      updatedAt: now,
    }).where(eq(socialPostTargets.id, targetId));
  }
}
