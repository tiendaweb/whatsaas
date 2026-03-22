import React from 'react';
import { Save } from 'lucide-react';
import { BaseNode } from './BaseNode';

interface SaveContactNodeData {
  nameVariable?: string;
  agentId?: string;
  departmentId?: string;
  tagId?: string;
  funnelStageId?: string;
  customFields?: Record<string, string>;
}

export function SaveContactNode({ data, selected }: { data: SaveContactNodeData, selected?: boolean }) {
  const updates = [
    data.nameVariable ? `Name: {{${data.nameVariable}}}` : null,
    data.agentId && data.agentId !== 'null' ? 'Assign Agent' : null,
    data.departmentId && data.departmentId !== 'null' ? 'Assign Department' : null,
    data.tagId && data.tagId !== 'null' ? 'Add Tag' : null,
    data.funnelStageId && data.funnelStageId !== 'null' ? 'Move Stage' : null,
    ...(data.customFields ? Object.entries(data.customFields).map(([key, val]) => `${key}: ${val}`) : [])
  ].filter(Boolean);

  return (
    <BaseNode title="Update Contact" icon={Save} selected={selected}>
      {updates.length > 0 ? (
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
          {updates.map((u, i) => <li key={i} className="truncate max-w-[180px]">{u}</li>)}
        </ul>
      ) : (
        <span className="text-xs text-muted-foreground italic">No updates configured</span>
      )}
    </BaseNode>
  );
}