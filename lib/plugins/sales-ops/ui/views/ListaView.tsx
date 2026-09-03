'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, Building2, CalendarClock, CheckCheck, ChevronRight, CircleDot, ClipboardCheck, EyeOff, Inbox, LayoutList, Loader2, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

import type { AnalysisRow, ListPayload, ListQuery } from '../../shared/api-types';
import type { Vista } from '../components/vistas';
import { OWNER_LABELS } from '../components/format';
import type { Owner } from '../../shared/taxonomy';
import { GATES, NEEDS, OBJECTIONS, SOURCES, type Gate } from '../../shared/taxonomy';
import { ContactRow } from '../components/ContactRow';
import { ProgramadosDialog } from '../components/ProgramadosDialog';
import { GateBadge } from '../components/GateBadge';
import { FiltroGates } from '../components/FiltroGates';
import type { OwnerFilterValue } from '../components/OwnerFilter';
import { IgnoradosPanel, type ExclusionKind } from '../components/IgnoradosPanel';
import { EmptyState, ErrorState, LoadingRows } from '../components/States';
import { useEncolado } from '../components/eventos';
import { SALES_OPS_API, fetcher, fmtInt, humanize, panel } from '../components/format';
import { toast } from 'sonner';

export type ListaVista = NonNullable<ListQuery['vista']>;

const DEFAULT_SORT: Record<ListaVista, NonNullable<ListQuery['sort']>> = {
  dinero: 'priority',
  oportunidades: 'priority',
  barrido: 'age',
  limpieza: 'lastFollowup',
  todos: 'priority',
};

const SORT_LABELS: Record<NonNullable<ListQuery['sort']>, string> = {
  priority: 'Prioridad',
  age: 'Más recientes primero',
  lastFollowup: 'Último impacto',
  name: 'Nombre',
};

const AGE_LABELS: Record<NonNullable<ListQuery['ageBucket']>, string> = {
  lt7: '< 7 días',
  '7to30': '7–30 días',
  '30to90': '30–90 días',
  '90to180': '90–180 días',
  gt180: '> 180 días',
};

const FOLLOWUP_LABELS: Record<NonNullable<ListQuery['followups']>, string> = { '0': '0', '1': '1', '2': '2', '3plus': '3 o más' };

type Filters = Omit<ListQuery, 'vista' | 'owner' | 'q' | 'cursor' | 'limit'>;

type Props = {
  vista: ListaVista;
  /** Navegación entre vistas; la usa el atajo a Contactos dentro de Todos. */
  onNav?: (v: Vista) => void;
  /** Abre la ficha directamente en el chat del contacto. */
  onOpenChat?: (chatId: number) => void;
  owner: OwnerFilterValue;
  selectedChatId: number | null;
  onOpen: (chatId: number) => void;
  /**
   * Filtros que impone quien la embebe y la persona no puede sacar (la vista
   * Contactos la usa para separar auditados con y sin seguimiento).
   */
  extraFilters?: Filters;
  /**
   * La vista Contactos embebe esta lista con su propio corte (sin procesar /
   * auditados sin tocar / con seguimiento): ahí las pestañas de estado sobran y
   * se contradicen con el grupo elegido.
   */
  embebida?: boolean;
};

function buildUrl(vista: ListaVista, owner: OwnerFilterValue, q: string, filters: Filters, cursor: string | null): string {
  const p = new URLSearchParams();
  p.set('vista', vista);
  if (owner !== 'todos') p.set('owner', owner);
  if (q.trim()) p.set('q', q.trim());
  if (filters.gates?.length) p.set('gates', filters.gates.join(','));
  if (filters.status?.length) p.set('status', filters.status.join(','));
  if (filters.objection) p.set('objection', filters.objection);
  if (filters.need) p.set('need', filters.need);
  if (filters.source) p.set('source', filters.source);
  if (filters.ageBucket) p.set('ageBucket', filters.ageBucket);
  if (filters.followups) p.set('followups', filters.followups);
  if (filters.evidenceGap) p.set('evidenceGap', '1');
  if (filters.automationActive) p.set('automationActive', '1');
  if (filters.stale) p.set('stale', '1');
  if (filters.toReview) p.set('toReview', '1');
  if (filters.scheduled) p.set('scheduled', filters.scheduled);
  if (filters.followUp) p.set('followUp', filters.followUp);
  if (filters.queued) p.set('queued', filters.queued);
  if (filters.executed) p.set('executed', filters.executed);
  if (filters.sort) p.set('sort', filters.sort);
  p.set('limit', '50');
  if (cursor) p.set('cursor', cursor);
  return `${SALES_OPS_API}/contacts?${p.toString()}`;
}

function countActive(filters: Filters, vista: ListaVista): number {
  let n = 0;
  if (filters.gates?.length) n += 1;
  if (filters.objection) n += 1;
  if (filters.need) n += 1;
  if (filters.source) n += 1;
  if (filters.ageBucket) n += 1;
  if (filters.followups) n += 1;
  if (filters.evidenceGap) n += 1;
  if (filters.automationActive) n += 1;
  if (filters.stale) n += 1;
  if (filters.toReview) n += 1;
  if (filters.scheduled) n += 1;
  if (filters.followUp) n += 1;
  if (filters.sort && filters.sort !== DEFAULT_SORT[vista]) n += 1;
  return n;
}

/**
 * El estado de trabajo de cada contacto de la lista.
 *
 * Las cinco listas del embudo (Dinero, Oportunidades…) ya están en el rail
 * vertical: repetirlas en horizontal era el mismo menú dos veces. Lo que no
 * estaba a la vista es lo único que decide si hay algo para hacer con alguien:
 * si ya tiene algo en marcha o si sigue esperando que una persona lo mire.
 *
 * Abre en "Pendiente de verificación" a propósito: es la lista de trabajo. "En
 * cola" es para controlar lo que ya está por salir, no para trabajar.
 */
const ESTADOS_COLA: Array<{ key: 'con' | 'sin' | null; label: string; icon: typeof Inbox; hint: string }> = [
  { key: 'sin', label: 'Pendiente de verificación', icon: ClipboardCheck, hint: 'Nadie le puso nada en marcha: ni acción propuesta, ni prompt encolado, ni mensaje programado.' },
  { key: 'con', label: 'En cola', icon: Inbox, hint: 'Ya tiene algo esperando salir: una acción sin ejecutar, un prompt en la cola o un programado activo.' },
  { key: null, label: 'Todos', icon: LayoutList, hint: 'La lista completa, sin separar por estado de trabajo.' },
];

/**
 * Los tres estados de seguimiento, con los mismos íconos que la columna de
 * estado de cada fila: el punto hueco es "auditado y todavía sin tocar", el
 * doble tilde es "ya se le hizo algo".
 */
const SEGUIMIENTOS: Array<{ key: 'con' | 'sin' | null; label: string; icon: typeof Users }> = [
  { key: null, label: 'Todos', icon: Users },
  { key: 'sin', label: 'Sin tocar', icon: CircleDot },
  { key: 'con', label: 'Con seguimiento', icon: CheckCheck },
];

/**
 * Lista paginada por cursor. El primer request y los "Cargar más" comparten un
 * mismo estado acumulado; cambiar cualquier filtro reinicia desde cero.
 */
function usePagedList(url: string) {
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const load = useCallback(
    async (cursor: string | null) => {
      const id = ++reqRef.current;
      if (cursor) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const sep = url.includes('?') ? '&' : '?';
        const payload = await fetcher<ListPayload>(cursor ? `${url}${sep}cursor=${encodeURIComponent(cursor)}` : url);
        if (id !== reqRef.current) return;
        setRows((prev) => (cursor ? [...prev, ...payload.rows] : payload.rows));
        setTotal(payload.total);
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

  /**
   * Saca una fila sin volver a pedir la lista.
   *
   * Cuando a un contacto se le encola algo deja de pertenecer a "Pendiente de
   * verificación", y recargar entera la lista perdería el scroll y las páginas
   * ya traídas justo cuando la persona está barriendo de arriba a abajo.
   */
  const quitar = useCallback((chatId: number) => {
    setRows((prev) => {
      if (!prev.some((r) => r.chatId === chatId)) return prev;
      setTotal((t) => Math.max(0, t - 1));
      return prev.filter((r) => r.chatId !== chatId);
    });
  }, []);

  return { rows, total, nextCursor, loading, loadingMore, error, quitar, reload: () => load(null), loadMore: () => nextCursor && load(nextCursor) };
}

export function ListaView({ vista, owner, selectedChatId, onOpen, extraFilters, embebida, onNav, onOpenChat }: Props) {
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [programados, setProgramados] = useState<{ chatId: number; nombre: string } | null>(null);
  /**
   * Sub-grupo de Limpieza. `descartes` es la lista de siempre (pre-descarte y
   * GX); los otros tres son chats que ni siquiera son conversaciones de venta y
   * que el sistema ignora por completo, así que no comparten consulta con ella.
   */
  const [grupo, setGrupo] = useState<'descartes' | 'ejecutados' | ExclusionKind>('descartes');
  const [ignorando, setIgnorando] = useState(false);
  /** Pestaña de estado de trabajo. En la lista embebida no se usa. */
  const [cola, setCola] = useState<'con' | 'sin' | null>('sin');

  // Cambiar de vista limpia filtros secundarios y selección: son de esa lista.
  useEffect(() => {
    setFilters({});
    setSelected(new Set());
    setQ('');
    setQDebounced('');
    setGrupo('descartes');
    setCola('sin');
  }, [vista]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const url = useMemo(
    // Los `extraFilters` van al final: el modo de la vista manda sobre lo que
    // la persona elija en el panel de filtros.
    () =>
      // "Ejecutados" en Limpieza no es un corte de descartes: son todos los
      // contactos a los que les salió algo, con cualquier gate, y sin el filtro
      // de cola (la pregunta es "a quién ya le escribimos", no "quién está libre").
      vista === 'limpieza' && grupo === 'ejecutados'
        ? buildUrl('todos', owner, qDebounced, { ...filters, sort: filters.sort ?? 'lastFollowup', executed: 'con', ...extraFilters }, null)
        : buildUrl(
            vista,
            owner,
            qDebounced,
            { ...filters, sort: filters.sort ?? DEFAULT_SORT[vista], ...(embebida ? {} : { queued: cola ?? undefined }), ...extraFilters },
            null,
          ),
    [vista, owner, qDebounced, filters, extraFilters, embebida, cola, grupo],
  );
  const { rows, total, nextCursor, loading, loadingMore, error, quitar, reload, loadMore } = usePagedList(url);

  /**
   * Posponer o transferir desde la fila. Posponer lo saca de esta lista hasta
   * la fecha; transferir cambia el responsable, así que si la lista está
   * filtrada por responsable también se va.
   */
  const lead = useCallback(
    async (row: AnalysisRow, action: { kind: 'snooze'; days: number } | { kind: 'transfer'; owner: Owner } | { kind: 'unsnooze' }) => {
      try {
        const body = action.kind === 'snooze' ? { action: 'snooze', days: action.days } : action.kind === 'transfer' ? { action: 'transfer', owner: action.owner } : { action: 'unsnooze' };
        const res = await fetch(`/api/plugins/sales-ops/contacts/${row.chatId}/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? 'No se pudo');
        if (action.kind === 'snooze') {
          toast.success(`${row.name}: pospuesto ${action.days === 1 ? 'hasta mañana' : `${action.days} días`}.`);
          if (filters.snoozed !== 'con') quitar(row.chatId);
        } else if (action.kind === 'transfer') {
          toast.success(`${row.name}: transferido a ${OWNER_LABELS[action.owner]}.`);
          if (owner !== 'todos' && owner !== action.owner) quitar(row.chatId);
          else reload();
        } else {
          toast.success(`${row.name}: vuelve a las listas.`);
          reload();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo');
      }
    },
    [filters.snoozed, owner, quitar, reload],
  );

  // Encolar algo desde la ficha limpia la fila de "Pendiente de verificación";
  // en "En cola" es al revés (aparece), así que ahí se vuelve a pedir.
  useEncolado(
    useCallback(
      (chatId: number) => {
        if (embebida) return;
        if (cola === 'sin') quitar(chatId);
        else if (cola === 'con') reload();
      },
      // `reload` se recrea en cada render del hook: se lo deja fuera a propósito
      // y se lo llama por referencia estable dentro del efecto del evento.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [embebida, cola, quitar],
    ),
  );

  const activeFilters = countActive(filters, vista);
  const selectable = vista === 'barrido' || vista === 'limpieza' || vista === 'todos';

  const toggle = useCallback((chatId: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(chatId);
      else next.delete(chatId);
      return next;
    });
  }, []);

  /**
   * Marca los seleccionados como "no comerciales".
   *
   * No es un borrado: los saca del circuito (listas, radar, clasificador, cola
   * de audios) y limpia lo que tuvieran encolado, pero conserva el análisis para
   * que devolverlos sea un clic. Por eso el aviso cuenta qué se limpió: marcar
   * cinco chats internos suele sacar cientos de audios de la cola.
   */
  const ignorar = async (kind: ExclusionKind) => {
    const chatIds = [...selected];
    if (!chatIds.length) return;
    setIgnorando(true);
    try {
      const res = await fetch(`${SALES_OPS_API}/exclusions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatIds, kind }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      const extra = [
        body.audiosRemoved ? `${body.audiosRemoved} audios fuera de la cola` : null,
        body.signalsRemoved ? `${body.signalsRemoved} señales descartadas` : null,
      ].filter(Boolean);
      toast.success(`${body.excluded} chats ignorados${extra.length ? ` · ${extra.join(' · ')}` : ''}.`);
      setSelected(new Set());
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron ignorar los chats.');
    } finally {
      setIgnorando(false);
    }
  };

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.chatId));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(prev);
      for (const r of rows) next.add(r.chatId);
      return next;
    });
  };

  const GRUPOS: Array<{ key: 'descartes' | 'ejecutados' | ExclusionKind; label: string }> = [
    { key: 'descartes', label: 'Descartes' },
    { key: 'ejecutados', label: 'Ejecutados' },
    { key: 'personal', label: 'Personal' },
    { key: 'equipo', label: 'Equipo' },
    { key: 'otros', label: 'Otros' },
  ];

  return (
    <div className="relative space-y-3">
      {!embebida && (
        <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ESTADOS_COLA.map(({ key, label, icon: Icon, hint }) => (
            <button
              key={label}
              type="button"
              title={hint}
              onClick={() => setCola(key)}
              aria-pressed={cola === key}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors',
                cola === key ? 'border-transparent bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Las etapas, a la vista y no enterradas en el panel de filtros. */}
      <FiltroGates seleccionados={filters.gates} onChange={(gates) => setFilters((f) => ({ ...f, gates }))} className="pb-0.5" />

      {/* Contactos / Clientes ya no está en el menú: es un corte de esta misma lista, así que se llega desde acá. */}
      {vista === 'todos' && !embebida && onNav && (
        <button
          type="button"
          onClick={() => onNav('clientes')}
          className="flex w-fit items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Building2 className="size-3.5" aria-hidden />
          Contactos y Clientes por grupos
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
      )}

      {/* Limpieza junta dos cosas distintas: los que se descartan por comerciales
          (GX, pre-descarte) y los que nunca fueron una venta. Separarlas evita
          que el chat de la familia se lea como un lead perdido. */}
      {vista === 'limpieza' && (
        <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {GRUPOS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setGrupo(key)}
              aria-pressed={grupo === key}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors',
                grupo === key ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {vista === 'limpieza' && grupo === 'ejecutados' && (
        <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Contactos a los que ya les salió una acción del Command Center. Al ejecutarse, su análisis queda marcado como viejo: el próximo pase del clasificador los vuelve a auditar con nuestro mensaje encima y, si vuelven a merecer una acción, entran solos en las listas y en un lote nuevo pasado el enfriamiento de envíos. Para reintentar antes, proponé desde la ficha.
        </p>
      )}

      {vista === 'limpieza' && grupo !== 'descartes' && grupo !== 'ejecutados' ? (
        <IgnoradosPanel kind={grupo} onChanged={reload} />
      ) : (
      <>
      {/* Separar por seguimiento en cualquier lista, no sólo en Contactos: en
          Dinero o en Oportunidades el que ya se contestó y el recién auditado
          se veían mezclados, y alguien volvía a trabajar el que ya estaba en
          curso. Cuando la vista que embebe ya impone el filtro (Contactos) no
          se dibuja: sería un control que contradice a su propio grupo. */}
      {!extraFilters?.followUp && (
        <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SEGUIMIENTOS.map(({ key, label, icon: Icon }) => {
            const activo = (filters.followUp ?? null) === key;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, followUp: key ?? undefined }))}
                aria-pressed={activo}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors',
                  activo ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, snoozed: f.snoozed === 'con' ? undefined : 'con' }))}
            aria-pressed={filters.snoozed === 'con'}
            className={cn(
              'ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors',
              filters.snoozed === 'con' ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            title="Los pospuestos no aparecen en las listas hasta su fecha"
          >
            <AlarmClock className="size-3.5" aria-hidden />
            Pospuestos
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o últimos dígitos"
            className="h-9 pl-8 pr-8 text-sm"
            aria-label="Buscar"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Limpiar búsqueda">
              <X className="size-4" />
            </button>
          )}
        </div>
        {/* Los que ya tienen algo por salir: escribirles encima es el error que
            más caro sale, y estaba a tres toques dentro del panel de filtros. */}
        <Button
          variant={filters.scheduled === 'con' ? 'default' : 'outline'}
          size="sm"
          className="h-9 shrink-0 px-3"
          aria-pressed={filters.scheduled === 'con'}
          title={filters.scheduled === 'con' ? 'Mostrando sólo los que tienen mensajes programados' : 'Ver sólo los que tienen mensajes programados'}
          onClick={() => setFilters((f) => ({ ...f, scheduled: f.scheduled === 'con' ? undefined : 'con' }))}
        >
          <CalendarClock className="size-4" aria-hidden />
          <span className="sr-only">Con mensajes programados</span>
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 px-3" onClick={() => setSheetOpen(true)}>
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">Filtros</span>
          {activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{activeFilters}</span>}
        </Button>
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          {selectable && rows.length > 0 && (
            <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Seleccionar todos los visibles" />
          )}
          <span className="tabular-nums">
            {loading ? 'Cargando…' : `${fmtInt(total)} ${total === 1 ? 'chat' : 'chats'}`}
            {!loading && rows.length < total && ` · mostrando ${fmtInt(rows.length)}`}
          </span>
        </span>
        <span>{SORT_LABELS[filters.sort ?? DEFAULT_SORT[vista]]}</span>
      </div>

      <div className={cn('rounded-xl border p-1', panel)}>
        {error ? (
          <ErrorState message={error} onRetry={reload} className="border-0 bg-transparent" />
        ) : loading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState
            className="border-0"
            title={qDebounced || activeFilters ? 'Nada coincide con la búsqueda' : 'Todavía no hay chats analizados'}
            hint={qDebounced || activeFilters ? 'Probá con otros filtros.' : undefined}
          />
        ) : (
          <div className="divide-y divide-border/50">
            {rows.map((row) => (
              <ContactRow
                key={row.id}
                row={row}
                selectable={selectable}
                selected={selected.has(row.chatId)}
                active={row.chatId === selectedChatId}
                onOpen={onOpen}
                onToggle={toggle}
                onProgramados={(r) => setProgramados({ chatId: r.chatId, nombre: r.name })}
                onChat={onOpenChat}
                onLead={lead}
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

      {selected.size > 0 && (
        <div className="sticky bottom-2 z-20 flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <span className="text-sm font-medium tabular-nums">
            {fmtInt(selected.size)} {selected.size === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelected(new Set())}>
              Limpiar
            </Button>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">Ignorar como</span>
            {(['personal', 'equipo', 'otros'] as ExclusionKind[]).map((kind) => (
              <Button
                key={kind}
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs capitalize"
                disabled={ignorando}
                onClick={() => void ignorar(kind)}
              >
                {ignorando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                {kind}
              </Button>
            ))}
          </div>
        </div>
      )}

      </>
      )}

      <FiltersSheet open={sheetOpen} onOpenChange={setSheetOpen} vista={vista} filters={filters} onChange={setFilters} />

      <ProgramadosDialog
        chatId={programados?.chatId ?? null}
        nombre={programados?.nombre ?? ''}
        onClose={() => setProgramados(null)}
        // Crear o borrar cambia el icono de la fila: la lista se vuelve a pedir.
        onCambio={reload}
      />
    </div>
  );
}

// ── Filtros secundarios ─────────────────────────────────────────────────────

function FiltersSheet({
  open,
  onOpenChange,
  vista,
  filters,
  onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vista: ListaVista;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  const toggleGate = (g: Gate) => {
    const current = filters.gates ?? [];
    const next = current.includes(g) ? current.filter((x) => x !== g) : [...current, g];
    set('gates', next.length ? next : undefined);
  };
  const ANY = '__any__';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-lg">
        <SheetHeader className="px-0">
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Recortan la lista actual. Se limpian al cambiar de vista.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <FilterGroup label="Gate">
            <div className="flex flex-wrap gap-1.5">
              {GATES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGate(g)}
                  aria-pressed={filters.gates?.includes(g) ?? false}
                  className={cn('rounded-md ring-offset-background transition-shadow', filters.gates?.includes(g) && 'ring-2 ring-primary ring-offset-1')}
                >
                  <GateBadge gate={g} />
                </button>
              ))}
            </div>
          </FilterGroup>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FilterGroup label="Orden">
              <Select value={filters.sort ?? DEFAULT_SORT[vista]} onValueChange={(v) => set('sort', v as Filters['sort'])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as Array<NonNullable<ListQuery['sort']>>).map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{SORT_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterGroup>
            <FilterGroup label="Antigüedad">
              <Select value={filters.ageBucket ?? ANY} onValueChange={(v) => set('ageBucket', v === ANY ? undefined : (v as Filters['ageBucket']))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY} className="text-xs">Cualquiera</SelectItem>
                  {(Object.keys(AGE_LABELS) as Array<NonNullable<ListQuery['ageBucket']>>).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">{AGE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterGroup>
            <FilterGroup label="Objeción">
              <Select value={filters.objection ?? ANY} onValueChange={(v) => set('objection', v === ANY ? undefined : (v as Filters['objection']))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY} className="text-xs">Cualquiera</SelectItem>
                  {OBJECTIONS.map((o) => (
                    <SelectItem key={o} value={o} className="text-xs">{humanize(o)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterGroup>
            <FilterGroup label="Necesidad">
              <Select value={filters.need ?? ANY} onValueChange={(v) => set('need', v === ANY ? undefined : (v as Filters['need']))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY} className="text-xs">Cualquiera</SelectItem>
                  {NEEDS.map((o) => (
                    <SelectItem key={o} value={o} className="text-xs">{humanize(o)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterGroup>
            <FilterGroup label="Origen">
              <Select value={filters.source ?? ANY} onValueChange={(v) => set('source', v === ANY ? undefined : (v as Filters['source']))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY} className="text-xs">Cualquiera</SelectItem>
                  {SOURCES.map((o) => (
                    <SelectItem key={o} value={o} className="text-xs">{humanize(o)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterGroup>
            <FilterGroup label="Impactos previos">
              <Select value={filters.followups ?? ANY} onValueChange={(v) => set('followups', v === ANY ? undefined : (v as Filters['followups']))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY} className="text-xs">Cualquiera</SelectItem>
                  {(Object.keys(FOLLOWUP_LABELS) as Array<NonNullable<ListQuery['followups']>>).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">{FOLLOWUP_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterGroup>
          </div>

          <FilterGroup label="Marcas">
            <div className="grid grid-cols-2 gap-2">
              <CheckRow label="Hueco de evidencia" checked={Boolean(filters.evidenceGap)} onChange={(v) => set('evidenceGap', v || undefined)} />
              <CheckRow label="Automatización activa" checked={Boolean(filters.automationActive)} onChange={(v) => set('automationActive', v || undefined)} />
              <CheckRow label="Desactualizado" checked={Boolean(filters.stale)} onChange={(v) => set('stale', v || undefined)} />
              <CheckRow label="Para revisar (< 55)" checked={Boolean(filters.toReview)} onChange={(v) => set('toReview', v || undefined)} />
            </div>
          </FilterGroup>

          {/* Antes había que abrir chat por chat para saber si a alguien ya le
              va a salir un mensaje nuestro: se le escribía encima sin saberlo. */}
          <FilterGroup label="Mensajes programados">
            <div className="flex gap-1">
              {([
                { value: undefined, label: 'Todos' },
                { value: 'con' as const, label: 'Con programados' },
                { value: 'sin' as const, label: 'Sin programados' },
              ]).map((opcion) => (
                <button
                  key={opcion.label}
                  type="button"
                  onClick={() => set('scheduled', opcion.value)}
                  aria-pressed={filters.scheduled === opcion.value}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    filters.scheduled === opcion.value ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {opcion.label}
                </button>
              ))}
            </div>
          </FilterGroup>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => onChange({})}>
              Limpiar filtros
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Aplicar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  );
}
