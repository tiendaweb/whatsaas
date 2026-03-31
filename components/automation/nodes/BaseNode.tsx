import React from 'react';
import { Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { DisconnectableTargetHandle } from './DisconnectableTargetHandle';
import { DisconnectableSourceHandle } from './DisconnectableSourceHandle';

interface BaseNodeProps {
  nodeId: string;
  selected?: boolean;
  title: string;
  icon: LucideIcon;
  children?: React.ReactNode;
  isStart?: boolean;
  disableSource?: boolean;
}

export function BaseNode({ 
  nodeId,
  selected, 
  title, 
  icon: Icon, 
  children, 
  isStart = false,
  disableSource = false
}: BaseNodeProps) {
  return (
    <div
      className={cn(
        "w-[280px] rounded-xl border bg-card text-card-foreground shadow-sm transition-all",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3 rounded-t-xl">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </div>

      <div className="p-4">
        {children}
      </div>

      {!isStart && (
        <DisconnectableTargetHandle
          nodeId={nodeId}
          position={Position.Left}
          className="!bg-muted-foreground !w-3 !h-3 !-ml-1.5"
        />
      )}
      
      {!disableSource && (
        <DisconnectableSourceHandle
          nodeId={nodeId}
          position={Position.Right}
          className="!bg-primary !w-3 !h-3 !-mr-1.5"
        />
      )}
    </div>
  );
}
