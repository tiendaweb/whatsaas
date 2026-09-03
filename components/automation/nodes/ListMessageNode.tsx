import React from 'react';
import { ListChecks } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';

interface ListItem {
  id: string;
  title: string;
  description?: string;
}

interface ListMessageData {
  bodyText?: string;
  buttonText?: string;
  items?: ListItem[];
}

export function ListMessageNode({ id, data, selected }: { id: string; data: ListMessageData, selected?: boolean }) {
  const t = useTranslations('Automation');
  const items = data.items || [];

  return (
    <BaseNode 
      nodeId={id}
      title={t('nodes.list')} 
      icon={ListChecks} 
      selected={selected}
      disableSource={true}
      referenceName={(data as any).referenceName}
    >
      <div className="flex flex-col gap-2">
        <div className="text-sm text-foreground line-clamp-3">
          {data.bodyText || t('enter_body_text_placeholder')}
        </div>
        <div className="bg-muted p-2 rounded text-xs text-center font-medium border border-border">
          {data.buttonText || "Menu"}
        </div>
        <div className="space-y-1 mt-1 max-h-40 overflow-y-auto pr-6 pl-1 py-1">
          {items.map((item, index) => (
            <div key={item.id || index} className="relative flex flex-col bg-card border border-border p-2 rounded text-xs group hover:border-primary/50 transition-colors">
              <span className="font-semibold truncate pr-2">{item.title || t('option_x_label', { count: index + 1 })}</span>
              {item.description && <span className="text-[10px] text-muted-foreground truncate">{item.description}</span>}
              <Handle
                type="source"
                position={Position.Right}
                id={`list-${item.id || index}`}
                className="!bg-primary !w-3 !h-3 z-50"
                style={{ 
                  position: 'absolute',
                  right: '-21px', 
                  top: '50%',
                  transform: 'translateY(-50%)'
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </BaseNode>
  );
}
