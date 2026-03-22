import React from 'react';
import { List, GripVertical } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function OptionsNode({ id, data, selected }: { id: string; data: { label: string, options?: string[] }, selected?: boolean }) {
  const options = data.options && data.options.length > 0 ? data.options : ['Option 1', 'Option 2'];

  return (
    <BaseNode nodeId={id} title="Options Menu" icon={List} selected={selected}>
      <div className="text-sm text-foreground mb-4 whitespace-pre-wrap">
        {data.label || "Choose an option:"}
      </div>

      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={index} className="relative flex items-center justify-between bg-muted/50 p-2 rounded border border-border text-xs font-medium">
            <span>{index + 1}. {option}</span>
            <GripVertical className="h-3 w-3 text-muted-foreground opacity-50" />
            
            <Handle
              type="source"
              position={Position.Right}
              id={`option-${index}`}
              className="!bg-orange-500 !w-3 !h-3 !-mr-3.5"
              style={{ top: '50%' }}
            />
          </div>
        ))}
      </div>
    </BaseNode>
  );
}
