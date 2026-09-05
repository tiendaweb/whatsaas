'use client';

import { useEffect, useRef, useState } from 'react';
import { Inbox, Loader2, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { classifyRunError } from '../../shared/run-errors';
import { avisarEncolado } from '../components/eventos';
import { LS_PROMPT, type Etapa } from './tipos';
import { dejarParaConector, ejecutarAhora } from './api';

type Props = {
  chatId: number;
  nombre: string;
  etapa: Etapa;
  /** Texto del programado que se está editando, para que la IA lo corrija en vez de escribir otro. */
  mensajeActual?: string | null;
  /** Acción recomendada por el análisis: es lo que se encola con el prompt vacío. */
  accionRecomendada?: string | null;
  /** Llega el texto que redactó la IA: el Focus lo baja al editor de programados. */
  onTexto: (texto: string) => void;
  /** Se encoló: el Focus pasa al siguiente cliente. */
  onEncolado: () => void;
};

/**
 * La barra de abajo: una línea para escribir qué hacer, y los dos botones que
 * terminan el cliente (doc 08 §5).
 *
 * **Ejecutar ahora** corre en el servidor con la IA del equipo y se queda en la
 * pantalla: lo que devuelve es un borrador que hay que leer. Nunca envía un
 * WhatsApp — redacta y programa, y el envío sigue pasando por aprobar y
 * ejecutar.
 *
 * **Listo para conector** encola el pedido y avanza. Con el prompt vacío encola
 * la acción recomendada del análisis, así pasar de largo igual deja trabajo
 * hecho en vez de nada.
 */
export function BarraPrompt({ chatId, nombre, etapa, mensajeActual, accionRecomendada, onTexto, onEncolado }: Props) {
  const [texto, setTexto] = useState('');
  const [ejecutando, setEjecutando] = useState(false);
  const [encolando, setEncolando] = useState(false);
  /** Motivo por el que lo último pedido no se pudo hacer acá. Se limpia al escribir. */
  const [motivoConector, setMotivoConector] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // El pedido se recuerda por etapa y no por cliente: en una tanda de Dinero el
  // 80 % de las veces se pide lo mismo, y volver a tipearlo es el trabajo que
  // esta pantalla vino a sacar.
  useEffect(() => {
    try {
      setTexto(window.localStorage.getItem(`${LS_PROMPT}:${etapa}`) ?? '');
    } catch {
      setTexto('');
    }
    setMotivoConector(null);
  }, [etapa]);

  const escribir = (v: string) => {
    setTexto(v);
    setMotivoConector(null);
    try {
      window.localStorage.setItem(`${LS_PROMPT}:${etapa}`, v);
    } catch {
      /* sin storage */
    }
  };

  const ocupado = ejecutando || encolando;

  const ejecutar = async () => {
    if (!texto.trim() || ocupado) return;
    setEjecutando(true);
    setMotivoConector(null);
    try {
      const res = await ejecutarAhora({ chatId, prompt: texto.trim(), message: mensajeActual ?? null, name: nombre });
      if (res.mode === 'texto') {
        onTexto(res.text);
        toast.success('Texto listo arriba. Revisalo y guardá el programado.');
      } else {
        setMotivoConector(res.reason);
      }
    } catch (e) {
      // Sin cuota de IA del equipo la salida es el conector, no reintentar. El
      // 429 de Gemini son 900 caracteres de JSON: se traduce antes de mostrarlo.
      const falla = classifyRunError(e instanceof Error ? e.message : String(e));
      setMotivoConector(falla ? `${falla.title} ${falla.hint}` : 'La IA del equipo no está disponible ahora. Dejalo para el conector.');
    } finally {
      setEjecutando(false);
    }
  };

  const encolar = async () => {
    if (ocupado) return;
    const pedido = texto.trim() || (accionRecomendada ?? '').trim();
    if (!pedido) {
      toast.error('Escribí qué querés que haga: este cliente no tiene acción recomendada.');
      ref.current?.focus();
      return;
    }
    setEncolando(true);
    try {
      await dejarParaConector({ chatId, text: pedido, title: `Focus · ${nombre}` });
      avisarEncolado(chatId);
      toast.success('En la cola. Lo toma el próximo conector.');
      onEncolado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setEncolando(false);
    }
  };

  return (
    <div className="sticky bottom-0 shrink-0 border-t border-border bg-background pt-2">
      {motivoConector && (
        <p className="mb-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
          {motivoConector}
        </p>
      )}
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Textarea
            ref={ref}
            rows={2}
            value={texto}
            onChange={(e) => escribir(e.target.value)}
            placeholder={accionRecomendada ? `${accionRecomendada.slice(0, 90)}…` : 'Qué querés que haga con este cliente…'}
            className="h-full min-h-[4.75rem] resize-none py-2 pr-8 text-sm"
            disabled={ocupado}
          />
          {/* El pedido se arrastra de un cliente al siguiente a propósito, pero
              tiene que poder cortarse sin borrar a mano. */}
          {texto && !ocupado && (
            <button
              type="button"
              onClick={() => escribir('')}
              className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Borrar el pedido"
              aria-label="Borrar el pedido"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        {/* Uno abajo del otro: al lado, con el mismo tamaño y el mismo peso, se
            apretaba el equivocado. Ahora la primera fila es la que se queda en
            la pantalla y la segunda la que pasa al siguiente. */}
        <div className="flex w-[168px] shrink-0 flex-col gap-1.5 sm:w-[184px]">
          <Button type="button" onClick={() => void ejecutar()} disabled={ocupado || !texto.trim()} className="h-9 w-full justify-start gap-1.5" title="La IA del equipo redacta acá mismo. No envía nada.">
            {ejecutando ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : <Play className="size-4 shrink-0" aria-hidden />}
            <span className="truncate">Ejecutar ahora</span>
          </Button>
          <Button
            type="button"
            variant={motivoConector ? 'default' : 'outline'}
            onClick={() => void encolar()}
            disabled={ocupado}
            className={cn('h-9 w-full justify-start gap-1.5', motivoConector && 'ring-2 ring-primary/40')}
            title="Deja el pedido en la cola y pasa al siguiente"
          >
            {encolando ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : <Inbox className="size-4 shrink-0" aria-hidden />}
            <span className="truncate">Listo para conector</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
