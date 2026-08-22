'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import {
  Activity, AppWindow, ArrowRight, BookOpen, BriefcaseBusiness, CalendarClock,
  Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, Command, Database,
  FilePlus2, FileText, HardDrive, LayoutDashboard, Link2, Loader2, Megaphone,
  MessageCircle, MousePointerClick, Network, NotebookPen, PanelTop, Pencil, Plus,
  Search, Settings2, Sparkles, Target, Users, Video, WalletCards,
  type LucideIcon,
} from 'lucide-react';
import {
  buildLauncherApps,
  type InstalledMiniApp,
  type LauncherApp,
  type PluginNavItem,
} from '@/components/apps/launcher-catalog';
import { DESKTOP_WIDGET_IDS } from '@/lib/desktop/types';
import type { DesktopLayout, DesktopOverview, DesktopSearchResult, DesktopWidgetId } from '@/lib/desktop/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type TabId = 'resumen' | DesktopWidgetId;

// Lenguaje visual ToDoS (docs/tareas-rediseno/02-SPEC-UI.md §1), aislado a esta pantalla:
// acento indigo-500 (#6366f1) vía clases literales `indigo-*` (el `--accent` global de
// WhatsPro es un gris shadcn distinto, así que no se reusa `bg-accent`/`text-accent` acá).
const label = 'text-[10px] uppercase font-black tracking-[0.2em] text-neutral-400 dark:text-neutral-500';
const countBadge = 'text-[10px] px-2 py-0.5 rounded-md font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400';
const card = 'rounded-3xl border border-neutral-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm';
const tile = 'rounded-xl border border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/60';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function formatMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value / 100);
}

function formatMetaMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function relativeDate(value: string | null, t: ReturnType<typeof useTranslations>) {
  if (!value) return t('noDate');
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const days = Math.round(diff / 86400000);
  if (days === 0) return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return t('tomorrow');
  if (days === -1) return t('yesterday');
  if (days > -7 && days < 7) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(days, 'day');
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function freshness(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(0, 'minute');
  if (minutes < 60) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-minutes, 'minute');
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-Math.round(minutes / 60), 'hour');
}

function getTabIcon(id: TabId): LucideIcon {
  switch (id) {
    case 'resumen': return LayoutDashboard;
    case 'focus': return Target;
    case 'conversations': return MessageCircle;
    case 'customers': return Users;
    case 'revenue': return WalletCards;
    case 'marketing': return Megaphone;
    case 'infrastructure': return Database;
    case 'knowledge': return BookOpen;
    case 'business-woman': return BriefcaseBusiness;
    case 'apps': return AppWindow;
    default: return LayoutDashboard;
  }
}

function StatTile({ icon: Icon, label: statLabel, value, detail, warning }: { icon: LucideIcon; label: string; value: string; detail?: string; warning?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 p-4', tile)}>
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', warning ? 'bg-indigo-500/10 text-indigo-500' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500')}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <small className={cn('block', label)}>{statLabel}</small>
        <strong className="mt-1 block truncate text-xl font-black tracking-tight text-neutral-900 dark:text-white">{value}</strong>
        {detail && <em className="block truncate text-xs not-italic text-neutral-400 dark:text-neutral-500">{detail}</em>}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label: metricLabel, value, detail, href, warning }: { icon: LucideIcon; label: string; value: string; detail: string; href: string; warning?: boolean }) {
  return (
    <Link
      href={href}
      className={cn('group flex items-center gap-4 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/30 hover:shadow-md', card)}
    >
      <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', warning ? 'bg-indigo-500/10 text-indigo-500' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500')}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <small className={cn('block', label)}>{metricLabel}</small>
        <strong className="mt-1 block text-2xl font-black tracking-tight text-neutral-900 dark:text-white">{value}</strong>
        <em className="block truncate text-xs not-italic text-neutral-400 dark:text-neutral-500">{detail}</em>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Status({ icon: Icon, label: statusLabel, value, detail, warning }: { icon: LucideIcon; label: string; value: string; detail: string; warning?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 p-3.5', tile)}>
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-2xl', warning ? 'bg-indigo-500/10 text-indigo-500' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500')}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <small className="block text-xs text-neutral-500 dark:text-neutral-400">{statusLabel}</small>
        <strong className="mt-0.5 block truncate text-lg font-black tracking-tight text-neutral-900 dark:text-white">{value}</strong>
        <em className="block truncate text-xs not-italic text-neutral-400 dark:text-neutral-500">{detail}</em>
      </div>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex h-full min-h-[130px] flex-col items-center justify-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
      <Icon className="h-5 w-5" /><span>{text}</span>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className={cn('overflow-hidden', card)}>
      <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4 text-sm font-bold text-neutral-900 dark:border-neutral-700 dark:text-white">
        <Icon className="h-4 w-4 text-indigo-500" />{title}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

function OpenModuleLink({ href, label: linkLabel }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-500 hover:underline">
      {linkLabel}<ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function AppIcon({ app }: { app: LauncherApp }) {
  const Icon = app.icon;
  return (
    <Link href={app.href} className="group flex flex-col items-center gap-2 rounded-2xl p-1.5 text-center" aria-label={`Abrir ${app.label}`}>
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-neutral-100 bg-neutral-50 text-indigo-500 shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5 dark:border-neutral-700 dark:bg-neutral-900/60">
        {app.visual.imageUrl
          ? <img src={app.visual.imageUrl} alt={app.visual.imageAlt ?? app.label} className="h-full w-full object-contain p-1.5" />
          : <Icon className="h-5 w-5" />}
      </span>
      <span className="w-full truncate text-[11px] font-bold text-neutral-500 dark:text-neutral-400">{app.label}</span>
    </Link>
  );
}

export function EscritorioClient({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('DesktopOperations');
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<DesktopOverview>('/api/escritorio/overview', fetcher, { refreshInterval: 60000 });
  const { data: pluginNavItems } = useSWR<PluginNavItem[]>('/api/plugins/nav', fetcher);
  const { data: installedMiniApps = [] } = useSWR<InstalledMiniApp[]>('/api/mini-apps', fetcher);
  const [layout, setLayout] = useState<DesktopLayout | null>(null);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<'task' | 'note' | 'document'>('task');
  const [createTitle, setCreateTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: searchResults, isLoading: searching } = useSWR<DesktopSearchResult[]>(search.trim().length >= 2 ? `/api/escritorio/search?q=${encodeURIComponent(search)}` : null, fetcher, { keepPreviousData: true });
  const launcherApps = useMemo(
    () => buildLauncherApps(pluginNavItems ?? [], installedMiniApps),
    [installedMiniApps, pluginNavItems],
  );

  useEffect(() => { if (data && !layout) setLayout(data.layout); }, [data, layout]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const visibleWidgets = useMemo(() => layout?.order.filter((id) => !layout.hidden.includes(id)) ?? [], [layout]);
  const tabIds = useMemo<TabId[]>(() => ['resumen', ...visibleWidgets], [visibleWidgets]);
  useEffect(() => { if (!tabIds.includes(activeTab)) setActiveTab('resumen'); }, [tabIds, activeTab]);

  async function persistLayout(next: DesktopLayout) {
    setLayout(next);
    await fetch('/api/escritorio/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
  }

  function hideWidget(id: DesktopWidgetId) {
    if (!layout) return;
    void persistLayout({ ...layout, hidden: [...new Set([...layout.hidden, id])], pinned: layout.pinned.filter((item) => item !== id) });
  }

  function restoreWidget(id: DesktopWidgetId) {
    if (!layout) return;
    void persistLayout({ ...layout, hidden: layout.hidden.filter((item) => item !== id) });
  }

  async function performNowAction(item: DesktopOverview['now'][number]) {
    if (!item.action) return;
    const target = item.action.type === 'complete-task' ? `/api/plugins/tasks/items/${item.action.id}` : '/api/chats/mark-read';
    const body = item.action.type === 'complete-task' ? { status: 'done' } : { chatId: item.action.id };
    await fetch(target, { method: item.action.type === 'complete-task' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await mutate();
  }

  async function createItem() {
    if (!data || !createTitle.trim()) return;
    setSaving(true);
    try {
      let url = '/api/plugins/tasks/items';
      let body: Record<string, unknown> = { title: createTitle.trim(), columnId: data.taskTarget?.columnId };
      if (createType === 'note') { url = '/api/plugins/notes'; body = { title: createTitle.trim(), content: '', tags: [], pinned: false, status: 'todo' }; }
      if (createType === 'document') { url = '/api/plugins/documents/documents'; body = { title: createTitle.trim() }; }
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error('create');
      const created = await response.json();
      setCreateTitle(''); setCreateOpen(false); await mutate();
      if (createType === 'document' && created?.id) router.push(`/plugins/documents/doc/${created.id}`);
    } finally { setSaving(false); }
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[70vh] flex-col items-center justify-center gap-3 bg-neutral-50 text-center dark:bg-neutral-900">
        <CircleAlert className="h-8 w-8 text-rose-500" />
        <strong className="text-base font-bold text-neutral-900 dark:text-white">{t('loadError')}</strong>
        <Button variant="outline" className="rounded-2xl border-neutral-200 dark:border-neutral-700" onClick={() => mutate()}>{t('retry')}</Button>
      </div>
    );
  }
  if (isLoading || !data || !layout) {
    return (
      <div className="flex h-full min-h-[70vh] flex-col items-center justify-center gap-3 bg-neutral-50 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-500">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        <span className="text-sm font-bold">{t('loading')}</span>
      </div>
    );
  }

  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const greeting = new Date().getHours() < 12 ? t('goodMorning') : new Date().getHours() < 19 ? t('goodAfternoon') : t('goodEvening');
  const topNow = data.now[0] ?? null;
  const costPerResult = data.marketing.results > 0 ? data.marketing.spend / data.marketing.results : null;
  const collectedPercent = data.revenue.paid + data.revenue.pending > 0
    ? Math.round((data.revenue.paid / (data.revenue.paid + data.revenue.pending)) * 100)
    : 100;
  const shortcutStats: Partial<Record<DesktopWidgetId, string>> = {
    focus: formatNumber(data.summary.openTasks),
    conversations: formatNumber(data.summary.unreadChats),
    customers: formatNumber(data.summary.customers),
    revenue: formatMoney(data.revenue.paid, data.revenue.currency),
    marketing: formatMetaMoney(data.marketing.spend, data.marketing.currency),
    infrastructure: formatNumber(data.infrastructure.domains),
    knowledge: formatNumber(data.knowledge.documents),
    'business-woman': formatNumber(data.businessWoman.agenda.length),
    apps: formatNumber(launcherApps.length),
  };

  return (
    <main
      className="escritorio-ui h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-neutral-50 text-neutral-900 [scrollbar-gutter:stable] dark:bg-neutral-900 dark:text-neutral-100"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:space-y-6 sm:px-6 sm:py-6 md:pb-10 lg:space-y-8 lg:px-10 lg:py-10">

        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
          <div className="min-w-0">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">{date}</span>
            <h1 className="mt-1.5 truncate text-2xl font-black tracking-tight text-neutral-900 dark:text-white sm:text-3xl lg:text-4xl">{greeting}, {data.user.name.split(' ')[0]}.</h1>
            <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">{t('subtitle', { team: data.user.teamName })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="hidden h-11 min-w-[220px] justify-start gap-2 rounded-2xl border-neutral-200 px-3 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400 sm:inline-flex"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" /> <span className="flex-1 text-left">{t('search')}</span>
              <kbd className="ml-auto flex items-center gap-0.5 rounded-md border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-400 dark:border-neutral-700 dark:text-neutral-500"><Command className="h-3 w-3" />K</kbd>
            </Button>
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-2xl border-neutral-200 dark:border-neutral-700 sm:hidden" onClick={() => setSearchOpen(true)} aria-label={t('search')}><Search className="h-4 w-4" /></Button>
            <Button className="h-11 shrink-0 gap-2 rounded-2xl bg-indigo-500 px-4 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 dark:shadow-none" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t('create')}</Button>
            <Button
              variant={editing ? 'default' : 'outline'}
              size="icon"
              className={cn('h-11 w-11 shrink-0 rounded-2xl', editing ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'border-neutral-200 dark:border-neutral-700')}
              onClick={() => setEditing(!editing)}
              title={t('customize')}
            >
              <Settings2 className="h-[18px] w-[18px]" />
            </Button>
          </div>
        </header>

        {editing ? (
          <div className="rounded-3xl border border-indigo-500/30 bg-indigo-500/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-indigo-500"><Pencil className="h-4 w-4" /><span className="text-sm font-bold">{t('customizeHelp')}</span></div>
              <Button size="sm" className="rounded-xl bg-indigo-500 text-white hover:bg-indigo-600" onClick={() => setEditing(false)}>{t('done')}</Button>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {DESKTOP_WIDGET_IDS.map((id) => {
                const hidden = layout.hidden.includes(id);
                const Icon = getTabIcon(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => (hidden ? restoreWidget(id) : hideWidget(id))}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all duration-200',
                      hidden ? 'border-neutral-100 bg-white text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500' : 'border-indigo-500/40 bg-white text-neutral-900 dark:bg-neutral-800 dark:text-white',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">{t(`widgets.${id}`)}</span>
                    {hidden ? <Plus className="h-3.5 w-3.5 shrink-0" /> : <Check className="h-3.5 w-3.5 shrink-0 text-indigo-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
            <TabsList className="h-auto w-full snap-x flex-nowrap justify-start gap-1 overflow-x-auto rounded-2xl border border-neutral-100 bg-neutral-100/60 p-1.5 dark:border-neutral-700 dark:bg-neutral-800/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabIds.map((id) => {
                const Icon = getTabIcon(id);
                const tabLabel = id === 'resumen' ? t('overviewTab') : t(`widgets.${id}`);
                return (
                  <TabsTrigger
                    key={id}
                    value={id}
                    aria-label={tabLabel}
                    className="flex-none snap-start gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-neutral-500 data-[state=active]:bg-white data-[state=active]:text-indigo-500 data-[state=active]:shadow-sm dark:text-neutral-400 dark:data-[state=active]:bg-neutral-900 sm:px-3.5 sm:text-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0" /><span className="hidden min-[420px]:inline">{tabLabel}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="resumen" className="mt-5 space-y-5 outline-none sm:mt-6 sm:space-y-6">
              <section className={cn('overflow-hidden', card)}>
                <div className={cn('flex items-center gap-2 border-b border-neutral-100 px-4 py-3.5 dark:border-neutral-700 sm:px-5', label)}>
                  <Sparkles className="h-4 w-4 text-indigo-500" /><span>{t('now')}</span>
                  <b className={cn('ml-auto', countBadge)}>{data.now.length}</b>
                </div>
                {data.now.length ? (
                  <div className="max-h-[380px] overflow-y-auto overscroll-contain">
                    {data.now.map((item) => (
                      <div key={item.id} className={cn('flex items-center gap-3 border-b border-neutral-100 px-4 py-3.5 last:border-0 dark:border-neutral-700 sm:px-5', item.urgent && 'bg-indigo-500/5')}>
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', item.urgent ? 'bg-indigo-500' : 'bg-neutral-300 dark:bg-neutral-600')} />
                        <Link href={item.href} className="min-w-0 flex-1">
                          <strong className="block truncate text-sm font-bold text-neutral-900 dark:text-white">{item.title}</strong>
                          <small className="mt-0.5 block truncate text-xs text-neutral-400 dark:text-neutral-500">{item.detail} · {relativeDate(item.at, t)}</small>
                        </Link>
                        {item.action && (
                          <button onClick={() => performNowAction(item)} title={t('resolve')} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-neutral-200 text-transparent transition-colors hover:border-indigo-500 hover:bg-indigo-500 hover:text-white dark:border-neutral-700">
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-5 text-sm text-neutral-500 dark:text-neutral-400 sm:px-5"><CheckCircle2 className="h-4 w-4 text-indigo-500" />{t('allClear')}</div>
                )}
              </section>

              <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
                <div className={cn('p-5', card)}>
                  <div className={cn('mb-4 flex items-center gap-2', label)}><Sparkles className="h-4 w-4 text-indigo-500" />{t('nextAction')}</div>
                  {topNow ? (
                    <Link href={topNow.href} className="flex items-center gap-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 transition-colors hover:border-indigo-500">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-500"><Sparkles className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-bold text-neutral-900 dark:text-white">{topNow.title}</strong>
                        <span className="block truncate text-xs text-neutral-400 dark:text-neutral-500">{topNow.detail} · {relativeDate(topNow.at, t)}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300" />
                    </Link>
                  ) : (
                    <div className={cn('flex items-center gap-2 p-4 text-sm text-neutral-500 dark:text-neutral-400', tile)}><CheckCircle2 className="h-4 w-4 text-indigo-500" />{t('nextActionEmpty')}</div>
                  )}
                </div>
                <div className={cn('p-5', card)}>
                  <div className={cn('mb-4', label)}>{t('shortcuts')}</div>
                  <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                    {visibleWidgets.map((id) => {
                      const Icon = getTabIcon(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setActiveTab(id)}
                          className={cn('flex items-center gap-2.5 p-3 text-left transition-all duration-200 hover:border-indigo-500/40', tile)}
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-500"><Icon className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-xs font-bold text-neutral-900 dark:text-white">{t(`widgets.${id}`)}</strong>
                            <span className="block truncate text-[11px] text-neutral-400 dark:text-neutral-500">{shortcutStats[id]}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                <Metric icon={CheckCircle2} label={t('openTasks')} value={formatNumber(data.summary.openTasks)} detail={t('overdueCount', { count: data.summary.overdueTasks })} href="/plugins/tasks" warning={data.summary.overdueTasks > 0} />
                <Metric icon={MessageCircle} label={t('unread')} value={formatNumber(data.summary.unreadChats)} detail={t('conversations')} href="/dashboard" warning={data.summary.unreadChats > 0} />
                <Metric icon={Users} label={t('activeCustomers')} value={formatNumber(data.summary.customers)} detail={t('membershipsCount', { count: data.summary.activeMemberships })} href="/plugins/customers" />
                <Metric icon={Network} label={t('renewals')} value={formatNumber(data.summary.expiringDomains)} detail={t('next30days')} href="/plugins/domains" warning={data.summary.expiringDomains > 0} />
                <Metric icon={Megaphone} label="Meta Ads" value={formatMetaMoney(data.summary.metaSpend30d, data.summary.metaCurrency)} detail={t('resultsCount', { count: formatNumber(data.summary.metaResults30d) })} href="/plugins/meta-ads" />
              </section>

              <p className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500"><Clock3 className="h-3.5 w-3.5" />{t('updatedAt', { time: freshness(data.generatedAt) })}</p>
            </TabsContent>

            {visibleWidgets.includes('focus') && (
              <TabsContent value="focus" className="mt-5 space-y-4 outline-none sm:mt-6">
                <StatTile icon={CheckCircle2} label={t('openTasks')} value={formatNumber(data.summary.openTasks)} detail={t('overdueCount', { count: data.summary.overdueTasks })} warning={data.summary.overdueTasks > 0} />
                {data.taskTarget ? (
                  <p className={cn('flex items-center gap-2 px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400', tile)}>
                    <Target className="h-3.5 w-3.5 text-indigo-500" />{t('taskTargetLabel')}: <strong className="font-bold text-neutral-900 dark:text-white">{data.taskTarget.projectName}</strong>
                  </p>
                ) : (
                  <p className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3 text-xs text-indigo-500"><CircleAlert className="h-3.5 w-3.5" />{t('noTaskTarget')}</p>
                )}
                <Panel title={t('focusTitle')} icon={Target}>
                  {data.tasks.length ? data.tasks.map((item) => (
                    <div key={item.id} className="flex min-h-[52px] items-center gap-3 border-b border-neutral-100 px-3 py-2.5 text-sm last:border-0 dark:border-neutral-700">
                      {data.permissions.tasksWrite && (
                        <button
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-neutral-300 text-transparent transition-all hover:border-indigo-500 hover:bg-indigo-500 hover:text-white dark:border-neutral-600"
                          onClick={() => performNowAction({ id: `task-${item.id}`, kind: 'task', title: item.title, detail: item.project, href: '/plugins/tasks', at: item.dueAt, urgent: item.overdue, action: { type: 'complete-task', id: item.id } })}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <Link href="/plugins/tasks" className="min-w-0 flex-1">
                        <strong className="block truncate font-bold text-neutral-900 dark:text-white">{item.title}</strong>
                        <span className="block truncate text-xs text-neutral-400 dark:text-neutral-500">{item.project} · {item.column}</span>
                      </Link>
                      <time className={cn('shrink-0 text-xs font-bold', item.overdue ? 'text-rose-500' : 'text-neutral-400 dark:text-neutral-500')}>{relativeDate(item.dueAt, t)}</time>
                    </div>
                  )) : <Empty icon={CheckCircle2} text={t('noTasks')} />}
                </Panel>
                <OpenModuleLink href="/plugins/tasks" label={t('openFull')} />
              </TabsContent>
            )}

            {visibleWidgets.includes('conversations') && (
              <TabsContent value="conversations" className="mt-5 space-y-4 outline-none sm:mt-6">
                <StatTile icon={MessageCircle} label={t('unread')} value={formatNumber(data.summary.unreadChats)} detail={t('conversations')} warning={data.summary.unreadChats > 0} />
                <Panel title={t('conversationsTitle')} icon={MessageCircle}>
                  {data.conversations.length ? data.conversations.map((chat) => (
                    <Link key={chat.id} href={chat.href} className="flex min-h-[56px] items-center gap-3 border-b border-neutral-100 px-3 py-2.5 text-sm last:border-0 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900/60">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-500/10 text-xs font-bold text-indigo-500">{chat.name.slice(0, 2).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate font-bold text-neutral-900 dark:text-white">{chat.name}</strong>
                        <span className="block truncate text-xs text-neutral-400 dark:text-neutral-500">{chat.preview || t('noPreview')}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <time className="text-xs text-neutral-400 dark:text-neutral-500">{relativeDate(chat.at, t)}</time>
                        {chat.unread > 0 && <b className="grid h-5 min-w-5 place-items-center rounded-full bg-indigo-500 px-1.5 text-[10px] font-bold text-white">{chat.unread}</b>}
                      </span>
                    </Link>
                  )) : <Empty icon={MessageCircle} text={t('noConversations')} />}
                </Panel>
                <OpenModuleLink href="/dashboard" label={t('openFull')} />
              </TabsContent>
            )}

            {visibleWidgets.includes('customers') && (
              <TabsContent value="customers" className="mt-5 space-y-4 outline-none sm:mt-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <StatTile icon={Users} label={t('customers')} value={formatNumber(data.summary.customers)} />
                  <StatTile icon={CheckCircle2} label={t('activeMemberships')} value={formatNumber(data.memberships.active)} />
                  <StatTile icon={Clock3} label={t('pendingMemberships')} value={formatNumber(data.memberships.pending)} />
                  <StatTile icon={CircleAlert} label={t('overduePayments')} value={formatNumber(data.memberships.overdue)} warning={data.memberships.overdue > 0} />
                  <StatTile icon={CalendarClock} label={t('expiringMemberships')} value={formatNumber(data.memberships.expiring)} warning={data.memberships.expiring > 0} />
                </div>
                <Panel title={t('customersTitle')} icon={Users}>
                  {data.customers.length ? data.customers.map((customer) => (
                    <div key={customer.id} className="flex min-h-[48px] items-center gap-3 border-b border-neutral-100 px-3 py-2.5 text-sm last:border-0 dark:border-neutral-700">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                      <strong className="min-w-0 flex-1 truncate font-bold text-neutral-900 dark:text-white">{customer.name}</strong>
                      <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">{customer.source}</span>
                      <Badge variant="secondary" className="shrink-0 rounded-md bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{customer.status}</Badge>
                    </div>
                  )) : <Empty icon={Users} text={t('noCustomers')} />}
                </Panel>
                <OpenModuleLink href="/plugins/customers" label={t('openFull')} />
              </TabsContent>
            )}

            {visibleWidgets.includes('revenue') && (
              <TabsContent value="revenue" className="mt-5 space-y-4 outline-none sm:mt-6">
                <div className={cn('p-5', card)}>
                  <small className={label}>{t('collected')}</small>
                  <strong className="mt-1.5 block text-3xl font-black tracking-tight text-neutral-900 dark:text-white sm:text-4xl">{formatMoney(data.revenue.paid, data.revenue.currency)}</strong>
                  <span className="mt-1 block text-xs font-bold text-indigo-500">{t('last30Sales', { count: data.revenue.recentSales })}</span>
                  <div className="mt-5 flex items-center justify-between text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">{t('pending')}</span>
                    <strong className="font-bold text-neutral-900 dark:text-white">{formatMoney(data.revenue.pending, data.revenue.currency)} · {collectedPercent}%</strong>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, collectedPercent)}%` }} />
                  </div>
                </div>
                <OpenModuleLink href="/plugins/sales" label={t('openFull')} />
              </TabsContent>
            )}

            {visibleWidgets.includes('marketing') && (
              <TabsContent value="marketing" className="mt-5 space-y-4 outline-none sm:mt-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <StatTile icon={WalletCards} label={t('spend30d')} value={formatMetaMoney(data.marketing.spend, data.marketing.currency)} />
                  <StatTile icon={Target} label={t('results')} value={formatNumber(data.marketing.results)} />
                  <StatTile icon={MousePointerClick} label={t('clicks')} value={formatNumber(data.marketing.clicks)} />
                  <StatTile icon={Users} label={t('accounts')} value={String(data.marketing.accounts)} />
                  <StatTile icon={Megaphone} label={t('campaigns')} value={String(data.marketing.activeCampaigns)} />
                </div>
                {costPerResult !== null && (
                  <div className="flex items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-500"><WalletCards className="h-[18px] w-[18px]" /></span>
                    <div>
                      <small className="block text-[11px] font-black uppercase tracking-[0.2em] text-indigo-500">{t('costPerResult')}</small>
                      <strong className="mt-0.5 block text-lg font-black text-neutral-900 dark:text-white">{formatMetaMoney(costPerResult, data.marketing.currency)}</strong>
                    </div>
                  </div>
                )}
                <OpenModuleLink href="/plugins/meta-ads" label={t('openFull')} />
              </TabsContent>
            )}

            {visibleWidgets.includes('infrastructure') && (
              <TabsContent value="infrastructure" className="mt-5 space-y-4 outline-none sm:mt-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Status icon={Network} label={t('domains')} value={String(data.infrastructure.domains)} detail={t('expiringCount', { count: data.infrastructure.expiring })} warning={data.infrastructure.expiring > 0} />
                  <Status icon={HardDrive} label="Hostinger" value={String(data.infrastructure.hostingerAccounts)} detail={data.infrastructure.hostingerErrors ? t('errorsCount', { count: data.infrastructure.hostingerErrors }) : t('systemsHealthy')} warning={data.infrastructure.hostingerErrors > 0} />
                  <Status icon={CheckCircle2} label={t('autoRenewLabel')} value={String(data.infrastructure.autoRenew)} detail={t('domains')} />
                  <Status icon={Clock3} label={t('lastSyncLabel')} value={data.infrastructure.lastSync ? relativeDate(data.infrastructure.lastSync, t) : t('neverSynced')} detail="Hostinger" />
                </div>
                <OpenModuleLink href="/plugins/domains" label={t('openFull')} />
              </TabsContent>
            )}

            {visibleWidgets.includes('knowledge') && (
              <TabsContent value="knowledge" className="mt-5 space-y-4 outline-none sm:mt-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile icon={FileText} label={t('documents')} value={formatNumber(data.knowledge.documents)} />
                  <StatTile icon={NotebookPen} label={t('notes')} value={formatNumber(data.knowledge.notes)} />
                  <StatTile icon={BookOpen} label={t('forms')} value={formatNumber(data.knowledge.forms)} />
                  <StatTile icon={FilePlus2} label={t('submissions')} value={formatNumber(data.knowledge.submissions)} />
                </div>
                <Panel title={t('knowledgeTitle')} icon={BookOpen}>
                  {data.knowledge.recentDocuments.length ? data.knowledge.recentDocuments.map((doc) => (
                    <Link key={doc.id} href={`/plugins/documents/doc/${doc.id}`} className="flex min-h-[44px] items-center gap-2 border-b border-neutral-100 px-3 py-2.5 text-sm last:border-0 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900/60">
                      <FileText className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
                      <strong className="min-w-0 flex-1 truncate font-bold text-neutral-900 dark:text-white">{doc.title}</strong>
                      <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">{relativeDate(doc.updatedAt, t)}</span>
                    </Link>
                  )) : <Empty icon={FileText} text={t('noDocuments')} />}
                </Panel>
                <OpenModuleLink href="/plugins/documents" label={t('openFull')} />
              </TabsContent>
            )}

            {visibleWidgets.includes('business-woman') && (
              <TabsContent value="business-woman" className="mt-5 space-y-4 outline-none sm:mt-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile icon={Link2} label={t('links')} value={formatNumber(data.businessWoman.links)} />
                  <StatTile icon={PanelTop} label={t('homeItems')} value={formatNumber(data.businessWoman.home)} />
                  <StatTile icon={Activity} label={t('growth')} value={formatNumber(data.businessWoman.growth)} />
                  <StatTile icon={Video} label={t('videos')} value={formatNumber(data.businessWoman.videos)} />
                </div>
                <Panel title="Business Woman" icon={BriefcaseBusiness}>
                  {data.businessWoman.agenda.length ? data.businessWoman.agenda.map((item) => (
                    <div key={item.id} className="grid min-h-[44px] grid-cols-[20px_60px_1fr] items-center gap-2 border-b border-neutral-100 px-3 py-2.5 text-sm last:border-0 dark:border-neutral-700">
                      <Clock3 className="h-4 w-4 text-indigo-500" />
                      <strong className="text-xs font-bold text-neutral-900 dark:text-white">{item.date || '—'}</strong>
                      <span className="truncate text-neutral-400 dark:text-neutral-500">{item.title}</span>
                    </div>
                  )) : <Empty icon={CalendarClock} text={t('agendaClear')} />}
                </Panel>
                <OpenModuleLink href="/plugins/mini-apps/business-woman-planner" label={t('openFull')} />
              </TabsContent>
            )}

            {visibleWidgets.includes('apps') && (
              <TabsContent value="apps" className="mt-5 space-y-4 outline-none sm:mt-6">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('appsTitle')} · {launcherApps.length} {t('active')}</p>
                <div className={cn('grid grid-cols-3 gap-4 p-5 sm:grid-cols-4 lg:grid-cols-6', card)}>
                  {launcherApps.map((app) => <AppIcon app={app} key={app.href} />)}
                </div>
                <OpenModuleLink href="/apps" label={t('openFull')} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent showCloseButton={false} className="top-[12%] max-h-[76vh] w-[calc(100%-1.5rem)] translate-y-0 gap-0 overflow-hidden rounded-[2rem] p-0 sm:max-w-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('search')}</DialogTitle>
            <DialogDescription>{t('searchPlaceholder')}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 border-b border-neutral-100 px-4 dark:border-neutral-700">
            <Search className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-14 flex-1 border-0 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white dark:placeholder:text-neutral-500"
            />
            <kbd className="shrink-0 rounded-md border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">ESC</kbd>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {searching && <div className="flex items-center justify-center gap-2 py-14 text-sm text-neutral-400 dark:text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />{t('searching')}</div>}
            {!searching && search.length < 2 && <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-neutral-400 dark:text-neutral-500"><Command className="h-5 w-5" />{t('searchHint')}</div>}
            {!searching && search.length >= 2 && !searchResults?.length && <div className="flex items-center justify-center py-14 text-sm text-neutral-400 dark:text-neutral-500">{t('noResults')}</div>}
            {searchResults?.map((result) => (
              <Link href={result.href} key={result.id} onClick={() => setSearchOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900/60">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-indigo-500 dark:bg-neutral-800"><Search className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-bold text-neutral-900 dark:text-white">{result.title}</strong>
                  <small className="block truncate text-xs text-neutral-400 dark:text-neutral-500">{result.subtitle}</small>
                </span>
                <em className="shrink-0 text-xs not-italic text-neutral-400 dark:text-neutral-500">{t(`resultTypes.${result.type}`)}</em>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-300" />
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] rounded-[2rem] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-white">{t('createSomething')}</DialogTitle>
            <DialogDescription className="text-neutral-500 dark:text-neutral-400">{t('quickCreate')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(['task', 'note', 'document'] as const).map((type) => {
                const Icon = type === 'task' ? CheckCircle2 : type === 'note' ? NotebookPen : FilePlus2;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCreateType(type)}
                    className={cn(
                      'flex h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border text-xs font-bold transition-all duration-200',
                      createType === type ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'border-neutral-100 text-neutral-400 hover:border-indigo-500/40 dark:border-neutral-700 dark:text-neutral-500',
                    )}
                  >
                    <Icon className="h-4 w-4" />{t(`createTypes.${type}`)}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              <Label htmlFor="escritorio-create-title" className="text-neutral-500 dark:text-neutral-400">{t('title')}</Label>
              <Input
                id="escritorio-create-title"
                autoFocus
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void createItem()}
                placeholder={t(`createPlaceholders.${createType}`)}
                className="rounded-xl border-neutral-200 dark:border-neutral-700"
              />
            </div>
            {createType === 'task' && !data.taskTarget && (
              <p className="flex items-center gap-2 text-xs text-rose-500"><CircleAlert className="h-3.5 w-3.5" />{t('noTaskTarget')}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-2xl border-neutral-200 dark:border-neutral-700" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
            <Button
              disabled={saving || !createTitle.trim() || (createType === 'task' && !data.taskTarget)}
              className="rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 dark:shadow-none"
              onClick={() => void createItem()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
