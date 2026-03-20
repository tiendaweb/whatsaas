import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const relativePath = request.nextUrl.searchParams.get('path');

    if (!relativePath) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const normalized = path.posix.normalize(relativePath).replace(/^\/+/, '');

    if (!normalized.startsWith('uploads/')) {
      return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
    }

    const absolutePath = path.join(process.cwd(), 'public', normalized);
    const fileBuffer = await fs.readFile(absolutePath);

    const extension = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    console.error('Error serving media file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
