import React from 'react';
import { List, GripVertical } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';

export function OptionsNode({ id, data, selected }: { id: string; data: { label: string, options?: string[] }, selected?: boolean }) {
  const t = useTranslations('Automation');
  const options = data.options && data.options.length > 0 ? data.options : [t('option_fallback_1'), t('option_fallback_2')];

  return (
    <BaseNode nodeId={id} title={t('nodes.options')} icon={List} selected={selected} referenceName={(data as any).referenceName}>
      <div className="text-sm text-foreground mb-4 whitespace-pre-wrap">
        {data.label || t('choose_option_fallback')}
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
              className="!bg-indigo-500 !w-3 !h-3 !-mr-3.5"
              style={{ top: '50%' }}
            />
          </div>
        ))}
      </div>
    </BaseNode>
  );
}
