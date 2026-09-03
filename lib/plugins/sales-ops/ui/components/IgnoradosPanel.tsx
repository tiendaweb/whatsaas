'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { EyeOff, Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SALES_OPS_API, fetcher, tiempoRelativo } from './format';

export type ExclusionKind = 'personal' | 'equipo' | 'otros';

type Row = {
  chatId: number;
  name: string;
  phoneMasked: string;
  kind: ExclusionKind;
  reason: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};

type Payload = { rows: Row[]; counts: Record<ExclusionKind, number> };

const EXPLICACIONES: Record<ExclusionKind, string> = {
  personal: 'Chats personales: familia, amigos, cosas de uno. Nunca fueron un cliente.',
  equipo: 'Chats internos: compañeros, otro número nuestro, grupos de trabajo.',
  otros: 'Proveedores, pruebas, spam y todo lo que no es una conversación de venta.',
};

/**
 * Los chats ignorados de un grupo, con el botón para devolverlos.
 *
 * Un chat marcado acá deja de existir para el circuito comercial: no se
 * clasifica, no entra al radar, no se le transcriben audios y no aparece en
 * ninguna lista. Por eso importa que se pueda deshacer de un clic y ver qué se
 * sacó: una exclusión silenciosa que no se puede revisar es cómo se pierde un
 * cliente real por un marcado apurado.
 *
 * El análisis que el chat tuviera no se borra: volver a incluirlo lo devuelve a
 * la lista donde estaba, con su gate y su prioridad intactos.
 */
export function IgnoradosPanel({ kind, onChanged }: { kind: ExclusionKind; onChanged?: () => void }) {
  const { data, isLoading, error, mutate } = useSWR<Payload>(`${SALES_OPS_API}/exclusions?kind=${kind}`, fetcher);
  const [devolviendo, setDevolviendo] = useState<number | null>(null);

  const devolver = async (row: Row) => {
    setDevolviendo(row.chatId);
    try {
      const res = await fetch(`${SALES_OPS_API}/exclusions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatIds: [row.chatId] }),
      });
      if (!res.ok) throw new Error(String((await res.json().catch(() => ({})))?.error ?? `Error ${res.status}`));
      toast.success(`${row.name} vuelve al circuito comercial.`);
      await mutate();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo devolver el chat.');
    } finally {
      setDevolviendo(null);
    }
  };

  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{String(error.message)}</p>;

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-muted-foreground">{EXPLICACIONES[kind]}</p>

      {isLoading && <div className="space-y-1.5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>}

      {!isLoading && (data?.rows.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No hay chats en este grupo. Seleccionalos en “Descartes” o en cualquier lista y usá “Ignorar”.
        </div>
      )}

      <ul className="space-y-1.5">
        {(data?.rows ?? []).map((row) => (
          <li key={row.chatId} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <EyeOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {row.phoneMasked} · ignorado {tiempoRelativo(row.createdAt)}
                {row.lastMessageAt && ` · último mensaje ${tiempoRelativo(row.lastMessageAt)}`}
                {row.reason && ` · ${row.reason}`}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1.5 text-xs"
              disabled={devolviendo === row.chatId}
              onClick={() => void devolver(row)}
            >
              {devolviendo === row.chatId ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Undo2 className="size-3.5" aria-hidden />}
              Devolver
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
