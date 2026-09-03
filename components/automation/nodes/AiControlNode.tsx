import React from 'react';
import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';

interface AiControlNodeData {
  action?: 'active' | 'paused';
}

export function AiControlNode({ id, data, selected }: { id: string; data: AiControlNodeData, selected?: boolean }) {
  const t = useTranslations('Automation');
  const actionLabel = data.action === 'active' ? t('enable_ai_select') : t('disable_pause_ai_select');
  
  const actionColor = data.action === 'active'
    ? 'text-primary bg-primary/10 border-primary/20'
    : 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-800';

  return (
    <BaseNode nodeId={id} title={t('nodes.ai_control')} icon={Bot} selected={selected} referenceName={(data as any).referenceName}>
      <div className={`text-xs font-medium px-2 py-1 rounded border text-center ${actionColor}`}>
        {actionLabel}
      </div>
    </BaseNode>
  );
}
