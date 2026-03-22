import React from 'react';
import { PenLine } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { Badge } from '@/components/ui/badge';

interface CollectNodeData {
  label: string;
  variable: string;
}

export function CollectNode({ data, selected }: { data: CollectNodeData, selected?: boolean }) {
  return (
    <BaseNode title="Collect Input" icon={PenLine} selected={selected}>
      <div className="text-sm text-foreground line-clamp-2 mb-2">
        {data.label || "Ask a question..."}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground uppercase font-bold">Save to:</span>
        <Badge variant="outline" className="text-[10px] h-5 px-1 bg-purple-50 text-purple-700 border-purple-200">
          {data.variable ? `{{${data.variable}}}` : 'Not set'}
        </Badge>
      </div>
    </BaseNode>
  );
}