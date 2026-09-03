'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import useSWR from 'swr';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  Blocks,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Columns3,
  Factory,
  ImageIcon,
  Info,
  LayoutDashboard,
  List,
  Loader2,
  NotebookPen,
  Play,
  RefreshCw,
  Rows3,
  Star,
  Table2,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  AppActionDefinition,
  AppBlockDefinition,
  ResolvedAppMakerView,
} from '../shared/contract';
import { getAppMakerDesignTemplate } from '../shared/design-templates';
import './app-maker.css';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Error ${response.status}`);
  return body;
};

const ICONS: Record<string, LucideIcon> = {
  Blocks,
  BriefcaseBusiness,
  Columns3,
  Factory,
  LayoutDashboard,
  List,
  NotebookPen,
  Rows3,
  Table2,
  Users,
};

const ACCENTS = {
  emerald: { solid: 'bg-emerald-600 text-white', soft: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-500/30' },
  blue: { solid: 'bg-blue-600 text-white', soft: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', ring: 'ring-blue-500/30' },
  violet: { solid: 'bg-violet-600 text-white', soft: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', ring: 'ring-violet-500/30' },
  rose: { solid: 'bg-rose-600 text-white', soft: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', ring: 'ring-rose-500/30' },
  amber: { solid: 'bg-amber-600 text-white', soft: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', ring: 'ring-amber-500/30' },
  slate: { solid: 'bg-slate-700 text-white', soft: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', ring: 'ring-slate-500/30' },
} as const;
type AccentStyle = { solid: string; soft: string; ring: string };

/** Hexadecimales del acento para los templates que derivan --primary del tema de la app. */
const ACCENT_HEX = {
  emerald: { light: '#059669', dark: '#34d399' },
  blue: { light: '#2563eb', dark: '#60a5fa' },
  violet: { light: '#7c3aed', dark: '#a78bfa' },
  rose: { light: '#e11d48', dark: '#fb7185' },
  amber: { light: '#d97706', dark: '#fbbf24' },
  slate: { light: '#475569', dark: '#94a3b8' },
} as const;

const MD_SPAN: Record<number, string> = {
  1: 'md:col-span-1', 2: 'md:col-span-2', 3: 'md:col-span-3', 4: 'md:col-span-4',
  5: 'md:col-span-5', 6: 'md:col-span-6', 7: 'md:col-span-7', 8: 'md:col-span-8',
  9: 'md:col-span-9', 10: 'md:col-span-10', 11: 'md:col-span-11', 12: 'md:col-span-12',
};

const FILE_FIELD_TYPES = new Set(['file', 'image', 'audio', 'video']);

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function icon(name?: string, fallback: LucideIcon = Blocks) {
  return name ? ICONS[name] ?? fallback : fallback;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString();
  }
  return String(value);
}

function metricValue(block: AppBlockDefinition, rows: Array<Record<string, unknown>>) {
  const metric = block.metric ?? { operation: 'count' as const, format: 'number' as const };
  if (metric.operation === 'count') return rows.length;
  const values = rows.map((row) => Number(row[metric.field ?? ''])).filter(Number.isFinite);
  if (!values.length) return 0;
  if (metric.operation === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (metric.operation === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (metric.operation === 'min') return Math.min(...values);
  return Math.max(...values);
}

function formatMetric(block: AppBlockDefinition, value: number) {
  const format = block.metric?.format ?? 'number';
  if (format === 'currency') return new Intl.NumberFormat(undefined, { style: 'currency', currency: block.metric?.currency ?? 'USD' }).format(value);
  if (format === 'percent') return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

export function AppMakerRuntime({ slug, draft = false, embedded = false }: { slug: string; draft?: boolean; embedded?: boolean }) {
  const [view, setView] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | undefined>();
  const query = new URLSearchParams();
  if (draft) query.set('draft', '1');
  if (view) query.set('view', view);
  const url = `/api/plugins/app-maker/resolve/${encodeURIComponent(slug)}?${query.toString()}`;
  const { data, error, isLoading, mutate } = useSWR<ResolvedAppMakerView>(url, fetcher, { keepPreviousData: true });

  if (isLoading && !data) return <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando aplicación…</div>;
  if (error && !data) return (
    <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="mx-auto size-5 text-destructive" />
      <p className="mt-2 text-sm font-semibold">No se pudo abrir la aplicación</p>
      <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={() => void mutate()}><RefreshCw className="size-4" /> Reintentar</Button>
    </div>
  );
  if (!data) return null;

  const design = getAppMakerDesignTemplate(data.app.design.template);
  const accent = design.usesThemeAccent
    ? ACCENTS[data.app.theme.accent]
    : { solid: 'bg-primary text-primary-foreground', soft: 'bg-accent text-accent-foreground', ring: 'ring-ring/30' };
  const accentHex = ACCENT_HEX[data.app.theme.accent] ?? ACCENT_HEX.emerald;
  const designStyle = {
    ...design.runtime.variables,
    '--am-accent': accentHex.light,
    '--am-accent-dark': accentHex.dark,
    fontFamily: design.runtime.fontFamily,
  } as CSSProperties;
  const views = data.definition.views;
  const nav = data.definition.navigation;
  const sidebar = nav.desktop === 'sidebar' || nav.desktop === 'hybrid';

  const navigation = (
    <nav className={cn(
      'gap-2',
      sidebar ? 'hidden w-60 shrink-0 flex-col border-r p-3 md:flex' : 'flex overflow-x-auto border-b px-3 py-2',
      design.runtime.navigationClassName,
    )} aria-label={`Vistas de ${data.app.name}`}>
      {views.map((item) => {
        const Icon = icon(item.icon);
        const active = item.slug === data.activeView.slug;
        return (
          <button key={item.slug} type="button" onClick={() => setView(item.slug)} className={cn(
            'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
            active ? accent.solid : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )} aria-current={active ? 'page' : undefined}>
            <Icon className="size-4" />
            <span>{item.name}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div style={designStyle} className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground', design.runtime.rootClassName, embedded ? 'h-[720px] rounded-xl border' : 'h-screen')}>
      <header className={cn('flex shrink-0 items-center gap-3 border-b px-4 py-3', design.runtime.headerClassName)}>
        {!embedded && <a href="/plugins/app-maker" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Volver a APP MAKER"><ArrowLeft className="size-4" /></a>}
        <span className={cn('flex size-10 items-center justify-center rounded-xl', accent.soft)}>{(() => { const Icon = icon(data.app.icon); return <Icon className="size-5" />; })()}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h1 className="truncate text-base font-bold">{data.app.name}</h1>{draft && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">PREVIEW</span>}</div>
          <p className="truncate text-xs text-muted-foreground">{data.app.description || data.app.category}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void mutate()} aria-label="Actualizar"><RefreshCw className="size-4" /></Button>
      </header>

      {!sidebar && navigation}
      <div className="flex min-h-0 flex-1">
        {sidebar && navigation}
        <main className="min-w-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-5 md:pb-5">
          <div className="mx-auto max-w-7xl space-y-5">
            <div>
              <h2 className="text-xl font-bold">{data.activeView.name}</h2>
              {data.activeView.description && <p className="mt-1 text-sm text-muted-foreground">{data.activeView.description}</p>}
            </div>
            {data.activeView.sections.map((section) => (
              <section key={section.id} className="space-y-3">
                {(section.title || section.description) && <div><h3 className="text-sm font-semibold">{section.title}</h3>{section.description && <p className="text-xs text-muted-foreground">{section.description}</p>}</div>}
                <div className={cn('grid grid-cols-1 gap-3 md:grid-cols-12', section.layout === 'stack' && 'md:grid-cols-1')}>
                  {[...section.blocks].filter((block) => !block.hidden).sort((a, b) => a.mobilePriority - b.mobilePriority).map((block) => (
                    <div key={block.id} className={section.layout === 'stack' ? '' : MD_SPAN[block.grid.desktop] ?? MD_SPAN[6]}>
                      <RuntimeBlock block={block} app={data} refresh={() => void mutate()} accent={accent} cardClassName={design.runtime.cardClassName} draft={draft} selected={selected} onSelect={setSelected} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>

      <nav className="absolute inset-x-0 bottom-0 z-30 flex justify-around border-t bg-background/95 p-2 backdrop-blur md:hidden" aria-label="Navegación móvil">
        {views.slice(0, 5).map((item) => {
          const Icon = icon(item.icon);
          const active = item.slug === data.activeView.slug;
          return <button key={item.slug} type="button" onClick={() => setView(item.slug)} className={cn('flex min-w-16 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px]', active ? accent.soft : 'text-muted-foreground')}><Icon className="size-4" /><span className="max-w-20 truncate">{item.name}</span></button>;
        })}
      </nav>
    </div>
  );
}

function RuntimeBlock({
  block,
  app,
  refresh,
  accent,
  cardClassName,
  draft,
  selected,
  onSelect,
}: {
  block: AppBlockDefinition;
  app: ResolvedAppMakerView;
  refresh: () => void;
  accent: AccentStyle;
  cardClassName: string;
  draft: boolean;
  selected?: Record<string, unknown>;
  onSelect: (row: Record<string, unknown>) => void;
}) {
  const source = block.dataSource ? app.data[block.dataSource] : undefined;
  const rows = source?.rows ?? [];
  const fields = block.fields?.length ? block.fields : Object.keys(rows[0] ?? {}).slice(0, 6);
  const actions = (block.actions ?? []).map((key) => app.actions.find((action) => action.key === key)).filter((action): action is AppActionDefinition => Boolean(action));
  const recordActions = actions.filter((action) => action.scope === 'record');
  const blockActions = actions.filter((action) => action.scope !== 'record');
  const formAction = block.action ? app.actions.find((action) => action.key === block.action) : undefined;

  return (
    <article className={cn('h-full overflow-hidden border bg-card text-card-foreground', cardClassName, block.sticky && 'md:sticky md:top-3')}>
      {(block.title || block.description) && <header className="border-b px-4 py-3"><h4 className="text-sm font-semibold">{block.title}</h4>{block.description && <p className="mt-0.5 text-xs text-muted-foreground">{block.description}</p>}</header>}
      <div className="p-4">
        {source?.error ? <p className="flex items-center gap-2 text-xs text-destructive"><AlertTriangle className="size-4" /> {source.error}</p> : null}
        {!source?.error && block.type === 'metric' && <div><p className="text-3xl font-bold tracking-tight">{formatMetric(block, metricValue(block, rows))}</p><p className="mt-1 text-xs text-muted-foreground">Hasta {displayValue(source?.meta?.perPage ?? rows.length)} registros recientes</p></div>}
        {!source?.error && block.type === 'table' && <DataTable rows={rows} fields={fields} actions={recordActions} appSlug={app.app.slug} refresh={refresh} draft={draft} selected={selected} onSelect={onSelect} />}
        {!source?.error && block.type === 'list' && <DataList rows={rows} fields={fields} actions={recordActions} appSlug={app.app.slug} refresh={refresh} draft={draft} selected={selected} onSelect={onSelect} />}
        {!source?.error && block.type === 'detail' && <Detail data={rows[0]} fields={fields} actions={recordActions} appSlug={app.app.slug} refresh={refresh} draft={draft} onSelect={onSelect} />}
        {!source?.error && block.type === 'kanban' && <Kanban rows={rows} fields={fields} groupBy={block.groupBy ?? 'status'} actions={recordActions} appSlug={app.app.slug} refresh={refresh} draft={draft} selected={selected} onSelect={onSelect} />}
        {!source?.error && block.type === 'chart' && block.chart && <DataChart rows={rows} config={block.chart} />}
        {!source?.error && block.type === 'progress' && block.progress && <ProgressList rows={rows} config={block.progress} />}
        {!source?.error && block.type === 'timeline' && block.timeline && <Timeline rows={rows} config={block.timeline} />}
        {!source?.error && block.type === 'calendar' && block.calendar && <CalendarGrid rows={rows} config={block.calendar} />}
        {!source?.error && block.type === 'gallery' && block.gallery && <Gallery rows={rows} config={block.gallery} />}
        {block.type === 'text' && <p className="whitespace-pre-wrap text-sm leading-6">{block.text}</p>}
        {block.type === 'heading' && block.heading && <Heading config={block.heading} />}
        {block.type === 'callout' && block.callout && <Callout config={block.callout} />}
        {block.type === 'divider' && <hr className="border-border" />}
        {block.type === 'spacer' && <div className={block.spacer?.size === 'sm' ? 'h-4' : block.spacer?.size === 'lg' ? 'h-16' : block.spacer?.size === 'xl' ? 'h-24' : 'h-8'} aria-hidden />}
        {block.type === 'image' && block.media && <Media block={block} rows={rows} video={false} />}
        {block.type === 'video' && block.media && <Media block={block} rows={rows} video />}
        {block.type === 'form' && block.form && formAction && <ActionForm appSlug={app.app.slug} action={formAction} form={block.form} refresh={refresh} accent={accent} draft={draft} selected={selected} data={app.data} />}
        {block.type === 'form' && block.form && !formAction && <p className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="size-4" /> Esta acción no está disponible para tu usuario.</p>}
        {block.type === 'actions' && <div className="flex flex-wrap gap-2">{blockActions.map((action) => <ActionButton key={action.key} appSlug={app.app.slug} action={action} refresh={refresh} draft={draft} selected={selected} />)}</div>}
        {!source?.error && ['table', 'list', 'detail', 'kanban', 'chart', 'progress', 'timeline', 'calendar', 'gallery'].includes(block.type) && rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No hay datos para mostrar.</p>}
      </div>
      {blockActions.length > 0 && block.type !== 'actions' && <footer className="flex flex-wrap gap-2 border-t px-4 py-3">{blockActions.map((action) => <ActionButton key={action.key} appSlug={app.app.slug} action={action} refresh={refresh} draft={draft} selected={selected} />)}</footer>}
    </article>
  );
}

type RecordViewProps = {
  rows: Array<Record<string, unknown>>;
  fields: string[];
  actions: AppActionDefinition[];
  appSlug: string;
  refresh: () => void;
  draft: boolean;
  selected?: Record<string, unknown>;
  onSelect: (row: Record<string, unknown>) => void;
};

function RowActions({ row, actions, appSlug, refresh, draft }: { row: Record<string, unknown>; actions: AppActionDefinition[]; appSlug: string; refresh: () => void; draft: boolean }) {
  if (!actions.length) return null;
  return <div className="flex justify-end gap-1">{actions.map((action) => <ActionButton key={action.key} appSlug={appSlug} action={action} refresh={refresh} draft={draft} row={row} compact />)}</div>;
}

function DataTable({ rows, fields, actions, appSlug, refresh, draft, selected, onSelect }: RecordViewProps) {
  if (!rows.length) return null;
  return <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="border-b">{fields.map((field) => <th key={field} className="px-2 py-2 font-semibold text-muted-foreground">{field}</th>)}{actions.length > 0 && <th className="px-2 py-2 text-right font-semibold text-muted-foreground">Acciones</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)} onClick={() => onSelect(row)} className={cn('cursor-pointer border-b last:border-0', selected?.id === row.id && 'bg-primary/5')}>{fields.map((field) => <td key={field} className="max-w-64 truncate px-2 py-2.5">{displayValue(row[field])}</td>)}{actions.length > 0 && <td className="px-2 py-1.5" onClick={(event) => event.stopPropagation()}><RowActions row={row} actions={actions} appSlug={appSlug} refresh={refresh} draft={draft} /></td>}</tr>)}</tbody></table></div>;
}

function DataList({ rows, fields, actions, appSlug, refresh, draft, selected, onSelect }: RecordViewProps) {
  return <div className="divide-y">{rows.map((row, index) => <div key={String(row.id ?? index)} onClick={() => onSelect(row)} className={cn('cursor-pointer py-3 first:pt-0 last:pb-0', selected?.id === row.id && 'bg-primary/5')}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{displayValue(row[fields[0]])}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{fields.slice(1).map((field) => `${field}: ${displayValue(row[field])}`).join(' · ')}</p></div><span onClick={(event) => event.stopPropagation()}><RowActions row={row} actions={actions} appSlug={appSlug} refresh={refresh} draft={draft} /></span></div></div>)}</div>;
}

function Detail({ data, fields, actions, appSlug, refresh, draft, onSelect }: Omit<RecordViewProps, 'rows' | 'selected'> & { data?: Record<string, unknown> }) {
  if (!data) return null;
  return <div onClick={() => onSelect(data)}><dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields.map((field) => <div key={field}><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{field}</dt><dd className="mt-1 text-sm">{displayValue(data[field])}</dd></div>)}</dl><div className="mt-3"><RowActions row={data} actions={actions} appSlug={appSlug} refresh={refresh} draft={draft} /></div></div>;
}

function Kanban({ rows, fields, groupBy, actions, appSlug, refresh, draft, selected, onSelect }: RecordViewProps & { groupBy: string }) {
  const groups = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const key = displayValue(row[groupBy]);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [rows, groupBy]);
  return <div className="flex gap-3 overflow-x-auto pb-2">{groups.map(([group, items]) => <section key={group} className="w-64 shrink-0 rounded-lg bg-muted/60 p-2"><header className="mb-2 flex items-center justify-between px-1 text-xs font-semibold"><span>{group}</span><span className="rounded-full bg-background px-2 py-0.5 text-muted-foreground">{items.length}</span></header><div className="space-y-2">{items.map((row, index) => <div key={String(row.id ?? index)} onClick={() => onSelect(row)} className={cn('cursor-pointer rounded-lg border bg-card p-3', selected?.id === row.id && 'border-primary')}><p className="text-sm font-medium">{displayValue(row[fields[0]])}</p><p className="mt-1 text-xs text-muted-foreground">{fields.slice(1).map((field) => displayValue(row[field])).join(' · ')}</p><div className="mt-2" onClick={(event) => event.stopPropagation()}><RowActions row={row} actions={actions} appSlug={appSlug} refresh={refresh} draft={draft} /></div></div>)}</div></section>)}</div>;
}

function DataChart({ rows, config }: { rows: Array<Record<string, unknown>>; config: NonNullable<AppBlockDefinition['chart']> }) {
  if (!rows.length) return null;
  const common = <><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey={config.categoryField} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} /><YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)', borderRadius: 'var(--radius)' }} />{config.showLegend && <Legend />}</>;
  const chart = config.variant === 'line' ? <LineChart data={rows}>{config.showGrid && common}{!config.showGrid && <><XAxis dataKey={config.categoryField} /><YAxis /><Tooltip />{config.showLegend && <Legend />}</>}{config.valueFields.map((field, index) => <Line key={field} dataKey={field} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2} dot={false} />)}</LineChart>
    : config.variant === 'area' ? <AreaChart data={rows}>{config.showGrid && common}{!config.showGrid && <><XAxis dataKey={config.categoryField} /><YAxis /><Tooltip />{config.showLegend && <Legend />}</>}{config.valueFields.map((field, index) => <Area key={field} dataKey={field} stackId={config.stacked ? 'total' : undefined} fill={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.25} stroke={CHART_COLORS[index % CHART_COLORS.length]} />)}</AreaChart>
      : config.variant === 'pie' || config.variant === 'donut' ? <PieChart><Tooltip contentStyle={{ background: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)' }} />{config.showLegend && <Legend />}<Pie data={rows} dataKey={config.valueFields[0]} nameKey={config.categoryField} innerRadius={config.variant === 'donut' ? '48%' : 0} outerRadius="78%">{rows.map((_row, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie></PieChart>
        : config.variant === 'radar' ? <RadarChart data={rows}><PolarGrid stroke="var(--border)" /><PolarAngleAxis dataKey={config.categoryField} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} /><PolarRadiusAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} /><Tooltip />{config.showLegend && <Legend />}{config.valueFields.map((field, index) => <Radar key={field} dataKey={field} stroke={CHART_COLORS[index % CHART_COLORS.length]} fill={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.16} />)}</RadarChart>
          : config.variant === 'scatter' ? <ScatterChart>{common}{config.valueFields.map((field, index) => <Scatter key={field} name={field} data={rows.map((row) => ({ x: Number(row[config.categoryField]), y: Number(row[field]) }))} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</ScatterChart>
            : <BarChart data={rows}>{config.showGrid && common}{!config.showGrid && <><XAxis dataKey={config.categoryField} /><YAxis /><Tooltip />{config.showLegend && <Legend />}</>}{config.valueFields.map((field, index) => <Bar key={field} dataKey={field} stackId={config.stacked ? 'total' : undefined} fill={CHART_COLORS[index % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />)}</BarChart>;
  return <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer></div>;
}

function ProgressList({ rows, config }: { rows: Array<Record<string, unknown>>; config: NonNullable<AppBlockDefinition['progress']> }) {
  return <div className="space-y-4">{rows.map((row, index) => {
    const value = Number(row[config.valueField]) || 0;
    const percent = Math.max(0, Math.min(100, (value / config.max) * 100));
    const formatted = config.format === 'currency' ? new Intl.NumberFormat(undefined, { style: 'currency', currency: config.currency ?? 'USD' }).format(value) : config.format === 'percent' ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(percent)}%` : displayValue(value);
    return <div key={String(row.id ?? index)}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium">{displayValue(row[config.labelField ?? 'name'] ?? row.id)}</span><span className="tabular-nums text-muted-foreground">{formatted}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} /></div></div>;
  })}</div>;
}

function Timeline({ rows, config }: { rows: Array<Record<string, unknown>>; config: NonNullable<AppBlockDefinition['timeline']> }) {
  const sorted = [...rows].sort((a, b) => new Date(String(b[config.dateField] ?? '')).getTime() - new Date(String(a[config.dateField] ?? '')).getTime());
  return <ol className="relative ml-2 border-l border-border">{sorted.map((row, index) => <li key={String(row.id ?? index)} className="relative pb-6 pl-6 last:pb-0"><span className="absolute -left-1.5 top-1 size-3 rounded-full border-2 border-card bg-primary" /><time className="text-[11px] font-medium text-muted-foreground">{displayValue(row[config.dateField])}</time><p className="mt-1 text-sm font-semibold">{displayValue(row[config.titleField])}</p>{config.descriptionField && <p className="mt-1 text-xs leading-5 text-muted-foreground">{displayValue(row[config.descriptionField])}</p>}{config.statusField && <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-1 text-[10px] font-medium">{displayValue(row[config.statusField])}</span>}</li>)}</ol>;
}

function CalendarGrid({ rows, config }: { rows: Array<Record<string, unknown>>; config: NonNullable<AppBlockDefinition['calendar']> }) {
  const valid = rows.map((row) => ({ row, date: new Date(String(row[config.dateField] ?? '')) })).filter((item) => !Number.isNaN(item.date.getTime()));
  if (!valid.length) return <p className="text-sm text-muted-foreground">No hay fechas válidas para mostrar.</p>;
  const base = valid[0].date;
  const year = base.getFullYear();
  const month = base.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const byDay = new Map<number, Array<Record<string, unknown>>>();
  for (const item of valid.filter((candidate) => candidate.date.getFullYear() === year && candidate.date.getMonth() === month)) byDay.set(item.date.getDate(), [...(byDay.get(item.date.getDate()) ?? []), item.row]);
  return <div><h5 className="mb-3 text-sm font-bold capitalize">{base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h5><div className="grid grid-cols-7 border-l border-t text-center text-[10px] font-semibold text-muted-foreground">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <div key={day} className="border-b border-r p-2">{day}</div>)}{Array.from({ length: offset }).map((_, index) => <div key={`empty-${index}`} className="min-h-20 border-b border-r bg-muted/30" />)}{Array.from({ length: days }).map((_, index) => { const day = index + 1; const events = byDay.get(day) ?? []; return <div key={day} className="min-h-20 border-b border-r p-1.5 text-left"><span className="text-[11px] font-semibold text-foreground">{day}</span><div className="mt-1 space-y-1">{events.slice(0, 3).map((row, eventIndex) => <p key={String(row.id ?? eventIndex)} className="truncate rounded bg-primary/10 px-1.5 py-1 text-[9px] font-medium text-primary">{displayValue(row[config.titleField])}</p>)}{events.length > 3 && <p className="text-[9px] text-muted-foreground">+{events.length - 3}</p>}</div></div>; })}</div></div>;
}

function Gallery({ rows, config }: { rows: Array<Record<string, unknown>>; config: NonNullable<AppBlockDefinition['gallery']> }) {
  const columns = config.columns === 1 ? 'grid-cols-1' : config.columns === 2 ? 'grid-cols-2' : config.columns === 4 ? 'grid-cols-2 md:grid-cols-4' : config.columns === 5 ? 'grid-cols-2 md:grid-cols-5' : config.columns === 6 ? 'grid-cols-2 md:grid-cols-6' : 'grid-cols-2 md:grid-cols-3';
  return <div className={cn('grid gap-3', columns)}>{rows.map((row, index) => <figure key={String(row.id ?? index)} className="overflow-hidden rounded-lg border bg-muted"><img src={String(row[config.mediaField] ?? '')} alt={config.titleField ? displayValue(row[config.titleField]) : ''} className={cn('aspect-square w-full', config.fit === 'contain' ? 'object-contain' : 'object-cover')} loading="lazy" />{(config.titleField || config.descriptionField) && <figcaption className="bg-card p-2"><p className="truncate text-xs font-semibold">{config.titleField ? displayValue(row[config.titleField]) : ''}</p>{config.descriptionField && <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{displayValue(row[config.descriptionField])}</p>}</figcaption>}</figure>)}</div>;
}

function Heading({ config }: { config: NonNullable<AppBlockDefinition['heading']> }) {
  const Tag = config.level;
  const size = config.level === 'h1' ? 'text-4xl sm:text-5xl' : config.level === 'h2' ? 'text-3xl' : config.level === 'h3' ? 'text-2xl' : 'text-xl';
  return <div className={config.align === 'center' ? 'text-center' : config.align === 'right' ? 'text-right' : 'text-left'}>{config.eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">{config.eyebrow}</p>}<Tag className={cn('font-bold tracking-tight', size)}>{config.text}</Tag></div>;
}

function Callout({ config }: { config: NonNullable<AppBlockDefinition['callout']> }) {
  const styles = config.tone === 'success' ? { box: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200', Icon: CircleCheck } : config.tone === 'warning' ? { box: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200', Icon: TriangleAlert } : config.tone === 'danger' ? { box: 'border-destructive/30 bg-destructive/10 text-destructive', Icon: CircleAlert } : config.tone === 'neutral' ? { box: 'border-border bg-muted text-foreground', Icon: Info } : { box: 'border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-200', Icon: Info };
  return <div className={cn('flex gap-3 rounded-lg border p-4 text-sm leading-6', styles.box)}><styles.Icon className="mt-0.5 size-4 shrink-0" /><p className="whitespace-pre-wrap">{config.text}</p></div>;
}

function Media({ block, rows, video }: { block: AppBlockDefinition; rows: Array<Record<string, unknown>>; video: boolean }) {
  const config = block.media;
  if (!config) return null;
  const src = config.src ?? (config.srcField ? String(rows[0]?.[config.srcField] ?? '') : '');
  const ratio = config.aspectRatio === 'square' ? 'aspect-square' : config.aspectRatio === 'wide' ? 'aspect-[21/9]' : config.aspectRatio === 'auto' ? '' : 'aspect-video';
  if (!src) return <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"><ImageIcon className="mr-2 size-4" />Sin contenido multimedia</div>;
  return <figure>{video ? <video src={src} controls={config.controls} className={cn('w-full rounded-lg bg-black', ratio, config.fit === 'contain' ? 'object-contain' : 'object-cover')} /> : <img src={src} alt={config.alt ?? ''} className={cn('w-full rounded-lg', ratio, config.fit === 'contain' ? 'object-contain' : 'object-cover')} loading="lazy" />}{config.caption && <figcaption className="mt-2 text-xs text-muted-foreground">{config.caption}</figcaption>}</figure>;
}

async function runAction(appSlug: string, actionKey: string, values: Record<string, unknown>, draft: boolean, context?: { row?: Record<string, unknown>; selected?: Record<string, unknown> }) {
  const query = draft ? '?draft=1' : '';
  const response = await fetch(`/api/plugins/app-maker/actions/${encodeURIComponent(appSlug)}/${encodeURIComponent(actionKey)}${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values, context }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? 'No se pudo ejecutar la acción.');
  return body;
}

function ActionButton({ appSlug, action, refresh, draft, row, selected, compact = false }: { appSlug: string; action: AppActionDefinition; refresh: () => void; draft: boolean; row?: Record<string, unknown>; selected?: Record<string, unknown>; compact?: boolean }) {
  const [running, setRunning] = useState(false);
  async function execute() {
    if (action.confirmation && !window.confirm(action.confirmation)) return;
    setRunning(true);
    try {
      await runAction(appSlug, action.key, {}, draft, { row, selected });
      toast.success('Acción completada');
      if (action.refresh) refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo ejecutar la acción.');
    } finally { setRunning(false); }
  }
  return <Button size="sm" variant={action.tone === 'destructive' ? 'destructive' : action.tone === 'secondary' ? 'outline' : 'default'} onClick={() => void execute()} disabled={running} title={compact ? action.label : undefined}>{running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}{compact ? <span className="sr-only">{action.label}</span> : action.label}</Button>;
}

function ActionForm({
  appSlug,
  action,
  form,
  refresh,
  accent,
  draft,
  selected,
  data,
}: {
  appSlug: string;
  action: AppActionDefinition;
  form: NonNullable<AppBlockDefinition['form']>;
  refresh: () => void;
  accent: AccentStyle;
  draft: boolean;
  selected?: Record<string, unknown>;
  data: ResolvedAppMakerView['data'];
}) {
  const fields = form.fields;
  const [values, setValues] = useState<Record<string, string | string[] | boolean | File[]>>(() => Object.fromEntries(fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.key, field.defaultValue as string | string[] | boolean | File[]])));
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const requiresSelection = action.operation === 'appmaker_update_record';
  const selectedId = selected?.id;
  // Editar sin precargar obliga a reescribir el registro entero para cambiar un
  // campo, así que al elegir una fila el formulario adopta sus valores.
  useEffect(() => {
    if (!requiresSelection || !selected) return;
    setValues(Object.fromEntries(fields
      .filter((field) => !FILE_FIELD_TYPES.has(field.type))
      .map((field) => {
        const raw = selected[field.key];
        if (raw === null || raw === undefined) return [field.key, ''];
        if (['checkbox', 'toggle'].includes(field.type)) return [field.key, Boolean(raw)];
        if (field.type === 'multi-select') return [field.key, Array.isArray(raw) ? raw.map(String) : [String(raw)]];
        const text = String(raw);
        if (field.type === 'date') return [field.key, text.slice(0, 10)];
        if (field.type === 'datetime') return [field.key, text.slice(0, 16)];
        return [field.key, text];
      })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiresSelection, selectedId]);
  const steps = form.presentation === 'wizard' ? form.steps ?? [] : [];
  const activeStep = steps[stepIndex];
  const visible = (field: (typeof fields)[number]) => {
    if (!field.visibleWhen) return true;
    const current = values[field.visibleWhen.field];
    if (field.visibleWhen.operator === 'truthy') return Boolean(current);
    if (field.visibleWhen.operator === 'falsy') return !current;
    if (field.visibleWhen.operator === 'contains') return Array.isArray(current) ? current.some((item) => String(item) === String(field.visibleWhen?.value)) : String(current ?? '').includes(String(field.visibleWhen.value ?? ''));
    if (field.visibleWhen.operator === 'neq') return current !== field.visibleWhen.value;
    return current === field.visibleWhen.value;
  };
  const displayedFields = fields.filter((field) => visible(field) && (!activeStep || activeStep.fields.includes(field.key)));
  const missingRequired = (candidates: typeof fields) => candidates.find((field) => {
    const value = values[field.key];
    return field.required && visible(field) && (value === undefined || value === '' || (Array.isArray(value) && value.length === 0));
  });

  function nextStep() {
    const missing = missingRequired(displayedFields);
    if (missing) { toast.error(`Completá ${missing.label}.`); return; }
    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const missing = missingRequired(fields);
    if (missing) { toast.error(`Completá ${missing.label}.`); return; }
    setSaving(true);
    try {
      const fileTypes = FILE_FIELD_TYPES;
      const normalized = Object.fromEntries(fields.filter((field) => !fileTypes.has(field.type) && !(requiresSelection && (values[field.key] === undefined || values[field.key] === ''))).map((field) => [
        field.key,
        ['number', 'currency', 'percent', 'range', 'rating'].includes(field.type)
          ? Number(values[field.key])
          : field.type === 'checkbox'
            ? Boolean(values[field.key])
            : values[field.key] ?? '',
      ]));
      const result = await runAction(appSlug, action.key, normalized, draft, { selected });
      const createdRecordId = Number(result?.result?.id);
      const entityKey = String(action.inputDefaults?.entityKey ?? action.inputDefaults?.entity ?? '');
      if (createdRecordId && entityKey) {
        for (const field of fields.filter((candidate) => fileTypes.has(candidate.type))) {
          const files = Array.isArray(values[field.key]) ? values[field.key] as File[] : [];
          for (const file of files) {
            const form = new FormData();
            form.set('fieldKey', field.key);
            form.set('file', file);
            const response = await fetch(`/api/plugins/app-maker/data/${encodeURIComponent(appSlug)}/${encodeURIComponent(entityKey)}/${createdRecordId}/attachments${draft ? '?draft=1' : ''}`, { method: 'POST', body: form });
            if (!response.ok) throw new Error('El registro se guardó, pero no se pudo adjuntar un archivo.');
          }
        }
      }
      if (form.resetAfterSubmit !== false) setValues(Object.fromEntries(fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.key, field.defaultValue as string | string[] | boolean | File[]])));
      setStepIndex(0);
      toast.success(form.successMessage ?? 'Guardado correctamente');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally { setSaving(false); }
  }
  const columns = form.presentation === 'inline' ? 'md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]' : form.columns === 4 ? 'md:grid-cols-4' : form.columns === 3 ? 'md:grid-cols-3' : form.columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1';
  const fieldGap = form.presentation === 'compact' ? 'gap-2' : 'gap-4';
  const widthClass = (width: (typeof fields)[number]['width']) => {
    if (form.presentation === 'inline') return '';
    const count = form.columns ?? 1;
    if (!width || width === 'full') return count === 4 ? 'md:col-span-4' : count === 3 ? 'md:col-span-3' : count === 2 ? 'md:col-span-2' : '';
    if (width === 'half') return count >= 4 ? 'md:col-span-2' : 'md:col-span-1';
    return 'md:col-span-1';
  };

  return <form className={form.presentation === 'compact' ? 'space-y-2' : 'space-y-4'} onSubmit={submit}>{requiresSelection && !selected ? <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Seleccioná un registro en la tabla para editarlo.</p> : null}{activeStep && <div><div className="mb-3 flex gap-1">{steps.map((step, index) => <span key={step.id} className={cn('h-1.5 flex-1 rounded-full', index <= stepIndex ? 'bg-primary' : 'bg-muted')} />)}</div><p className="text-sm font-semibold">{activeStep.title}</p>{activeStep.description && <p className="mt-1 text-xs text-muted-foreground">{activeStep.description}</p>}<p className="mt-1 text-[10px] font-medium text-muted-foreground">Paso {stepIndex + 1} de {steps.length}</p></div>}<div className={cn('grid', columns, fieldGap)}>{displayedFields.map((field) => {
    const options = field.options ?? (field.optionsDataSource ? (data[field.optionsDataSource]?.rows ?? []).map((row) => ({ label: displayValue(row.name ?? row.title ?? row.id), value: row.id ?? '' })) : []);
    const value = values[field.key] ?? field.defaultValue;
    if (field.type === 'hidden') return <input key={field.key} type="hidden" name={field.key} value={String(value ?? '')} />;
    const set = (next: string | string[] | boolean | File[]) => setValues((current) => ({ ...current, [field.key]: next }));
    const input = ['textarea', 'rich-text'].includes(field.type)
      ? <Textarea required={field.required} disabled={field.disabled} readOnly={field.readOnly} minLength={field.minLength} maxLength={field.maxLength} placeholder={field.placeholder} value={String(value ?? '')} onChange={(event) => set(event.target.value)} className={form.presentation === 'compact' ? 'min-h-20 text-xs' : undefined} />
      : ['select', 'relation', 'user', 'department'].includes(field.type)
        ? <select required={field.required} disabled={field.disabled} value={String(value ?? '')} onChange={(event) => set(event.target.value)} className={cn('w-full rounded-md border bg-background px-3 text-sm', form.presentation === 'compact' ? 'h-8' : 'h-10')}><option value="">Seleccionar</option>{options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>
        : field.type === 'multi-select'
          ? <select multiple required={field.required} disabled={field.disabled} value={Array.isArray(value) ? value.map(String) : []} onChange={(event) => set(Array.from(event.target.selectedOptions).map((option) => option.value))} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm">{options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>
          : field.type === 'radio'
            ? <div className="flex flex-wrap gap-3">{options.map((option) => <label key={String(option.value)} className="flex items-center gap-2 text-sm"><input type="radio" name={field.key} required={field.required} disabled={field.disabled} checked={String(value ?? '') === String(option.value)} onChange={() => set(String(option.value))} />{option.label}</label>)}</div>
        : ['file', 'image', 'audio', 'video'].includes(field.type)
          ? <Input type="file" required={field.required} disabled={field.disabled} accept={field.accept ?? (field.type === 'file' ? undefined : `${field.type}/*`)} multiple={Boolean(field.multiple)} onChange={(event) => set(Array.from(event.target.files ?? []))} />
          : ['checkbox', 'toggle'].includes(field.type)
            ? <button type="button" role="switch" aria-checked={Boolean(value)} disabled={field.disabled || field.readOnly} onClick={() => set(!Boolean(value))} className={cn('relative h-6 w-11 rounded-full transition-colors', value ? 'bg-primary' : 'bg-muted')}><span className={cn('absolute top-1 size-4 rounded-full bg-white transition-transform', value ? 'left-6' : 'left-1')} /></button>
            : field.type === 'rating'
              ? <div className="flex gap-1">{Array.from({ length: Math.min(10, field.max ?? 5) }, (_, index) => index + 1).map((rating) => <button key={rating} type="button" onClick={() => set(String(rating))} disabled={field.disabled || field.readOnly} aria-label={`${rating} de ${field.max ?? 5}`}><Star className={cn('size-5', Number(value) >= rating ? 'fill-primary text-primary' : 'text-muted-foreground')} /></button>)}</div>
              : <Input type={['number', 'currency', 'percent', 'range'].includes(field.type) ? field.type === 'range' ? 'range' : 'number' : field.type === 'datetime' ? 'datetime-local' : field.type === 'phone' ? 'tel' : field.type} required={field.required} disabled={field.disabled} readOnly={field.readOnly} min={field.min} max={field.max} step={field.step} minLength={field.minLength} maxLength={field.maxLength} pattern={field.pattern} placeholder={field.placeholder} value={String(value ?? '')} onChange={(event) => set(event.target.value)} className={form.presentation === 'compact' ? 'h-8 text-xs' : undefined} />;
    return <label key={field.key} className={cn('block space-y-1.5', widthClass(field.width))}><span className="flex items-center gap-1 text-xs font-medium">{field.label}{field.required && <span className="text-destructive" aria-hidden>*</span>}</span><div className="flex items-center">{field.prefix && <span className="flex h-10 items-center rounded-l-md border border-r-0 bg-muted px-2 text-xs text-muted-foreground">{field.prefix}</span>}<div className="min-w-0 flex-1">{input}</div>{field.suffix && <span className="flex h-10 items-center rounded-r-md border border-l-0 bg-muted px-2 text-xs text-muted-foreground">{field.suffix}</span>}</div>{field.helpText && <span className="block text-[11px] leading-4 text-muted-foreground">{field.helpText}</span>}</label>;
  })}</div><div className={cn('flex items-center gap-2', activeStep ? 'justify-between' : form.presentation === 'inline' ? 'justify-end' : '')}>{activeStep && stepIndex > 0 && <button type="button" onClick={() => setStepIndex((current) => current - 1)} className="inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium"><ChevronLeft className="size-4" />Anterior</button>}<span className="flex-1" />{activeStep && stepIndex < steps.length - 1 ? <button type="button" onClick={nextStep} className={cn('inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium', accent.solid)}>Siguiente<ChevronRight className="size-4" /></button> : <button type="submit" disabled={saving || (requiresSelection && !selected)} className={cn('inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-50', accent.solid)}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{form.submitLabel}</button>}</div></form>;
}
