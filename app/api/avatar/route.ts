import { NextRequest, NextResponse } from 'next/server';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { PROXIED_AVATAR_HOSTS } from '@/lib/avatar-url';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const permCtx = await getUserPermissionContext();
  if (!permCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawUrl = request.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  let avatarUrl: URL;
  try {
    avatarUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  if (avatarUrl.protocol !== 'https:' || !PROXIED_AVATAR_HOSTS.has(avatarUrl.hostname)) {
    return NextResponse.json({ error: 'Avatar host is not allowed' }, { status: 400 });
  }

  try {
    const response = await fetch(avatarUrl.toString(), {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid avatar content' }, { status: 502 });
    }

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error proxying avatar:', error);
    return NextResponse.json({ error: 'Failed to fetch avatar' }, { status: 502 });
  }
}
