'use client';

import { useState } from 'react';
import { Check, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SignalRow } from '../../shared/api-types';
import { KIND_META, timeAgo } from '../radar/kind-meta';
import type { SignalGroup } from '../radar/ContactSignalCard';

/**
 * Un contacto que respondió, como una fila más de lo que hay que decidir.
 *
 * Respuestas era una bandeja aparte y por eso se abandonó: 406 señales
 * atendidas hasta el 04/09 y 649 acumuladas después, a razón de sesenta por
 * día. Una respuesta de un cliente no es una categoría distinta de trabajo —es
 * la decisión más urgente que hay— así que vive donde se decide todo lo demás.
 * La bandeja sigue existiendo para el barrido largo; ésta es la fila que
 * aparece cuando entrás a decidir.
 *
 * "Atendido" cierra todas las señales del contacto de un request, igual que en
 * la bandeja: quien contesta un chat contesta la conversación, no cada mensaje.
 */
export function RespuestaItem({
  group,
  onOpen,
  onOpenChat,
  onAtendido,
}: {
  group: SignalGroup;
  onOpen?: (chatId: number) => void;
  onOpenChat?: (chatId: number) => void;
  onAtendido: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const ultima: SignalRow | undefined = group.signals[0];
  const tipos = [...new Set(group.signals.map((s) => s.kind))].slice(0, 3);

  async function atender() {
    setBusy(true);
    try {
      const res = await fetch('/api/plugins/sales-ops/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark', signalIds: group.signals.map((s) => s.id), status: 'handled' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error ?? `Error ${res.status}`));
      toast.success(`${group.name}: ${group.signals.length} respuesta${group.signals.length === 1 ? '' : 's'} atendida${group.signals.length === 1 ? '' : 's'}.`);
      onAtendido();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo marcar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
        group.urgent ? 'border-amber-300/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5' : 'border-border/60 bg-card',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen?.(group.chatId)}
        className="min-w-0 flex-1 text-left"
        title="Abrir la ficha del contacto"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{group.name}</span>
          {tipos.map((kind) => (
            <span key={kind} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {KIND_META[kind]?.emoji} {KIND_META[kind]?.label ?? kind}
            </span>
          ))}
          {group.signals.length > 1 && (
            <span className="text-[11px] tabular-nums text-muted-foreground">{group.signals.length} mensajes</span>
          )}
          <span className="text-[11px] text-muted-foreground">{timeAgo(group.lastAt)}</span>
        </div>
        {ultima?.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">«{ultima.excerpt}»</p>}
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {onOpenChat && (
          <button
            type="button"
            onClick={() => onOpenChat(group.chatId)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Ver el chat"
            aria-label={`Ver el chat de ${group.name}`}
          >
            <MessageSquare className="size-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={atender}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
          title="Cierra todas las señales de este contacto"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
          Atendido
        </button>
      </div>
    </div>
  );
}
