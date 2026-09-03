'use client';

import { ArrowRight, Radio, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { OverviewPayload } from '../../shared/api-types';
import { GateBadge } from '../components/GateBadge';
import type { Vista } from '../components/vistas';
import { OWNER_LABELS, SIGNAL_LABELS, fmtInt, iniciales } from '../components/format';
import { CH, TONOS } from './estilo';

type Item = OverviewPayload['nextBest'][number];

/**
 * La cola de trabajo del día: a quién hay que tocar ahora y por qué.
 *
 * Vive en su propia pestaña porque es lo único de Hoy sobre lo que se *actúa*:
 * mezclada abajo de los contadores quedaba fuera de pantalla en el celular,
 * justo la lista que hay que barrer de arriba a abajo.
 */
export function AccionesHoy({
  items,
  analizados,
  onOpen,
  onChangeVista,
}: {
  items: Item[];
  analizados: number;
  onOpen: (chatId: number) => void;
  onChangeVista: (vista: Vista) => void;
}) {
  if (items.length === 0) {
    return (
      <div className={cn('px-6 py-12 text-center', CH.card)}>
        <p className={CH.titulo}>{analizados === 0 ? 'Todavía no hay chats analizados' : 'Nada urgente para este responsable'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {analizados === 0 ? 'Dejá los chats en cola desde Contactos y un conector los clasifica.' : 'Probá sacando el filtro de responsable.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className={CH.rotulo}>{fmtInt(items.length)} para tocar ahora</h2>
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-[11px] font-bold" onClick={() => onChangeVista('cola')}>
          Ver la cola <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </div>

      <ol className="space-y-2">
        {items.map((item, i) => {
          const esSenal = item.reason === 'signal';
          return (
            <li key={`${item.chatId}-${i}`} className={cn('flex items-center gap-3 p-3.5', CH.card)}>
              <span className={cn(CH.iconoCaja, esSenal ? TONOS.violet : TONOS.indigo)}>
                {esSenal ? <Radio className="size-5" aria-hidden /> : <span className="text-xs font-black">{iniciales(item.name)}</span>}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{item.name}</span>
                  {esSenal ? (
                    <span className="shrink-0 rounded-lg bg-violet-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                      {item.signalKind ? SIGNAL_LABELS[item.signalKind] : 'señal nueva'}
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <GateBadge gate={item.gate} />
                      <span className="flex items-center gap-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                        <Target className="size-3" aria-hidden />
                        {fmtInt(item.priorityScore)}
                      </span>
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.text || '—'}</p>
                <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">{OWNER_LABELS[item.owner] ?? item.owner}</p>
              </div>

              <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-xl px-3 text-xs font-bold" onClick={() => onOpen(item.chatId)}>
                {esSenal ? 'Responder' : 'Abrir'}
              </Button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
