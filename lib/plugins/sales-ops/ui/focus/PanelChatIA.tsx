'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Bot, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HumanDecisionCard } from '../cola/HumanDecisionCard';
import { SALES_OPS_API, fetcher, tiempoRelativo } from '../components/format';
import { etiquetaDeCorrida, RUN_STATUS_TONE } from '../skills/skill-meta';
import { FallaCorrida } from '../skills/FallaCorrida';
import type { SkillRun } from '../skills/api';

/**
 * Centro abajo del Focus: la conversación con la IA sobre ESTE cliente.
 *
 * Es la misma cola del Prompt Studio (`GET /prompts/queue?chatId=`), leída como
 * un hilo en vez de como una bandeja: lo que se le pidió, lo que devolvió, y lo
 * que está esperando. Lo bloqueado sube arriba de todo con su formulario, porque
 * es lo único que no avanza sin una persona.
 */
export function PanelChatIA({ chatId, className }: { chatId: number; className?: string }) {
  const { data, isLoading, mutate } = useSWR<{ runs: SkillRun[] }>(`${SALES_OPS_API}/prompts/queue?chatId=${chatId}&status=all&limit=20`, fetcher, {
    revalidateOnFocus: false,
  });

  const runs = useMemo(() => {
    const todas = data?.runs ?? [];
    const bloqueadas = todas.filter((r) => r.status === 'blocked' && r.humanRequest);
    const resto = todas.filter((r) => !(r.status === 'blocked' && r.humanRequest));
    return [...bloqueadas, ...resto];
  }, [data?.runs]);

  return (
    <section className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 pb-1.5">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-3 text-primary" aria-hidden />
          Chat IA
        </h2>
        {runs.length > 0 && <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{runs.length}</span>}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {isLoading && <div className="h-16 animate-pulse rounded-lg bg-muted/60" />}
        {!isLoading && runs.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
            Todavía no se le pidió nada a la IA sobre este cliente. Escribí abajo qué querés que haga.
          </p>
        )}
        {runs.map((run) => (
          <Corrida key={run.id} run={run} onCambio={() => void mutate()} />
        ))}
      </div>
    </section>
  );
}

function Corrida({ run, onCambio }: { run: SkillRun; onCambio: () => void }) {
  const necesitaCriterio = run.status === 'blocked' && Boolean(run.humanRequest);
  /**
   * Una corrida fallida no muestra su `summary`: ahí adentro viene el error
   * crudo del SDK —el 429 de Gemini son 900 caracteres de JSON— y eso no lo lee
   * nadie. `FallaCorrida` dice qué pasó en castellano, qué hacer, y deja el
   * detalle técnico a un clic.
   */
  const fallida = run.status === 'failed' || (run.status === 'blocked' && !run.humanRequest);

  return (
    <article className={cn('rounded-lg border p-2.5', necesitaCriterio ? 'border-primary/40 bg-primary/5' : 'border-border bg-card')}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 line-clamp-2 text-xs font-medium leading-snug" title={run.title}>
          <User className="mr-1 inline size-3 text-muted-foreground" aria-hidden />
          {run.title}
        </p>
        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', necesitaCriterio ? 'bg-primary/15 text-primary' : (RUN_STATUS_TONE[run.status] ?? 'bg-muted text-muted-foreground'))}>
          {etiquetaDeCorrida(run)}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{tiempoRelativo(run.completedAt ?? run.createdAt)}</p>

      {fallida ? (
        <FallaCorrida run={run} className="mt-1.5" onRetried={onCambio} />
      ) : (
        (run.summary || run.output) && (
          <div className="mt-1.5 rounded-md bg-muted/50 px-2 py-1.5">
            <p className="whitespace-pre-wrap text-[11px] leading-snug text-foreground/90">
              <Bot className="mr-1 inline size-3 text-primary" aria-hidden />
              {(run.output ?? run.summary ?? '').slice(0, 1200)}
            </p>
          </div>
        )
      )}

      {necesitaCriterio && (
        <div className="mt-2">
          <HumanDecisionCard run={run} onAnswered={onCambio} />
        </div>
      )}
    </article>
  );
}
