'use client';

import { useEffect, useRef, useState } from 'react';
import { Inbox, Loader2, Play, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { classifyRunError } from '../../shared/run-errors';
import { avisarEncolado } from '../components/eventos';
import { ACCIONES, tituloDeAccion, type AccionFocus } from './acciones';
import { SelectorAccion } from './SelectorAccion';
import { atajosDe, recordarAtajo, type Atajo } from './atajos';
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
  /**
   * En el celular los botones van a lo ancho y más altos: se aprietan con el
   * pulgar, con el teléfono en una mano, y el margen de error es otro.
   */
  movil?: boolean;
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
export function BarraPrompt({ chatId, nombre, etapa, mensajeActual, accionRecomendada, onTexto, onEncolado, movil = false }: Props) {
  const [texto, setTexto] = useState('');
  const [atajos, setAtajos] = useState<Atajo[]>([]);
  /**
   * Qué tiene que producir el pedido.
   *
   * Sólo pesa en el camino del conector: "Ejecutar ahora" corre en el servidor,
   * que no tiene herramientas, así que le va el pedido tal cual se escribió. Al
   * conector, en cambio, se le manda la plantilla de la acción con su cadena de
   * tools, y la corrida queda titulada "Programar · Juan" en vez de "Focus · Juan".
   */
  const [accion, setAccion] = useState<AccionFocus>('mensaje');
  const [ejecutando, setEjecutando] = useState(false);
  const [encolando, setEncolando] = useState(false);
  /** Motivo por el que lo último pedido no se pudo hacer acá. Se limpia al escribir. */
  const [motivoConector, setMotivoConector] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Al cambiar de etapa se recupera lo último que quedó escrito sin encolar: un
  // borrador a medias no se pierde por cambiar de lista. Lo que SÍ se limpia es
  // el pedido ya encolado, apenas se manda (ver `encolar`).
  useEffect(() => {
    try {
      setTexto(window.localStorage.getItem(`${LS_PROMPT}:${etapa}`) ?? '');
    } catch {
      setTexto('');
    }
    setMotivoConector(null);
  }, [etapa]);

  // Los atajos se recalculan por cliente: el primero es su acción recomendada,
  // que es el único que mira a ESTE y no a la tanda.
  useEffect(() => {
    setAtajos(atajosDe(etapa, accionRecomendada));
  }, [etapa, accionRecomendada, chatId]);

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
      const pedido = texto.trim();
      const res = await ejecutarAhora({ chatId, prompt: pedido, message: mensajeActual ?? null, name: nombre });
      recordarAtajo(etapa, pedido);
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
      const conPlantilla = ACCIONES[accion].plantilla(nombre, pedido).trim() || pedido;
      await dejarParaConector({ chatId, text: conPlantilla, title: tituloDeAccion(accion, nombre) });
      recordarAtajo(etapa, pedido);
      avisarEncolado(chatId);
      // Se limpia al encolar: la pantalla pasa al siguiente cliente y un pedido
      // heredado que quedó ahí se manda sin querer al que viene. Repetirlo no
      // cuesta escribirlo de nuevo — `recordarAtajo` lo dejó primero en las
      // fichas de arriba, a un toque.
      escribir('');
      toast.success('En la cola. Lo toma el próximo conector.');
      onEncolado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setEncolando(false);
    }
  };

  const selector = <SelectorAccion valor={accion} onCambio={setAccion} compacto={movil} className="pb-1.5" />;

  const chips = atajos.length > 0 && (
    <div className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]{display:none}">
      {atajos.map((atajo) => (
        <button
          key={atajo.texto}
          type="button"
          disabled={ocupado}
          onClick={() => escribir(atajo.texto)}
          title={atajo.texto}
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-1 text-left text-[11px] leading-tight transition-colors disabled:opacity-50',
            atajo.texto === texto
              ? 'border-primary bg-primary/10 text-foreground'
              : atajo.origen === 'analisis'
                ? 'border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          {atajo.origen === 'analisis' && <Sparkles className="mr-1 inline size-2.5 text-primary" aria-hidden />}
          <span className={cn('inline-block truncate align-middle', movil ? 'max-w-[62vw]' : 'max-w-[240px]')}>{atajo.texto}</span>
        </button>
      ))}
    </div>
  );

  if (movil) {
    return (
      <div className="shrink-0 border-t border-border bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {motivoConector && (
          <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
            {motivoConector}
          </p>
        )}

        {selector}
        {chips}

        <div className="relative">
          <Textarea
            ref={ref}
            rows={2}
            value={texto}
            onChange={(e) => escribir(e.target.value)}
            placeholder="Tocá un atajo o escribí qué hacer…"
            className="min-h-[3.5rem] resize-none py-2 pr-9 text-sm"
            disabled={ocupado}
          />
          {texto && !ocupado && (
            <button
              type="button"
              onClick={() => escribir('')}
              className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-muted-foreground active:bg-muted"
              aria-label="Borrar el pedido"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        {/* A lo ancho y altos: se aprietan con el pulgar. El de arriba se queda
            en este cliente; el de abajo pasa al siguiente. */}
        <div className="mt-2 grid gap-2">
          <Button type="button" onClick={() => void ejecutar()} disabled={ocupado || !texto.trim()} className="h-11 w-full gap-2 text-sm">
            {ejecutando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
            Ejecutar ahora
          </Button>
          <Button
            type="button"
            variant={motivoConector ? 'default' : 'outline'}
            onClick={() => void encolar()}
            disabled={ocupado}
            className={cn('h-11 w-full gap-2 text-sm', motivoConector && 'ring-2 ring-primary/40')}
          >
            {encolando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Inbox className="size-4" aria-hidden />}
            Listo para conector
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 shrink-0 border-t border-border bg-background pt-2">
      {selector}
      {chips}
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
