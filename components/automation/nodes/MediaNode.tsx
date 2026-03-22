import React from 'react';
import { Image, Mic, FileText, Video } from 'lucide-react';
import { BaseNode } from './BaseNode';

interface MediaNodeData {
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  fileName?: string;
}

export function MediaNode({ data, selected }: { data: MediaNodeData, selected?: boolean }) {
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
    <BaseNode title="Send Media" icon={Icon} selected={selected}>
      <div className="flex flex-col gap-2">
        {data.mediaUrl ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2 bg-muted/50 p-2 rounded">
             <Icon className="h-4 w-4" />
             <span className="truncate max-w-[180px]">{data.fileName || 'File attached'}</span>
          </div>
        ) : (
          <div className="text-xs text-destructive italic">No file selected</div>
        )}
        {data.caption && (
          <p className="text-xs text-foreground line-clamp-2 italic">"{data.caption}"</p>
        )}
      </div>
    </BaseNode>
  );
}