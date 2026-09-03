'use server';

import { db } from '@/lib/db/drizzle';
import { branding } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.gif'];

/**
 * Deriva un nombre de archivo propio a partir del subido. El nombre original nunca
 * llega al filesystem: traería colisiones entre marcas (dos `logo.png` se pisan) y
 * permitiría escapar del directorio con un `../`.
 */
function buildAssetFilename(originalName: string, kind: 'logo' | 'favicon'): string | null {
  const extension = extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return null;
  }

  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
}

async function saveAsset(file: File, kind: 'logo' | 'favicon', uploadDir: string) {
  if (!file || file.size === 0) return '';

  const filename = buildAssetFilename(file.name, kind);
  if (!filename) {
    throw new Error('Formato de imagen no permitido.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadDir, filename), buffer);

  return `/uploads/branding/${filename}`;
}

export async function updateBranding(formData: FormData) {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    return { success: false, message: 'No autorizado.' };
  }

  const name = formData.get('name') as string;
  const logo = formData.get('logo') as File;
  const favicon = formData.get('favicon') as File;

  try {
    const uploadDir = join(process.cwd(), 'public/uploads/branding');
    await mkdir(uploadDir, { recursive: true });

    const logoUrl = await saveAsset(logo, 'logo', uploadDir);
    const faviconUrl = await saveAsset(favicon, 'favicon', uploadDir);

    const currentBranding = await db.query.branding.findFirst();

    if (currentBranding) {
      await db
        .update(branding)
        .set({
          name,
          logoUrl: logoUrl || currentBranding.logoUrl,
          faviconUrl: faviconUrl || currentBranding.faviconUrl,
          updatedAt: new Date(),
        })
        .where(eq(branding.id, currentBranding.id));
    } else {
      await db.insert(branding).values({
        name,
        logoUrl,
        faviconUrl,
      });
    }

    revalidatePath('/(admin)/admin/branding');
    revalidatePath('/');

    return {
      success: true,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error instanceof Error && error.message === 'Formato de imagen no permitido.'
        ? error.message
        : 'No se pudo actualizar la marca.',
    };
  }
}
