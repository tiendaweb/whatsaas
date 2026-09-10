'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Ban, ChevronDown, ChevronRight, Loader2, MessageSquarePlus, Radar as RadarIcon, RefreshCw, Undo2 } from 'lucide-react';
import { usePusher } from '@/providers/pusher-provider';
import { cn } from '@/lib/utils';
import type { SignalRow, SignalsPayload } from '../../shared/api-types';
import { URGENT_SIGNALS, type SignalKind } from '../../shared/taxonomy';
import { KIND_META, timeAgo } from '../radar/kind-meta';
import { SignalCounts } from '../radar/SignalCounts';
import { agruparSenales, type SignalGroup } from '../radar/ContactSignalCard';
import { FilaRespuesta } from '../radar/FilaRespuesta';
import { MesaChats } from '../radar/MesaChats';

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error ?? 'Error');
  return json;
});

type ScanReport = { scanned: number; created: number; byKind: Partial<Record<SignalKind, number>> };

/** Cuántas conversaciones caben en la mesa a la vez. Más de cuatro no se leen. */
const MAX_MESA = 4;
const LS_MESA = 'sales-ops:respuestas:mesa';

/** Descuenta del contador por tipo lo que se acaba de atender. Nunca baja de 0. */
function descontar(counts: Record<SignalKind, number>, signals: SignalRow[]): Record<SignalKind, number> {
  const next = { ...counts };
  for (const signal of signals) next[signal.kind] = Math.max(0, (next[signal.kind] ?? 1) - 1);
  return next;
}

/**
 * Respuestas: una mesa para atender a varios clientes a la vez.
 *
 * Antes era una lista de tarjetas y contestar a alguien era abrir su chat en un
 * modal, escribir, cerrarlo, volver a la lista y buscar al siguiente. Con
 * sesenta contactos esperando, la mitad del trabajo eran esos viajes: por eso
 * la bandeja se dejó de mirar el 04/09 y se acumularon 649 señales.
 *
 * Ahora el rail de la izquierda es la fila de espera —quién escribió, qué tipo
 * de respuesta y qué dijo— y la derecha es la mesa: hasta cuatro conversaciones
 * abiertas al mismo tiempo, cada una con el chat completo del Command Center
 * (historial, envío real, nota interna y sus programados). Se contesta bajando
 * por la mesa; al marcar a uno como atendido, su lugar lo toma automáticamente
 * el siguiente de la fila, así la mesa nunca queda con un hueco.
 *
 * La mesa sobrevive a recargar la pantalla (localStorage): un bloque de trabajo
 * no se pierde porque alguien apretó F5.
 */
export function RespuestasView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pusher = usePusher();

  const [kindFilter, setKindFilter] = useState<SignalKind | null>(null);
  const [foldedOpen, setFoldedOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [verExcluidos, setVerExcluidos] = useState(false);
  /** Los chats sobre la mesa, en el orden en que se pusieron. */
  const [mesa, setMesa] = useState<number[]>([]);
  const [activo, setActivo] = useState<number | null>(null);

  const { data: team } = useSWR<{ id: number }>('/api/team', fetcher);
  const { data, error, isLoading, mutate } = useSWR<SignalsPayload>('/api/plugins/sales-ops/signals?status=new&limit=500', fetcher, {
    refreshInterval: 60_000,
  });

  const openChat = useCallback(
    (chatId: number) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('chat', String(chatId));
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // La mesa se recuerda: recargar no puede costar el bloque de trabajo.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_MESA);
      const ids = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(ids)) {
        const limpios = ids.filter((n): n is number => Number.isInteger(n)).slice(0, MAX_MESA);
        setMesa(limpios);
        setActivo(limpios[0] ?? null);
      }
    } catch {
      /* sin storage */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_MESA, JSON.stringify(mesa));
    } catch {
      /* sin storage */
    }
  }, [mesa]);

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

  /** Los grupos que están sobre la mesa, en el orden de la mesa. */
  const enMesa = useMemo(() => {
    const porChat = new Map<number, SignalGroup>();
    for (const g of [...main, ...folded]) porChat.set(g.chatId, g);
    return mesa.map((id) => porChat.get(id)).filter((g): g is SignalGroup => Boolean(g));
  }, [mesa, main, folded]);

  /** El primero de la fila que todavía no está sobre la mesa. */
  const siguientes = useMemo(() => main.filter((g) => !mesa.includes(g.chatId)), [main, mesa]);

  const abrir = useCallback(
    (chatId: number) => {
      setActivo(chatId);
      setMesa((actual) => {
        if (actual.includes(chatId)) return actual;
        // La mesa tiene tamaño fijo: el más viejo cede el lugar. Cerrar a mano
        // sigue estando, pero nadie tiene que hacer lugar antes de abrir.
        const next = [...actual, chatId];
        return next.length > MAX_MESA ? next.slice(next.length - MAX_MESA) : next;
      });
    },
    [],
  );

  const cerrar = useCallback((chatId: number) => {
    setMesa((actual) => actual.filter((id) => id !== chatId));
    setActivo((act) => (act === chatId ? null : act));
  }, []);

  /** Llena la mesa con los primeros de la fila que no estén abiertos. */
  const llenarMesa = useCallback(() => {
    const lugares = MAX_MESA - mesa.length;
    if (lugares <= 0 || !siguientes.length) return;
    const nuevos = siguientes.slice(0, lugares).map((g) => g.chatId);
    setMesa((actual) => [...actual, ...nuevos].slice(0, MAX_MESA));
    setActivo((act) => act ?? nuevos[0] ?? null);
  }, [mesa.length, siguientes]);

  /**
   * Marca atendido y deja entrar al siguiente.
   *
   * El request ya lo hizo quien llama (la fila o la columna): acá se actualiza
   * la lista sin revalidar —para que el contacto no parpadee de vuelta— y se
   * libera el lugar en la mesa.
   */
  const atendido = useCallback(
    (chatId: number, signals: SignalRow[]) => {
      const ids = new Set(signals.map((s) => s.id));
      void mutate(
        (current) =>
          current ? { ...current, rows: current.rows.filter((r) => !ids.has(r.id)), counts: descontar(current.counts, signals) } : current,
        { revalidate: false },
      );
      const reemplazo = siguientes.find((g) => g.chatId !== chatId)?.chatId ?? null;
      setMesa((actual) => {
        const sinEl = actual.filter((id) => id !== chatId);
        return reemplazo && !sinEl.includes(reemplazo) ? [...sinEl, reemplazo] : sinEl;
      });
      setActivo((act) => (act === chatId ? reemplazo : act));
      toast.success(signals.length > 1 ? `${signals.length} respuestas atendidas.` : 'Respuesta atendida.');
    },
    [mutate, siguientes],
  );

  const excluir = useCallback(
    async (chatId: number, name: string) => {
      if (!window.confirm(`¿Excluir a ${name} de Respuestas? El radar deja de avisar por este contacto; se puede revertir desde "Excluidos".`)) return;
      try {
        const res = await fetch('/api/plugins/sales-ops/signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mute', chatId, muted: true }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? 'No se pudo excluir');
        toast.success(`${name}: excluido de Respuestas.`);
        cerrar(chatId);
        await mutate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo excluir');
      }
    },
    [mutate, cerrar],
  );

  const incluir = useCallback(
    async (chatId: number) => {
      try {
        const res = await fetch('/api/plugins/sales-ops/signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mute', chatId, muted: false }),
        });
        if (!res.ok) throw new Error('No se pudo');
        toast.success('Vuelve a Respuestas.');
        await mutate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo');
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
      toast.success(
        json.created
          ? `Barrido: ${json.created} señal${json.created === 1 ? '' : 'es'} nueva${json.created === 1 ? '' : 's'}${urgent ? ` · ${urgent} urgente${urgent === 1 ? '' : 's'}` : ''}`
          : 'Barrido: nada nuevo',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo barrer');
    } finally {
      setScanning(false);
    }
  }, [mutate]);

  // Tiempo real: una señal nueva refresca la fila y avisa.
  useEffect(() => {
    if (!pusher || !team?.id) return;
    const channel = pusher.subscribe(`team-${team.id}`);
    const handler = (payload: { chatId: number; kind: SignalKind; name: string }) => {
      void mutate();
      const meta = KIND_META[payload.kind];
      toast(`${meta?.emoji ?? '•'} ${meta?.label ?? payload.kind}: ${payload.name}`, {
        description: 'Respondió recién',
        action: { label: 'Sumar a la mesa', onClick: () => abrir(payload.chatId) },
      });
    };
    channel.bind('sales-ops:signal', handler);
    return () => {
      channel.unbind('sales-ops:signal', handler);
    };
  }, [pusher, team?.id, mutate, abrir]);

  const fila = (group: SignalGroup) => (
    <FilaRespuesta
      key={group.chatId}
      group={group}
      abierto={mesa.includes(group.chatId)}
      onAbrir={abrir}
      onAtendido={atendido}
      onExcluir={excluir}
    />
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RadarIcon className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Respuestas</h2>
            {contactos > 0 && (
              <span className="text-xs text-muted-foreground">
                {contactos} esperando · {enMesa.length} en la mesa
              </span>
            )}
            {data?.lastCutAt ? <span className="hidden text-xs text-muted-foreground sm:inline">último corte {timeAgo(data.lastCutAt)}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={llenarMesa}
              disabled={!siguientes.length || mesa.length >= MAX_MESA}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
              title={`Abre hasta ${MAX_MESA} conversaciones a la vez`}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
              Llenar la mesa
            </button>
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
        </div>
        <SignalCounts counts={data?.counts ?? {}} active={kindFilter} onSelect={setKindFilter} />
      </header>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</div>
      ) : isLoading && !data ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando señales…
        </div>
      ) : contactos === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sin respuestas nuevas. Tocá “Barrer ahora” para revisar los mensajes entrantes.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(240px,300px)_1fr]">
          {/* La fila de espera. */}
          <div className={cn('flex min-h-0 flex-col gap-2 lg:overflow-y-auto lg:pr-1')}>
            <ul className="flex flex-col gap-2">{main.map(fila)}</ul>

            {folded.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/30">
                <button
                  type="button"
                  onClick={() => setFoldedOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={foldedOpen}
                >
                  {foldedOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                  Automáticas e irrelevantes ({folded.length})
                </button>
                {foldedOpen && <ul className="flex flex-col gap-2 p-2 pt-0">{folded.map(fila)}</ul>}
              </div>
            )}

            {(data?.muted?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-border bg-card p-3">
                <button
                  type="button"
                  onClick={() => setVerExcluidos((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden />
                  {verExcluidos ? 'Ocultar excluidos' : `Excluidos · ${data!.muted!.length}`}
                </button>
                {verExcluidos && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {data!.muted!.map((m) => (
                      <li key={m.chatId} className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs">
                        <button type="button" className="underline-offset-2 hover:underline" onClick={() => openChat(m.chatId)}>
                          {m.name}
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          title="Volver a incluir"
                          onClick={() => void incluir(m.chatId)}
                        >
                          <Undo2 className="h-3 w-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* La mesa. */}
          <MesaChats
            grupos={enMesa}
            activo={activo ?? enMesa[0]?.chatId ?? null}
            onActivo={setActivo}
            onCerrar={cerrar}
            onAtendido={atendido}
            onFicha={openChat}
            onSumar={llenarMesa}
            puedeSumar={siguientes.length > 0}
          />
        </div>
      )}
    </section>
  );
}
