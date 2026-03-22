import React from 'react';
import { Clock } from 'lucide-react';
import { BaseNode } from './BaseNode';

export function DelayNode({ id, data, selected }: { id: string; data: { label?: string, seconds?: number }, selected?: boolean }) {
  const seconds = data.seconds || 2;
  
  return (
    <BaseNode nodeId={id} title="Delay" icon={Clock} selected={selected}>
      <div className="text-sm text-foreground flex items-center gap-2">
        <span className="font-mono text-lg font-bold text-primary">{seconds}</span>
        <span className="text-muted-foreground">seconds wait</span>
      </div>
    </BaseNode>
  );
}
