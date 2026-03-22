import React from 'react';
import { Bot } from 'lucide-react';
import { BaseNode } from './BaseNode';

interface AiControlNodeData {
  action?: 'active' | 'paused';
}

export function AiControlNode({ data, selected }: { data: AiControlNodeData, selected?: boolean }) {
  const actionLabel = data.action === 'active' ? 'Enable IA' : 'Pause IA';
  
  const actionColor = data.action === 'active' 
    ? 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-800' 
    : 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-800';

  return (
    <BaseNode title="IA Control" icon={Bot} selected={selected}>
      <div className={`text-xs font-medium px-2 py-1 rounded border text-center ${actionColor}`}>
        {actionLabel}
      </div>
    </BaseNode>
  );
}