'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, RotateCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RUN_FAILURE_LABELS, classifyRunError } from '../../shared/run-errors';
import { retryRun, type SkillRun } from './api';

type Props = {
  run: Pick<SkillRun, 'id' | 'summary'>;
  /** Se llama con la corrida nueva, salga bien o mal, para refrescar la lista. */
  onRetried?: (run: SkillRun, mode: 'api' | 'queue') => void;
  className?: string;
};

/**
 * Una corrida que falló, explicada, con las dos salidas posibles.
 *
 * Es el mismo bloque en la Actividad del Studio, en la Cola, en la ficha del
 * chat y en el lanzador: el motivo en castellano (nunca el JSON del SDK), qué
 * hacer, y dos botones. **Reintentar ahora** vuelve a correrla con la IA del
 * equipo en el momento —sirve cuando el fallo fue transitorio (modelo
 * saturado, cuota que ya se renovó)—; **Dejar en la cola** se la pasa a un
 * conector, que ejecuta con su propia cuota. El error crudo queda a un clic.
 */
export function FallaCorrida({ run, onRetried, className }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<'api' | 'queue' | null>(null);
  const failure = classifyRunError(run.summary) ?? {
    kind: 'other' as const,
    title: 'La corrida falló',
    detail: 'No quedó registrado el motivo.',
    hint: 'Probá reintentarla ahora.',
    canQueue: true,
    parts: [],
  };

  const relanzar = async (mode: 'api' | 'queue') => {
    setOcupado(mode);
    try {
      const { run: nueva } = await retryRun(run.id, mode);
      if (mode === 'queue') {
        toast.success('En la cola. La toma el próximo conector que pida trabajo.');
      } else if (nueva.status === 'failed') {
        toast.error(classifyRunError(nueva.summary)?.title ?? 'Volvió a fallar.');
      } else {
        toast.success('Listo. La respuesta quedó en la actividad del Studio.');
      }
      onRetried?.(nueva, mode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo relanzar.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className={cn('rounded-lg border border-border/70 bg-muted/40 p-2.5', className)}>
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-foreground">
        <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        {failure.title}
        <span className="rounded bg-background px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">{RUN_FAILURE_LABELS[failure.kind]}</span>
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{failure.detail}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-foreground/80">
        <span className="font-medium">Qué hacer:</span> {failure.hint}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" disabled={ocupado !== null} onClick={() => void relanzar('api')}>
          {ocupado === 'api' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <RotateCw className="size-3" aria-hidden />}
          Reintentar ahora
        </Button>
        {failure.canQueue && (
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-[11px]" disabled={ocupado !== null} onClick={() => void relanzar('queue')}>
            {ocupado === 'queue' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Send className="size-3" aria-hidden />}
            Dejar en la cola de conectores
          </Button>
        )}
        {failure.parts.length > 0 && (
          <button type="button" className="text-[10px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAbierto((v) => !v)}>
            {abierto ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}
          </button>
        )}
      </div>

      {abierto && (
        <dl className="mt-2 space-y-1 border-t border-border/60 pt-2">
          {failure.parts.map((part, i) => (
            <div key={i} className="min-w-0">
              {part.source && <dt className="text-[10px] font-medium uppercase text-muted-foreground">{part.source}</dt>}
              <dd className="break-words font-mono text-[10px] leading-relaxed text-muted-foreground">{part.message}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
