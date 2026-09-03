import React from 'react';
import { MousePointerClick } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';

interface Button {
  id: string;
  text: string;
}

interface ButtonMessageData {
  bodyText?: string;
  footerText?: string;
  buttons?: Button[];
}

export function ButtonMessageNode({ id, data, selected }: { id: string; data: ButtonMessageData, selected?: boolean }) {
  const t = useTranslations('Automation');
  const buttons = data.buttons || [];

  return (
    <BaseNode 
      nodeId={id}
      title={t('nodes.buttons')} 
      icon={MousePointerClick} 
      selected={selected}
      disableSource={true}
      referenceName={(data as any).referenceName}
    >
      <div className="flex flex-col gap-2">
        <div className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap">
          {data.bodyText || t('enter_message_text_placeholder')}
        </div>
        {data.footerText && (
          <div className="text-xs text-muted-foreground truncate">
            {data.footerText}
          </div>
        )}
        <div className="space-y-1 mt-2">
          {buttons.map((btn, index) => (
            <div key={btn.id || index} className="relative flex items-center justify-center bg-primary/10 p-2 rounded text-xs font-medium text-primary border border-primary/20">
              {btn.text || t('button_x_label', { count: index + 1 })}
              <Handle
                type="source"
                position={Position.Right}
                id={`btn-${btn.id || index}`}
                className="!bg-primary !w-3 !h-3 !-mr-3.5"
                style={{ top: '50%' }}
              />
            </div>
          ))}
          {buttons.length === 0 && (
            <div className="text-xs text-destructive italic text-center">{t('no_buttons_defined')}</div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}
