import React from 'react';
import { XCircle } from 'lucide-react';
import { Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { DisconnectableTargetHandle } from './DisconnectableTargetHandle';

export function EndNode({ id, selected }: { id: string; selected?: boolean }) {
  return (
    <div
      className={cn(
        "w-[150px] rounded-full border bg-destructive/10 text-destructive shadow-sm transition-all flex items-center justify-center py-2 px-4 gap-2",
        selected ? "border-destructive ring-1 ring-destructive" : "border-destructive/50"
      )}
    >
      <XCircle className="h-4 w-4" />
      <span className="text-sm font-bold">End Chat</span>
      
      <DisconnectableTargetHandle
        nodeId={id}
        position={Position.Left}
        className="!bg-destructive !w-3 !h-3 !-ml-1.5"
      />
    </div>
  );
}
