'use client';

import { memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { AnalysisRow } from '../../shared/api-types';
import { GateBadge } from './GateBadge';
import { PriorityPill } from './PriorityPill';
import { OWNER_LABELS, STATUS_LABELS, iniciales, tiempoRelativo } from './format';

type Props = {
  row: AnalysisRow;
  selected?: boolean;
  active?: boolean;
  selectable?: boolean;
  onOpen: (chatId: number) => void;
  onToggle?: (chatId: number, checked: boolean) => void;
};

/**
 * Fila de dos líneas, móvil primero:
 *   ◯ Nombre                         G10 · 187 · 🔥
 *     Acción recomendada…            hace 6 h · Carlos   ›
 */
export const ContactRow = memo(function ContactRow({ row, selected, active, selectable, onOpen, onToggle }: Props) {
  const tiempo = tiempoRelativo(row.lastCustomerMessageAt);
  const marcas: string[] = [];
  if (row.stale) marcas.push('desactualizado');
  if (row.automationActive) marcas.push('automatización');
  if (row.evidenceGap) marcas.push('hueco');
  if (row.analyzedAt && row.confidence < 55) marcas.push('revisar');
  if (row.status !== 'sin_analizar' && row.status !== 'en_proceso' && row.status !== 'recuperado') marcas.push(STATUS_LABELS[row.status] ?? row.status);

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50',
        active && 'bg-muted/70',
        selected && 'bg-primary/5',
      )}
    >
      {selectable && (
        <Checkbox
          checked={Boolean(selected)}
          onCheckedChange={(v) => onToggle?.(row.chatId, v === true)}
          aria-label={`Seleccionar ${row.name}`}
          className="shrink-0"
        />
      )}
      <button
        type="button"
        onClick={() => onOpen(row.chatId)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none"
        aria-label={`Abrir ficha de ${row.name}`}
      >
        <Avatar className="size-9 shrink-0">
          {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
          <AvatarFallback className="text-xs">{iniciales(row.name)}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{row.name}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <GateBadge gate={row.currentGate} />
              <PriorityPill score={row.priorityScore} temperature={row.temperature} />
            </span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              {row.recommendedAction || (row.analyzedAt ? 'Sin acción recomendada' : 'Sin analizar')}
            </span>
            <span className="shrink-0 truncate tabular-nums">
              {tiempo}
              {tiempo && ' · '}
              {OWNER_LABELS[row.recommendedOwner] ?? row.recommendedOwner}
            </span>
          </span>
          {marcas.length > 0 && (
            <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground/80">{marcas.join(' · ')}</span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" aria-hidden />
      </button>
    </div>
  );
});
