export const PROXIED_AVATAR_HOSTS = new Set([
  'pps.whatsapp.net',
  'mmg.whatsapp.net',
]);

export function getSafeAvatarSrc(src: unknown) {
  if (typeof src !== 'string' || !src.trim()) {
    return undefined;
  }

  try {
    const url = new URL(src);
    if (PROXIED_AVATAR_HOSTS.has(url.hostname)) {
      return `/api/avatar?url=${encodeURIComponent(url.toString())}`;
    }
  } catch {
    // Relative app assets are valid avatar sources.
  }

  return src;
}
