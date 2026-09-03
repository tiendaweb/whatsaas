import React from 'react';
import { Image, Mic, FileText, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';

interface MediaNodeData {
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  fileName?: string;
}

export function MediaNode({ id, data, selected }: { id: string; data: MediaNodeData, selected?: boolean }) {
  const t = useTranslations('Automation');
  const getIcon = () => {
    switch (data.mediaType) {
      case 'image': return Image;
      case 'video': return Video;
      case 'audio': return Mic;
      default: return FileText;
    }
  };

  const Icon = getIcon();

  return (
    <BaseNode nodeId={id} title={t('nodes.media')} icon={Icon} selected={selected} referenceName={(data as any).referenceName}>
      <div className="flex flex-col gap-2">
        {data.mediaUrl ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2 bg-muted/50 p-2 rounded">
             <Icon className="h-4 w-4" />
             <span className="truncate max-w-[180px]">{data.fileName || t('file_attached_fallback')}</span>
          </div>
        ) : (
          <div className="text-xs text-destructive italic">{t('no_file_selected')}</div>
        )}
        {data.caption && (
          <p className="text-xs text-foreground line-clamp-2 italic">"{data.caption}"</p>
        )}
      </div>
    </BaseNode>
  );
}
