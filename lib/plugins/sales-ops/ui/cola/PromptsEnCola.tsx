'use client';

import { ExternalLink, Pause, Play, Sparkles, Trash2, UserSquare2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PROGRAMADOS_API, programadosFetcher } from '@/lib/plugins/scheduled-messages/ui/swr';
import { fmtDateTime, tiempoRelativo } from '../components/format';
import { borrarProgramado } from '../programados/api';
import type { SkillRun } from '../skills/api';
import { RUN_STATUS_LABELS, RUN_STATUS_TONE, MODE_LABELS } from '../skills/skill-meta';

/**
 * Piezas compartidas de la Cola para corridas del Prompt Studio y programados.
 *
 * Acá vivía la pestaña "Prompts y programados" entera. Se desarmó cuando la
 * Cola pasó a mostrar todo junto (lotes, indicaciones, prompts y programados)
 * por momento —en revisión, en cola, hechos, descartados— en vez de por tipo:
 * lo que queda son las piezas que la vista unificada reutiliza.
 */

export type Programado = {
  id: number;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  message: string | null;
  aiPrompt: string | null;
  nextRunAt: string | null;
  lastRunAt?: string | null;
  lastError?: string | null;
  createdAt?: string | null;
  targetNumbers: string[];
};

/**
 * La clave y el fetcher vienen del plugin dueño del endpoint, no de acá: son los
 * mismos que usan la app de Programados y Tareas. Dos fetchers sobre la misma
 * clave de SWR se pisan (ver el comentario en ese archivo).
 */
export { PROGRAMADOS_API, programadosFetcher };

/** Pausa o reactiva un programado. */
export async function cambiarEstadoProgramado(item: Programado, status: 'active' | 'paused') {
  const res = await fetch(`${PROGRAMADOS_API}/${item.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
}

/**
 * Un programado en la Cola: nombre, cuándo sale, su prompt, pausar/activar,
 * abrir la ficha del contacto (si el teléfono cruza con un chat) y descartar.
 * Descartar un programado es borrarlo: no hay un estado "rechazado" para ellos
 * y uno pausado seguiría apareciendo en revisión para siempre.
 */
export function ProgramadoRow({ item, chatId, onOpen, onChanged }: { item: Programado; chatId?: number | null; onOpen?: (chatId: number) => void; onChanged: () => void }) {
  const descartar = async () => {
    if (!window.confirm(`¿Descartar el programado “${item.name}”? Se borra y no sale.`)) return;
    try {
      await borrarProgramado(item.id);
      toast.success('Programado descartado.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descartar.');
    }
  };
  const cambiar = async (status: 'active' | 'paused') => {
    try {
      await cambiarEstadoProgramado(item, status);
      toast.success(status === 'paused' ? 'Programado pausado.' : 'Programado activado.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
    }
  };
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {item.status === 'paused'
            ? 'Pausado'
            : item.status === 'completed'
              ? `Enviado${item.lastRunAt ? ` · ${fmtDateTime(item.lastRunAt)}` : ''}`
              : item.status === 'failed'
                ? `Falló${item.lastError ? ` · ${item.lastError}` : ''}`
                : `Sale ${fmtDateTime(item.nextRunAt)}`}
          {item.targetNumbers?.length > 1 && ` · ${item.targetNumbers.length} destinatarios`}
        </p>
        {item.aiPrompt && (
          <p className="mt-1 line-clamp-2 text-[11px] italic text-muted-foreground/90">
            <Sparkles className="mr-1 inline size-3 text-primary" aria-hidden />
            {item.aiPrompt}
          </p>
        )}
        {item.message && <p className="mt-1 line-clamp-2 text-[11px] text-foreground/80">{item.message}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {(item.status === 'active' || item.status === 'paused') && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            title={item.status === 'active' ? 'Pausar' : 'Activar'}
            onClick={() => void cambiar(item.status === 'active' ? 'paused' : 'active')}
          >
            {item.status === 'active' ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          </Button>
        )}
        {chatId && onOpen ? (
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Abrir la ficha del contacto" onClick={() => onOpen(chatId)}>
            <UserSquare2 className="size-3.5" aria-hidden />
          </Button>
        ) : (
          <a
            href="/plugins/scheduled-messages"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Abrir en Programados"
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        {item.status !== 'completed' && (
          <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" title="Descartar (borra el programado)" onClick={() => void descartar()}>
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </>
  );
}

/** Título, destino y estado de una corrida. Igual en todos los lugares que las muestran. */
export function FilaRun({ run, onOpen, compact }: { run: SkillRun; onOpen?: (chatId: number) => void; compact?: boolean }) {
  const tQueue = useTranslations('SalesOpsQueue');
  const needsDecision = run.status === 'blocked' && Boolean(run.humanRequest);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug" title={run.title}>{run.title}</p>
        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', needsDecision ? 'bg-primary/10 text-primary' : RUN_STATUS_TONE[run.status] ?? 'bg-muted text-muted-foreground')}>
          {needsDecision ? tQueue('decisionStatus') : RUN_STATUS_LABELS[run.status] ?? run.status}
        </span>
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
        {run.targetKind === 'chat' ? (
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpen?.(Number(run.targetId))}>
            {run.targetName ?? `chat ${run.targetId}`}
          </button>
        ) : run.targetKind === 'batch' ? (
          <span>lote {run.targetName ?? run.targetId}</span>
        ) : (
          <span>equipo</span>
        )}
        <span>· {tiempoRelativo(run.completedAt ?? run.createdAt)}</span>
        <span>· {MODE_LABELS[run.mode]}</span>
      </p>
      {!compact && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/90">{run.text}</p>}
    </>
  );
}
