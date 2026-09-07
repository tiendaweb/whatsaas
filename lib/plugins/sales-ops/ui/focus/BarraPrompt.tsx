'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeDollarSign, Check, Inbox, Loader2, Play, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { mutate as mutateGlobal } from 'swr';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CobroPropuesto } from '../../server/focus';
import type { CrmFix } from '../../shared/crm-fix';
import { classifyRunError } from '../../shared/run-errors';
import { avisarEncolado } from '../components/eventos';
import { SALES_OPS_API } from '../components/format';
import { componerPedido } from './acciones';
import { useCapacidades } from './useCapacidades';
import { atajosDe, recordarAtajo, type Atajo } from './atajos';
import { ChipsAtajos } from './ChipsAtajos';
import { LS_PROMPT, tituloDePedido, type Etapa } from './tipos';
import { aplicarCrmPropuesto, dejarParaConector, ejecutarAhora, registrarCobroPropuesto } from './api';

type Props = {
  chatId: number;
  nombre: string;
  etapa: Etapa;
  /** Texto del programado que se está editando, para que la IA lo corrija en vez de escribir otro. */
  mensajeActual?: string | null;
  /** Acción recomendada por el análisis: es lo que se encola con el prompt vacío. */
  accionRecomendada?: string | null;
  /**
   * Llega el texto que redactó la IA: el Focus lo baja al editor de programados.
   * Con `cuando` (hora local `YYYY-MM-DDTHH:mm`) el editor queda con la fecha
   * puesta: guardar es un clic y no hizo falta ningún conector.
   */
  onTexto: (texto: string, cuando?: string | null) => void;
  /** Se encoló: el Focus pasa al siguiente cliente. */
  onEncolado: () => void;
  /** Una ejecución local válida cuenta para el progreso de la tanda. */
  onEjecutado?: () => void;
  /**
   * En el celular los botones van a lo ancho y más altos: se aprietan con el
   * pulgar, con el teléfono en una mano, y el margen de error es otro.
   */
  movil?: boolean;
};

/**
 * El importe con su moneda, como lo va a leer quien aprieta el botón. Va con
 * red: `Intl` tira `RangeError` con un código de moneda raro y eso tumbaría la
 * pantalla entera justo cuando hay que confirmar plata.
 */
function formatearImporte(importe: number, moneda: string): string {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(importe);
  } catch {
    return `${importe} ${moneda}`;
  }
}

/**
 * La barra de abajo: una línea para escribir qué hacer, y los dos botones que
 * terminan el cliente (doc 08 §5).
 *
 * **Ejecutar ahora** corre en el servidor con la IA del equipo y se queda en la
 * pantalla: lo que devuelve es un borrador que hay que leer, un programado con
 * la fecha puesta, una corrección de CRM o un cobro, y las dos últimas se
 * confirman con un botón que dice exactamente qué va a pasar. Nunca envía un
 * WhatsApp — el envío sigue pasando por aprobar y ejecutar.
 *
 * **Listo para conector** encola el pedido y avanza. Con el prompt vacío encola
 * la acción recomendada del análisis, así pasar de largo igual deja trabajo
 * hecho en vez de nada.
 */
export function BarraPrompt({ chatId, nombre, etapa, mensajeActual, accionRecomendada, onTexto, onEncolado, onEjecutado, movil = false }: Props) {
  const [texto, setTexto] = useState('');
  const [atajos, setAtajos] = useState<Atajo[]>([]);
  /**
   * Lo que el conector puede hacer en este equipo.
   *
   * Antes acá había un selector para que la persona eligiera UNA acción y la
   * plantilla la fijaba. Pero quien lee el chat es el conector, y lo que hace
   * falta casi nunca es una sola cosa: "contestale y armale la tarea" son dos.
   * Ahora el pedido lleva la lista de lo que se puede hacer, con sus tools, y él
   * elige una o una secuencia. Sólo se nombran las que el equipo tiene
   * habilitadas: ofrecer una app apagada es mandarlo a fallar.
   */
  const { permitidas } = useCapacidades();
  const [ejecutando, setEjecutando] = useState(false);
  const [encolando, setEncolando] = useState(false);
  /** Motivo por el que lo último pedido no se pudo hacer acá. Se limpia al escribir. */
  const [motivoConector, setMotivoConector] = useState<string | null>(null);
  /**
   * Corrección de CRM que propuso "Ejecutar ahora" y espera confirmación.
   * La IA propone; aplicar es de la persona, y pasa por el mismo aplicador que
   * el botón de la ficha.
   */
  const [crmPropuesto, setCrmPropuesto] = useState<{ fix: CrmFix; steps: string[]; skipped: string[]; reason: string | null } | null>(null);
  const [aplicandoCrm, setAplicandoCrm] = useState(false);
  /**
   * Cobro que propuso "Ejecutar ahora" y espera confirmación. Registrarlo crea
   * la venta, el asiento y el pago: es plata, así que lo aprieta una persona
   * después de leer el importe, no el modelo.
   */
  const [cobroPropuesto, setCobroPropuesto] = useState<{ cobro: CobroPropuesto; reason: string | null } | null>(null);
  const [registrandoCobro, setRegistrandoCobro] = useState(false);
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
    setCrmPropuesto(null);
    setCobroPropuesto(null);
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
        onTexto(res.text, null);
        toast.success(res.reason ? `Texto listo arriba. ${res.reason}` : 'Texto listo arriba. Revisalo y guardá el programado.');
      } else if (res.mode === 'programar') {
        onTexto(res.text, res.when);
        toast.success('Programado armado arriba, con la fecha puesta. Revisalo y guardá.');
      } else if (res.mode === 'crm') {
        setCrmPropuesto({ fix: res.fix, steps: res.steps, skipped: res.skipped, reason: res.reason });
      } else if (res.mode === 'cobro') {
        setCobroPropuesto({ cobro: res.cobro, reason: res.reason });
      } else {
        setMotivoConector(res.reason);
      }
      // El cobro no cuenta acá: cuenta cuando se registra (ver `registrar`).
      // Proponerlo y descartarlo no movió nada, y sumarlo dos veces inflaría el
      // progreso de la tanda con trabajo que no se hizo.
      if (res.mode !== 'conector' && res.mode !== 'cobro') onEjecutado?.();
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
      await dejarParaConector({ chatId, text: componerPedido(nombre, pedido, permitidas), title: tituloDePedido(nombre) });
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

  const aplicarCrm = async () => {
    if (!crmPropuesto) return;
    setAplicandoCrm(true);
    try {
      const r = await aplicarCrmPropuesto(chatId, crmPropuesto.fix);
      toast.success(`CRM corregido: ${r.applied.join(' · ')}`);
      if (r.skipped.length) toast.warning(r.skipped.join(' · '));
      setCrmPropuesto(null);
      escribir('');
      // La pestaña CRM del panel lee esta clave: se le avisa que cambió.
      void mutateGlobal(`${SALES_OPS_API}/contacts/${chatId}/crm`);
      void mutateGlobal(`${SALES_OPS_API}/contacts/${chatId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aplicar.');
    } finally {
      setAplicandoCrm(false);
    }
  };

  const registrar = async () => {
    if (!cobroPropuesto) return;
    setRegistrandoCobro(true);
    try {
      const r = await registrarCobroPropuesto(chatId, cobroPropuesto.cobro);
      toast.success(r.idempotent ? `Ya estaba registrado. ${r.summary}` : `Cobro registrado: ${r.summary}`);
      setCobroPropuesto(null);
      escribir('');
      // Un cobro toca la ficha entera: cliente nuevo, deuda al día y el chat en
      // G11. Las tres claves que mira el panel se refrescan juntas.
      void mutateGlobal(`${SALES_OPS_API}/contacts/${chatId}`);
      void mutateGlobal(`${SALES_OPS_API}/contacts/${chatId}/crm`);
      void mutateGlobal(`${SALES_OPS_API}/contacts/${chatId}/cobros`);
      onEjecutado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar el cobro.');
    } finally {
      setRegistrandoCobro(false);
    }
  };

  /** La corrección propuesta: qué va a cambiar, y los dos botones. */
  const tarjetaCrm = crmPropuesto && (
    <div className="mb-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5" data-crm-propuesto>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
        <Wrench className="size-3" aria-hidden />
        Corrección de CRM propuesta
      </p>
      {crmPropuesto.reason && <p className="mt-1 text-[11px] leading-snug text-foreground/90">{crmPropuesto.reason}</p>}
      <ul className="mt-1 space-y-0.5">
        {crmPropuesto.steps.map((paso) => (
          <li key={paso} className="flex items-start gap-1.5 text-[11px] text-foreground/90">
            <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
            {paso}
          </li>
        ))}
      </ul>
      {crmPropuesto.skipped.length > 0 && <p className="mt-1 text-[10px] text-muted-foreground">Se saltea: {crmPropuesto.skipped.join(' · ')}</p>}
      <div className="mt-2 flex gap-1.5">
        <Button type="button" size="sm" className="h-8 gap-1.5 text-[11px]" disabled={aplicandoCrm} onClick={() => void aplicarCrm()}>
          {aplicandoCrm ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
          Aplicar al CRM
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-[11px]" disabled={aplicandoCrm} onClick={() => setCrmPropuesto(null)}>
          Descartar
        </Button>
      </div>
    </div>
  );

  /**
   * El cobro propuesto. Misma estructura que la del CRM, con una diferencia que
   * no es de estilo: acá el importe se lee formateado ANTES de apretar, porque
   * lo que se confirma es plata y "Aplicar" a secas no dice cuánta.
   */
  const tarjetaCobro = cobroPropuesto && (
    <div className="mb-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5" data-cobro-propuesto>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
        <BadgeDollarSign className="size-3" aria-hidden />
        Cobro por registrar
      </p>
      <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
        {formatearImporte(cobroPropuesto.cobro.importe, cobroPropuesto.cobro.moneda)} · {cobroPropuesto.cobro.concepto}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {cobroPropuesto.cobro.medio ? `Por ${cobroPropuesto.cobro.medio}. ` : ''}
        Fecha de pago: {cobroPropuesto.cobro.fecha}.
      </p>
      {cobroPropuesto.reason && <p className="mt-1 text-[11px] leading-snug text-foreground/90">{cobroPropuesto.reason}</p>}
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
        Se registra la venta y el ingreso en Finanzas, {nombre} queda vinculado como cliente y el chat pasa a G11 · cliente.
      </p>
      <div className="mt-2 flex gap-1.5">
        <Button type="button" size="sm" className="h-8 gap-1.5 bg-emerald-600 text-[11px] text-white hover:bg-emerald-700" disabled={registrandoCobro} onClick={() => void registrar()}>
          {registrandoCobro ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
          Registrar cobro
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-[11px]" disabled={registrandoCobro} onClick={() => setCobroPropuesto(null)}>
          Descartar
        </Button>
      </div>
    </div>
  );

  // Los mismos atajos que "Mandar otro pedido" de la supervisión: una sola fila
  // de fichas para los dos Focus, así tocar un atajo se siente igual en ambos.
  const chips = <ChipsAtajos atajos={atajos} seleccionado={texto} onElegir={escribir} disabled={ocupado} movil={movil} />;

  if (movil) {
    return (
      <div className="shrink-0 border-t border-border bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {tarjetaCrm}
        {tarjetaCobro}
        {motivoConector && (
          <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
            {motivoConector}
          </p>
        )}

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
      {chips}
      {tarjetaCrm}
      {tarjetaCobro}
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
          <Button type="button" onClick={() => void ejecutar()} disabled={ocupado || !texto.trim()} className="h-9 w-full justify-start gap-1.5" title="La IA del equipo redacta, programa o propone la corrección de CRM acá mismo. No envía nada.">
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
