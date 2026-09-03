import React from 'react';
import { PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';
import { Badge } from '@/components/ui/badge';

interface CollectNodeData {
  label: string;
  variable: string;
}

export function CollectNode({ id, data, selected }: { id: string; data: CollectNodeData, selected?: boolean }) {
  const t = useTranslations('Automation');

  return (
    <BaseNode nodeId={id} title={t('nodes.collect')} icon={PenLine} selected={selected} referenceName={(data as any).referenceName}>
      <div className="text-sm text-foreground line-clamp-2 mb-2">
        {data.label || t('collect_question_fallback')}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground uppercase font-bold">{t('save_to_label')}</span>
        <Badge variant="outline" className="text-[10px] h-5 px-1 bg-primary/10 text-primary border-primary/20">
          {data.variable ? `{{${data.variable}}}` : t('not_set')}
        </Badge>
      </div>
    </BaseNode>
  );
}
