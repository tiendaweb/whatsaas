import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Split } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { Badge } from '@/components/ui/badge';

interface Condition {
  id: string;
  type: string;
  operator: string;
  value: string;
  value2?: string;
}

interface ConditionNodeData {
  label: string;
  conditions: Condition[];
}

export function ConditionNode({ data, selected }: { data: ConditionNodeData, selected?: boolean }) {
  const conditions = data.conditions || [];

  return (
    <BaseNode 
      title="Condition Split" 
      icon={Split} 
      selected={selected} 
      disableSource={true} 
    >
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground mb-1">
          Check rules:
        </div>

        {conditions.map((condition, index) => (
          <div key={condition.id} className="relative flex items-center justify-between bg-muted/40 p-2 rounded border border-border text-xs group">
            <div className="flex flex-col truncate max-w-[180px]">
              <span className="font-semibold capitalize text-[10px] text-primary">
                {condition.type} • {condition.operator.replace('_', ' ')}
              </span>
              <span className="truncate">
                {condition.value} {condition.value2 ? `- ${condition.value2}` : ''}
              </span>
            </div>
            
            <Badge variant="outline" className="text-[9px] h-4 px-1 ml-2">
              #{index + 1}
            </Badge>

            <Handle
              type="source"
              position={Position.Right}
              id={condition.id}
              className="!bg-blue-500 !w-3 !h-3 !-mr-[22px]" 
            />
          </div>
        ))}

        <div className="relative flex items-center justify-between bg-destructive/10 p-2 rounded border border-destructive/20 text-xs mt-1">
          <span className="font-medium text-destructive">Else (Fallback)</span>
          <Handle
            type="source"
            position={Position.Right}
            id="fallback"
            className="!bg-destructive !w-3 !h-3 !-mr-[22px]" 
          />
        </div>
      </div>
    </BaseNode>
  );
}