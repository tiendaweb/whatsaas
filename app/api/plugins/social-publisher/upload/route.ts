import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { randomBytes } from 'crypto';
import sharp from 'sharp';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { enforceFeature } from '@/lib/limits';
import { detectMediaType } from '@/lib/social/validation';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1GB (límite de video de Meta)

export async function POST(request: Request) {
  try {
    const ctx = await getPluginRequestContext('socialPublisherWrite');
    if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

    await enforceFeature(ctx.team.id, 'isSocialPublisherEnabled');

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    const mediaType = detectMediaType(file.name);
    if (!mediaType) {
      return NextResponse.json(
        { error: 'Formato no soportado. Usa JPG, PNG, WebP, GIF, MP4 o MOV.' },
        { status: 400 },
      );
    }

    let buffer = Buffer.from(await file.arrayBuffer());
    let extension = (file.name.split('.').pop() || 'dat').toLowerCase();

    // Instagram solo garantiza JPEG: convertimos cualquier imagen que no lo sea
    if (mediaType === 'image' && extension !== 'jpg' && extension !== 'jpeg') {
      buffer = Buffer.from(await sharp(buffer).jpeg({ quality: 90 }).toBuffer());
      extension = 'jpg';
    }

    // Nombre criptográficamente aleatorio: la carpeta es pública (Meta debe poder leerla)
    // pero las URLs no son enumerables.
    const filename = `${randomBytes(16).toString('hex')}.${extension}`;
    const relativeDirPath = path.join('uploads', 'social', String(ctx.team.id));
    const absoluteDirPath = path.join(process.cwd(), 'public', relativeDirPath);

    await fs.mkdir(absoluteDirPath, { recursive: true });
    await fs.writeFile(path.join(absoluteDirPath, filename), buffer);

    const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
    const publicPath = `/${relativeDirPath.split(path.sep).join('/')}/${filename}`;

    return NextResponse.json({
      url: `${baseUrl}${publicPath}`,
      path: publicPath,
      type: mediaType,
      filename: file.name,
    });
  } catch (error: any) {
    console.error('[social-publisher/upload] Error:', error);
    const message = error?.message?.includes('plan') ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
