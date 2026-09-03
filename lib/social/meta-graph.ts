// Cliente para Meta Graph API (Facebook Pages + Instagram Content Publishing).
// Docs: https://developers.facebook.com/docs/graph-api

export const GRAPH_API_VERSION = 'v23.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaGraphError extends Error {
  code: number;
  subcode?: number;
  type?: string;

  constructor(message: string, code: number, subcode?: number, type?: string) {
    super(message);
    this.name = 'MetaGraphError';
    this.code = code;
    this.subcode = subcode;
    this.type = type;
  }

  // Códigos transitorios de Meta: 1/2 (unknown/service), 4/17/32 (rate limit),
  // 613 (custom rate limit). Reintentables en el siguiente tick del cron.
  get isTransient(): boolean {
    return [1, 2, 4, 17, 32, 613].includes(this.code);
  }

  // 190 = token inválido/expirado
  get isTokenError(): boolean {
    return this.code === 190;
  }
}

export type GraphParams = Record<string, string | number | boolean | undefined>;

export async function graphFetch<T = any>(
  path: string,
  opts: { method?: 'GET' | 'POST' | 'DELETE'; token: string; params?: GraphParams },
): Promise<T> {
  const { method = 'GET', token, params = {} } = opts;
  const url = new URL(`${GRAPH_BASE}${path}`);

  const allParams: GraphParams = { ...params, access_token: token };

  let body: URLSearchParams | undefined;
  if (method === 'GET' || method === 'DELETE') {
    for (const [k, v] of Object.entries(allParams)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  } else {
    body = new URLSearchParams();
    for (const [k, v] of Object.entries(allParams)) {
      if (v !== undefined) body.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), { method, body });
  const json = await res.json().catch(() => ({}));

  if (json?.error) {
    throw new MetaGraphError(
      json.error.message || 'Unknown Graph API error',
      json.error.code ?? 0,
      json.error.error_subcode,
      json.error.type,
    );
  }
  if (!res.ok) {
    throw new MetaGraphError(`Graph API HTTP ${res.status}`, res.status);
  }
  return json as T;
}

// ─── Discovery / cuentas ─────────────────────────────────────────────────────

export type DiscoveredPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
  };
};

export async function listUserPages(userToken: string): Promise<DiscoveredPage[]> {
  const pages: DiscoveredPage[] = [];
  let path = `/me/accounts`;
  let params: GraphParams = {
    fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}',
    limit: 100,
  };
  // Paginación de Graph API
  for (let i = 0; i < 10; i++) {
    const res = await graphFetch<{ data: DiscoveredPage[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      path, { token: userToken, params },
    );
    pages.push(...(res.data || []));
    if (!res.paging?.next || !res.paging?.cursors?.after) break;
    params = { ...params, after: res.paging.cursors.after };
  }
  return pages;
}

export async function debugToken(token: string) {
  return graphFetch<{ data: { is_valid: boolean; expires_at?: number; scopes?: string[] } }>(
    `/debug_token`, { token, params: { input_token: token } },
  );
}

// ─── Facebook Page (publicación síncrona) ────────────────────────────────────

export async function publishPageTextOrLink(
  pageId: string, token: string,
  { message, link }: { message?: string; link?: string },
): Promise<{ id: string }> {
  return graphFetch(`/${pageId}/feed`, { method: 'POST', token, params: { message, link } });
}

export async function publishPagePhoto(
  pageId: string, token: string,
  { url, caption }: { url: string; caption?: string },
): Promise<{ id: string; post_id?: string }> {
  return graphFetch(`/${pageId}/photos`, { method: 'POST', token, params: { url, caption } });
}

export async function publishPageMultiPhoto(
  pageId: string, token: string,
  { urls, caption }: { urls: string[]; caption?: string },
): Promise<{ id: string }> {
  const photoIds: string[] = [];
  for (const url of urls) {
    const res = await graphFetch<{ id: string }>(`/${pageId}/photos`, {
      method: 'POST', token, params: { url, published: false },
    });
    photoIds.push(res.id);
  }
  const params: GraphParams = { message: caption };
  photoIds.forEach((id, i) => {
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });
  return graphFetch(`/${pageId}/feed`, { method: 'POST', token, params });
}

export async function publishPageVideo(
  pageId: string, token: string,
  { fileUrl, description }: { fileUrl: string; description?: string },
): Promise<{ id: string }> {
  return graphFetch(`/${pageId}/videos`, {
    method: 'POST', token, params: { file_url: fileUrl, description },
  });
}

// Reels y Stories de video usan el flujo start → upload por URL → finish.
async function uploadHostedVideo(uploadUrl: string, token: string, fileUrl: string) {
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_url: fileUrl },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    throw new MetaGraphError(json?.error?.message || `Video upload HTTP ${res.status}`, json?.error?.code ?? res.status);
  }
}

export async function publishPageReel(
  pageId: string, token: string,
  { fileUrl, description }: { fileUrl: string; description?: string },
): Promise<{ id: string }> {
  const start = await graphFetch<{ video_id: string; upload_url: string }>(`/${pageId}/video_reels`, {
    method: 'POST', token, params: { upload_phase: 'start' },
  });
  await uploadHostedVideo(start.upload_url, token, fileUrl);
  await graphFetch(`/${pageId}/video_reels`, {
    method: 'POST', token,
    params: { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description },
  });
  return { id: start.video_id };
}

export async function publishPagePhotoStory(
  pageId: string, token: string, { url }: { url: string },
): Promise<{ id: string }> {
  const photo = await graphFetch<{ id: string }>(`/${pageId}/photos`, {
    method: 'POST', token, params: { url, published: false },
  });
  const story = await graphFetch<{ post_id: string }>(`/${pageId}/photo_stories`, {
    method: 'POST', token, params: { photo_id: photo.id },
  });
  return { id: story.post_id };
}

export async function publishPageVideoStory(
  pageId: string, token: string, { fileUrl }: { fileUrl: string },
): Promise<{ id: string }> {
  const start = await graphFetch<{ video_id: string; upload_url: string }>(`/${pageId}/video_stories`, {
    method: 'POST', token, params: { upload_phase: 'start' },
  });
  await uploadHostedVideo(start.upload_url, token, fileUrl);
  const finish = await graphFetch<{ post_id?: string }>(`/${pageId}/video_stories`, {
    method: 'POST', token, params: { upload_phase: 'finish', video_id: start.video_id },
  });
  return { id: finish.post_id || start.video_id };
}

export async function getPagePostPermalink(postId: string, token: string): Promise<string | null> {
  try {
    const res = await graphFetch<{ permalink_url?: string }>(`/${postId}`, {
      token, params: { fields: 'permalink_url' },
    });
    return res.permalink_url || null;
  } catch {
    return null;
  }
}

// ─── Instagram (contenedor → poll → publish) ─────────────────────────────────

export async function createIgImageContainer(
  igUserId: string, token: string,
  { imageUrl, caption, isCarouselItem }: { imageUrl: string; caption?: string; isCarouselItem?: boolean },
): Promise<{ id: string }> {
  return graphFetch(`/${igUserId}/media`, {
    method: 'POST', token,
    params: {
      image_url: imageUrl,
      caption: isCarouselItem ? undefined : caption,
      is_carousel_item: isCarouselItem || undefined,
    },
  });
}

export async function createIgVideoContainer(
  igUserId: string, token: string,
  { videoUrl, caption, isCarouselItem, shareToFeed }: { videoUrl: string; caption?: string; isCarouselItem?: boolean; shareToFeed?: boolean },
): Promise<{ id: string }> {
  return graphFetch(`/${igUserId}/media`, {
    method: 'POST', token,
    params: {
      media_type: 'REELS',
      video_url: videoUrl,
      caption: isCarouselItem ? undefined : caption,
      is_carousel_item: isCarouselItem || undefined,
      share_to_feed: shareToFeed === undefined ? undefined : shareToFeed,
    },
  });
}

export async function createIgStoryContainer(
  igUserId: string, token: string,
  { url, type }: { url: string; type: 'image' | 'video' },
): Promise<{ id: string }> {
  return graphFetch(`/${igUserId}/media`, {
    method: 'POST', token,
    params: {
      media_type: 'STORIES',
      ...(type === 'image' ? { image_url: url } : { video_url: url }),
    },
  });
}

export async function createIgCarouselContainer(
  igUserId: string, token: string,
  { childrenIds, caption }: { childrenIds: string[]; caption?: string },
): Promise<{ id: string }> {
  return graphFetch(`/${igUserId}/media`, {
    method: 'POST', token,
    params: { media_type: 'CAROUSEL', children: childrenIds.join(','), caption },
  });
}

export type IgContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';

export async function getIgContainerStatus(
  containerId: string, token: string,
): Promise<{ status_code: IgContainerStatus; status?: string }> {
  return graphFetch(`/${containerId}`, { token, params: { fields: 'status_code,status' } });
}

export async function publishIgContainer(
  igUserId: string, token: string, creationId: string,
): Promise<{ id: string }> {
  return graphFetch(`/${igUserId}/media_publish`, {
    method: 'POST', token, params: { creation_id: creationId },
  });
}

export async function getIgMediaPermalink(mediaId: string, token: string): Promise<string | null> {
  try {
    const res = await graphFetch<{ permalink?: string }>(`/${mediaId}`, {
      token, params: { fields: 'permalink' },
    });
    return res.permalink || null;
  } catch {
    return null;
  }
}

export async function getIgPublishingLimit(
  igUserId: string, token: string,
): Promise<{ quotaUsage: number; quotaTotal: number }> {
  const res = await graphFetch<{ data: Array<{ quota_usage: number; config: { quota_total: number } }> }>(
    `/${igUserId}/content_publishing_limit`,
    { token, params: { fields: 'quota_usage,config' } },
  );
  const entry = res.data?.[0];
  return { quotaUsage: entry?.quota_usage ?? 0, quotaTotal: entry?.config?.quota_total ?? 50 };
}
