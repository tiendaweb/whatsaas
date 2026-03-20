const UPLOADS_PREFIX = 'uploads/';

export function resolveMediaUrl(mediaUrl?: string | null): string | null {
  if (!mediaUrl) return null;

  if (
    mediaUrl.startsWith('http://') ||
    mediaUrl.startsWith('https://') ||
    mediaUrl.startsWith('blob:') ||
    mediaUrl.startsWith('/api/media?')
  ) {
    return mediaUrl;
  }

  const normalizedPath = mediaUrl.startsWith('/') ? mediaUrl.slice(1) : mediaUrl;

  if (normalizedPath.startsWith(UPLOADS_PREFIX)) {
    return `/api/media?path=${encodeURIComponent(normalizedPath)}`;
  }

  return mediaUrl;
}
