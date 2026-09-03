import fs from 'fs/promises';
import path from 'path';
import { Buffer } from 'buffer';
import { v4 as uuidv4 } from 'uuid';

export type EvolutionMediaMessageType =
  | 'imageMessage'
  | 'audioMessage'
  | 'videoMessage'
  | 'documentMessage'
  | 'stickerMessage';

export type EvolutionMediaPart = {
  messageType: EvolutionMediaMessageType;
  mediaContent: any;
  sourcePayload: any;
};

export type SavedEvolutionMediaDetails = {
  mediaUrl?: string | null;
  mediaMimetype?: string | null;
  mediaCaption?: string | null;
  mediaFileLength?: string | null;
  mediaSeconds?: number | null;
  mediaIsPtt?: boolean | null;
  text?: string | null;
};

const MEDIA_KEYS: Array<{ key: string; messageType: EvolutionMediaMessageType }> = [
  { key: 'imageMessage', messageType: 'imageMessage' },
  { key: 'audioMessage', messageType: 'audioMessage' },
  { key: 'videoMessage', messageType: 'videoMessage' },
  { key: 'documentMessage', messageType: 'documentMessage' },
  { key: 'stickerMessage', messageType: 'stickerMessage' },
];

const DEFAULT_MIMETYPES: Record<EvolutionMediaMessageType, string> = {
  imageMessage: 'image/jpeg',
  audioMessage: 'audio/ogg',
  videoMessage: 'video/mp4',
  documentMessage: 'application/octet-stream',
  stickerMessage: 'image/webp',
};

export function getEvolutionMediaMimetype(
  mediaContent: any,
  messageType: EvolutionMediaMessageType,
): string {
  return mediaContent?.mimetype || mediaContent?.mime_type || DEFAULT_MIMETYPES[messageType];
}

export function getExtensionFromMimetype(mimetype: string | null): string | null {
  if (!mimetype) return null;
  const mimeMap: { [key: string]: string } = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/amr': 'amr',
    'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/opus': 'ogg',
    'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip', 'application/vnd.rar': 'rar', 'application/x-7z-compressed': '7z',
    'application/json': 'json', 'text/html': 'html', 'text/xml': 'xml',
    'text/vcard': 'vcf', 'model/stl': 'stl', 'application/sla': 'stl',
    'application/vnd.ms-pki.stl': 'stl',
  };
  if (mimeMap[mimetype]) return mimeMap[mimetype];
  const cleanMime = mimetype.split(';')[0].trim();
  if (mimeMap[cleanMime]) return mimeMap[cleanMime];
  const subtype = cleanMime.split('/')[1];
  if (subtype && /^[a-z0-9]+$/.test(subtype)) {
    if (!['octet-stream', 'vnd.oasis.opendocument.text'].includes(subtype)) {
      return subtype;
    }
  }
  return null;
}

function getDirectMediaPart(payload: any): EvolutionMediaPart | null {
  if (!payload || typeof payload !== 'object') return null;

  for (const { key, messageType } of MEDIA_KEYS) {
    if (payload[key]) {
      return {
        messageType,
        mediaContent: payload[key],
        sourcePayload: payload,
      };
    }
  }

  return null;
}

function collectAlbumMediaParts(value: any, output: EvolutionMediaPart[], depth = 0) {
  if (!value || depth > 8) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectAlbumMediaParts(item, output, depth + 1);
    }
    return;
  }

  if (typeof value !== 'object') return;

  const directPart = getDirectMediaPart(value);
  if (directPart) {
    output.push(directPart);
    return;
  }

  for (const key of ['message', 'messages', 'items', 'media', 'medias', 'album', 'albumMessage', 'content', 'contents']) {
    if (value[key]) {
      collectAlbumMediaParts(value[key], output, depth + 1);
    }
  }
}

function dedupeMediaParts(parts: EvolutionMediaPart[]): EvolutionMediaPart[] {
  const seen = new Set<string>();
  const deduped: EvolutionMediaPart[] = [];

  for (const part of parts) {
    const key = [
      part.messageType,
      part.mediaContent?.url || '',
      part.mediaContent?.directPath || '',
      part.mediaContent?.mediaKey || '',
      part.mediaContent?.fileSha256 || '',
      part.mediaContent?.base64 ? `base64:${String(part.mediaContent.base64).slice(0, 64)}` : '',
    ].join('|');

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(part);
  }

  return deduped;
}

export function extractEvolutionMediaParts(
  messagePayload: any,
  messageType?: string | null,
): EvolutionMediaPart[] {
  const directPart = getDirectMediaPart(messagePayload);
  if (directPart) {
    return [directPart];
  }

  if (messageType !== 'albumMessage' && !messagePayload?.albumMessage) {
    return [];
  }

  const albumParts: EvolutionMediaPart[] = [];
  collectAlbumMediaParts(messagePayload?.albumMessage || messagePayload, albumParts);
  const supportedParts = albumParts.filter((part) =>
    part.messageType === 'imageMessage' || part.messageType === 'videoMessage'
  );

  if (!supportedParts.length) {
    console.warn('[Evolution] albumMessage received without supported media parts', {
      keys: messagePayload && typeof messagePayload === 'object' ? Object.keys(messagePayload) : [],
    });
  }

  return dedupeMediaParts(supportedParts);
}

export function getAlbumMessagePreview(parts: EvolutionMediaPart[]): string {
  const imageCount = parts.filter((part) => part.messageType === 'imageMessage').length;
  const videoCount = parts.filter((part) => part.messageType === 'videoMessage').length;
  const total = parts.length;

  if (total === 0) return '📷 Álbum';
  if (videoCount === 0) return `📷 Álbum (${imageCount} ${imageCount === 1 ? 'imagen' : 'imágenes'})`;
  if (imageCount === 0) return `📹 Álbum (${videoCount} ${videoCount === 1 ? 'video' : 'videos'})`;
  return `🖼️ Álbum (${total} archivos)`;
}

export function getMediaCaption(part: EvolutionMediaPart): string | null {
  return part.mediaContent?.caption || part.sourcePayload?.caption || null;
}

export function getMediaTextFallback(part: EvolutionMediaPart): string | null {
  if (part.messageType === 'documentMessage') {
    return part.mediaContent?.fileName || part.mediaContent?.filename || 'document';
  }
  return getMediaCaption(part);
}

export function buildMediaDetails(part: EvolutionMediaPart, mediaUrl: string | null): SavedEvolutionMediaDetails {
  const mimetype = getEvolutionMediaMimetype(part.mediaContent, part.messageType);
  const details: SavedEvolutionMediaDetails = {
    mediaUrl,
    mediaMimetype: mimetype,
  };

  if (part.messageType === 'imageMessage') {
    details.mediaCaption = getMediaCaption(part);
    details.mediaFileLength = part.mediaContent?.fileLength?.toString();
  } else if (part.messageType === 'audioMessage') {
    details.mediaSeconds = part.mediaContent?.seconds;
    details.mediaIsPtt = part.mediaContent?.ptt || part.mediaContent?.voice;
    details.mediaFileLength = part.mediaContent?.fileLength?.toString();
  } else if (part.messageType === 'videoMessage') {
    details.mediaCaption = getMediaCaption(part);
    details.mediaSeconds = part.mediaContent?.seconds;
    details.mediaFileLength = part.mediaContent?.fileLength?.toString();
  } else if (part.messageType === 'documentMessage') {
    details.mediaCaption = getMediaCaption(part);
    details.text = part.mediaContent?.fileName || part.mediaContent?.filename || 'document';
    details.mediaFileLength = part.mediaContent?.fileLength?.toString();
  }

  return details;
}

export async function saveEvolutionMediaPart(
  part: EvolutionMediaPart,
  options: { metaToken?: string | null } = {},
): Promise<SavedEvolutionMediaDetails> {
  const rawBase64 = part.sourcePayload?.base64 || part.mediaContent?.base64;
  const remoteMediaUrl = part.mediaContent?.url || part.mediaContent?.mediaUrl;

  if (!rawBase64 && !remoteMediaUrl) {
    return buildMediaDetails(part, null);
  }

  let buffer: Buffer | null = null;

  if (rawBase64) {
    const rawString = String(rawBase64);
    const base64String = rawString.startsWith('data:') ? rawString.split(',')[1] || rawString : rawString;
    buffer = Buffer.from(base64String, 'base64');
  } else if (remoteMediaUrl) {
    const headers: HeadersInit = {
      'User-Agent': 'Evolution-Client/1.0',
    };

    if (options.metaToken) {
      headers.Authorization = `Bearer ${options.metaToken}`;
    }

    const response = await fetch(remoteMediaUrl, { headers, signal: AbortSignal.timeout(15000) });

    if (response.ok) {
      const contentLength = response.headers.get('content-length');
      if (!contentLength || parseInt(contentLength, 10) <= 50 * 1024 * 1024) {
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }
    }
  }

  if (!buffer) {
    return buildMediaDetails(part, null);
  }

  const mimetype = getEvolutionMediaMimetype(part.mediaContent, part.messageType);
  const extension = getExtensionFromMimetype(mimetype);

  if (!extension) {
    return buildMediaDetails(part, null);
  }

  const timestamp = Date.now();
  const uniqueId = uuidv4();
  const filename = `${timestamp}-${uniqueId}.${extension}`;
  const subDir = part.messageType.replace('Message', '').toLowerCase();
  const relativeDirPath = path.join('uploads', subDir);
  const absoluteDirPath = path.join(process.cwd(), 'public', relativeDirPath);
  const absoluteFilePath = path.join(absoluteDirPath, filename);

  await fs.mkdir(absoluteDirPath, { recursive: true });
  await fs.writeFile(absoluteFilePath, buffer);

  const details = buildMediaDetails(part, `/${relativeDirPath}/${filename}`);
  details.mediaFileLength = buffer.byteLength.toString();
  return details;
}
