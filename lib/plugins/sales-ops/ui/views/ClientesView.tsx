'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ACCOUNT_KINDS, ACCOUNT_TABS, type AccountKind, type AccountRow, type AccountTab, type AccountsListPayload, type Visibility } from '../../shared/accounts-types';
import { EmptyState, ErrorState, LoadingRows } from '../components/States';
import { fmtInt, panel } from '../components/format';
import { AccountRowItem } from '../clientes/AccountRowItem';
import { KIND_LABELS, TAB_LABELS, accountsUrl, fetchList, patchVisibility } from '../clientes/api';

const LS_KIND = 'sales-ops:clientes:kind';

const EMPTY_HINTS: Record<AccountTab, string> = {
  en_venta: 'Acá aparecen los que tienen una membresía activa y visible.',
  privadas: 'Marcá una membresía o un cliente como privado desde el menú ⋯ y va a aparecer acá.',
  vencidas: 'Los que tienen membresías vencidas y ninguna activa.',
  ocultas: 'Lo que ocultás desde el menú ⋯ queda acá, fuera del resto de las pestañas.',
  todas: 'Todavía no hay clientes cargados.',
};

/**
 * Lista paginada por offset. Cambiar kind/tab/búsqueda reinicia desde cero;
 * "Cargar más" acumula. Los conteos de las pestañas vienen con cada respuesta.
 */
function usePagedAccounts(url: string) {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<AccountsListPayload['counts'] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const load = useCallback(
    async (cursor: string | null, silent = false) => {
      const id = ++reqRef.current;
      if (cursor) setLoadingMore(true);
      else if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const payload = await fetchList(cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url);
        if (id !== reqRef.current) return;
        setRows((prev) => (cursor ? [...prev, ...payload.rows] : payload.rows));
        setTotal(payload.total);
        setCounts(payload.counts);
        setNextCursor(payload.nextCursor);
      } catch (e) {
        if (id !== reqRef.current) return;
        setError(e instanceof Error ? e.message : 'Error');
      } finally {
        if (id === reqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [url],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  return {
    rows,
    setRows,
    total,
    counts,
    nextCursor,
    loading,
    loadingMore,
    error,
    reload: () => load(null),
    refresh: () => load(null, true),
    loadMore: () => nextCursor && load(nextCursor),
  };
}

export function ClientesView({ onOpen }: { onOpen?: (chatId: number) => void }) {
  const [kind, setKind] = useState<AccountKind>('customers');
  const [tab, setTab] = useState<AccountTab>('en_venta');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LS_KIND);
      if (saved && (ACCOUNT_KINDS as readonly string[]).includes(saved)) setKind(saved as AccountKind);
    } catch {
      /* sin storage */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Cambiar de tipo o de pestaña cierra el acordeón: el detalle es de esa lista.
  useEffect(() => setOpenId(null), [kind, tab]);

  const url = useMemo(() => accountsUrl(kind, tab, qDebounced, null), [kind, tab, qDebounced]);
  const { rows, setRows, total, counts, nextCursor, loading, loadingMore, error, reload, refresh, loadMore } = usePagedAccounts(url);

  const cambiarKind = (next: AccountKind) => {
    setKind(next);
    try {
      window.localStorage.setItem(LS_KIND, next);
    } catch {
      /* sin storage */
    }
  };

  const toggle = useCallback((row: AccountRow) => setOpenId((prev) => (prev === row.id ? null : row.id)), []);

  /** Cambio optimista a nivel cliente/empresa: la fila se actualiza y después se refrescan conteos. */
  const cambiarVisibilidad = useCallback(
    async (row: AccountRow, next: Visibility) => {
      const previous = row.visibility;
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, visibility: next } : r)));
      try {
        await patchVisibility({ target: kind === 'customers' ? 'customer' : 'company', id: row.id, visibility: next });
        toast.success(next === 'visible' ? `${row.name}: visible otra vez` : next === 'private' ? `${row.name}: ${kind === 'customers' ? 'privado' : 'privada'}` : `${row.name}: ${kind === 'customers' ? 'oculto' : 'oculta'}`);
        void refresh();
      } catch (e) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, visibility: previous } : r)));
        toast.error(e instanceof Error ? e.message : 'No se pudo cambiar la visibilidad');
      }
    },
    [kind, setRows, refresh],
  );

  return (
    <div className="space-y-3">
      {/* Selector Clientes · Empresas + búsqueda */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="inline-flex shrink-0 rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Tipo de cuenta">
          {ACCOUNT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => cambiarKind(k)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={kind === 'customers' ? 'Buscar cliente, contacto, rubro o últimos dígitos' : 'Buscar empresa o contacto'}
            className="h-9 pl-8 pr-8 text-sm"
            aria-label="Buscar"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Limpiar búsqueda">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Pestañas con conteos */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max items-center gap-1 border-b border-border" role="tablist" aria-label="Pestañas">
          {ACCOUNT_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm transition-colors',
                tab === t ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABELS[t]}
              {counts && (
                <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', tab === t ? 'bg-primary/10 text-foreground' : 'bg-muted text-muted-foreground')}>
                  {fmtInt(counts[t])}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {loading ? 'Cargando…' : `${fmtInt(total)} ${kind === 'customers' ? (total === 1 ? 'cliente' : 'clientes') : total === 1 ? 'empresa' : 'empresas'}`}
          {!loading && rows.length < total && ` · mostrando ${fmtInt(rows.length)}`}
        </span>
        <span>{tab === 'en_venta' ? 'Con membresía activa y visible' : tab === 'ocultas' ? 'Sólo se ven acá' : ''}</span>
      </div>

      <div className={cn('rounded-xl border p-1', panel)}>
        {error ? (
          <ErrorState message={error} onRetry={reload} className="border-0 bg-transparent" />
        ) : loading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState
            className="border-0"
            title={qDebounced ? 'Nada coincide con la búsqueda' : `Nada en “${TAB_LABELS[tab]}”`}
            hint={qDebounced ? 'Probá con otro nombre o los últimos dígitos del teléfono.' : EMPTY_HINTS[tab]}
          />
        ) : (
          <div className="divide-y divide-border/50">
            {rows.map((row) => (
              <AccountRowItem
                key={`${row.kind}-${row.id}`}
                row={row}
                tab={tab}
                open={openId === row.id}
                onToggle={toggle}
                onVisibility={cambiarVisibilidad}
                onOpen={onOpen}
                onVisibilityChanged={refresh}
              />
            ))}
          </div>
        )}
        {!loading && !error && nextCursor && (
          <div className="p-2">
            <Button variant="outline" size="sm" className="w-full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Cargar más
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
