'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ActionRow, DetailPayload } from '../../shared/api-types';
import type { EstadoCaso } from './tipos';

export type AccionesTarjetaHandle = {
  aprobar: () => void;
  editar: () => void;
  ia: () => void;
  posponer: () => void;
};

type Detalle = DetailPayload & { header: { name: string } };

type Props = {
  chatId: number;
  detalle: Detalle;
  contextoAbierto: boolean;
  onContexto: () => void;
  onEstado: (estado: EstadoCaso | null) => void;
  onResuelto: (tipo: 'aprobado' | 'pospuesto') => void;
  onSaltar: () => void;
  onDetalleCambio: () => void;
};

const VIVAS = ['proposed', 'pending_approval', 'approved'] as const;
const CHIPS = ['Más corto', 'Más cálido', 'Quiero cerrar', 'No menciones el precio', 'Recordale lo que pidió', 'Que parezca más humano'];

/** `.btn` de la maqueta: 46px de alto, radio 12, peso 900. */
const BTN = 'inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-4 py-[11px] text-sm font-black outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)] disabled:cursor-not-allowed disabled:opacity-40';
const BTN_PRIMARIO = `${BTN} border-0 bg-[var(--mn-accent)] text-[#0d0718] hover:brightness-110`;
const BTN_GHOST = `${BTN} border border-[var(--mn-line)] bg-transparent text-white hover:border-[var(--mn-accent)]`;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
  return body;
}

function textoDe(action: ActionRow | null): string {
  return typeof action?.payload?.text === 'string' ? action.payload.text : '';
}

export const AccionesTarjeta = forwardRef<AccionesTarjetaHandle, Props>(function AccionesTarjeta(
  { chatId, detalle, contextoAbierto, onContexto, onEstado, onResuelto, onSaltar, onDetalleCambio },
  ref,
) {
  const action = useMemo(() => detalle.actions.find((a) => VIVAS.includes(a.status as (typeof VIVAS)[number]) && a.kind === 'send_message') ?? null, [detalle.actions]);
  const original = textoDe(action);
  const [mensaje, setMensaje] = useState(original);
  const [modo, setModo] = useState<'ver' | 'editar' | 'ia'>('ver');
  const [instruccion, setInstruccion] = useState('');
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aprobado, setAprobado] = useState(false);
  const intentoAutomatico = useRef<number | null>(null);

  useEffect(() => {
    setMensaje(original);
    setModo('ver');
    setInstruccion('');
    setAprobado(false);
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
          draftType: 'dynamic',
          mode: 'improve',
          baseContent: mensaje || a?.recommendedAction || '',
          prompt: `Escribí únicamente un mensaje de WhatsApp listo para enviar a ${detalle.header.name}. No inventes precios, fechas ni promesas. Objetivo confirmado: ${a?.recommendedAction || 'retomar la conversación'}. Necesidad: ${a?.needDetail || a?.need || 'sin confirmar'}. Estado: ${a?.statusReason || a?.status || 'sin confirmar'}. Instrucción: ${direccion}`,
        }),
      });
      const next = body.content?.trim();
      if (!next) throw new Error('La IA no devolvió un mensaje.');
      setMensaje(next);
      onEstado({ texto: 'VERSIÓN IA GENERADA · REQUIERE APROBACIÓN', tono: 'neutro' });
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

  const editarAction = useCallback(async (actionId: number, text: string) => {
    await json(`/api/plugins/sales-ops/queue/actions/${actionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }, []);

  const asegurarAction = useCallback(async (): Promise<ActionRow> => {
    if (!mensaje.trim()) throw new Error('Todavía no hay un mensaje para aprobar.');
    if (action && (action.status === 'proposed' || action.status === 'pending_approval')) {
      if (textoDe(action) !== mensaje.trim()) await editarAction(action.id, mensaje.trim());
      return { ...action, payload: { ...action.payload, text: mensaje.trim() } };
    }
    if (action?.status === 'approved') return action;
    const proposed = await json<{ batchId: string | null; excluded: Array<{ reason: string }> }>('/api/plugins/sales-ops/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: `Modo Noelia · ${detalle.header.name}`,
        kind: 'send_message',
        requiresRole: 'any',
        chatIds: [chatId],
        payloadTemplate: {
          text: mensaje.trim(),
          extra: { modoNoelia: true, focusRecommendation: detalle.analysis?.recommendedAction ?? null, originalText: original || null, aiInstruction: instruccion || null },
        },
      }),
    });
    if (!proposed.batchId) throw new Error(proposed.excluded[0]?.reason || 'No se pudo crear la propuesta.');
    const batch = await json<{ actions: ActionRow[] }>(`/api/plugins/sales-ops/queue/${proposed.batchId}`);
    const created = batch.actions.find((row) => row.chatId === chatId);
    if (!created) throw new Error('La propuesta se creó sin una fila aprobable.');
    return created;
  }, [action, chatId, detalle, editarAction, instruccion, mensaje, original]);

  const aprobar = useCallback(async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      const current = await asegurarAction();
      if (current.status !== 'approved') {
        await json(`/api/plugins/sales-ops/queue/actions/${current.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recommendation: detalle.analysis?.recommendedAction, originalText: original || mensaje, aiInstruction: instruccion || undefined }),
        });
      }
      setAprobado(true);
      onEstado({ texto: '✓ APROBADO · LISTO PARA EJECUTAR', tono: 'verde' });
      toast.success('Listo. Quedó aprobado, todavía no se envió.');
      onDetalleCambio();
      onResuelto('aprobado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar. Reintentá.');
    } finally {
      setGuardando(false);
    }
  }, [asegurarAction, detalle.analysis?.recommendedAction, guardando, instruccion, mensaje, onDetalleCambio, onEstado, onResuelto, original]);

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

  const abrirEdicion = useCallback(() => {
    setModo('editar');
    onEstado({ texto: 'EDITANDO MENSAJE · NO ENVIADO', tono: 'neutro' });
  }, [onEstado]);

  useImperativeHandle(ref, () => ({
    aprobar: () => void aprobar(),
    editar: abrirEdicion,
    ia: () => setModo('ia'),
    posponer: () => void posponer(),
  }), [abrirEdicion, aprobar, posponer]);

  const puedeAprobar = !guardando && !generando && Boolean(mensaje.trim());

  return (
    <>
      {/* MENSAJE LISTO — caja verde de la maqueta. */}
      <section className="mt-2.5 rounded-[13px] border border-[var(--mn-msg-line)] bg-[var(--mn-msg-bg)] p-3.5" aria-label="Mensaje listo">
        <small className="block text-[12px] font-black tracking-[0.06em] text-[var(--mn-green-soft)]">MENSAJE LISTO</small>
        {modo === 'editar' ? (
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={5}
            autoFocus
            aria-label="Editar mensaje"
            className="mt-2 w-full resize-y rounded-xl border border-[var(--mn-msg-line)] bg-[var(--mn-context)] p-3 text-[15px] font-[750] leading-relaxed text-[var(--mn-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--mn-green)]"
          />
        ) : (
          <p className="mb-0 mt-1.5 whitespace-pre-wrap text-[15px] font-[750] leading-relaxed text-[var(--mn-text)]" aria-live="polite">
            {generando
              ? <span className="flex items-center gap-2 text-[var(--mn-dim)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Preparando un mensaje con los datos del caso…</span>
              : mensaje || <span className="text-[var(--mn-dim)]">No hay un mensaje listo. Usá «Cambiar con IA» para prepararlo.</span>}
          </p>
        )}
      </section>

      {modo === 'ia' && (
        <section className="mt-2.5 rounded-[13px] border border-[var(--mn-tools-line)] bg-[var(--mn-panel)] p-3.5" aria-label="Cambiar con IA">
          <small className="block text-[12px] font-black tracking-[0.06em] text-[var(--mn-label)]">¿QUÉ QUERÉS CAMBIAR?</small>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CHIPS.map((chip) => (
              <button key={chip} type="button" onClick={() => setInstruccion(chip)} className={cn('rounded-full border px-2.5 py-1.5 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]', instruccion === chip ? 'border-[var(--mn-accent)] text-[var(--mn-accent)]' : 'border-[var(--mn-key-line)] text-[var(--mn-soft)] hover:border-[var(--mn-accent)]')}>
                {chip}
              </button>
            ))}
          </div>
          <input
            value={instruccion}
            onChange={(e) => setInstruccion(e.target.value)}
            placeholder="Otra indicación"
            aria-label="Otra indicación para la IA"
            className="mt-2.5 h-11 w-full rounded-xl border border-[var(--mn-key-line)] bg-[var(--mn-context)] px-3 text-sm text-[var(--mn-text)] outline-none placeholder:text-[var(--mn-dim)] focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]"
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className={BTN_PRIMARIO} disabled={generando || !instruccion.trim()} onClick={() => void generar(instruccion, true)}>
              {generando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : '✨'} USAR ESTA
            </button>
            <button type="button" className={BTN_GHOST} disabled={generando} onClick={() => void generar(instruccion)}>↻ CAMBIAR OTRA VEZ</button>
            <button type="button" className={BTN_GHOST} onClick={() => { setMensaje(original); setModo('ver'); onEstado(null); }}>VOLVER AL ORIGINAL</button>
          </div>
        </section>
      )}

      {/* Las cinco acciones, en el orden y con los textos de la maqueta. */}
      {/* Bajo 820px la maqueta pone dos por fila (`flex:1 1 44%`). */}
      <div className="mt-3 grid grid-cols-2 gap-2 min-[820px]:flex min-[820px]:flex-wrap min-[820px]:items-center">
        <button type="button" className={BTN_PRIMARIO} onClick={() => void aprobar()} disabled={!puedeAprobar}>
          {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : '✓'} {aprobado ? 'APROBADO' : 'APROBAR'}
        </button>
        <button type="button" className={BTN_GHOST} onClick={() => (modo === 'editar' ? (setModo('ver'), onEstado(null)) : abrirEdicion())}>
          {modo === 'editar' ? '✓ GUARDAR' : '✎ EDITAR'}
        </button>
        <button type="button" className={BTN_GHOST} onClick={() => setModo(modo === 'ia' ? 'ver' : 'ia')}>✨ CAMBIAR CON IA</button>
        <button type="button" className={BTN_GHOST} onClick={() => void posponer()} disabled={guardando}>⏰ POSPONER</button>
        <button type="button" className={BTN_GHOST} onClick={onSaltar}>→ SALTAR</button>
      </div>

      {/* Fila de herramientas: contexto + el recordatorio de que nada sale solo. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={BTN_GHOST} aria-expanded={contextoAbierto} onClick={onContexto}>MÁS CONTEXTO</button>
        <span className="rounded-full border border-[var(--mn-tools-line)] px-2.5 py-1.5 text-[11px] font-black text-[var(--mn-tools-text)]">
          APROBAR NO ENVÍA · LA COLA EJECUTA
        </span>
      </div>
    </>
  );
});
