'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Ban, Bot, Check, Clock3, Loader2, Pencil, Send, Sparkles, SkipForward, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ActionKind } from '../../shared/taxonomy';
import type { ActionRow, DetailPayload } from '../../shared/api-types';
import type { EstadoCaso } from './tipos';
import { aplicarVariables, detectarVariables, fechaLegible, horaLegible, nombreParaSaludo } from '../../shared/variables';
import { VariablesRapidas } from './VariablesRapidas';

export type AccionesTarjetaHandle = {
  enviar: () => void;
  editar: () => void;
  ia: () => void;
  programar: () => void;
  cola: () => void;
  posponer: () => void;
  prompt: () => void;
  excluir: () => void;
};

type Detalle = DetailPayload & { header: { name: string } };

type Props = {
  chatId: number;
  detalle: Detalle;
  contextoAbierto: boolean;
  onContexto: () => void;
  onEstado: (estado: EstadoCaso | null) => void;
  onResuelto: (tipo: 'enviado' | 'encolado' | 'programado' | 'pospuesto') => void;
  onSaltar: () => void;
  onDetalleCambio: () => void;
};

type AprobarRespuesta = {
  batchId: string;
  approvedIds: number[];
  execution: { executed: number; skipped: number; failed: number; results: Array<{ status: 'executed' | 'skipped' | 'failed'; reason?: string }> } | null;
};

type Modo = 'ver' | 'editar' | 'ia' | 'programar' | 'cola' | 'prompt' | 'excluir';

const VIVAS = ['proposed', 'pending_approval', 'approved'] as const;
const CHIPS = ['Más corto', 'Más cálido', 'Quiero cerrar', 'No menciones el precio', 'Recordale lo que pidió', 'Que parezca más humano'];
/**
 * Los tres motivos con los que se saca a alguien del circuito. Son los mismos
 * de las Listas (`EXCLUSION_KINDS` del servidor): un cuarto motivo inventado acá
 * no lo entendería el panel de Ignorados.
 */
const MOTIVOS: Array<{ kind: 'personal' | 'equipo' | 'otros'; label: string; ayuda: string }> = [
  { kind: 'personal', label: 'PERSONAL', ayuda: 'Familia, amigos, cosas mías.' },
  { kind: 'equipo', label: 'EQUIPO', ayuda: 'Alguien que trabaja acá.' },
  { kind: 'otros', label: 'OTROS', ayuda: 'Proveedor, spam, no es una venta.' },
];

/** Encabezados de prompt: lo más pedido, para dejarlo sin escribir nada. */
const PROMPTS_RAPIDOS = [
  'Averiguá en qué quedó y dejame el resumen.',
  'Escribile vos con lo que veas en el chat.',
  'Revisá si ya pagó y avisame.',
  'Buscá el mejor momento para insistir y dejalo programado.',
];

const INDICACIONES = [
  'Mejorá el texto con lo que veas en el chat y mandalo.',
  'Confirmá el precio en el chat antes de mandar.',
  'Si ya respondió, contestá lo que preguntó en vez de esto.',
  'Adaptá el tono a cómo viene hablando el cliente.',
];

/** Botones de la cabina: 44px de alto, radio 12, peso 900. */
const BTN = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-black outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)] disabled:cursor-not-allowed disabled:opacity-40';
const BTN_PRIMARIO = `${BTN} border-0 bg-[var(--mn-accent)] text-[#150a26] hover:brightness-110`;
const BTN_GHOST = `${BTN} border border-[var(--mn-line)] bg-transparent text-[var(--mn-text)] hover:border-[var(--mn-accent)]`;
/** Fila secundaria: más chica, para que las cinco entren sin empujar la pantalla. */
const BTN_MINI = 'inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--mn-line)] px-2 text-[11px] font-black text-[var(--mn-muted)] outline-none transition-colors hover:border-[var(--mn-accent)] hover:text-[var(--mn-text)] focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)] disabled:opacity-40';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
  return body;
}

function textoDe(action: ActionRow | null): string {
  return typeof action?.payload?.text === 'string' ? action.payload.text : '';
}

/** Valor para un `<input type="datetime-local">` desde un Date, en hora del navegador. */
function paraInput(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function enHoras(horas: number): Date {
  return new Date(Date.now() + horas * 3600_000);
}

function mananaALas(hora: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hora, 0, 0, 0);
  return d;
}

export const AccionesTarjeta = forwardRef<AccionesTarjetaHandle, Props>(function AccionesTarjeta(
  { chatId, detalle, contextoAbierto, onContexto, onEstado, onResuelto, onSaltar, onDetalleCambio },
  ref,
) {
  const action = useMemo(() => detalle.actions.find((a) => VIVAS.includes(a.status as (typeof VIVAS)[number]) && a.kind === 'send_message') ?? null, [detalle.actions]);
  const original = textoDe(action);
  const [mensaje, setMensaje] = useState(original);
  const [modo, setModo] = useState<Modo>('ver');
  const [instruccion, setInstruccion] = useState('');
  const [paraConector, setParaConector] = useState('');
  const [promptTexto, setPromptTexto] = useState('');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [cuando, setCuando] = useState(() => paraInput(mananaALas(9)));
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resuelto, setResuelto] = useState<'enviado' | 'encolado' | 'programado' | null>(null);
  const intentoAutomatico = useRef<number | null>(null);

  useEffect(() => {
    setMensaje(original);
    setModo('ver');
    setInstruccion('');
    setParaConector('');
    setCuando(paraInput(mananaALas(9)));
    setResuelto(null);
    intentoAutomatico.current = null;
  }, [chatId, original]);

  const generar = useCallback(async (pedido?: string, volverAVer = false) => {
    if (generando) return;
    setGenerando(true);
    const a = detalle.analysis;
    const direccion = pedido?.trim() || 'Redactá una primera versión breve, cálida y concreta.';
    try {
      const body = await json<{ content: string }>('/api/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftType: 'static',
          mode: 'improve',
          baseContent: mensaje || a?.recommendedAction || '',
          prompt: `Escribí únicamente un mensaje de WhatsApp final y listo para enviar a ${detalle.header.name}. No uses variables, placeholders ni textos entre llaves o corchetes. No inventes precios, fechas, horarios ni promesas. Si falta un dato, formulá una pregunta natural para que el cliente lo indique. Objetivo confirmado: ${a?.recommendedAction || 'retomar la conversación'}. Necesidad: ${a?.needDetail || a?.need || 'sin confirmar'}. Estado: ${a?.statusReason || a?.status || 'sin confirmar'}. Instrucción: ${direccion}`,
        }),
      });
      const next = body.content?.trim();
      if (!next) throw new Error('La IA no devolvió un mensaje.');
      setMensaje(next);
      onEstado({ texto: 'VERSIÓN IA · REQUIERE TU APROBACIÓN', tono: 'neutro' });
      if (volverAVer) setModo('ver');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo preparar el mensaje.');
    } finally {
      setGenerando(false);
    }
  }, [detalle, generando, mensaje, onEstado]);

  // Sólo prepara la tarjeta actual y una vez. No crea lote ni aprueba nada.
  useEffect(() => {
    if (mensaje || intentoAutomatico.current === chatId) return;
    intentoAutomatico.current = chatId;
    void generar();
  }, [chatId, generar, mensaje]);

  /**
   * Los huecos del mensaje y su resolución.
   *
   * `mensaje` guarda el texto CON las llaves —es lo que se edita y lo que se
   * vuelve a leer si cambia una variable— y todo lo que sale para afuera usa
   * `mensajeFinal`. Guardar el texto ya resuelto haría imposible corregir una
   * fecha sin reescribir la frase entera.
   */
  const variables = useMemo(() => detectarVariables(mensaje), [mensaje]);
  const nombreSugerido = useMemo(() => nombreParaSaludo(detalle.header.name), [detalle.header.name]);

  const valoresLegibles = useMemo(() => {
    const salida: Record<string, string> = {};
    for (const v of variables) {
      const crudo = (valores[v.name] ?? '').trim();
      if (!crudo) continue;
      // La fecha y la hora se guardan como las devuelve el picker y se
      // escriben como las diría una persona.
      salida[v.name] = v.tipo === 'fecha' ? fechaLegible(crudo) : v.tipo === 'hora' ? horaLegible(crudo) : crudo;
    }
    return salida;
  }, [variables, valores]);

  const mensajeFinal = useMemo(() => aplicarVariables(mensaje, valoresLegibles), [mensaje, valoresLegibles]);
  const faltan = variables.filter((v) => !(valores[v.name] ?? '').trim()).length;

  /**
   * El nombre del contacto se completa solo, pero únicamente si sirve para
   * saludar: con «5491160001672» o «vidrieria urgencia 24» el campo queda
   * vacío en vez de mandar "Hola 5491160001672".
   */
  useEffect(() => {
    if (!nombreSugerido) return;
    const deNombre = variables.filter((v) => v.tipo === 'nombre');
    if (!deNombre.length) return;
    setValores((actual) => {
      let cambio = false;
      const siguiente = { ...actual };
      for (const v of deNombre) {
        if (!(siguiente[v.name] ?? '').trim()) {
          siguiente[v.name] = nombreSugerido;
          cambio = true;
        }
      }
      return cambio ? siguiente : actual;
    });
  }, [variables, nombreSugerido]);

  const editarAction = useCallback(async (actionId: number, text: string) => {
    await json(`/api/plugins/sales-ops/queue/actions/${actionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }, []);

  /**
   * Devuelve una fila aprobable del tipo pedido. Reutiliza la que ya exista
   * (actualizando el texto si cambió) y si no crea el lote de una sola fila.
   */
  const asegurarAction = useCallback(async (kind: ActionKind, extra: Record<string, unknown> = {}, sendAt?: string): Promise<ActionRow> => {
    // Sale el texto con las variables resueltas, nunca el de las llaves.
    const texto = mensajeFinal.trim();
    if (!texto) throw new Error('Todavía no hay un mensaje.');
    if (faltan > 0) throw new Error('Completá o quitá las variables antes de continuar.');
    if (kind === 'send_message' && action && !Object.keys(extra).length) {
      if (action.status === 'proposed' || action.status === 'pending_approval') {
        if (textoDe(action) !== texto) await editarAction(action.id, texto);
        return { ...action, payload: { ...action.payload, text: texto } };
      }
      if (action.status === 'approved') return action;
    }
    const proposed = await json<{ batchId: string | null; excluded: Array<{ reason: string }> }>('/api/plugins/sales-ops/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: `Modo Noelia · ${detalle.header.name}`,
        kind,
        requiresRole: 'any',
        chatIds: [chatId],
        payloadTemplate: {
          text: texto,
          ...(sendAt ? { sendAt } : {}),
          extra: { modoNoelia: true, focusRecommendation: detalle.analysis?.recommendedAction ?? null, originalText: original || null, aiInstruction: instruccion || null, ...extra },
        },
      }),
    });
    if (!proposed.batchId) throw new Error(proposed.excluded[0]?.reason || 'No se pudo crear la propuesta.');
    const batch = await json<{ actions: ActionRow[] }>(`/api/plugins/sales-ops/queue/${proposed.batchId}`);
    const created = batch.actions.find((row) => row.chatId === chatId);
    if (!created) throw new Error('La propuesta se creó sin una fila aprobable.');
    return created;
  }, [action, chatId, detalle, editarAction, faltan, instruccion, mensajeFinal, original]);

  const aprobar = useCallback(async (actionId: number, execute: boolean) => {
    return json<AprobarRespuesta>(`/api/plugins/sales-ops/queue/actions/${actionId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendation: detalle.analysis?.recommendedAction, originalText: original || mensajeFinal, aiInstruction: instruccion || undefined, execute }),
    });
  }, [detalle.analysis?.recommendedAction, instruccion, mensajeFinal, original]);

  /** Envía ahora: aprueba y ejecuta en el mismo request. */
  const enviarAhora = useCallback(async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      const fila = await asegurarAction('send_message');
      const res = await aprobar(fila.id, true);
      const salida = res.execution?.results?.[0] ?? null;
      if (salida?.status === 'failed') {
        onEstado({ texto: '⚠ NO SE PUDO ENVIAR', tono: 'ambar' });
        toast.error(salida.reason || 'Quedó aprobado pero el envío falló. Reintentá desde la Cola.');
        onDetalleCambio();
        return;
      }
      if (res.execution && res.execution.executed > 0) {
        setResuelto('enviado');
        onEstado({ texto: '✓ ENVIADO RECIÉN', tono: 'verde' });
        toast.success(`Enviado a ${detalle.header.name}.`);
      } else {
        setResuelto('encolado');
        onEstado({ texto: '✓ APROBADO · SALE POR LA COLA', tono: 'verde' });
        toast.success('Aprobado. Queda en la cola para salir.');
      }
      onDetalleCambio();
      onResuelto('enviado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar. Reintentá.');
    } finally {
      setGuardando(false);
    }
  }, [aprobar, asegurarAction, detalle.header.name, guardando, onDetalleCambio, onEstado, onResuelto]);

  /** Deja la fila aprobada SIN ejecutar, con la indicación que lee el conector. */
  const dejarEnCola = useCallback(async () => {
    if (guardando) return;
    const indicacion = paraConector.trim();
    if (!indicacion) {
      toast.error('Escribile al conector qué tiene que hacer.');
      return;
    }
    setGuardando(true);
    try {
      const fila = await asegurarAction('send_message', { instruccionConector: indicacion });
      await aprobar(fila.id, false);
      setResuelto('encolado');
      setModo('ver');
      onEstado({ texto: '🤖 EN LA COLA DEL CONECTOR', tono: 'neutro' });
      toast.success('Queda en la cola: el conector lo mejora y lo manda.');
      onDetalleCambio();
      onResuelto('encolado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo dejar en la cola.');
    } finally {
      setGuardando(false);
    }
  }, [aprobar, asegurarAction, guardando, onDetalleCambio, onEstado, onResuelto, paraConector]);

  /** Programa el mensaje para una fecha y hora. */
  const programar = useCallback(async () => {
    if (guardando) return;
    const fecha = new Date(cuando);
    if (Number.isNaN(fecha.getTime())) {
      toast.error('Elegí una fecha y hora válidas.');
      return;
    }
    if (fecha.getTime() <= Date.now()) {
      toast.error('Esa hora ya pasó. Elegí una futura.');
      return;
    }
    setGuardando(true);
    try {
      // El instante se calcula en el navegador y viaja en ISO con zona: el
      // servidor corre en UTC y una hora "suelta" se le iría de lugar.
      const fila = await asegurarAction('schedule_message', {}, fecha.toISOString());
      const res = await aprobar(fila.id, true);
      const salida = res.execution?.results?.[0] ?? null;
      if (salida?.status === 'failed') {
        onEstado({ texto: '⚠ NO SE PUDO PROGRAMAR', tono: 'ambar' });
        toast.error(salida.reason || 'No se pudo dejar programado.');
        onDetalleCambio();
        return;
      }
      setResuelto('programado');
      setModo('ver');
      onEstado({ texto: `⏱ PROGRAMADO ${fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, tono: 'verde' });
      toast.success('Programado.');
      onDetalleCambio();
      onResuelto('programado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo programar.');
    } finally {
      setGuardando(false);
    }
  }, [aprobar, asegurarAction, cuando, guardando, onDetalleCambio, onEstado, onResuelto]);

  const posponer = useCallback(async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      await json(`/api/plugins/sales-ops/contacts/${chatId}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'snooze', days: 1, note: 'Pospuesto 24 h desde Modo Noelia' }),
      });
      onEstado({ texto: '⏱ POSPUESTO 24 HORAS', tono: 'ambar' });
      toast.success('Pospuesto por 24 horas.');
      onResuelto('pospuesto');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo posponer.');
    } finally {
      setGuardando(false);
    }
  }, [chatId, guardando, onEstado, onResuelto]);

  /**
   * Deja un prompt para el conector sobre ESTE contacto, sin mensaje de por
   * medio.
   *
   * "A la cola" exige un mensaje redactado —es una fila aprobable con texto—, y
   * eso dejaba afuera el caso más común de la cabina: no querés mandar nada
   * todavía, querés que el conector averigüe algo o escriba él. Esto crea una
   * corrida del Prompt Studio (`team_prompt_runs`) en modo `queue`: contesta al
   * instante y el conector la levanta con su turno.
   */
  const dejarPrompt = useCallback(async () => {
    if (guardando) return;
    const texto = promptTexto.trim();
    if (!texto) {
      toast.error('Escribí qué querés que haga.');
      return;
    }
    setGuardando(true);
    try {
      await json('/api/plugins/sales-ops/prompts/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: texto,
          title: `Modo Noelia · ${detalle.header.name}`,
          targetKind: 'chat',
          targetId: chatId,
          mode: 'queue',
        }),
      });
      setPromptTexto('');
      setModo('ver');
      onEstado({ texto: '🤖 PROMPT DEJADO', tono: 'neutro' });
      toast.success('Listo: el conector lo toma en su próxima pasada.');
      onResuelto('encolado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo dejar el prompt.');
    } finally {
      setGuardando(false);
    }
  }, [chatId, detalle.header.name, guardando, onEstado, onResuelto, promptTexto]);

  /**
   * Saca al contacto del circuito comercial.
   *
   * No borra nada: lo marca como no comercial y lo limpia de listas, radar,
   * clasificador y cola de audios, igual que el botón de las Listas. Conserva el
   * análisis para que devolverlo sea un clic desde Ignorados.
   */
  const excluir = useCallback(async (kind: 'personal' | 'equipo' | 'otros') => {
    if (guardando) return;
    setGuardando(true);
    try {
      const res = await json<{ excluded: number; audiosRemoved?: number; signalsRemoved?: number }>(
        '/api/plugins/sales-ops/exclusions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatIds: [chatId], kind, reason: 'Excluido desde Modo Noelia' }),
        },
      );
      const extra = [
        res.audiosRemoved ? `${res.audiosRemoved} audios fuera de la cola` : null,
        res.signalsRemoved ? `${res.signalsRemoved} señales descartadas` : null,
      ].filter(Boolean);
      setModo('ver');
      onEstado({ texto: '🚫 FUERA DEL CIRCUITO', tono: 'ambar' });
      toast.success(`${detalle.header.name} queda fuera${extra.length ? ` · ${extra.join(' · ')}` : ''}.`);
      // Se va de la cola como un salteado: ya no hay nada que decidir acá.
      onSaltar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo excluir.');
    } finally {
      setGuardando(false);
    }
  }, [chatId, detalle.header.name, guardando, onEstado, onSaltar]);

  const abrirEdicion = useCallback(() => {
    setModo('editar');
    onEstado({ texto: 'EDITANDO · TODAVÍA NO SALIÓ', tono: 'neutro' });
  }, [onEstado]);

  useImperativeHandle(ref, () => ({
    enviar: () => void enviarAhora(),
    editar: abrirEdicion,
    ia: () => setModo((m) => (m === 'ia' ? 'ver' : 'ia')),
    programar: () => setModo((m) => (m === 'programar' ? 'ver' : 'programar')),
    cola: () => setModo((m) => (m === 'cola' ? 'ver' : 'cola')),
    posponer: () => void posponer(),
    prompt: () => setModo((m) => (m === 'prompt' ? 'ver' : 'prompt')),
    excluir: () => setModo((m) => (m === 'excluir' ? 'ver' : 'excluir')),
  }), [abrirEdicion, enviarAhora, posponer]);

  const hayMensaje = Boolean(mensaje.trim());
  const bloqueado = guardando || generando || !hayMensaje || faltan > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Mensaje listo. Es lo único que puede crecer: scrollea adentro para que
          la pantalla no se estire y los botones queden siempre a la vista. */}
      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--mn-msg-line)] bg-[var(--mn-msg-bg)] p-2.5" aria-label="Mensaje listo">
        <div className="flex items-center justify-between gap-2">
          <small className="text-[11px] font-black tracking-[0.06em] text-[var(--mn-green-soft)]">
            {modo === 'editar' ? 'EDITANDO EL MENSAJE'
              : modo === 'programar' ? 'CUÁNDO SALE'
                : modo === 'cola' ? 'QUÉ HACE EL CONECTOR'
                  : modo === 'ia' ? 'QUÉ CAMBIAMOS'
                    : modo === 'prompt' ? 'QUÉ QUERÉS QUE HAGA'
                      : modo === 'excluir' ? 'POR QUÉ LO SACÁS'
                        : faltan > 0 ? `MENSAJE CON ${faltan} HUECO${faltan === 1 ? '' : 'S'}` : 'MENSAJE LISTO'}
          </small>
          {modo !== 'ver' && (
            <button type="button" onClick={() => { setModo('ver'); onEstado(null); }} className="text-[var(--mn-muted)] hover:text-[var(--mn-text)]" aria-label="Volver">
              <X className="size-4" />
            </button>
          )}
        </div>

        {modo === 'editar' ? (
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            autoFocus
            aria-label="Editar mensaje"
            className="mt-1.5 min-h-0 w-full flex-1 resize-none rounded-lg border border-[var(--mn-line)] bg-[var(--mn-context)] p-2 text-[14px] leading-relaxed text-[var(--mn-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--mn-green)]"
          />
        ) : modo === 'programar' ? (
          <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              {[{ l: 'En 1 h', d: enHoras(1) }, { l: 'En 3 h', d: enHoras(3) }, { l: 'Mañana 9:00', d: mananaALas(9) }, { l: 'Mañana 15:00', d: mananaALas(15) }].map(({ l, d }) => (
                <button key={l} type="button" onClick={() => setCuando(paraInput(d))} className="rounded-full border border-[var(--mn-line)] px-2.5 py-1 text-[11px] font-black text-[var(--mn-muted)] hover:border-[var(--mn-accent)] hover:text-[var(--mn-text)]">{l}</button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={cuando}
              onChange={(e) => setCuando(e.target.value)}
              aria-label="Fecha y hora de salida"
              className="mt-2 h-10 w-full rounded-lg border border-[var(--mn-line)] bg-[var(--mn-context)] px-2 text-sm text-[var(--mn-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]"
            />
            <button type="button" className={cn(BTN_PRIMARIO, 'mt-2 w-full')} disabled={guardando} onClick={() => void programar()}>
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Clock3 className="size-4" aria-hidden />} DEJAR PROGRAMADO
            </button>
          </div>
        ) : modo === 'cola' ? (
          <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto">
            <p className="text-[12px] leading-snug text-[var(--mn-muted)]">
              El conector lee esta indicación junto con el chat, mejora el texto y lo manda. Queda con clave de idempotencia y auditoría.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {INDICACIONES.map((i) => (
                <button key={i} type="button" onClick={() => setParaConector(i)} className={cn('rounded-full border px-2.5 py-1 text-[11px] font-black', paraConector === i ? 'border-[var(--mn-accent)] text-[var(--mn-accent)]' : 'border-[var(--mn-line)] text-[var(--mn-muted)] hover:border-[var(--mn-accent)]')}>{i}</button>
              ))}
            </div>
            <textarea
              value={paraConector}
              onChange={(e) => setParaConector(e.target.value)}
              rows={2}
              placeholder="Qué tiene que hacer el conector antes de mandar"
              aria-label="Indicación para el conector"
              className="mt-2 w-full resize-none rounded-lg border border-[var(--mn-line)] bg-[var(--mn-context)] p-2 text-sm text-[var(--mn-text)] outline-none placeholder:text-[var(--mn-dim)] focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]"
            />
            <button type="button" className={cn(BTN_PRIMARIO, 'mt-2 w-full')} disabled={guardando || !paraConector.trim()} onClick={() => void dejarEnCola()}>
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Bot className="size-4" aria-hidden />} DEJAR EN LA COLA
            </button>
          </div>
        ) : modo === 'prompt' ? (
          <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {PROMPTS_RAPIDOS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setPromptTexto(chip)}
                  className={cn('rounded-full border px-2.5 py-1 text-[11px] font-black', promptTexto === chip ? 'border-[var(--mn-accent)] text-[var(--mn-accent)]' : 'border-[var(--mn-line)] text-[var(--mn-muted)] hover:border-[var(--mn-accent)]')}
                >
                  {chip}
                </button>
              ))}
            </div>
            <textarea
              value={promptTexto}
              onChange={(e) => setPromptTexto(e.target.value)}
              placeholder="Escribile al conector qué tiene que hacer con este contacto…"
              className="min-h-0 flex-1 resize-none rounded-lg border border-[var(--mn-line)] bg-transparent p-2 text-[14px] font-[650] leading-relaxed text-[var(--mn-text)] outline-none focus-visible:border-[var(--mn-accent)]"
              aria-label="Prompt para el conector"
            />
            <p className="text-[11px] font-bold text-[var(--mn-dim)]">
              No manda nada: queda como corrida en el Prompt Studio y el conector la toma en su próxima pasada.
            </p>
            <button type="button" className={cn(BTN_PRIMARIO, 'w-full')} disabled={guardando || !promptTexto.trim()} onClick={() => void dejarPrompt()}>
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />} DEJAR PROMPT
            </button>
          </div>
        ) : modo === 'excluir' ? (
          <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2">
            <p className="text-[12px] font-bold leading-snug text-[var(--mn-muted)]">
              Sale de las listas, del radar, del clasificador y de la cola de audios. No se borra: vuelve de un clic desde Ignorados.
            </p>
            <div className="flex flex-col gap-1.5">
              {MOTIVOS.map((m) => (
                <button
                  key={m.kind}
                  type="button"
                  disabled={guardando}
                  onClick={() => void excluir(m.kind)}
                  className={cn(BTN_GHOST, 'w-full justify-between px-3 text-left')}
                >
                  <span>{m.label}</span>
                  <span className="text-[11px] font-bold text-[var(--mn-dim)]">{m.ayuda}</span>
                </button>
              ))}
            </div>
          </div>
        ) : modo === 'ia' ? (
          <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              {CHIPS.map((chip) => (
                <button key={chip} type="button" onClick={() => setInstruccion(chip)} className={cn('rounded-full border px-2.5 py-1 text-[11px] font-black', instruccion === chip ? 'border-[var(--mn-accent)] text-[var(--mn-accent)]' : 'border-[var(--mn-line)] text-[var(--mn-muted)] hover:border-[var(--mn-accent)]')}>{chip}</button>
              ))}
            </div>
            <input
              value={instruccion}
              onChange={(e) => setInstruccion(e.target.value)}
              placeholder="Otra indicación para la IA"
              aria-label="Indicación para la IA"
              className="mt-2 h-10 w-full rounded-lg border border-[var(--mn-line)] bg-[var(--mn-context)] px-2 text-sm text-[var(--mn-text)] outline-none placeholder:text-[var(--mn-dim)] focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" className={BTN_PRIMARIO} disabled={generando || !instruccion.trim()} onClick={() => void generar(instruccion, true)}>
                {generando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} USAR ESTA
              </button>
              <button type="button" className={BTN_GHOST} disabled={generando} onClick={() => void generar(instruccion)}>OTRA VEZ</button>
              <button type="button" className={BTN_GHOST} onClick={() => { setMensaje(original); setModo('ver'); onEstado(null); }}>ORIGINAL</button>
            </div>
          </div>
        ) : (
          <p className="mt-1 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-[14px] font-[650] leading-relaxed text-[var(--mn-text)]" aria-live="polite">
            {generando
              ? <span className="flex items-center gap-2 text-[var(--mn-dim)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Preparando el mensaje…</span>
              : mensajeFinal || <span className="text-[var(--mn-dim)]">No hay mensaje. Usá «IA» para prepararlo o escribilo con «Editar».</span>}
          </p>
        )}
      </section>

      {/* Los huecos del mensaje. Sólo aparece si hay alguno: una tarjeta sin
          variables no tiene por qué perder alto en un recuadro vacío. */}
      {modo === 'ver' && variables.length > 0 && (
        <VariablesRapidas
          variables={variables}
          valores={valores}
          onCambio={(name, valor) => setValores((actual) => ({ ...actual, [name]: valor }))}
          nombreSugerido={nombreSugerido}
        />
      )}

      {/* Las tres salidas del caso. Enviar ahora es la primaria. */}
      <div className="grid shrink-0 grid-cols-3 gap-1.5">
        <button type="button" className={BTN_PRIMARIO} title="Atajo: A" onClick={() => void enviarAhora()} disabled={bloqueado || modo === 'editar'}>
          {guardando && modo === 'ver' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          {resuelto === 'enviado' ? 'ENVIADO' : 'ENVIAR AHORA'}
        </button>
        <button type="button" className={cn(BTN_GHOST, modo === 'programar' && 'border-[var(--mn-accent)] text-[var(--mn-accent)]')} title="Atajo: G" onClick={() => setModo((m) => (m === 'programar' ? 'ver' : 'programar'))} disabled={!hayMensaje}>
          <Clock3 className="size-4" aria-hidden /> PROGRAMAR
        </button>
        <button type="button" className={cn(BTN_GHOST, modo === 'cola' && 'border-[var(--mn-accent)] text-[var(--mn-accent)]')} title="Atajo: C" onClick={() => setModo((m) => (m === 'cola' ? 'ver' : 'cola'))} disabled={!hayMensaje}>
          <Bot className="size-4" aria-hidden /> A LA COLA
        </button>
      </div>

      {/* Fila secundaria: corregir, dejar prompt, posponer, saltar, sacar del
          circuito y contexto. Envuelve: son siete y en el celular no entran en
          una línea sin volverse ilegibles. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button type="button" className={cn(BTN_MINI, modo === 'editar' && 'border-[var(--mn-accent)] text-[var(--mn-accent)]')} title="Atajo: E" onClick={() => (modo === 'editar' ? (setModo('ver'), onEstado(null)) : abrirEdicion())}>
          <Pencil className="size-3.5" aria-hidden /> {modo === 'editar' ? 'Listo' : 'Editar'}
        </button>
        <button type="button" className={cn(BTN_MINI, modo === 'ia' && 'border-[var(--mn-accent)] text-[var(--mn-accent)]')} title="Atajo: I" onClick={() => setModo((m) => (m === 'ia' ? 'ver' : 'ia'))}>
          <Sparkles className="size-3.5" aria-hidden /> IA
        </button>
        <button type="button" className={cn(BTN_MINI, modo === 'prompt' && 'border-[var(--mn-accent)] text-[var(--mn-accent)]')} title="Atajo: D · dejar un prompt sin mandar nada" onClick={() => setModo((m) => (m === 'prompt' ? 'ver' : 'prompt'))}>
          <Wand2 className="size-3.5" aria-hidden /> Prompt
        </button>
        <button type="button" className={BTN_MINI} title="Atajo: P" onClick={() => void posponer()} disabled={guardando}>
          <Clock3 className="size-3.5" aria-hidden /> Posponer
        </button>
        <button type="button" className={BTN_MINI} title="Atajo: S" onClick={onSaltar}>
          <SkipForward className="size-3.5" aria-hidden /> Saltar
        </button>
        <button type="button" className={cn(BTN_MINI, modo === 'excluir' && 'border-[var(--mn-accent)] text-[var(--mn-accent)]')} title="Atajo: X · sacarlo del circuito" onClick={() => setModo((m) => (m === 'excluir' ? 'ver' : 'excluir'))} disabled={guardando}>
          <Ban className="size-3.5" aria-hidden /> Excluir
        </button>
        <button type="button" className={cn(BTN_MINI, contextoAbierto && 'border-[var(--mn-accent)] text-[var(--mn-accent)]')} aria-expanded={contextoAbierto} onClick={onContexto}>
          <Check className="size-3.5" aria-hidden /> Por qué
        </button>
      </div>
    </div>
  );
});
