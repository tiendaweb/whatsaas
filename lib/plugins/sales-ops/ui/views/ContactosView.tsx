'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Building2, CheckCheck, CircleDot, Circle, Loader2, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { FichaDock, type DockItem } from '../components/FichaDock';
import { ErrorState } from '../components/States';
import { SALES_OPS_API, fetcher, fmtInt, iniciales, tiempoRelativo } from '../components/format';
import { ClientesView } from './ClientesView';
import { ListaView } from './ListaView';

type Seccion = 'contactos' | 'clientes';
type Grupo = 'sin_procesar' | 'sin_seguimiento' | 'con_seguimiento' | 'todos';

const GRUPOS: Array<{ id: Grupo; label: string; icon: typeof Circle; hint: string }> = [
  { id: 'sin_procesar', label: 'Sin procesar', icon: Circle, hint: 'Todavía no se auditaron. Dejalos en cola y un conector los clasifica.' },
  { id: 'sin_seguimiento', label: 'Auditados sin tocar', icon: CircleDot, hint: 'Ya tienen gate y siguiente acción, pero nadie hizo nada todavía.' },
  { id: 'con_seguimiento', label: 'Con seguimiento', icon: CheckCheck, hint: 'Se les envió algo o se les corrió un prompt después del análisis.' },
  { id: 'todos', label: 'Todos', icon: Users, hint: 'Todos los contactos auditados, sin separar.' },
];

type PendingRow = {
  chatId: number;
  name: string;
  phoneMasked: string;
  lastCustomerAt: string | null;
  whoSpokeLast: string;
  signals: string[];
  pendingReason: string;
};

/**
 * Contactos y Clientes, en la misma vista.
 *
 * "Clientes" mostraba sólo las cuentas con membresía: para ver un contacto que
 * todavía no compró había que irse a las listas del embudo, que están armadas
 * por gate. Faltaba la pregunta más simple de todas —"¿a quién tengo?"— y sobre
 * todo faltaba ver a los que el sistema **todavía no miró**, que no aparecen en
 * ninguna lista comercial porque no tienen análisis.
 *
 * Los grupos no se mezclan a propósito: un contacto recién auditado y uno al
 * que ya se le escribió necesitan cosas distintas, y verlos juntos hacía que
 * alguien volviera a trabajar al que ya estaba en curso.
 */
export function ContactosView({ onOpen, onOpenChat, owner }: { onOpen: (chatId: number) => void; onOpenChat?: (chatId: number) => void; owner: 'todos' | string }) {
  const [seccion, setSeccion] = useState<Seccion>('contactos');
  const [grupo, setGrupo] = useState<Grupo>('sin_procesar');

  const secciones: Array<DockItem<Seccion>> = [
    { id: 'contactos', label: 'Contactos', icon: Users },
    { id: 'clientes', label: 'Clientes', icon: Building2 },
  ];

  const hint = GRUPOS.find((g) => g.id === grupo)?.hint ?? '';

  return (
    <div className="flex min-h-[60dvh] flex-col overflow-hidden rounded-xl border border-border">
      <FichaDock items={secciones} active={seccion} onChange={setSeccion} />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {seccion === 'clientes' ? (
          <ClientesView onOpen={onOpen} />
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {GRUPOS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGrupo(id)}
                  aria-pressed={grupo === id}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors',
                    grupo === id ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <p className="px-1 text-[11px] text-muted-foreground">{hint}</p>

            {grupo === 'sin_procesar' ? (
              <SinProcesar onOpen={onOpen} />
            ) : (
              <ListaView
                key={grupo}
                vista="todos"
                owner={owner as never}
                selectedChatId={null}
                onOpen={onOpen}
                onOpenChat={onOpenChat}
                embebida
                extraFilters={grupo === 'todos' ? {} : { followUp: grupo === 'con_seguimiento' ? 'con' : 'sin' }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Los chats que el sistema todavía no miró.
 *
 * No salen de `team_commercial_analysis` —no tienen fila ahí— sino del
 * prefiltro, así que es una lista aparte con su propia acción: mandarlos a la
 * cola para que un conector los clasifique.
 */
function SinProcesar({ onOpen }: { onOpen: (chatId: number) => void }) {
  const { data, error, isLoading, mutate } = useSWR<{ rows: PendingRow[]; total: number }>(`${SALES_OPS_API}/pending?source=all&limit=200`, fetcher);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [encolando, setEncolando] = useState(false);

  const rows = data?.rows ?? [];
  const todosElegidos = rows.length > 0 && rows.every((r) => elegidos.has(r.chatId));

  const encolar = async (chatIds: number[]) => {
    if (!chatIds.length) return;
    setEncolando(true);
    try {
      const res = await fetch(`${SALES_OPS_API}/pending/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatIds: chatIds.slice(0, 50) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      toast.success(
        body.fallidos
          ? `${body.encolados} en cola · ${body.fallidos} no se pudieron.`
          : `${body.encolados} chats en la cola. Los toma el próximo conector.`,
      );
      setElegidos(new Set());
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar el análisis.');
    } finally {
      setEncolando(false);
    }
  };

  if (error) return <ErrorState message={String(error.message ?? error)} onRetry={() => void mutate()} />;
  if (isLoading) return <div className="space-y-1.5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium">No queda nada sin procesar</p>
        <p className="mt-1 text-xs text-muted-foreground">Todos los chats del equipo tienen análisis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={todosElegidos}
            onCheckedChange={() => setElegidos(todosElegidos ? new Set() : new Set(rows.map((r) => r.chatId)))}
            aria-label="Seleccionar todos"
          />
          {fmtInt(rows.length)} sin procesar
        </label>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={encolando || elegidos.size === 0}
          onClick={() => void encolar([...elegidos])}
        >
          {encolando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
          Dejar en cola {elegidos.size > 0 ? `(${Math.min(elegidos.size, 50)})` : ''}
        </Button>
      </div>

      {elegidos.size > 50 && (
        <p className="px-1 text-[11px] text-amber-700 dark:text-amber-300">
          Se encolan de a 50 por vez: repetí la operación para el resto.
        </p>
      )}

      <ul className="space-y-1">
        {rows.map((row) => {
          const elegido = elegidos.has(row.chatId);
          return (
            <li key={row.chatId} className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2">
              <Checkbox
                checked={elegido}
                onCheckedChange={() =>
                  setElegidos((prev) => {
                    const next = new Set(prev);
                    if (next.has(row.chatId)) next.delete(row.chatId);
                    else next.add(row.chatId);
                    return next;
                  })
                }
                aria-label={`Elegir ${row.name}`}
              />
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="text-[11px]">{iniciales(row.name)}</AvatarFallback>
              </Avatar>
              <button type="button" onClick={() => onOpen(row.chatId)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {row.phoneMasked}
                  {row.lastCustomerAt && ` · escribió ${tiempoRelativo(row.lastCustomerAt)}`}
                  {row.signals.length > 0 && ` · ${row.signals.join(', ').replace(/_/g, ' ')}`}
                </p>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-[11px]"
                disabled={encolando}
                onClick={() => void encolar([row.chatId])}
              >
                Analizar
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
