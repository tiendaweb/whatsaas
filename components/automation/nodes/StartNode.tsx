import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap, MessageSquare, Variable, User, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface StartNodeData {
  label: string;
  triggerType: string;
  keywords: string[];
  conditions?: {
    funnelStageId?: string;
    tagId?: string;
    assignedUserId?: string;
  };
}

export function StartNode({ id, data, selected }: { id: string; data: StartNodeData, selected?: boolean }) {
  const t = useTranslations('Automation');
  const triggerTypeLabel = {
    exact_match: t('exact_match_select'),
    contains: t('message_contains_select'),
    first_message: t('first_message_select'),
    fallback: t('fallback_select')
  }[data.triggerType] || t('message_contains_select');

  return (
    <div className="relative">
      <BaseNode nodeId={id} title={t('nodes.start')} icon={Zap} selected={selected} isStart referenceName={(data as any).referenceName}>
        <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          <MessageSquare className="h-3 w-3" />
          <span className="font-medium">{t('node_trigger_type', { type: triggerTypeLabel })}</span>
        </div>

        {data.keywords && data.keywords.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">{t('keywords_label')}</span>
            <div className="flex flex-wrap gap-1">
              {data.keywords.slice(0, 3).map((k, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] px-1 h-5">{k}</Badge>
              ))}
              {data.keywords.length > 3 && (
                <Badge variant="secondary" className="text-[10px] px-1 h-5">+{data.keywords.length - 3}</Badge>
              )}
            </div>
          </div>
        )}
        
        <Separator className="my-2" />

        <div className="space-y-2">
            <div className="flex items-center gap-1.5">
                <Variable className="h-3 w-3 text-primary" />
                <span className="text-[10px] uppercase font-bold text-muted-foreground">{t('available_variables_label')}</span>
            </div>
            
            <div className="grid gap-1.5">
                <div className="flex items-center gap-2 bg-primary/5 p-1.5 rounded border border-primary/10">
                    <User className="h-3 w-3 text-primary/70" />
                    <code className="text-[10px] font-mono text-foreground">{'{{contact.name}}'}</code>
                </div>
                <div className="flex items-center gap-2 bg-primary/5 p-1.5 rounded border border-primary/10">
                    <Phone className="h-3 w-3 text-primary/70" />
                    <code className="text-[10px] font-mono text-foreground">{'{{contact.phone}}'}</code>
                </div>
            </div>
        </div>
        </div>
      </BaseNode>
      <Handle
        id="incoming-delegation"
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!h-3 !w-3 !-ml-1.5 !border-2 !border-indigo-200 !bg-indigo-500"
      />
    </div>
  );
}
