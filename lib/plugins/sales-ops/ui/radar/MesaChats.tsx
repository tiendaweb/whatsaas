'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Check, ExternalLink, Loader2, MessageSquarePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SignalRow } from '../../shared/api-types';
import { FichaChat } from '../components/FichaChat';
import { SALES_OPS_API, fetcher } from '../components/format';
import { KIND_META } from './kind-meta';
import type { SignalGroup } from './ContactSignalCard';

type Detalle = {
  header?: { name?: string | null; chatId?: number };
  chatHref?: string;
  analysis?: { currentGate?: string | null; need?: string | null } | null;
};

/**
 * La mesa: varios clientes contestándose al mismo tiempo.
 *
 * Atender respuestas era abrir un chat, contestar, cerrarlo, volver a la lista
 * y buscar el siguiente. Con sesenta contactos esperando, la mitad del trabajo
 * eran esos viajes de ida y vuelta. Acá las conversaciones se ponen una al lado
 * de la otra —dos, tres o cuatro columnas según la pantalla— y se contesta
 * bajando por la mesa; el rail de la izquierda queda para elegir a quién sumar.
 *
 * Cada columna es el mismo chat de la ficha (`FichaChat`): historial completo,
 * envío real por WhatsApp, nota interna y los programados del contacto. Nada de
 * un compositor aparte que se comporte distinto según desde dónde se escriba.
 *
 * En el teléfono no hay mesa: hay pestañas. Tres columnas de 120 px no son tres
 * conversaciones, son tres columnas ilegibles.
 */
export function MesaChats({
  grupos,
  activo,
  onActivo,
  onCerrar,
  onAtendido,
  onFicha,
  onSumar,
  puedeSumar,
}: {
  /** Los contactos abiertos, en el orden en que se pusieron sobre la mesa. */
  grupos: SignalGroup[];
  /** El de la pestaña visible en móvil. */
  activo: number | null;
  onActivo: (chatId: number) => void;
  onCerrar: (chatId: number) => void;
  onAtendido: (chatId: number, signals: SignalRow[]) => void;
  onFicha: (chatId: number) => void;
  onSumar: () => void;
  puedeSumar: boolean;
}) {
  if (!grupos.length) {
    return (
      <div className="flex min-h-[340px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          La mesa está vacía. Elegí un contacto de la izquierda, o abrí los primeros de una.
        </p>
        {puedeSumar && (
          <button
            type="button"
            onClick={onSumar}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <MessageSquarePlus className="size-3.5" aria-hidden />
            Abrir los primeros
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Pestañas: la mesa en el teléfono. */}
      <div className="mb-2 flex gap-1 overflow-x-auto lg:hidden" role="tablist" aria-label="Chats abiertos">
        {grupos.map((g) => (
          <button
            key={g.chatId}
            type="button"
            role="tab"
            aria-selected={activo === g.chatId}
            onClick={() => onActivo(g.chatId)}
            className={cn(
              'shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium',
              activo === g.chatId ? 'border-primary/50 bg-primary/5 text-foreground' : 'border-border/60 text-muted-foreground',
            )}
          >
            {g.name.split(' ')[0]}
            {g.signals.length > 1 && <span className="ml-1 tabular-nums opacity-70">{g.signals.length}</span>}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-3',
          // Una columna por conversación, hasta cuatro. Más angosto que ~320 px
          // el chat deja de leerse, así que el corte lo pone la pantalla.
          grupos.length === 1 ? 'lg:grid-cols-1' : grupos.length === 2 ? 'lg:grid-cols-2' : grupos.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2 2xl:grid-cols-4',
        )}
      >
        {grupos.map((g) => (
          <ColumnaChat
            key={g.chatId}
            group={g}
            oculta={activo !== g.chatId}
            onCerrar={() => onCerrar(g.chatId)}
            onAtendido={() => onAtendido(g.chatId, g.signals)}
            onFicha={() => onFicha(g.chatId)}
          />
        ))}
      </div>
    </div>
  );
}

function ColumnaChat({
  group,
  oculta,
  onCerrar,
  onAtendido,
  onFicha,
}: {
  group: SignalGroup;
  /** En móvil sólo se ve la pestaña activa; en escritorio se ven todas. */
  oculta: boolean;
  onCerrar: () => void;
  onAtendido: () => void;
  onFicha: () => void;
}) {
  const detalle = useSWR<Detalle>(`${SALES_OPS_API}/contacts/${group.chatId}`, fetcher);
  const [marcando, setMarcando] = useState(false);
  const tipos = [...new Set(group.signals.map((s) => s.kind))];

  // El aviso de "ya no tiene señales" no tiene que quedar pegado si el contacto
  // vuelve a escribir mientras la columna sigue abierta.
  useEffect(() => {
    setMarcando(false);
  }, [group.signals.length]);

  async function atender() {
    setMarcando(true);
    onAtendido();
  }

  return (
    <section
      className={cn(
        'flex min-h-[420px] min-w-0 flex-col rounded-xl border border-border bg-card p-3 lg:min-h-0',
        oculta && 'hidden lg:flex',
      )}
      aria-label={`Chat con ${group.name}`}
    >
      <header className="mb-2 flex items-start gap-2 border-b border-border/60 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{detalle.data?.header?.name ?? group.name}</h3>
            {tipos.slice(0, 3).map((kind) => (
              <span key={kind} className="text-[11px]" title={KIND_META[kind]?.label ?? kind}>
                {KIND_META[kind]?.emoji}
              </span>
            ))}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {group.signals.length} respuesta{group.signals.length === 1 ? '' : 's'} sin atender
            {detalle.data?.analysis?.currentGate ? ` · ${detalle.data.analysis.currentGate}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onFicha}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Abrir la ficha completa"
            aria-label={`Ficha de ${group.name}`}
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={atender}
            disabled={marcando}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-60"
            title="Cierra sus señales y libera el lugar en la mesa"
          >
            {marcando ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
            Atendido
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Sacar de la mesa (sin marcar como atendido)"
            aria-label={`Cerrar el chat de ${group.name}`}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </header>

      <FichaChat
        chatId={group.chatId}
        chatHref={detalle.data?.chatHref ?? `/dashboard?chat=${group.chatId}`}
        className="min-h-0 flex-1"
      />
    </section>
  );
}
