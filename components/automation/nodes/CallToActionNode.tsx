import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';

interface CallToActionData {
  bodyText?: string;
  buttonText?: string;
  url?: string;
}

export function CallToActionNode({ id, data, selected }: { id: string; data: CallToActionData, selected?: boolean }) {
  const t = useTranslations('Automation');

  return (
    <BaseNode nodeId={id} title={t('nodes.cta')} icon={ExternalLink} selected={selected} referenceName={(data as any).referenceName}>
      <div className="flex flex-col gap-3">
        <div className="text-sm text-foreground line-clamp-3">
          {data.bodyText || t('enter_message_text_placeholder')}
        </div>
        <div className="flex items-center justify-center gap-2 bg-primary/10 text-primary p-2 rounded border border-primary/20 text-xs font-medium">
          <ExternalLink className="h-3 w-3" />
          <span className="truncate">{data.buttonText || t('visit_website_fallback')}</span>
        </div>
        {data.url && (
          <div className="text-[10px] text-muted-foreground truncate text-center">
            {data.url}
          </div>
        )}
      </div>
    </BaseNode>
  );
}
