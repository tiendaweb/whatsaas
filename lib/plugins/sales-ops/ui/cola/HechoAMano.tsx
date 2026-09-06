'use client';

import { useState } from 'react';
import { Check, HandMetal, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { completeRunManual, type SkillRun } from '../skills/api';

/**
 * Cerrar una corrida "a mano": alguien —una persona, o una IA que maneja el
 * navegador— hizo lo que pedía sin pasar por el conector.
 *
 * Antes lo que esperaba conector sólo se resolvía cuando un conector lo
 * tomaba. Pero al lado de la corrida están el chat (con caja para contestar) y
 * el editor de programados: quien está mirando puede contestar o programar ahí
 * mismo, y lo único que le faltaba era poder decir "ya está". Cierra la corrida
 * como `completed` con `connector: 'manual'`, así sale de la cola de conectores
 * y queda en Hechos con lo que se hizo escrito.
 *
 * Pide un resumen porque es lo que después leen el Muro, la ficha y el
 * clasificador: "hecho" a secas no le sirve a nadie.
 */
export function HechoAMano({
  run,
  onHecho,
  className,
  variante = 'fila',
}: {
  run: SkillRun;
  /** La corrida quedó cerrada: quien la lista la saca o avanza. */
  onHecho: () => void;
  className?: string;
  variante?: 'fila' | 'focus';
}) {
  const [abierto, setAbierto] = useState(false);
  const [resumen, setResumen] = useState('');
  const [guardando, setGuardando] = useState(false);
  const focus = variante === 'focus';

  const cerrar = async () => {
    const texto = resumen.trim();
    if (texto.length < 5) {
      toast.error('Contá en una línea qué hiciste (mínimo 5 caracteres).');
      return;
    }
    setGuardando(true);
    try {
      await completeRunManual(run.id, { summary: texto });
      toast.success('Cerrada como hecha a mano. Ya no la toma ningún conector.');
      setAbierto(false);
      setResumen('');
      onHecho();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar.');
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn('gap-1.5', focus ? 'h-9' : 'h-7 px-2 text-[11px]', className)}
        title="Lo hiciste vos (o una IA desde el navegador) sin conector: contestaste, programaste o cargaste lo que pedía. Se cierra y sale de la cola."
        aria-label={`Marcar como hecha a mano: ${run.title}`}
        data-hecho-a-mano-run={run.id}
        onClick={() => setAbierto(true)}
      >
        <HandMetal className={focus ? 'size-4' : 'size-3'} aria-hidden />
        Lo hice a mano
      </Button>
    );
  }

  return (
    <div className={cn('rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2.5', className)} data-hecho-a-mano-run={run.id}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Qué hiciste</p>
      <Textarea
        id={`hecho-a-mano-${run.id}`}
        aria-label={`Qué se hizo a mano para ${run.title}`}
        value={resumen}
        onChange={(e) => setResumen(e.target.value)}
        rows={focus ? 3 : 2}
        className="mt-1 resize-y text-xs"
        placeholder="Ej.: le contesté por el chat confirmando el precio y le programé el recordatorio para mañana a las 10."
        autoFocus
        disabled={guardando}
      />
      <div className="mt-2 flex items-center gap-1.5">
        <Button type="button" size="sm" className={cn('gap-1.5', focus ? 'h-9' : 'h-7 px-2 text-[11px]')} disabled={guardando || resumen.trim().length < 5} onClick={() => void cerrar()}>
          {guardando ? <Loader2 className={focus ? 'size-4 animate-spin' : 'size-3 animate-spin'} aria-hidden /> : <Check className={focus ? 'size-4' : 'size-3'} aria-hidden />}
          Marcar como hecha
        </Button>
        <Button type="button" size="sm" variant="ghost" className={cn('gap-1', focus ? 'h-9' : 'h-7 px-2 text-[11px]')} disabled={guardando} onClick={() => setAbierto(false)}>
          <X className={focus ? 'size-4' : 'size-3'} aria-hidden />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
