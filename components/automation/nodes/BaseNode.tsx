import React from 'react';
import { Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { DisconnectableTargetHandle } from './DisconnectableTargetHandle';
import { DisconnectableSourceHandle } from './DisconnectableSourceHandle';

type BaseNodeAccent = 'default' | 'indigo';

interface BaseNodeProps {
  nodeId: string;
  selected?: boolean;
  title: string;
  icon: LucideIcon;
  children?: React.ReactNode;
  isStart?: boolean;
  disableSource?: boolean;
  referenceName?: string;
  accent?: BaseNodeAccent;
  className?: string;
}

const ACCENT_STYLES: Record<BaseNodeAccent, { container: (selected?: boolean) => string; header: string; icon: string }> = {
  default: {
    container: (selected) =>
      selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
    header: "border-b bg-muted/50",
    icon: "text-muted-foreground",
  },
  indigo: {
    container: (selected) =>
      selected
        ? "border-indigo-500 ring-1 ring-indigo-400"
        : "border-indigo-300 hover:border-indigo-400 dark:border-indigo-700 dark:hover:border-indigo-500",
    header: "border-b border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40",
    icon: "text-indigo-600 dark:text-indigo-300",
  },
};

export function BaseNode({
  nodeId,
  selected,
  title,
  icon: Icon,
  children,
  isStart = false,
  disableSource = false,
  referenceName,
  accent = 'default',
  className,
}: BaseNodeProps) {
  const accentStyle = ACCENT_STYLES[accent];
  return (
    <div
      className={cn(
        "relative w-[280px] rounded-xl border bg-card text-card-foreground shadow-sm transition-all",
        className,
        accentStyle.container(selected)
      )}
    >
      <div className={cn("flex items-center gap-2 px-4 py-3 rounded-t-xl", accentStyle.header)}>
        <Icon className={cn("h-4 w-4", accentStyle.icon)} />
        <span className="text-sm font-medium">{title}</span>
      </div>
      {referenceName && (
        <div className="px-4 pt-1 text-[10px] text-muted-foreground font-mono truncate">
          {referenceName}
        </div>
      )}

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
