'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Ban, ChevronDown, ChevronRight, Loader2, Radar as RadarIcon, RefreshCw, Undo2 } from 'lucide-react';
import { usePusher } from '@/providers/pusher-provider';
import type { SignalRow, SignalsPayload } from '../../shared/api-types';
import { URGENT_SIGNALS, type SignalKind } from '../../shared/taxonomy';
import { KIND_META, timeAgo } from '../radar/kind-meta';
import { SignalCounts } from '../radar/SignalCounts';
import { ContactSignalCard, agruparSenales, type AutomationOption, type SignalGroup } from '../radar/ContactSignalCard';
import { ChatFlotante } from '../radar/ChatFlotante';
import type { SkillRun } from '../skills/api';

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error ?? 'Error');
  return json;
});

type ScanReport = { scanned: number; created: number; byKind: Partial<Record<SignalKind, number>> };

/** Descuenta del contador por tipo lo que se acaba de atender. Nunca baja de 0. */
function descontar(counts: Record<SignalKind, number>, signals: SignalRow[]): Record<SignalKind, number> {
  const next = { ...counts };
  for (const signal of signals) next[signal.kind] = Math.max(0, (next[signal.kind] ?? 1) - 1);
  return next;
}

/**
 * Respuestas (radar) — doc 05 §6.
 *
 * Una tarjeta por CONTACTO, no por mensaje: el radar crea una señal por mensaje
 * entrante y quien escribe cinco veces llenaba cinco filas que se atendían de a
 * una. Urgentes arriba, después por quién habló más recién; los contactos cuyo
 * único tráfico es automático o irrelevante quedan plegados abajo. Aviso en
 * tiempo real por Pusher (`sales-ops:signal`).
 */
export function RespuestasView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pusher = usePusher();

  const [kindFilter, setKindFilter] = useState<SignalKind | null>(null);
  const [foldedOpen, setFoldedOpen] = useState(false);
  const [busyChatId, setBusyChatId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  const { data: team } = useSWR<{ id: number }>('/api/team', fetcher);
  const { data, error, isLoading, mutate } = useSWR<SignalsPayload>('/api/plugins/sales-ops/signals?status=new&limit=500', fetcher, {
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

  /** Excluir de Respuestas: sus señales abiertas se descartan y el radar no le crea más. Se revierte desde "Excluidos". */
  const excluir = useCallback(
    async (chatId: number, name: string) => {
      if (!window.confirm(`¿Excluir a ${name} de Respuestas? El radar deja de avisar por este contacto; se puede revertir desde "Excluidos".`)) return;
      try {
        const res = await fetch('/api/plugins/sales-ops/signals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mute', chatId, muted: true }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? 'No se pudo excluir');
        toast.success(`${name}: excluido de Respuestas.`);
        await mutate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo excluir');
      }
    },
    [mutate],
  );
  const incluir = useCallback(
    async (chatId: number) => {
      try {
        const res = await fetch('/api/plugins/sales-ops/signals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mute', chatId, muted: false }) });
        if (!res.ok) throw new Error('No se pudo');
        toast.success('Vuelve a Respuestas.');
        await mutate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo');
      }
    },
    [mutate],
  );
  const [verExcluidos, setVerExcluidos] = useState(false);

  /** Chat flotante: contestar sin irse de la bandeja. */
  const [chatFlotante, setChatFlotante] = useState<number | null>(null);
  const enCola = useSWR<{ runs: SkillRun[] }>('/api/plugins/sales-ops/prompts/queue?status=open&engine=exclude&limit=200', fetcher, { refreshInterval: 60_000 });
  const automationsList = useSWR<{ automations: AutomationOption[] }>('/api/plugins/sales-ops/automations', fetcher, { revalidateOnFocus: false });
  const pendientesPorChat = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of enCola.data?.runs ?? []) if (r.targetKind === 'chat') m.set(Number(r.targetId), (m.get(Number(r.targetId)) ?? 0) + 1);
    return m;
  }, [enCola.data?.runs]);

  /** Varios prompts seguidos = varias filas en cola: cada uno lo toma un conector por separado. */
  const encolarPrompt = useCallback(
    async (chatId: number, text: string) => {
      try {
        const res = await fetch('/api/plugins/sales-ops/prompts/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, targetKind: 'chat', targetId: chatId, mode: 'queue' }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? 'No se pudo encolar');
        toast.success('En la cola. Lo toma el próximo conector.');
        void enCola.mutate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo encolar');
      }
    },
    [enCola],
  );

  const dispararFlujo = useCallback(async (chatId: number, automationId: number) => {
    try {
      const res = await fetch('/api/plugins/sales-ops/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, automationId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.triggered) throw new Error(json?.error ?? 'No se pudo disparar');
      toast.success(`Flujo "${json.automation?.name ?? ''}" disparado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo disparar');
    }
  }, []);

  /**
   * Atiende todas las señales que se le pasan en un solo request: si fueran N
   * requests y el tercero falla, el contacto queda medio atendido y vuelve a
   * aparecer al refrescar sin que se entienda por qué.
   */
  const atender = useCallback(
    async (chatId: number, signals: SignalRow[], etiqueta: string) => {
      if (!signals.length) return;
      setBusyChatId(chatId);
      try {
        const res = await fetch('/api/plugins/sales-ops/signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark', signalIds: signals.map((s) => s.id), status: 'handled' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? 'No se pudo marcar');
        const ids = new Set(signals.map((s) => s.id));
        await mutate(
          (current) =>
            current
              ? { ...current, rows: current.rows.filter((r) => !ids.has(r.id)), counts: descontar(current.counts, signals) }
              : current,
          { revalidate: false },
        );
        toast.success(signals.length > 1 ? `Atendidas ${signals.length}: ${etiqueta}` : `Atendida: ${etiqueta}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo marcar');
      } finally {
        setBusyChatId(null);
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

  const { main, folded, contactos } = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => (kindFilter ? r.kind === kindFilter : true));
    const sorted = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const grupos = agruparSenales(sorted);
    return {
      main: grupos.filter((g) => !g.folded),
      folded: grupos.filter((g) => g.folded),
      contactos: grupos.length,
    };
  }, [data?.rows, kindFilter]);

  const tarjeta = (group: SignalGroup) => (
    <ContactSignalCard
      key={group.chatId}
      group={group}
      busy={busyChatId === group.chatId}
      onOpen={openChat}
      onHandleAll={(g) => void atender(g.chatId, g.signals, g.name)}
      onHandleOne={(signal) => void atender(signal.chatId, [signal], signal.name)}
      onAbrirChat={setChatFlotante}
      onExcluir={excluir}
      onPrompt={encolarPrompt}
      onFlujo={dispararFlujo}
      pendientes={pendientesPorChat.get(group.chatId) ?? 0}
      automations={automationsList.data?.automations ?? []}
    />
  );

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
        {contactos > 0 ? (
          <p className="text-xs text-muted-foreground">
            {contactos} contacto{contactos === 1 ? '' : 's'} esperando respuesta
          </p>
        ) : null}
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
          <ul className="flex flex-col gap-2">{main.map(tarjeta)}</ul>
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
              {foldedOpen ? <ul className="flex flex-col gap-2 p-2 pt-0">{folded.map(tarjeta)}</ul> : null}
            </div>
          ) : null}
        </>
      )}
      {(data?.muted?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <button type="button" onClick={() => setVerExcluidos((v) => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline">
            <Ban className="h-3.5 w-3.5" aria-hidden />
            {verExcluidos ? 'Ocultar excluidos' : `Excluidos de Respuestas · ${data!.muted!.length}`}
          </button>
          {verExcluidos && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {data!.muted!.map((m) => (
                <li key={m.chatId} className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => openChat(m.chatId)}>{m.name}</button>
                  <button type="button" className="text-muted-foreground hover:text-foreground" title="Volver a incluir" onClick={() => void incluir(m.chatId)}>
                    <Undo2 className="h-3 w-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ChatFlotante chatId={chatFlotante} onClose={() => setChatFlotante(null)} onFicha={(id) => { setChatFlotante(null); openChat(id); }} />
    </section>
  );
}
