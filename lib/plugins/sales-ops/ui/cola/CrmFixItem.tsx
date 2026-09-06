'use client';

import { useState } from 'react';
import { Check, Loader2, UserSquare2, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CrmFixPendiente } from '../../server/crm';
import { describeCrmFix } from '../../shared/crm-fix';
import { GateBadge } from '../components/GateBadge';
import { SALES_OPS_API, tiempoRelativo } from '../components/format';
import type { Gate } from '../../shared/taxonomy';

export const CRM_FIXES_ENDPOINT = `${SALES_OPS_API}/crm-fixes`;

/**
 * Una corrección de CRM esperando decisión, en la Cola y en el Focus de
 * supervisión.
 *
 * Es lo mismo que el bloque "CRM a corregir" de la ficha, pero afuera: hasta
 * ahora para enterarse de que la clasificación había detectado una etapa mal
 * puesta había que abrir el contacto. Como es una decisión pendiente igual que
 * un lote, se lista con los lotes. Aplicar pasa por el mismo camino que el
 * botón de la ficha (`applyCrmFix` → `updateCrm`): mismas validaciones, misma
 * auditoría. De a un contacto, nunca en lote.
 */
export function CrmFixItem({
  item,
  onOpen,
  onResuelto,
  variante = 'fila',
}: {
  item: CrmFixPendiente;
  onOpen?: (chatId: number) => void;
  /** Se aplicó o se descartó: la lista lo saca. */
  onResuelto: (como: 'aprobado' | 'descartado') => void;
  /** `focus` = más aire y botones grandes; `fila` = compacto para la lista. */
  variante?: 'fila' | 'focus';
}) {
  const [ocupado, setOcupado] = useState<'aplicar' | 'descartar' | null>(null);
  const pasos = describeCrmFix(item.fix);
  const focus = variante === 'focus';

  const aplicar = async () => {
    setOcupado('aplicar');
    try {
      const res = await fetch(`${SALES_OPS_API}/contacts/${item.chatId}/crm/apply`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { applied?: string[]; skipped?: string[]; error?: string };
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      toast.success(`${item.name}: ${(body.applied ?? []).join(' · ')}`);
      if (body.skipped?.length) toast.warning(body.skipped.join(' · '));
      onResuelto('aprobado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aplicar.');
    } finally {
      setOcupado(null);
    }
  };

  const descartar = async () => {
    setOcupado('descartar');
    try {
      const res = await fetch(`${SALES_OPS_API}/contacts/${item.chatId}/crm/apply`, { method: 'DELETE' });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      toast.success('Corrección descartada.');
      onResuelto('descartado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descartar.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className={cn(!focus && 'rounded-xl border border-amber-500/40 bg-card px-3 py-2')} data-crm-fix-chat={item.chatId} aria-busy={ocupado !== null}>
      <div className="flex items-start gap-2">
        {!focus && <Wrench className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {onOpen ? (
              <button type="button" className={cn('truncate text-left font-medium underline-offset-2 hover:underline', focus ? 'text-sm font-semibold' : 'text-sm')} onClick={() => onOpen(item.chatId)}>
                {item.name}
              </button>
            ) : (
              <span className={cn('truncate font-medium', focus ? 'text-sm font-semibold' : 'text-sm')}>{item.name}</span>
            )}
            {item.gate && <GateBadge gate={item.gate as Gate} />}
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">Corregir CRM</span>
            {item.analyzedAt && <span className="text-[11px] text-muted-foreground">· detectado {tiempoRelativo(item.analyzedAt)}</span>}
          </div>
          {(item.texto || item.fix.reason) && <p className={cn('mt-1 leading-snug text-foreground/90', focus ? 'text-[13px]' : 'text-xs')}>{item.texto ?? item.fix.reason}</p>}
          <ul className={cn('mt-1.5 space-y-0.5', focus && 'mt-3')}>
            {pasos.map((paso) => (
              <li key={paso} className={cn('flex items-start gap-1.5 text-muted-foreground', focus ? 'text-xs' : 'text-[11px]')}>
                <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
                {paso}
              </li>
            ))}
          </ul>
        </div>
        {!focus && (
          <button type="button" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Descartar" title="Descartar la corrección" disabled={ocupado !== null} onClick={() => void descartar()}>
            {ocupado === 'descartar' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
          </button>
        )}
      </div>
      <div className={cn('flex flex-wrap items-center gap-1.5', focus ? 'mt-4 gap-2' : 'mt-2')}>
        <Button type="button" size="sm" className={cn('gap-1.5', focus ? 'h-9' : 'h-7 px-2 text-[11px]')} disabled={ocupado !== null} onClick={() => void aplicar()}>
          {ocupado === 'aplicar' ? <Loader2 className={focus ? 'size-4 animate-spin' : 'size-3 animate-spin'} aria-hidden /> : <Check className={focus ? 'size-4' : 'size-3'} aria-hidden />}
          Aplicar al CRM
        </Button>
        {focus && (
          <Button type="button" size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" disabled={ocupado !== null} onClick={() => void descartar()}>
            {ocupado === 'descartar' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}
            Descartar
          </Button>
        )}
        {onOpen && !focus && (
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => onOpen(item.chatId)}>
            <UserSquare2 className="size-3" aria-hidden />
            Ficha
          </Button>
        )}
      </div>
    </div>
  );
}
