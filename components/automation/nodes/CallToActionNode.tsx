import React from 'react';
import { ExternalLink } from 'lucide-react';
import { BaseNode } from './BaseNode';

interface CallToActionData {
  bodyText?: string;
  buttonText?: string;
  url?: string;
}

export function CallToActionNode({ id, data, selected }: { id: string; data: CallToActionData, selected?: boolean }) {
  return (
    <BaseNode nodeId={id} title="Call to Action" icon={ExternalLink} selected={selected}>
      <div className="flex flex-col gap-3">
        <div className="text-sm text-foreground line-clamp-3">
          {data.bodyText || "Enter message text..."}
        </div>
        <div className="flex items-center justify-center gap-2 bg-blue-500/10 text-blue-600 p-2 rounded border border-blue-500/20 text-xs font-medium">
          <ExternalLink className="h-3 w-3" />
          <span className="truncate">{data.buttonText || "Visit Website"}</span>
        </div>
        {data.url && (
          <div className="text-[10px] text-muted-foreground truncate text-center">
            {data.url}
          </div>
        )}
      </div>
    </BaseNode>
  );
}
