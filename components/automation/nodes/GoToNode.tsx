import React from 'react';
import { GitBranchPlus } from 'lucide-react';
import { BaseNode } from './BaseNode';

type GoToNodeData = {
  mode?: 'previous_node' | 'specific_node' | 'other_flow';
  targetNodeId?: string;
  targetAutomationId?: string | number;
  fallbackNodeId?: string;
};

const modeLabels: Record<NonNullable<GoToNodeData['mode']>, string> = {
  previous_node: 'Previous node',
  specific_node: 'Specific node',
  other_flow: 'Other flow',
};

export function GoToNode({ id, data, selected }: { id: string; data: GoToNodeData; selected?: boolean }) {
  const mode = data.mode || 'previous_node';

  return (
    <BaseNode nodeId={id} title="Go To Node" icon={GitBranchPlus} selected={selected} disableSource>
      <div className="space-y-2 text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">Mode:</span> {modeLabels[mode]}
        </div>

        {mode !== 'previous_node' && data.targetNodeId ? (
          <div>
            <span className="font-semibold text-foreground">Target node:</span> {data.targetNodeId}
          </div>
        ) : null}

        {mode === 'other_flow' && data.targetAutomationId ? (
          <div>
            <span className="font-semibold text-foreground">Target flow:</span> {String(data.targetAutomationId)}
          </div>
        ) : null}

        {data.fallbackNodeId ? (
          <div>
            <span className="font-semibold text-foreground">Fallback:</span> {data.fallbackNodeId}
          </div>
        ) : null}
      </div>
    </BaseNode>
  );
}
