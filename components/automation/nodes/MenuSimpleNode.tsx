import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock, ListOrdered, LocateFixed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BaseNode } from './BaseNode';
import { Badge } from '@/components/ui/badge';
import { getMenuMarker } from '@/lib/automation/menu-simple';
import type { MenuSimpleNodeData } from '@/lib/automation/flow-schema';

type MenuSimpleNodeViewData = MenuSimpleNodeData & {
  connectedSourceHandles?: string[];
  onNavigateToConnectedNode?: (sourceHandle: string) => void;
};

export function MenuSimpleNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: MenuSimpleNodeViewData;
  selected?: boolean;
}) {
  const t = useTranslations('Automation');
  const markerStyle = data.markerStyle || 'emoji_number';
  const options =
    data.menuOptions && data.menuOptions.length > 0
      ? data.menuOptions
      : [{ id: 'opt-1', text: 'Opción 1' }];
  const globalDelay = Number(data.globalDelaySeconds) || 0;

  return (
    <BaseNode
      nodeId={id}
      title={t('nodes.menu_simple')}
      icon={ListOrdered}
      selected={selected}
      disableSource
      referenceName={(data as { referenceName?: string }).referenceName}
    >
      <div className="text-sm text-foreground mb-3 whitespace-pre-wrap line-clamp-3">
        {data.label || 'Elegí una opción:'}
      </div>

      <div className="flex flex-col gap-2">
        {options.map((option, index) => {
          const sourceHandle = `menu-${option.id}`;
          const isConnected = data.connectedSourceHandles?.includes(sourceHandle) ?? false;

          return (
            <div key={option.id} className="relative">
              <button
                type="button"
                disabled={!isConnected}
                onClick={(event) => {
                  event.stopPropagation();
                  data.onNavigateToConnectedNode?.(sourceHandle);
                }}
                aria-label={
                  isConnected
                    ? t('menu_simple_go_to_connected_node', { option: option.text })
                    : undefined
                }
                title={
                  isConnected
                    ? t('menu_simple_go_to_connected_node', { option: option.text })
                    : undefined
                }
                className={[
                  'nodrag nopan flex w-full items-center justify-between rounded border border-border bg-muted/50 p-2 text-left text-xs font-medium transition-colors',
                  isConnected
                    ? 'cursor-pointer hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                    : 'cursor-default',
                ].join(' ')}
              >
                <span className="min-w-0 truncate">
                  <span className="mr-1 text-muted-foreground">{getMenuMarker(markerStyle, index)}</span>
                  {option.text}
                </span>
                <span className="ml-2 flex shrink-0 items-center gap-1.5">
                  {option.matchValue && option.matchValue.trim() ? (
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                      {option.matchOperator || 'equals'}
                    </Badge>
                  ) : null}
                  {isConnected ? <LocateFixed className="h-3.5 w-3.5 text-primary" /> : null}
                </span>
              </button>

              <Handle
                type="source"
                position={Position.Right}
                id={sourceHandle}
                className="!bg-indigo-500 !w-3 !h-3 !-mr-[22px]"
              />
            </div>
          );
        })}

        <div className="relative mt-1">
          <button
            type="button"
            disabled={!data.connectedSourceHandles?.includes('fallback')}
            onClick={(event) => {
              event.stopPropagation();
              data.onNavigateToConnectedNode?.('fallback');
            }}
            aria-label={
              data.connectedSourceHandles?.includes('fallback')
                ? t('menu_simple_go_to_fallback_node')
                : undefined
            }
            title={
              data.connectedSourceHandles?.includes('fallback')
                ? t('menu_simple_go_to_fallback_node')
                : undefined
            }
            className={[
              'nodrag nopan flex w-full items-center justify-between rounded border border-destructive/20 bg-destructive/10 p-2 text-left text-xs transition-colors',
              data.connectedSourceHandles?.includes('fallback')
                ? 'cursor-pointer hover:border-destructive/40 hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30'
                : 'cursor-default',
            ].join(' ')}
          >
            <span className="font-medium text-destructive">{t('menu_simple_fallback_label')}</span>
            {data.connectedSourceHandles?.includes('fallback') ? (
              <LocateFixed className="h-3.5 w-3.5 text-destructive" />
            ) : null}
          </button>
          <Handle
            type="source"
            position={Position.Right}
            id="fallback"
            className="!bg-destructive !w-3 !h-3 !-mr-[22px]"
          />
        </div>
      </div>

      {globalDelay > 0 && (
        <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {t('menu_simple_delay_badge', { seconds: globalDelay })}
        </div>
      )}
    </BaseNode>
  );
}
