import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Split } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';
import { Badge } from '@/components/ui/badge';

interface Condition {
  id: string;
  type: string;
  operator: string;
  value: string;
  value2?: string;
  label?: string;
}

interface ConditionNodeData {
  label: string;
  conditions: Condition[];
}

export function ConditionNode({ id, data, selected }: { id: string; data: ConditionNodeData, selected?: boolean }) {
  const t = useTranslations('Automation');
  const conditions = data.conditions || [];

  return (
    <BaseNode 
      nodeId={id}
      title={t('nodes.condition')} 
      icon={Split} 
      selected={selected} 
      disableSource={true} 
      referenceName={(data as any).referenceName}
    >
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground mb-1">
          {t('check_rules_label')}
        </div>

        {conditions.map((condition, index) => (
          <div key={condition.id} className="relative flex items-center justify-between bg-muted/40 p-2 rounded border border-border text-xs group">
            <div className="flex flex-col truncate max-w-[180px]">
              {condition.label && (
                <span className="font-medium text-[10px] text-foreground truncate mb-0.5" title={condition.label}>
                  {condition.label}
                </span>
              )}
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
              className="!bg-indigo-500 !w-3 !h-3 !-mr-[22px]"
            />
          </div>
        ))}

        <div className="relative flex items-center justify-between bg-destructive/10 p-2 rounded border border-destructive/20 text-xs mt-1">
          <span className="font-medium text-destructive">{t('else_fallback_label')}</span>
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
