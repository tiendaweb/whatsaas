import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';

export function MessageNode({ id, data, selected }: { id: string; data: { label: string }, selected?: boolean }) {
  const t = useTranslations('Automation');

  return (
    <BaseNode nodeId={id} title={t('nodes.message')} icon={MessageSquare} selected={selected} referenceName={(data as any).referenceName}>
      <div className="text-sm text-foreground line-clamp-3">
        {data.label || t('no_text_configured')}
      </div>
    </BaseNode>
  );
}
