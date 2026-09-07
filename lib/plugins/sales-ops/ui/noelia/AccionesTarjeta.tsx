'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Check, Clock3, Loader2, Pencil, RefreshCw, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ActionRow, DetailPayload } from '../../shared/api-types';

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
  onResuelto: (tipo: 'aprobado' | 'pospuesto') => void;
  onSaltar: () => void;
  onDetalleCambio: () => void;
};

const VIVAS = ['proposed', 'pending_approval', 'approved'] as const;
const CHIPS = ['Más corto', 'Más cálido', 'Quiero cerrar', 'No menciones el precio', 'Recordale lo que pidió', 'Que parezca más humano'];

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
  { chatId, detalle, onResuelto, onSaltar, onDetalleCambio },
  ref,
) {
  const action = useMemo(() => detalle.actions.find((a) => VIVAS.includes(a.status as (typeof VIVAS)[number]) && a.kind === 'send_message') ?? null, [detalle.actions]);
  const original = textoDe(action);
  const [mensaje, setMensaje] = useState(original);
  const [modo, setModo] = useState<'ver' | 'editar' | 'ia'>('ver');
  const [instruccion, setInstruccion] = useState('');
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const intentoAutomatico = useRef<number | null>(null);

  useEffect(() => {
    setMensaje(original);
    setModo('ver');
    setInstruccion('');
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
      if (volverAVer) setModo('ver');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo preparar el mensaje.');
    } finally {
      setGenerando(false);
    }
  }, [detalle, generando, mensaje]);

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
      toast.success('Listo. Quedó aprobado, todavía no se envió.');
      onDetalleCambio();
      onResuelto('aprobado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar. Reintentá.');
    } finally {
      setGuardando(false);
    }
  }, [asegurarAction, detalle.analysis?.recommendedAction, guardando, instruccion, mensaje, onDetalleCambio, onResuelto, original]);

  const posponer = useCallback(async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      await json(`/api/plugins/sales-ops/contacts/${chatId}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'snooze', days: 1, note: 'Pospuesto 24 h desde Modo Noelia' }),
      });
      toast.success('Pospuesto por 24 horas.');
      onResuelto('pospuesto');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo posponer.');
    } finally {
      setGuardando(false);
    }
  }, [chatId, guardando, onResuelto]);

  useImperativeHandle(ref, () => ({ aprobar: () => void aprobar(), editar: () => setModo('editar'), ia: () => setModo('ia'), posponer: () => void posponer() }), [aprobar, posponer]);

  if (modo === 'editar') {
    return (
      <div className="space-y-3">
        <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={6} autoFocus className="w-full resize-y rounded-2xl border border-border bg-background p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Editar mensaje" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="min-h-11 flex-1 gap-2" onClick={() => void aprobar()} disabled={guardando || !mensaje.trim()}>{guardando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar y aprobar</Button>
          <Button variant="outline" className="min-h-11" onClick={() => { setMensaje(original || mensaje); setModo('ver'); }}><X className="size-4" /> Cancelar</Button>
        </div>
      </div>
    );
  }

  if (modo === 'ia') {
    return (
      <div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-3">
        <p className="text-xs font-black uppercase tracking-[0.15em]">¿Qué querés cambiar?</p>
        <div className="flex flex-wrap gap-1.5">{CHIPS.map((chip) => <button key={chip} type="button" onClick={() => setInstruccion(chip)} className="rounded-full border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{chip}</button>)}</div>
        <input value={instruccion} onChange={(e) => setInstruccion(e.target.value)} placeholder="Otra indicación" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5" disabled={generando || !instruccion.trim()} onClick={() => void generar(instruccion, true)}>{generando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Usar esta</Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={generando} onClick={() => void generar(instruccion)}><RefreshCw className="size-4" /> Cambiar otra vez</Button>
          <Button size="sm" variant="ghost" onClick={() => { setMensaje(original); setModo('ver'); }}>Volver al original</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="min-h-24 whitespace-pre-wrap rounded-2xl border border-border bg-muted/30 p-3 text-sm leading-relaxed" aria-live="polite">
        {generando ? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Preparando un mensaje con los datos del caso…</span> : mensaje || <span className="text-muted-foreground">No hay un mensaje listo. Usá Cambiar con IA para prepararlo.</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Button className="col-span-2 min-h-12 gap-1.5 sm:col-span-1" onClick={() => void aprobar()} disabled={guardando || generando || !mensaje.trim()}>{guardando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Aprobar</Button>
        <Button variant="outline" className="min-h-12 gap-1.5" onClick={() => setModo('editar')}><Pencil className="size-4" /> Editar</Button>
        <Button variant="outline" className="min-h-12 gap-1.5" onClick={() => setModo('ia')}><Sparkles className="size-4" /> IA</Button>
        <Button variant="outline" className="min-h-12 gap-1.5" onClick={() => void posponer()} disabled={guardando}><Clock3 className="size-4" /> Posponer</Button>
        <Button variant="ghost" className="min-h-12" onClick={onSaltar}>Saltar →</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Aprobar guarda la decisión; no envía el mensaje. Atajos: A aprobar · E editar · I IA · P posponer · S saltar.</p>
    </div>
  );
});
