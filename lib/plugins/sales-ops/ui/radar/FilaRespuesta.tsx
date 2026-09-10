'use client';

import { useState } from 'react';
import { Ban, Check, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SignalRow } from '../../shared/api-types';
import { KIND_META, timeAgo } from './kind-meta';
import type { SignalGroup } from './ContactSignalCard';

/**
 * Un contacto que respondió, en el rail de la mesa de atención.
 *
 * Es la fila de la izquierda: lo mínimo para decidir a quién abrir —quién es,
 * qué tipo de respuesta mandó, qué dijo lo último y hace cuánto—. Todo lo demás
 * (contestar, la ficha, el CRM) pasa en la columna de chat que abre, no acá.
 *
 * "Atendido" cierra TODAS las señales del contacto en un request: quien
 * contesta un chat contesta la conversación, no cada mensaje suelto.
 */
export function FilaRespuesta({
  group,
  abierto = false,
  onAbrir,
  onAtendido,
  onExcluir,
}: {
  group: SignalGroup;
  /** Ya tiene una columna en la mesa. */
  abierto?: boolean;
  onAbrir: (chatId: number) => void;
  onAtendido: (chatId: number, signals: SignalRow[]) => void;
  onExcluir?: (chatId: number, name: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const ultima: SignalRow | undefined = group.signals[0];
  const tipos = [...new Set(group.signals.map((s) => s.kind))].slice(0, 2);

  async function atender(event: React.MouseEvent) {
    event.stopPropagation();
    setBusy(true);
    try {
      const res = await fetch('/api/plugins/sales-ops/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark', signalIds: group.signals.map((s) => s.id), status: 'handled' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error ?? `Error ${res.status}`));
      onAtendido(group.chatId, group.signals);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo marcar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onAbrir(group.chatId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAbrir(group.chatId);
          }
        }}
        aria-pressed={abierto}
        className={cn(
          'group w-full cursor-pointer rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          abierto
            ? 'border-primary/50 bg-primary/5'
            : group.urgent
              ? 'border-amber-300/70 bg-amber-50/60 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5'
              : 'border-border/60 bg-card hover:bg-muted/50',
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="truncate text-sm font-medium">{group.name}</span>
              {tipos.map((kind) => (
                <span key={kind} className="text-[11px] text-muted-foreground" title={KIND_META[kind]?.label ?? kind}>
                  {KIND_META[kind]?.emoji}
                </span>
              ))}
              {group.signals.length > 1 && (
                <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{group.signals.length}</span>
              )}
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{timeAgo(group.lastAt)}</span>
            </div>
            {ultima?.excerpt && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{ultima.excerpt}</p>}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAbrir(group.chatId);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium hover:bg-muted"
          >
            <MessageSquare className="size-3" aria-hidden />
            {abierto ? 'En la mesa' : 'Abrir chat'}
          </button>
          <button
            type="button"
            onClick={atender}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-60"
            title="Cierra todas las señales de este contacto"
          >
            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
            Atendido
          </button>
          {onExcluir && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExcluir(group.chatId, group.name);
              }}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Excluir de Respuestas"
              aria-label={`Excluir a ${group.name} de Respuestas`}
            >
              <Ban className="size-3" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
