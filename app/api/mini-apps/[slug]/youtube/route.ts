import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { KNOWN_SLUGS } from '@/lib/plugins/mini-apps/catalog';

export const dynamic = 'force-dynamic';

type YouTubeOEmbed = {
  title?: string;
  author_name?: string;
  provider_name?: string;
  thumbnail_url?: string;
};

function extractYouTubeVideoId(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] ?? null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') return url.searchParams.get('v');

      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ctx = await getPluginRequestContext('miniAppsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { slug } = await params;
  if (!KNOWN_SLUGS.includes(slug)) {
    return NextResponse.json({ error: 'Unknown app slug' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url') ?? '';
  const videoId = extractYouTubeVideoId(rawUrl);

  if (!videoId) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let metadata: YouTubeOEmbed = {};

  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`,
      { next: { revalidate: 3600 } },
    );

    if (response.ok) {
      metadata = (await response.json()) as YouTubeOEmbed;
    }
  } catch (error) {
    console.warn('[mini-apps/youtube] oEmbed failed', error);
  }

  return NextResponse.json({
    url: canonicalUrl,
    videoId,
    title: metadata.title || 'Video de YouTube',
    authorName: metadata.author_name || '',
    providerName: metadata.provider_name || 'YouTube',
    thumbnailUrl: metadata.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  });
}
