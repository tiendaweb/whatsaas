import React from 'react';
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';

interface SaveContactNodeData {
  nameVariable?: string;
  agentId?: string;
  departmentId?: string;
  tagId?: string;
  funnelStageId?: string;
  customFields?: Record<string, string>;
}

export function SaveContactNode({ id, data, selected }: { id: string; data: SaveContactNodeData, selected?: boolean }) {
  const t = useTranslations('Automation');
  const updates = [
    data.nameVariable ? t('name_update_label', { variable: `{{${data.nameVariable}}}` }) : null,
    data.agentId && data.agentId !== 'null' ? t('assign_agent_update') : null,
    data.departmentId && data.departmentId !== 'null' ? t('assign_department_update') : null,
    data.tagId && data.tagId !== 'null' ? t('add_tag_update') : null,
    data.funnelStageId && data.funnelStageId !== 'null' ? t('move_stage_update') : null,
    ...(data.customFields ? Object.entries(data.customFields).map(([key, val]) => `${key}: ${val}`) : [])
  ].filter(Boolean);

  return (
    <BaseNode nodeId={id} title={t('nodes.save_contact')} icon={Save} selected={selected} referenceName={(data as any).referenceName}>
      {updates.length > 0 ? (
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
          {updates.map((u, i) => <li key={i} className="truncate max-w-[180px]">{u}</li>)}
        </ul>
      ) : (
        <span className="text-xs text-muted-foreground italic">{t('no_updates_configured')}</span>
      )}
    </BaseNode>
  );
}
