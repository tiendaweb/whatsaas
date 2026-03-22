import React from 'react';
import { MessageSquare } from 'lucide-react';
import { BaseNode } from './BaseNode';

export function MessageNode({ data, selected }: { data: { label: string }, selected?: boolean }) {
  return (
    <BaseNode title="Send Message" icon={MessageSquare} selected={selected}>
      <div className="text-sm text-foreground line-clamp-3">
        {data.label || "No text configured..."}
      </div>
    </BaseNode>
  );
}