'use client';

import { useEffect, useState } from 'react';
import { Inbox, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { avisarEncolado } from '../components/eventos';
import { dejarParaConector } from './api';
import { componerPedido } from './acciones';
import { atajosDe, recordarAtajo, type Atajo } from './atajos';
import { ChipsAtajos } from './ChipsAtajos';
import { tituloDePedido, type Etapa } from './tipos';
import { useCapacidades } from './useCapacidades';

/**
 * Mandar otro pedido sobre este contacto, sin salir de donde uno está.
 *
 * Supervisando aparece seguido: el prompt que se está mirando está bien, pero
 * además hace falta otra cosa —ya que estamos, armale la tarea—. Antes eso era
 * salir, buscar el contacto, abrir la ficha y lanzar desde ahí; para cuando
 * volvías habías perdido el lugar en la cola.
 *
 * Arranca cerrado: es una acción de más, no la principal de la pantalla.
 *
 * Las reglas son las de la barra del Focus de trabajo, no otras: mismos
 * atajos de un toque, mismo título en la Cola, y con el texto vacío se encola
 * la acción recomendada del análisis. Tenían tres diferencias chicas y cada una
 * era una sorpresa al pasar de una pantalla a la otra.
 */
export function NuevoPedido({
  chatId,
  nombre,
  etapa = 'oportunidades',
  accionRecomendada = null,
  onEnviado,
  className,
}: {
  chatId: number;
  nombre: string;
  /** Etapa del contacto (por su gate): decide qué atajos se ofrecen. */
  etapa?: Etapa;
  /** Acción recomendada por el análisis: es lo que se encola con el texto vacío. */
  accionRecomendada?: string | null;
  onEnviado?: () => void;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [atajos, setAtajos] = useState<Atajo[]>([]);

  const { permitidas } = useCapacidades();

  // Los recientes salen de localStorage: se leen al montar, no al renderizar.
  useEffect(() => {
    setAtajos(atajosDe(etapa, accionRecomendada));
  }, [etapa, accionRecomendada, chatId]);

  const enviar = async () => {
    const pedido = detalle.trim() || (accionRecomendada ?? '').trim();
    if (!pedido) {
      toast.error('Escribí qué querés que haga: este cliente no tiene acción recomendada.');
      return;
    }
    setEnviando(true);
    try {
      await dejarParaConector({ chatId, text: componerPedido(nombre, pedido, permitidas), title: tituloDePedido(nombre) });
      recordarAtajo(etapa, pedido);
      avisarEncolado(chatId);
      toast.success('En la cola. Lo toma el próximo conector.');
      setDetalle('');
      setAbierto(false);
      onEnviado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setEnviando(false);
    }
  };

  if (!abierto) {
    return (
      <Button variant="outline" size="sm" className={cn('h-8 gap-1.5 text-[11px]', className)} onClick={() => setAbierto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Mandar otro pedido
      </Button>
    );
  }

  return (
    <div className={cn('rounded-xl border border-violet-500/30 bg-violet-500/5 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Otro pedido para {nombre}</p>
        <Button variant="ghost" size="icon" className="size-6" onClick={() => setAbierto(false)} aria-label="Cerrar">
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        El conector elige qué hacer —mensaje, programado, tarea, documento, calendario o CRM— y en qué orden. Vos decís qué hace falta.
      </p>

      <div className="mt-2">
        <ChipsAtajos atajos={atajos} seleccionado={detalle} onElegir={setDetalle} disabled={enviando} />
      </div>

      <Textarea
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        rows={3}
        placeholder={accionRecomendada ? `${accionRecomendada.slice(0, 90)}…` : 'Qué hace falta con este cliente…'}
        className="resize-y text-sm"
        disabled={enviando}
      />

      <Button size="sm" className="mt-2 h-9 w-full gap-1.5 bg-violet-600 text-white hover:bg-violet-700" onClick={() => void enviar()} disabled={enviando}>
        {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Inbox className="size-4" aria-hidden />}
        Dejar en la cola
      </Button>
    </div>
  );
}
