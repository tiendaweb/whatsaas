import path from 'path';
import fs from 'fs/promises';

/**
 * Dónde viven físicamente los adjuntos: `messages.media_url` guarda rutas como
 * `/uploads/audio/xxx.ogg`, relativas a `public/`.
 */
const PUBLIC_ROOT = path.resolve(process.cwd(), 'public');

/**
 * Blindaje calcado de app/api/media/route.ts.
 *
 * La ruta NUNCA viene del input de una herramienta (el modelo solo puede pasar
 * ids), pero igual se blinda: normalizamos, exigimos el prefijo `uploads/`,
 * rechazamos cualquier segmento `..` y al final verificamos que la ruta
 * resuelta siga adentro de `public/`. Una fila vieja con una ruta rara no puede
 * terminar haciendo que el conector lea /etc/passwd.
 *
 * Diferencia con app/api/media/route.ts: ahí se rechaza cualquier `..` como
 * subcadena, y eso voltea nombres de archivo legítimos (hay media guardada como
 * "ChatGPT_Image_21_mar_2026__04_42_12_p.m..png"). Acá se miran los SEGMENTOS
 * de la ruta, que es lo que realmente puede escapar del directorio.
 */
export function resolveMediaFilePath(mediaUrl: string | null | undefined) {
  if (!mediaUrl) return null;
  const normalized = path.posix.normalize(mediaUrl.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!normalized.startsWith('uploads/') || normalized.split('/').includes('..')) return null;
  const absolutePath = path.resolve(PUBLIC_ROOT, normalized);
  if (!absolutePath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) return null;
  return { normalized, absolutePath };
}

export async function statMediaFile(absolutePath: string) {
  try {
    const stats = await fs.stat(absolutePath);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}
