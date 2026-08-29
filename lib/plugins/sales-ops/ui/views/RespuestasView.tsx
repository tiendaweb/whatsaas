'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Loader2, Radar as RadarIcon, RefreshCw } from 'lucide-react';
import { usePusher } from '@/providers/pusher-provider';
import type { SignalRow, SignalsPayload } from '../../shared/api-types';
import { URGENT_SIGNALS, type SignalKind } from '../../shared/taxonomy';
import { KIND_META, timeAgo } from '../radar/kind-meta';
import { SignalCounts } from '../radar/SignalCounts';
import { SignalItem } from '../radar/SignalItem';

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error ?? 'Error');
  return json;
});

type ScanReport = { scanned: number; created: number; byKind: Partial<Record<SignalKind, number>> };

/**
 * Respuestas (radar) — doc 05 §6.
 * Señales `new`, urgentes arriba, después las demás por fecha; automáticas e
 * irrelevantes plegadas. Aviso en tiempo real por Pusher (`sales-ops:signal`).
 */
export function RespuestasView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pusher = usePusher();

  const [kindFilter, setKindFilter] = useState<SignalKind | null>(null);
  const [foldedOpen, setFoldedOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  const { data: team } = useSWR<{ id: number }>('/api/team', fetcher);
  const { data, error, isLoading, mutate } = useSWR<SignalsPayload>('/api/plugins/sales-ops/signals?status=new&limit=200', fetcher, {
    refreshInterval: 60_000,
  });

  // Tiempo real: una señal urgente refresca la lista y avisa.
  useEffect(() => {
    if (!pusher || !team?.id) return;
    const channel = pusher.subscribe(`team-${team.id}`);
    const handler = (payload: { chatId: number; kind: SignalKind; name: string }) => {
      mutate();
      const meta = KIND_META[payload.kind];
      toast(`${meta?.emoji ?? '•'} ${meta?.label ?? payload.kind}: ${payload.name}`, {
        description: 'Nueva señal del radar',
        action: { label: 'Abrir', onClick: () => openChat(payload.chatId) },
      });
    };
    channel.bind('sales-ops:signal', handler);
    return () => {
      channel.unbind('sales-ops:signal', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pusher, team?.id, mutate]);

  const openChat = useCallback(
    (chatId: number) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('chat', String(chatId));
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const handle = useCallback(
    async (signal: SignalRow) => {
      setBusyId(signal.id);
      try {
        const res = await fetch(`/api/plugins/sales-ops/signals/${signal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'handled' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? 'No se pudo marcar');
        await mutate(
          (current) =>
            current
              ? { ...current, rows: current.rows.filter((r) => r.id !== signal.id), counts: { ...current.counts, [signal.kind]: Math.max(0, (current.counts[signal.kind] ?? 1) - 1) } }
              : current,
          { revalidate: false },
        );
        toast.success(`Atendida: ${signal.name}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo marcar');
      } finally {
        setBusyId(null);
      }
    },
    [mutate],
  );

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/plugins/sales-ops/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan', limit: 200 }),
      });
      const json = (await res.json()) as ScanReport & { error?: string };
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo barrer');
      await mutate();
      const urgent = URGENT_SIGNALS.reduce((n, k) => n + (json.byKind?.[k] ?? 0), 0);
      toast.success(json.created ? `Barrido: ${json.created} señal${json.created === 1 ? '' : 'es'} nueva${json.created === 1 ? '' : 's'}${urgent ? ` · ${urgent} urgente${urgent === 1 ? '' : 's'}` : ''}` : 'Barrido: nada nuevo');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo barrer');
    } finally {
      setScanning(false);
    }
  }, [mutate]);

  const { main, folded } = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => (kindFilter ? r.kind === kindFilter : true));
    const rank = (r: SignalRow) => (KIND_META[r.kind]?.urgent ? 0 : 1);
    const sorted = [...rows].sort((a, b) => rank(a) - rank(b) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return {
      main: sorted.filter((r) => !KIND_META[r.kind]?.folded),
      folded: sorted.filter((r) => KIND_META[r.kind]?.folded),
    };
  }, [data?.rows, kindFilter]);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RadarIcon className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Respuestas</h2>
            {data?.lastCutAt ? <span className="text-xs text-muted-foreground">último corte {timeAgo(data.lastCutAt)}</span> : null}
          </div>
          <button
            type="button"
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            Barrer ahora
          </button>
        </div>
        <SignalCounts counts={data?.counts ?? {}} active={kindFilter} onSelect={setKindFilter} />
      </header>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</div>
      ) : isLoading && !data ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando señales…
        </div>
      ) : main.length === 0 && folded.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sin señales nuevas. Tocá “Barrer ahora” para revisar los mensajes entrantes.
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {main.map((signal) => (
              <SignalItem key={signal.id} signal={signal} busy={busyId === signal.id} onOpen={(s) => openChat(s.chatId)} onHandle={handle} />
            ))}
          </ul>
          {folded.length > 0 ? (
            <div className="rounded-xl border border-border bg-muted/30">
              <button
                type="button"
                onClick={() => setFoldedOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
                aria-expanded={foldedOpen}
              >
                {foldedOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                Automáticas e irrelevantes ({folded.length})
              </button>
              {foldedOpen ? (
                <ul className="flex flex-col gap-2 p-2 pt-0">
                  {folded.map((signal) => (
                    <SignalItem key={signal.id} signal={signal} busy={busyId === signal.id} onOpen={(s) => openChat(s.chatId)} onHandle={handle} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
