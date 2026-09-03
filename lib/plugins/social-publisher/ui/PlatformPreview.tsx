'use client';

import { Facebook, Instagram, ImageIcon, Film } from 'lucide-react';
import type { MediaItem } from './types';

type Props = {
  platform: 'facebook_page' | 'instagram';
  format: 'post' | 'reel' | 'story';
  accountName: string;
  caption: string;
  link?: string;
  mediaItems: MediaItem[];
};

export function PlatformPreview({ platform, format, accountName, caption, link, mediaItems }: Props) {
  const sorted = [...mediaItems].sort((a, b) => a.order - b.order);
  const first = sorted[0];
  const isVertical = format === 'story' || format === 'reel';

  return (
    <div className="border rounded-lg overflow-hidden bg-card w-full max-w-xs">
      <div className="flex items-center gap-2 p-3 border-b">
        {platform === 'instagram'
          ? <Instagram className="h-4 w-4 text-pink-600" />
          : <Facebook className="h-4 w-4 text-blue-600" />}
        <span className="text-sm font-medium truncate">{accountName}</span>
        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {format === 'story' ? 'Historia' : format === 'reel' ? 'Reel' : 'Publicación'}
        </span>
      </div>

      {platform === 'facebook_page' && caption && (
        <p className="px-3 pt-3 text-sm whitespace-pre-wrap line-clamp-4">{caption}</p>
      )}

      <div className={`bg-muted flex items-center justify-center ${isVertical ? 'aspect-[9/16] max-h-72' : 'aspect-square'} m-3 rounded overflow-hidden relative`}>
        {first ? (
          first.type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={first.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center text-muted-foreground">
              <Film className="h-8 w-8" />
              <span className="text-xs mt-1">Video</span>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center text-muted-foreground/50">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs mt-1">Sin media</span>
          </div>
        )}
        {sorted.length > 1 && (
          <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
            1/{sorted.length}
          </span>
        )}
      </div>

      {platform === 'instagram' && caption && (
        <p className="px-3 pb-3 text-sm line-clamp-3">
          <span className="font-medium">{accountName}</span> {caption}
        </p>
      )}
      {platform === 'facebook_page' && link && (
        <p className="px-3 pb-3 text-xs text-blue-600 truncate">{link}</p>
      )}
    </div>
  );
}
