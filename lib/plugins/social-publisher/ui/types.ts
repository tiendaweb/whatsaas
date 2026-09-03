export type SocialAccountItem = {
  id: number;
  platform: 'facebook_page' | 'instagram';
  externalId: string;
  name: string;
  username: string | null;
  pictureUrl: string | null;
  status: 'active' | 'token_expired' | 'disconnected';
  linkedFacebookPageId: string | null;
  createdAt: string;
};

export type MediaItem = { url: string; type: 'image' | 'video'; order: number };

export type PostTargetItem = {
  id: number;
  platform: 'facebook_page' | 'instagram';
  status: 'pending' | 'publishing' | 'awaiting_container' | 'published' | 'failed';
  permalink: string | null;
  errorMessage: string | null;
  account: Pick<SocialAccountItem, 'id' | 'platform' | 'name' | 'username' | 'pictureUrl' | 'status'>;
};

export type SocialPostItem = {
  id: number;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'partially_published' | 'failed';
  format: 'post' | 'reel' | 'story';
  caption: string | null;
  link: string | null;
  mediaItems: MediaItem[];
  scheduledAt: string | null;
  timezone: string | null;
  publishedAt: string | null;
  createdAt: string;
  targets: PostTargetItem[];
};

export const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

export const POST_STATUS_LABELS: Record<SocialPostItem['status'], string> = {
  draft: 'Borrador',
  scheduled: 'Programado',
  publishing: 'Publicando',
  published: 'Publicado',
  partially_published: 'Parcial',
  failed: 'Fallido',
};

export const FORMAT_LABELS: Record<SocialPostItem['format'], string> = {
  post: 'Publicación',
  reel: 'Reel',
  story: 'Historia',
};
