'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, RotateCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { RUN_FAILURE_LABELS, classifyRunError, type RunFailureKind } from '../../shared/run-errors';
import { retryRun, type SkillRun } from '../skills/api';

/**
 * Reintentar de una vez todas las corridas que fallaron.
 *
 * Una tanda de clasificación que se quedó sin cuota deja veinte corridas
 * fallidas iguales, y arreglarlas era abrir veinte tarjetas y apretar veinte
 * botones idénticos. Acá se hace de una, y el diálogo dice antes por qué
 * fallaron —agrupadas por tipo— porque la salida correcta depende de eso: una
 * falla de cuota no se arregla reintentando con la misma cuota.
 *
 * Van **de a una y en orden**, no en paralelo: veinte llamadas simultáneas
 * contra un proveedor que ya venía rechazando es la forma más rápida de que
 * fallen las veinte otra vez. El contador muestra por dónde va.
 */
/**
 * Cuántas se reintentan por clic.
 *
 * Con 570 clasificaciones caídas por cuota, el grupo que llega acá puede ser de
 * cien. Cien pedidos seguidos de un solo clic tardan minutos y no hay forma de
 * frenarlos a mitad: se hacen de a tandas, y el diálogo dice cuántas quedan.
 */
const POR_TANDA = 50;

export function ReintentarFallidas({ runs, onListo }: { runs: SkillRun[]; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<'api' | 'queue' | null>(null);
  const [hechas, setHechas] = useState(0);

  if (runs.length === 0) return null;

  const tanda = runs.slice(0, POR_TANDA);
  const restantes = runs.length - tanda.length;

  const porTipo = runs.reduce<Record<string, number>>((acc, run) => {
    const kind: RunFailureKind = classifyRunError(run.summary)?.kind ?? 'other';
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {});
  const soloCuota = (porTipo.quota ?? 0) + (porTipo.overloaded ?? 0) === runs.length;

  const correr = async (mode: 'api' | 'queue') => {
    setModo(mode);
    setHechas(0);
    let ok = 0;
    const errores: string[] = [];
    for (const run of tanda) {
      try {
        const { run: nueva } = await retryRun(run.id, mode);
        if (mode === 'queue' || nueva.status !== 'failed') ok += 1;
        else errores.push(classifyRunError(nueva.summary)?.title ?? 'volvió a fallar');
      } catch (e) {
        errores.push(e instanceof Error ? e.message : 'error');
      }
      setHechas((n) => n + 1);
    }
    setModo(null);
    setAbierto(false);
    onListo();
    if (ok === tanda.length) {
      toast.success(
        `${mode === 'queue' ? `${ok} en la cola de conectores` : `${ok} reintentadas y resueltas`}${restantes > 0 ? `. Quedan ${restantes}.` : '.'}`,
      );
    } else if (ok > 0) {
      toast.warning(`${ok} de ${tanda.length} salieron bien. El resto falló: ${errores[0] ?? ''}`);
    } else {
      toast.error(`Ninguna salió. ${errores[0] ?? ''}`);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setAbierto(true)}
        title={`${runs.length} corridas fallaron`}
        className="h-8 shrink-0 gap-1.5 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
      >
        <AlertTriangle className="size-4" aria-hidden />
        <span className="hidden sm:inline">Reintentar</span>
        <span className="rounded-full bg-amber-500/20 px-1.5 font-mono text-[10px] tabular-nums">{runs.length}</span>
      </Button>

      <Dialog open={abierto} onOpenChange={(o) => !modo && setAbierto(o)}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-base">Reintentar {tanda.length} corridas</DialogTitle>
          <DialogDescription className="text-xs">
            {restantes > 0 ? `De ${runs.length} en total; el resto queda para la próxima tanda. Por qué fallaron:` : 'Por qué fallaron:'}
          </DialogDescription>

          <ul className="space-y-1">
            {Object.entries(porTipo).map(([kind, n]) => (
              <li key={kind} className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                <span>{RUN_FAILURE_LABELS[kind as RunFailureKind]}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>

          {soloCuota && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
              Todas fallaron por cuota o saturación. Reintentarlas con la IA del equipo va a volver a fallar: la salida es la cola de conectores, que ejecutan con su propia cuota.
            </p>
          )}

          {modo && (
            <p className="text-center font-mono text-xs tabular-nums text-muted-foreground">
              {hechas} de {tanda.length}…
            </p>
          )}

          <div className="mt-1 space-y-2">
            <Button
              className="w-full gap-2"
              variant={soloCuota ? 'default' : 'outline'}
              disabled={modo !== null}
              onClick={() => void correr('queue')}
            >
              {modo === 'queue' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              Dejar las {tanda.length} en la cola de conectores
            </Button>
            <Button
              className="w-full gap-2"
              variant={soloCuota ? 'outline' : 'default'}
              disabled={modo !== null}
              onClick={() => void correr('api')}
            >
              {modo === 'api' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
              Reintentar con la IA del equipo
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" disabled={modo !== null} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
