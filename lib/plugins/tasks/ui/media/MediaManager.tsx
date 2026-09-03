'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { FileText } from 'lucide-react';
import {
  getTaskMediaEndpoint,
  taskOsFetcher,
  uploadTaskMedia,
} from '@/lib/plugins/tasks/client/api';
import type { TaskMedia, TaskMediaOwnerType } from '@/lib/plugins/tasks/client/types';
import { formatBytes } from '@/lib/plugins/tasks/client/utils';
import { MediaUploadZone } from './MediaUploadZone';

export type MediaManagerProps = {
  ownerType: TaskMediaOwnerType;
  ownerId: number;
  compact?: boolean;
  onSetCover?: (mediaId: number) => void; // for tasks
};

export function MediaManager({ ownerType, ownerId, compact = false, onSetCover }: MediaManagerProps) {
  const endpoint = getTaskMediaEndpoint(ownerType, ownerId);
  const { data: media = [], mutate } = useSWR<TaskMedia[]>(endpoint, taskOsFetcher);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('ownerType', ownerType);
    formData.append('ownerId', String(ownerId));
    formData.append('file', file);
    await uploadTaskMedia(formData);
    setUploading(false);
    mutate();
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const file = Array.from(event.clipboardData.files ?? [])[0];
    if (file) {
      event.preventDefault();
      void uploadFile(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files ?? [])[0];
    if (file) void uploadFile(file);
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <MediaUploadZone
        uploading={uploading}
        inputRef={inputRef}
        onFile={(file) => void uploadFile(file)}
        onPaste={handlePaste}
        onDrop={handleDrop}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {media.map((item) => {
          const isImage = item.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(item.url);
          return (
            <a
              key={String(item.id)}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/8 p-2 text-left transition hover:bg-white/12"
            >
              {isImage ? (
                <img src={item.url} alt={item.fileName} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <FileText className="h-4 w-4 text-white/55" />
                </div>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-white/80">{item.fileName}</span>
                <span className="block truncate text-[10px] text-white/35">
                  {item.inheritedFrom && item.inheritedFrom !== 'direct' ? `${item.inheritedFrom} · ` : ''}
                  {formatBytes(item.size)}
                </span>
              </span>
              {onSetCover && isImage && ownerType === 'task' && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSetCover(Number(item.id)); }}
                  className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/20"
                  title="Usar como portada"
                >Portada</button>
              )}
            </a>
          );
        })}
        {media.length === 0 && (
          <p className="col-span-full rounded-xl border border-white/10 bg-white/6 px-3 py-4 text-center text-xs text-white/35">
            Sin media
          </p>
        )}
      </div>
    </div>
  );
}