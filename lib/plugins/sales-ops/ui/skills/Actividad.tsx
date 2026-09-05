'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Inbox, Info, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ReintentarFallidas } from '../cola/ReintentarFallidas';
import { classifyRunError, type RunFailure } from '../../shared/run-errors';
import { fmtInt, tiempoRelativo } from '../components/format';
import { cancelRun, type SkillRun } from './api';
import { FallaCorrida } from './FallaCorrida';
import { MODE_LABELS, RUN_STATUS_LABELS, RUN_STATUS_TONE } from './skill-meta';

type Pestana = 'abiertas' | 'cuota' | 'fallidas' | 'hechas';

const LABELS: Record<Pestana, string> = {
  abiertas: 'En cola',
  cuota: 'Sin cuota',
  fallidas: 'Otros fallos',
  hechas: 'Hechas',
};

const ICONOS: Record<Pestana, typeof Inbox> = {
  abiertas: Inbox,
  cuota: Ban,
  fallidas: AlertTriangle,
  hechas: CheckCircle2,
};

type Props = {
  runs: SkillRun[];
  onOpen?: (chatId: number) => void;
  onChanged: () => void;
};

/**
 * Actividad del Prompt Studio, separada por lo que hay que hacer con cada cosa.
 *
 * Antes era una lista sola donde una corrida que se quedó sin cuota se veía
 * igual que una que salió bien, con el error crudo del SDK
 * (`{"code":429,"status":"RESOURCE_EXHAUSTED"}`) como si fuera un resumen. Dos
 * problemas: no se distinguía "falló porque no hay tokens" —que se arregla
 * mandándola a un conector— de "falló porque el prompt está mal", y el motivo
 * era ilegible.
 *
 * Ahora **Sin cuota** es su propia pestaña, con la explicación en castellano y
 * el botón que resuelve el caso: pasarla a la cola de conectores, que ejecutan
 * con su propia cuota y no gastan la del equipo.
 */
export function Actividad({ runs, onOpen, onChanged }: Props) {
  const [pestana, setPestana] = useState<Pestana>('abiertas');

  const grupos = useMemo(() => {
    const abiertas: SkillRun[] = [];
    const cuota: Array<SkillRun & { failure: RunFailure }> = [];
    const fallidas: Array<SkillRun & { failure: RunFailure }> = [];
    const hechas: SkillRun[] = [];

    for (const run of runs) {
      if (run.status === 'queued' || run.status === 'in_progress') {
        abiertas.push(run);
        continue;
      }
      if (run.status === 'failed' || run.status === 'blocked') {
        const failure = classifyRunError(run.summary) ?? {
          kind: 'other' as const,
          title: 'La corrida falló',
          detail: 'No quedó registrado el motivo.',
          hint: 'Probá lanzarla de nuevo.',
          canQueue: true,
          parts: [],
        };
        // Cuota y saturación van juntas: las dos se resuelven igual, dejándolas
        // en la cola en vez de reintentar contra la misma API agotada.
        if (failure.kind === 'quota' || failure.kind === 'overloaded') cuota.push({ ...run, failure });
        else fallidas.push({ ...run, failure });
        continue;
      }
      hechas.push(run);
    }
    return { abiertas, cuota, fallidas, hechas: hechas.slice(0, 20) };
  }, [runs]);

  const conteos: Record<Pestana, number> = {
    abiertas: grupos.abiertas.length,
    cuota: grupos.cuota.length,
    fallidas: grupos.fallidas.length,
    hechas: grupos.hechas.length,
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actividad</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(Object.keys(LABELS) as Pestana[]).map((key) => {
          const Icon = ICONOS[key];
          const activa = pestana === key;
          const esCuota = key === 'cuota' && conteos.cuota > 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPestana(key)}
              aria-pressed={activa}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors',
                activa
                  ? 'border-transparent bg-foreground font-medium text-background'
                  : esCuota
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {LABELS[key]}
              {conteos[key] > 0 && <span className="tabular-nums opacity-70">{fmtInt(conteos[key])}</span>}
            </button>
          );
        })}
      </div>

      {pestana === 'abiertas' && (
        <Lista
          vacio="Nada esperando. Lo que lances acá o desde la ficha de un chat aparece en esta lista."
          runs={grupos.abiertas}
          onOpen={onOpen}
          onChanged={onChanged}
          cancelable
        />
      )}

      {pestana === 'cuota' && (
        <>
          {grupos.cuota.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                <Info className="size-3.5" aria-hidden />
                Estas corridas no fallaron por el prompt
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                La IA del equipo se quedó sin cuota o el modelo estaba saturado. El mismo texto funciona tal cual: pasalo a la cola y lo ejecuta un conector
                (Claude, ChatGPT o Grok) con su propia cuota.
              </p>
              {/* Son todas la misma falla: arreglarlas de a una es apretar el
                  mismo botón veinte veces. */}
              <div className="mt-2">
                <ReintentarFallidas runs={grupos.cuota} onListo={onChanged} />
              </div>
            </div>
          )}
          <Lista vacio="Ninguna corrida se quedó sin cuota. 👌" runs={grupos.cuota} onOpen={onOpen} onChanged={onChanged} />
        </>
      )}

      {pestana === 'fallidas' && (
        <>
          {grupos.fallidas.length > 1 && (
            <div className="flex justify-end">
              <ReintentarFallidas runs={grupos.fallidas} onListo={onChanged} />
            </div>
          )}
          <Lista vacio="Sin fallos que revisar." runs={grupos.fallidas} onOpen={onOpen} onChanged={onChanged} />
        </>
      )}

      {pestana === 'hechas' && <Lista vacio="Todavía no se completó ninguna corrida." runs={grupos.hechas} onOpen={onOpen} onChanged={onChanged} />}
    </section>
  );
}

function Lista({
  runs,
  vacio,
  onOpen,
  onChanged,
  cancelable,
}: {
  runs: Array<SkillRun & { failure?: RunFailure }>;
  vacio: string;
  onOpen?: (chatId: number) => void;
  onChanged: () => void;
  cancelable?: boolean;
}) {
  if (runs.length === 0) {
    return <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{vacio}</div>;
  }
  return (
    <ul className="space-y-1.5">
      {runs.map((run) => (
        <RunRow key={run.id} run={run} failure={run.failure} onOpen={onOpen} onChanged={onChanged} cancelable={cancelable} />
      ))}
    </ul>
  );
}

function RunRow({
  run,
  failure,
  onOpen,
  onChanged,
  cancelable,
}: {
  run: SkillRun;
  failure?: RunFailure;
  onOpen?: (chatId: number) => void;
  onChanged: () => void;
  cancelable?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const chatId = run.targetKind === 'chat' ? Number(run.targetId) : null;
  const cuerpo = run.output ?? (failure ? null : run.summary);

  const cancelar = async () => {
    try {
      await cancelRun(run.id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cancelar.');
    }
  };

  return (
    <li className={cn('rounded-lg border px-3 py-2 text-xs', failure?.kind === 'quota' || failure?.kind === 'overloaded' ? 'border-amber-500/30' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{run.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
            {chatId ? (
              <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpen?.(chatId)}>
                {run.targetName ?? `chat ${chatId}`}
              </button>
            ) : (
              <span>equipo</span>
            )}
            <span>· {tiempoRelativo(run.createdAt)}</span>
            <span>· {MODE_LABELS[run.mode]}</span>
            {run.connector && !['pending', 'server'].includes(run.connector) && <span>· {run.connector}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', RUN_STATUS_TONE[run.status] ?? 'bg-muted text-muted-foreground')}>
            {RUN_STATUS_LABELS[run.status] ?? run.status}
          </span>
          {cancelable && run.status === 'queued' && (
            <button type="button" className="text-muted-foreground hover:text-destructive" aria-label="Cancelar corrida" onClick={() => void cancelar()}>
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* El motivo, explicado, con "Reintentar ahora" y "Dejar en la cola". */}
      {failure && <FallaCorrida run={run} onRetried={onChanged} className="mt-2" />}

      {cuerpo && (
        <div className="mt-1.5">
          <p className={cn('whitespace-pre-wrap text-muted-foreground', !abierto && 'line-clamp-3')}>{cuerpo}</p>
          {cuerpo.length > 220 && (
            <button type="button" className="mt-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAbierto((v) => !v)}>
              {abierto ? 'Ver menos' : 'Ver todo'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
