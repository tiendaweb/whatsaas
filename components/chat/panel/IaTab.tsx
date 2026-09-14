'use client';

import { useState } from 'react';
import { CalendarClock, ExternalLink, Layers, Loader2, SendHorizontal, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import type { PanelChatSnapshot } from '@/lib/plugins/sales-ops/server/panel-chat';
import { fecha, relativo } from './tipos';

/**
 * IA: dejarle una indicación al conector sobre este chat, y ver qué hay encolado.
 *
 * Es la misma cola que el Command Center: lo que se escribe acá se guarda como
 * una **indicación** en `team_prompt_runs` y aparece en la Cola con su estado,
 * donde se aprueba o la toma el próximo conector. No se ejecuta al enviar y no
 * le llega nada al cliente: eso es a propósito, y por eso el texto de abajo lo
 * dice.
 *
 * Abajo, lo que ya está en cola PARA ESTE CONTACTO: las indicaciones sin cerrar
 * y las filas de lote esperando salir. Hasta ahora había que ir a la Cola y
 * buscar el nombre para saber si alguien ya le había preparado algo, y esa es
 * justo la pregunta que hay que contestar antes de escribirle otra cosa.
 */

const ESTADO_RUN: Record<string, string> = {
  queued: 'en cola',
  in_progress: 'corriendo',
  blocked: 'esperando una decisión',
  failed: 'falló',
};

const ESTADO_ACCION: Record<string, string> = {
  proposed: 'propuesta',
  pending_approval: 'esperando aprobación',
  approved: 'aprobada, sin salir',
  executing: 'saliendo',
};

const TIPO_ACCION: Record<string, string> = {
  send_message: 'mensaje',
  schedule_message: 'mensaje programado',
  create_task: 'tarea',
  request_demo: 'pedido de demo',
  assign_owner: 'asignación',
  schedule_call: 'llamada',
  mark_pre_descarte: 'marca de pre-descarte',
  mark_descarte: 'marca de descarte',
};

export function IaTab({
  chatId,
  snapshot,
  onEncolado,
}: {
  chatId: number;
  snapshot: PanelChatSnapshot | null;
  /** Recarga el resumen: lo recién encolado tiene que aparecer abajo. */
  onEncolado: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  // 403 al pedir el resumen = el equipo no tiene el Command Center. Sin él no
  // hay cola donde dejar el pedido, así que no se ofrece la caja.
  if (!snapshot) {
    return (
      <div className="ctx-sec">
        <p className="text-[11.5px]" style={{ color: 'var(--mq-muted2)' }}>
          Esta pestaña necesita el Command Center comercial, que este equipo no tiene activo.
        </p>
      </div>
    );
  }

  const enviar = async () => {
    const limpio = texto.trim();
    if (limpio.length < 5) {
      toast.error('Escribí qué tiene que hacer el conector (mínimo 5 caracteres).');
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch('/api/plugins/sales-ops/prompts/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: limpio, targetKind: 'chat', targetId: chatId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      setTexto('');
      toast.success('Encolado: queda en la Cola como indicación.');
      onEncolado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setEnviando(false);
    }
  };

  const { runs, acciones } = snapshot.cola;
  const hayCola = runs.length > 0 || acciones.length > 0;

  return (
    <>
      <div className="ctx-sec">
        <div className="ctx-t"><Wand2 className="size-3" aria-hidden /> Dejar un pedido</div>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter manda, Shift+Enter hace salto: es una caja de chat.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={3}
          placeholder="Ej.: revisá qué quedó pendiente y redactá el mensaje para pedir la seña, no lo envíes."
          className="resize-none text-xs"
        />
        <button
          type="button"
          className="btn g mt-2 w-full justify-center"
          disabled={enviando || texto.trim().length < 5}
          onClick={() => void enviar()}
        >
          {enviando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <SendHorizontal className="size-3.5" aria-hidden />}
          Dejar en cola
        </button>
        <p className="mt-1.5 text-[10.5px] leading-relaxed" style={{ color: 'var(--mq-muted2)' }}>
          No se ejecuta al enviar ni le llega nada al cliente: queda en la Cola del Command Center y lo toma un conector.
        </p>
      </div>

      <div className="ctx-sec">
        <div className="ctx-t"><Layers className="size-3" aria-hidden /> Trabajo en cola ({runs.length + acciones.length})</div>

        {!hayCola ? (
          <p className="text-[11.5px]" style={{ color: 'var(--mq-muted2)' }}>
            No hay nada preparado para este contacto.
          </p>
        ) : (
          <>
            {runs.map((r) => (
              <div key={`run-${r.id}`} className="list-row">
                <Wand2 className="size-3.5 shrink-0" style={{ color: 'var(--mq-muted)' }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="nm">{r.title}</div>
                  <div className="sub2">
                    {ESTADO_RUN[r.status] ?? r.status}
                    {r.connector && !['any', 'pending', 'server'].includes(r.connector) ? ` · ${r.connector}` : ''}
                    {` · ${relativo(r.createdAt)}`}
                  </div>
                </div>
              </div>
            ))}

            {acciones.map((x) => (
              <div key={`acc-${x.id}`} className="list-row">
                <Layers className="size-3.5 shrink-0" style={{ color: 'var(--mq-muted)' }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="nm">{TIPO_ACCION[x.kind] ?? x.kind}</div>
                  <div className="sub2">
                    {ESTADO_ACCION[x.status] ?? x.status} · {x.batchLabel}
                  </div>
                  {/* Cuándo sale: un programado aprobado sin fecha visible es la
                      forma más rápida de escribirle dos veces al mismo cliente. */}
                  {x.scheduledFor && (
                    <div className="sub2 flex items-center gap-1" style={{ color: 'var(--mq-text)' }}>
                      <CalendarClock className="size-3 shrink-0" aria-hidden />
                      Sale {fecha(x.scheduledFor)} · {relativo(x.scheduledFor)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        <a
          href="/plugins/sales-ops?vista=cola"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          Abrir la Cola <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </>
  );
}
