'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { HelpCircle, Inbox, ListChecks, Loader2, Settings2, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { surfaceCard } from '../tokens';
import {
  COMMAND_ITEM_KINDS,
  type BatchResponse,
  type BatchResultRow,
  type CommandCenterPayload,
  type CommandItem,
  type CommandItemKind,
  type PlannedAction,
} from '@/lib/desktop/command-center/types';
import { useCommandPlan } from './useCommandPlan';
import { CommandItemRow } from './CommandItemRow';
import { ReviewDialog } from './ReviewDialog';
import { ResultDialog } from './ResultDialog';
import { OperationsAiChat } from '@/components/operations-ai/OperationsAiChat';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

const ENDPOINT = '/api/escritorio/bandeja';
const SUGGESTION_BATCH = 6;

/** uuid del navegador con respaldo: el `batchId` sostiene la idempotencia. */
function newBatchId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function CommandCenter() {
  const t = useTranslations('DesktopOperations');
  const { data, isLoading, mutate } = useSWR<CommandCenterPayload>(ENDPOINT, fetcher, {
    refreshInterval: 60_000,
  });

  const [filter, setFilter] = useState<CommandItemKind | 'all'>('all');
  const [suggested, setSuggested] = useState<Record<string, CommandItem['suggestions']>>({});
  const [states, setStates] = useState<Record<string, { state: CommandItem['suggestionsState']; reason?: CommandItem['suggestionsReason'] }>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [results, setResults] = useState<BatchResultRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [batchId, setBatchId] = useState(newBatchId);
  const abortRef = useRef<AbortController | null>(null);
  const askedRef = useRef<Set<string>>(new Set());

  // Las sugerencias llegan en segunda fase: la bandeja pinta primero y no queda
  // atada a la latencia del modelo.
  const baseItems = data?.items ?? [];
  const items = useMemo(
    () =>
      baseItems.map((item) => {
        const bundle = states[item.id];
        return {
          ...item,
          suggestions: suggested[item.id] ?? item.suggestions,
          suggestionsState: bundle?.state ?? item.suggestionsState,
          suggestionsReason: bundle?.reason ?? item.suggestionsReason,
        };
      }),
    [baseItems, suggested, states],
  );

  const plan = useCommandPlan(items);
  const { selectionMode, setSelectionMode, selected, executable, itemsById } = plan;

  const visible = useMemo(
    () => items.filter((item) => filter === 'all' || item.kind === filter),
    [items, filter],
  );

  const askSuggestions = useCallback(async (ids: string[]) => {
    const pending = ids.filter((id) => !askedRef.current.has(id));
    if (!pending.length) return;
    for (const id of pending) askedRef.current.add(id);
    setStates((current) => {
      const next = { ...current };
      for (const id of pending) next[id] = { state: 'loading' };
      return next;
    });
    try {
      const response = await fetch('/api/escritorio/bandeja/sugerencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: pending }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const payload = (await response.json()) as {
        suggestions: Record<string, { suggestions: CommandItem['suggestions']; state: CommandItem['suggestionsState']; reason?: CommandItem['suggestionsReason'] }>;
      };
      setSuggested((current) => {
        const next = { ...current };
        for (const [id, bundle] of Object.entries(payload.suggestions ?? {})) next[id] = bundle.suggestions ?? [];
        return next;
      });
      setStates((current) => {
        const next = { ...current };
        for (const id of pending) {
          const bundle = payload.suggestions?.[id];
          next[id] = bundle ? { state: bundle.state, reason: bundle.reason } : { state: 'unavailable', reason: 'error' };
          // Una fila que quedó "loading" porque otro request la reservó se puede
          // volver a pedir en el próximo ciclo.
          if (bundle?.state === 'loading') askedRef.current.delete(id);
        }
        return next;
      });
    } catch {
      setStates((current) => {
        const next = { ...current };
        for (const id of pending) next[id] = { state: 'unavailable', reason: 'error' };
        return next;
      });
      for (const id of pending) askedRef.current.delete(id);
    }
  }, []);

  // Respuestas y tareas, en tandas: pedir sugerencias para 30
  // ítems de una es pagarle al modelo 30 veces por una pantalla que el usuario
  // apenas mira.
  useEffect(() => {
    const candidates = visible
      .filter((item) => (item.reply || (item.kind === 'task' && item.actions.length > 0)) && item.suggestionsState === 'idle')
      .slice(0, SUGGESTION_BATCH)
      .map((item) => item.id);
    if (candidates.length) void askSuggestions(candidates);
  }, [visible, askSuggestions]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  /**
   * Los reversibles van en un request; los envíos, de a uno y en serie. Ese es
   * el único "deshacer" que existe para algo irreversible: los mensajes que
   * todavía no salieron.
   */
  const execute = async (entries: PlannedAction[]) => {
    if (!data || running || !entries.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setSentCount(0);

    const collected: BatchResultRow[] = [];
    const reversible = entries.filter((entry) => entry.action.type !== 'send-message');
    const sends = entries.filter((entry) => entry.action.type === 'send-message');

    const post = async (actions: PlannedAction[]) => {
      const response = await fetch('/api/escritorio/bandeja/ejecutar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: data.teamId, batchId, confirm: 'EJECUTAR', actions }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          results: actions.map((entry) => ({ itemId: entry.itemId, ok: false, error: 'invalid' as const })),
        } as BatchResponse;
      }
      return (await response.json()) as BatchResponse;
    };

    try {
      if (reversible.length) collected.push(...(await post(reversible)).results);
      for (const entry of sends) {
        if (controller.signal.aborted) break;
        collected.push(...(await post([entry])).results);
        setSentCount((current) => current + 1);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        collected.push(
          ...entries
            .filter((entry) => !collected.some((row) => row.itemId === entry.itemId))
            .map((entry) => ({ itemId: entry.itemId, ok: false, error: 'invalid' as const })),
        );
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setReviewOpen(false);
      setResults(collected);
      plan.clearOk(collected.filter((row) => row.ok).map((row) => row.itemId));
      void mutate();
      askedRef.current = new Set();
    }
  };

  const counts = data?.counts ?? (Object.fromEntries(COMMAND_ITEM_KINDS.map((kind) => [kind, 0])) as Record<CommandItemKind, number>);
  const visibleIds = visible.map((item) => item.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label={t('command.filters.all')} count={data?.totals.pending ?? 0} />
        {COMMAND_ITEM_KINDS.map((kind) => (
          <FilterPill
            key={kind}
            active={filter === kind}
            onClick={() => setFilter(kind)}
            label={t(`command.kinds.${kind}`)}
            count={counts[kind] ?? 0}
          />
        ))}
        {/* La ayuda explica qué junta esta bandeja y qué se le puede pedir a la
            IA por los conectores. Sin una puerta acá, la página existe y nadie
            la encuentra. */}
        <Link
          href="/docs/centro-de-comandos"
          title={t('command.helpLinkTitle')}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
        >
          <HelpCircle className="size-3.5" aria-hidden />
          {t('command.helpLink')}
        </Link>
      </div>

      {data && !data.capabilities.aiReady && (
        <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/40 p-3 text-sm">
          <Settings2 className="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden />
          <p className="text-muted-foreground">
            {t('command.aiOff')}{' '}
            <Link href="/settings/ai" className="font-medium text-primary hover:underline">
              {t('command.aiOffLink')}
            </Link>
          </p>
        </div>
      )}

      <Card className={cn('overflow-hidden', surfaceCard)}>
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={allVisibleSelected} onCheckedChange={() => plan.toggleVisible(visibleIds)} />
              {t('command.selectVisible')}
            </label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('command.showing', { shown: visible.length, total: data?.totals.pending ?? visible.length })}
            </span>
          </div>

          {isLoading && !data ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <Inbox className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">{t('command.empty.title')}</p>
              <p className="text-sm text-muted-foreground">{t('command.empty.hint')}</p>
            </div>
          ) : (
            <div>
              {visible.map((item) => (
                <CommandItemRow
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  plannedAction={plan.plan.get(item.id)?.action ?? null}
                  aiReady={!!data?.capabilities.aiReady}
                  onToggle={() => {
                    plan.toggleSelected(item.id);
                    setSelectionMode(true);
                  }}
                  onPlan={(action) => plan.planAction(item.id, action)}
                />
              ))}
            </div>
          )}

          {(selectionMode || selected.size > 0) && (
            <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border/40 bg-white/90 px-4 py-3 backdrop-blur-sm dark:bg-card/90">
              <div className="flex items-center gap-3">
                {/* La X va siempre, aunque no haya nada seleccionado: si la barra
                    se desmonta al deseleccionar, el usuario queda atrapado. */}
                <Button type="button" variant="ghost" size="icon" onClick={plan.clear} aria-label={t('command.exitSelection')}>
                  <X className="size-4" aria-hidden />
                </Button>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium tabular-nums text-primary">
                  {t('command.selectedCount', { count: selected.size })}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {t('command.plannedCount', { count: executable.length })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {running && (
                  <Button type="button" variant="destructive" size="sm" onClick={stop} className="gap-1.5">
                    <Square className="size-3.5" aria-hidden />
                    {t('command.stop')}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={!executable.length || running}
                  onClick={() => {
                    setBatchId(newBatchId());
                    setReviewOpen(true);
                  }}
                >
                  {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ListChecks className="size-4" aria-hidden />}
                  {t('command.reviewAndRun', { count: executable.length })}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {data && (
        <ReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          plan={executable}
          itemsById={itemsById}
          teamId={data.teamId}
          batchId={batchId}
          running={running}
          sentCount={sentCount}
          onStop={stop}
          onEditText={(itemId, text) => {
            const entry = plan.plan.get(itemId);
            if (entry?.action.type === 'send-message') {
              plan.planAction(itemId, { ...entry.action, text, source: 'custom', suggestionId: null });
            }
          }}
          onConfirm={() => void execute(executable)}
        />
      )}

      <ResultDialog
        open={!!results}
        onOpenChange={(open) => !open && setResults(null)}
        results={results ?? []}
        itemsById={itemsById}
        onRetry={(itemIds) => {
          const retry = executable.filter((entry) => itemIds.includes(entry.itemId));
          setResults(null);
          // Mismo `batchId`: un reintento no puede duplicar lo que sí salió.
          void execute(retry);
        }}
      />
      <OperationsAiChat surface="command-center" />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border/60 bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
