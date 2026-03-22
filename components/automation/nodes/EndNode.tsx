import React from 'react';
import { XCircle } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';

export function EndNode({ selected }: { selected?: boolean }) {
  return (
    <div
      className={cn(
        "w-[150px] rounded-full border bg-destructive/10 text-destructive shadow-sm transition-all flex items-center justify-center py-2 px-4 gap-2",
        selected ? "border-destructive ring-1 ring-destructive" : "border-destructive/50"
      )}
    >
      <XCircle className="h-4 w-4" />
      <span className="text-sm font-bold">End Chat</span>
      
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-destructive !w-3 !h-3 !-ml-1.5"
      />
    </div>
  );
}