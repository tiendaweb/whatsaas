import fs from 'fs/promises';
import path from 'path';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, messages } from '@/lib/db/schema';
import { resolveMediaUrl } from '@/lib/media-url';

export const FILE_TYPES = ['image', 'video', 'audio', 'document'] as const;
export type FileType = (typeof FILE_TYPES)[number];

export type ListChatFilesInput = {
  teamId: number;
  query?: string;
  type?: FileType;
  chatId?: number;
  from?: Date;
  to?: Date;
  sort?: 'newest' | 'oldest' | 'largest' | 'smallest';
  page?: number;
  limit?: number;
};

export type ArchiveChatFile = {
  id: string;
  fileName: string;
  sourceUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

const mediaSizeCache = new Map<string, number | null>();

const mediaCondition = or(
  eq(messages.messageType, 'imageMessage'),
  eq(messages.messageType, 'videoMessage'),
  eq(messages.messageType, 'audioMessage'),
  eq(messages.messageType, 'documentMessage'),
  ilike(messages.mediaMimetype, 'audio/%'),
);

function typeCondition(type: FileType): SQL | undefined {
  if (type === 'image') return eq(messages.messageType, 'imageMessage');
  if (type === 'video') return eq(messages.messageType, 'videoMessage');
  if (type === 'document') return eq(messages.messageType, 'documentMessage');
  return or(eq(messages.messageType, 'audioMessage'), ilike(messages.mediaMimetype, 'audio/%'));
}

function normalizeType(messageType: string | null, mimeType: string | null): FileType {
  if (messageType === 'imageMessage') return 'image';
  if (messageType === 'videoMessage') return 'video';
  if (messageType === 'documentMessage') return 'document';
  if (messageType === 'audioMessage' || mimeType?.startsWith('audio/')) return 'audio';
  return 'document';
}

function extensionFor(type: FileType, mimeType: string | null) {
  const fromMime = mimeType?.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg');
  if (fromMime && /^[a-z0-9.+-]+$/i.test(fromMime)) return fromMime;
  return type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : type === 'audio' ? 'ogg' : 'bin';
}

function inferFileName(input: {
  type: FileType;
  text: string | null;
  caption: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  timestamp: Date;
}) {
  if (input.type === 'document') {
    const explicit = input.text?.trim() || input.caption?.trim();
    if (explicit && explicit.length <= 255) return explicit;
  }

  if (input.mediaUrl) {
    try {
      const pathname = new URL(input.mediaUrl, 'https://local.invalid').pathname;
      const segment = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
      if (segment && segment.includes('.')) return segment.slice(0, 255);
    } catch {
      // A malformed historical URL should not prevent the library from loading.
    }
  }

  const day = input.timestamp.toISOString().slice(0, 10);
  return `${input.type}-${day}.${extensionFor(input.type, input.mimeType)}`;
}

function parseSize(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function buildConditions(input: ListChatFilesInput, ids?: string[]) {
  const conditions: Array<SQL | undefined> = [
    eq(chats.teamId, input.teamId),
    mediaCondition,
    isNotNull(messages.mediaUrl),
    input.type ? typeCondition(input.type) : undefined,
    input.chatId ? eq(chats.id, input.chatId) : undefined,
    input.from ? gte(messages.timestamp, input.from) : undefined,
    input.to ? lte(messages.timestamp, input.to) : undefined,
    ids?.length ? inArray(messages.id, ids) : undefined,
  ];

  const query = input.query?.trim();
  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      or(
        ilike(messages.text, pattern),
        ilike(messages.mediaCaption, pattern),
        ilike(messages.mediaMimetype, pattern),
        ilike(chats.name, pattern),
        ilike(chats.pushName, pattern),
        ilike(chats.remoteJid, pattern),
      ),
    );
  }

  return and(...conditions.filter((condition): condition is SQL => Boolean(condition)));
}

function buildOrderBy(sort: ListChatFilesInput['sort']) {
  return sort === 'oldest'
    ? asc(messages.timestamp)
    : sort === 'largest'
      ? desc(sql<number>`CASE
          WHEN ${messages.mediaFileLength} ~ '^[0-9]+$'
            THEN ${messages.mediaFileLength}::numeric
          ELSE 0
        END`)
      : sort === 'smallest'
        ? asc(sql<number>`CASE
            WHEN ${messages.mediaFileLength} ~ '^[0-9]+$'
              THEN ${messages.mediaFileLength}::numeric
            ELSE 999999999999999999
          END`)
        : desc(messages.timestamp);
}

function localMediaPath(mediaUrl: string) {
  let normalized = mediaUrl;

  if (mediaUrl.startsWith('/api/media?')) {
    try {
      normalized = new URL(mediaUrl, 'https://local.invalid').searchParams.get('path') ?? '';
    } catch {
      return null;
    }
  }

  normalized = normalized.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized.startsWith('uploads/') || normalized.includes('..')) return null;

  const publicRoot = path.resolve(process.cwd(), 'public');
  const absolutePath = path.resolve(publicRoot, normalized);
  return absolutePath.startsWith(`${publicRoot}${path.sep}`) ? absolutePath : null;
}

async function resolveActualMediaSize(mediaUrl: string, storedSize: string | null) {
  const parsed = parseSize(storedSize);
  if (parsed !== null) return parsed;
  if (mediaSizeCache.has(mediaUrl)) return mediaSizeCache.get(mediaUrl) ?? null;

  const localPath = localMediaPath(mediaUrl);
  if (localPath) {
    try {
      const size = (await fs.stat(localPath)).size;
      mediaSizeCache.set(mediaUrl, size);
      return size;
    } catch {
      mediaSizeCache.set(mediaUrl, null);
      return null;
    }
  }

  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
    try {
      const response = await fetch(mediaUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(4_000),
      });
      const size = response.ok ? parseSize(response.headers.get('content-length')) : null;
      mediaSizeCache.set(mediaUrl, size);
      return size;
    } catch {
      mediaSizeCache.set(mediaUrl, null);
      return null;
    }
  }

  mediaSizeCache.set(mediaUrl, null);
  return null;
}

async function resolveRowSizes<T extends { mediaUrl: string | null; size: string | null }>(rows: T[]) {
  const resolved: Array<number | null> = [];
  const concurrency = 6;

  for (let index = 0; index < rows.length; index += concurrency) {
    const batch = rows.slice(index, index + concurrency);
    resolved.push(
      ...(await Promise.all(
        batch.map((row) =>
          row.mediaUrl ? resolveActualMediaSize(row.mediaUrl, row.size) : Promise.resolve(null),
        ),
      )),
    );
  }

  return resolved;
}

export async function readArchiveFile(sourceUrl: string) {
  const localPath = localMediaPath(sourceUrl);
  if (localPath) {
    try {
      return await fs.readFile(localPath);
    } catch {
      return null;
    }
  }

  if (!sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://')) return null;

  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function listChatFiles(input: ListChatFilesInput) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(12, input.limit ?? 48));
  const where = buildConditions(input);
  const orderBy = buildOrderBy(input.sort);

  const [rows, totalRows, typeRows, chatRows] = await Promise.all([
    db
      .select({
        id: messages.id,
        chatId: chats.id,
        remoteJid: chats.remoteJid,
        chatName: sql<string>`COALESCE(NULLIF(${chats.name}, ''), NULLIF(${chats.pushName}, ''), ${chats.remoteJid})`,
        messageType: messages.messageType,
        text: messages.text,
        caption: messages.mediaCaption,
        mediaUrl: messages.mediaUrl,
        mimeType: messages.mediaMimetype,
        size: messages.mediaFileLength,
        fromMe: messages.fromMe,
        timestamp: messages.timestamp,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ value: count() })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(where),
    db
      .select({
        messageType: messages.messageType,
        mimeType: messages.mediaMimetype,
        value: count(),
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(and(eq(chats.teamId, input.teamId), mediaCondition, isNotNull(messages.mediaUrl)))
      .groupBy(messages.messageType, messages.mediaMimetype),
    db
      .select({
        id: chats.id,
        remoteJid: chats.remoteJid,
        name: sql<string>`COALESCE(NULLIF(${chats.name}, ''), NULLIF(${chats.pushName}, ''), ${chats.remoteJid})`,
        count: count(),
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(and(eq(chats.teamId, input.teamId), mediaCondition, isNotNull(messages.mediaUrl)))
      .groupBy(chats.id, chats.remoteJid, chats.name, chats.pushName)
      .orderBy(desc(count()))
      .limit(200),
  ]);

  const counts: Record<FileType, number> = { image: 0, video: 0, audio: 0, document: 0 };
  for (const row of typeRows) {
    counts[normalizeType(row.messageType, row.mimeType)] += Number(row.value);
  }

  const resolvedSizes = await resolveRowSizes(rows);
  const items = rows.map((row, index) => {
    const type = normalizeType(row.messageType, row.mimeType);
    return {
      id: row.id,
      chatId: row.chatId,
      remoteJid: row.remoteJid,
      chatName: row.chatName,
      type,
      fileName: inferFileName({
        type,
        text: row.text,
        caption: row.caption,
        mediaUrl: row.mediaUrl,
        mimeType: row.mimeType,
        timestamp: row.timestamp,
      }),
      caption: row.caption,
      mediaUrl: resolveMediaUrl(row.mediaUrl),
      mimeType: row.mimeType,
      sizeBytes: resolvedSizes[index],
      fromMe: row.fromMe,
      timestamp: row.timestamp.toISOString(),
    };
  });

  const total = Number(totalRows[0]?.value ?? 0);
  return {
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    facets: {
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      chats: chatRows.map((chat) => ({ ...chat, count: Number(chat.count) })),
    },
  };
}

export async function listChatFilesForArchive(
  input: Omit<ListChatFilesInput, 'page' | 'limit'> & { ids?: string[]; limit?: number },
) {
  const limit = Math.min(1_000, Math.max(1, input.limit ?? 1_000));
  const rows = await db
    .select({
      id: messages.id,
      messageType: messages.messageType,
      text: messages.text,
      caption: messages.mediaCaption,
      mediaUrl: messages.mediaUrl,
      mimeType: messages.mediaMimetype,
      size: messages.mediaFileLength,
      timestamp: messages.timestamp,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(buildConditions(input, input.ids))
    .orderBy(buildOrderBy(input.sort))
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const archiveRows = rows.slice(0, limit);
  const resolvedSizes = await resolveRowSizes(archiveRows);

  return {
    truncated,
    items: archiveRows.flatMap((row, index): ArchiveChatFile[] => {
      if (!row.mediaUrl) return [];
      const type = normalizeType(row.messageType, row.mimeType);
      return [
        {
          id: row.id,
          fileName: inferFileName({
            type,
            text: row.text,
            caption: row.caption,
            mediaUrl: row.mediaUrl,
            mimeType: row.mimeType,
            timestamp: row.timestamp,
          }),
          sourceUrl: row.mediaUrl,
          mimeType: row.mimeType,
          sizeBytes: resolvedSizes[index],
        },
      ];
    }),
  };
}
