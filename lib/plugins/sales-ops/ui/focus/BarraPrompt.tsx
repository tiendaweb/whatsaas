'use client';

import { useEffect, useRef, useState } from 'react';
import { Inbox, Loader2, Play } from 'lucide-react';
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
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          rows={1}
          value={texto}
          onChange={(e) => escribir(e.target.value)}
          placeholder={accionRecomendada ? `${accionRecomendada.slice(0, 90)}…` : 'Qué querés que haga con este cliente…'}
          className="max-h-24 min-h-9 flex-1 resize-none py-2 text-sm"
          disabled={ocupado}
        />
        <Button type="button" onClick={() => void ejecutar()} disabled={ocupado || !texto.trim()} className="h-9 shrink-0 gap-1.5" title="La IA del equipo redacta acá mismo (E). No envía nada.">
          {ejecutando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
          <span className="hidden sm:inline">Ejecutar ahora</span>
        </Button>
        <Button
          type="button"
          variant={motivoConector ? 'default' : 'outline'}
          onClick={() => void encolar()}
          disabled={ocupado}
          className={cn('h-9 shrink-0 gap-1.5', motivoConector && 'ring-2 ring-primary/40')}
          title="Deja el pedido en la cola y pasa al siguiente (C)"
        >
          {encolando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Inbox className="size-4" aria-hidden />}
          <span className="hidden sm:inline">Listo para conector</span>
        </Button>
      </div>
    </div>
  );
}
