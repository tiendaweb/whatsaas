// Validaciones y límites de formato por plataforma para el Social Publisher.
// Se usan tanto en el composer (UI) como en la API antes de guardar.

import type { SocialMediaItem } from '@/lib/db/schema';

export type SocialPlatform = 'facebook_page' | 'instagram';
export type SocialPostFormat = 'post' | 'reel' | 'story';

export const LIMITS = {
  instagram: {
    imageMaxBytes: 8 * 1024 * 1024,
    carouselMin: 2,
    carouselMax: 10,
    captionMaxChars: 2200,
    dailyApiQuota: 50,
  },
  facebook: {
    multiPhotoMax: 10,
    captionMaxChars: 63206,
  },
} as const;

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
export const VIDEO_EXTENSIONS = ['.mp4', '.mov'];

export function detectMediaType(fileName: string): 'image' | 'video' | null {
  const lower = fileName.toLowerCase();
  if (IMAGE_EXTENSIONS.some((e) => lower.endsWith(e))) return 'image';
  if (VIDEO_EXTENSIONS.some((e) => lower.endsWith(e))) return 'video';
  return null;
}

export type PostValidationInput = {
  platform: SocialPlatform;
  format: SocialPostFormat;
  caption?: string | null;
  link?: string | null;
  mediaItems: SocialMediaItem[];
};

// Devuelve la lista de errores (vacía = válido) para un destino concreto.
export function validatePostForPlatform(input: PostValidationInput): string[] {
  const { platform, format, caption, link, mediaItems } = input;
  const errors: string[] = [];
  const images = mediaItems.filter((m) => m.type === 'image');
  const videos = mediaItems.filter((m) => m.type === 'video');

  for (const item of mediaItems) {
    if (!/^https?:\/\//.test(item.url)) {
      errors.push(`La URL del media debe ser absoluta y pública: ${item.url}`);
    }
  }

  if (platform === 'instagram') {
    if (caption && caption.length > LIMITS.instagram.captionMaxChars) {
      errors.push(`El caption de Instagram supera ${LIMITS.instagram.captionMaxChars} caracteres`);
    }
    if (link) errors.push('Instagram no soporta posts de enlace');

    if (format === 'post') {
      if (mediaItems.length === 0) errors.push('Instagram requiere al menos una imagen o video');
      if (mediaItems.length > LIMITS.instagram.carouselMax) {
        errors.push(`El carrusel de Instagram admite máximo ${LIMITS.instagram.carouselMax} elementos`);
      }
    } else if (format === 'story' || format === 'reel') {
      if (mediaItems.length !== 1) errors.push(`Un ${format} de Instagram requiere exactamente un archivo`);
      if (format === 'reel' && videos.length !== 1) errors.push('Un reel de Instagram debe ser un video');
    }
  }

  if (platform === 'facebook_page') {
    if (format === 'post') {
      if (mediaItems.length === 0 && !caption && !link) {
        errors.push('Un post de Facebook necesita texto, enlace o media');
      }
      if (images.length > LIMITS.facebook.multiPhotoMax) {
        errors.push(`Máximo ${LIMITS.facebook.multiPhotoMax} fotos por publicación de Facebook`);
      }
      if (videos.length > 1) errors.push('Facebook admite un solo video por publicación');
      if (videos.length === 1 && images.length > 0) {
        errors.push('Facebook no permite mezclar fotos y video en una misma publicación');
      }
    } else if (format === 'reel') {
      if (videos.length !== 1 || mediaItems.length !== 1) errors.push('Un reel de Facebook debe ser un solo video');
    } else if (format === 'story') {
      if (mediaItems.length !== 1) errors.push('Una historia de Facebook requiere exactamente un archivo');
    }
  }

  return errors;
}
