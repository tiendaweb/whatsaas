'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { preload } from 'swr';
import { CalendarRange, Columns3, ListChecks, Loader2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type DashboardView = 'kanban' | 'bookmarks' | 'tasks';

const VIEW_ORDER: DashboardView[] = ['kanban', 'bookmarks', 'tasks'];

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
};

function ViewLoading() {
  return (
    <div className="flex h-full min-h-[45vh] items-center justify-center bg-background" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

const KanbanBoard = dynamic(() => import('./KanbanBoard'), { ssr: false, loading: ViewLoading });
const BookmarksBoard = dynamic(() => import('./BookmarksBoard'), { ssr: false, loading: ViewLoading });
const DashboardTasksBoard = dynamic(() => import('./DashboardTasksBoard'), { ssr: false, loading: ViewLoading });

function viewFromParams(value: string | null): DashboardView {
  if (value === 'bookmarks') return value;
  if (value === 'tasks' || value === 'desktop') return 'tasks';
  return 'kanban';
}

function warmView(view: DashboardView) {
  if (view === 'kanban') {
    void import('./KanbanBoard');
    void preload('/api/funnel-stages', fetcher);
    void preload('/api/funnel-stage-groups', fetcher);
    void preload('/api/chats?scope=kanban', fetcher);
    void preload('/api/chats/kanban-metadata', fetcher);
    return;
  }
  if (view === 'bookmarks') {
    void import('./BookmarksBoard');
    void preload('/api/dashboard/bookmarks', fetcher);
    return;
  }
  void import('./DashboardTasksBoard');
  void preload('/api/dashboard/tasks', fetcher);
}

export default function DashboardPage() {
  const t = useTranslations('DashboardViews');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryView = viewFromParams(searchParams.get('view'));
  const hasBoardInUrl = searchParams.has('view');
  const [activeView, setActiveViewState] = useState<DashboardView>(queryView);
  const [mountedViews, setMountedViews] = useState<Set<DashboardView>>(() => new Set());
  const [selectedFunnelGroupId, setSelectedFunnelGroupId] = useState('all');
  const touchStartRef = useRef<{
    x: number;
    y: number;
    blocked: boolean;
    horizontalBoundary: 'start' | 'end' | 'both' | 'middle' | null;
  } | null>(null);

  useEffect(() => {
    const storedGroupId = localStorage.getItem('dashboardFunnelGroupId');
    if (storedGroupId) setSelectedFunnelGroupId(storedGroupId);
  }, []);

  useEffect(() => {
    setActiveViewState(queryView);
    if (hasBoardInUrl || !window.matchMedia('(max-width: 767px)').matches) {
      setMountedViews((current) => new Set(current).add(queryView));
    }
  }, [hasBoardInUrl, queryView]);

  useEffect(() => {
    const showBoard = (event: Event) => {
      const requestedView = (event as CustomEvent<{ view?: string }>).detail?.view;
      const nextView = viewFromParams(requestedView ?? new URLSearchParams(window.location.search).get('view'));
      setActiveViewState(nextView);
      setMountedViews((current) => new Set(current).add(nextView));
      warmView(nextView);
    };
    window.addEventListener('dashboard:show-board', showBoard);
    return () => window.removeEventListener('dashboard:show-board', showBoard);
  }, []);

  useEffect(() => {
    const warmAdjacentViews = () => {
      warmView('kanban');
      window.setTimeout(() => warmView('bookmarks'), 350);
      window.setTimeout(() => warmView('tasks'), 800);
    };
    const idleApi = window as unknown as {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const idleCallback = idleApi.requestIdleCallback?.bind(window);
    const idleId = idleCallback
      ? idleCallback(warmAdjacentViews, { timeout: 1800 })
      : window.setTimeout(warmAdjacentViews, 900);
    return () => {
      if (idleCallback) idleApi.cancelIdleCallback?.(idleId);
      else window.clearTimeout(idleId);
    };
  }, []);

  const selectFunnelGroup = (groupId: string) => {
    setSelectedFunnelGroupId(groupId);
    localStorage.setItem('dashboardFunnelGroupId', groupId);
  };

  const openView = useCallback((view: DashboardView) => {
    setActiveViewState(view);
    setMountedViews((current) => new Set(current).add(view));
    localStorage.setItem('dashboardActiveView', view);
    warmView(view);

    const index = VIEW_ORDER.indexOf(view);
    const nextView = VIEW_ORDER[index + 1];
    if (nextView) window.setTimeout(() => warmView(nextView), 120);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('view', view);
    if (view !== 'tasks') nextParams.delete('contactId');
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    window.dispatchEvent(new CustomEvent('dashboard:show-board', { detail: { view } }));
  }, [pathname, router, searchParams]);

  const openChats = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('view');
    nextParams.delete('contactId');
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    window.dispatchEvent(new Event('dashboard:show-chat-list'));
  }, [pathname, router, searchParams]);

  const navigateBySwipe = useCallback((direction: -1 | 1) => {
    const currentIndex = VIEW_ORDER.indexOf(activeView);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0) openChats();
    else if (nextIndex < VIEW_ORDER.length) openView(VIEW_ORDER[nextIndex]);
  }, [activeView, openChats, openView]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const target = event.target as HTMLElement;
    const horizontalScroller = target.closest<HTMLElement>('[data-dashboard-horizontal-scroll]');
    const atStart = !horizontalScroller || horizontalScroller.scrollLeft <= 2;
    const atEnd = !horizontalScroller
      || horizontalScroller.scrollLeft + horizontalScroller.clientWidth >= horizontalScroller.scrollWidth - 2;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      blocked: Boolean(target.closest('button, input, textarea, select, [role="dialog"], [data-rbd-draggable-context-id], [data-dashboard-swipe-lock]')),
      horizontalBoundary: !horizontalScroller
        ? null
        : atStart && atEnd
          ? 'both'
          : atStart
            ? 'start'
            : atEnd
              ? 'end'
              : 'middle',
    };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || start.blocked) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    if (start.horizontalBoundary === 'middle') return;
    if (deltaX < 0 && start.horizontalBoundary === 'start') return;
    if (deltaX > 0 && start.horizontalBoundary === 'end') return;
    navigateBySwipe(deltaX < 0 ? 1 : -1);
  };

  const views = [
    { id: 'kanban' as const, label: t('kanban_label'), icon: Columns3 },
    { id: 'bookmarks' as const, label: t('bookmarks_label'), icon: CalendarRange },
    { id: 'tasks' as const, label: t('tasks_label'), icon: ListChecks },
  ];

  const desktopViewSwitcher = (
    <nav className="hidden h-full shrink-0 items-stretch md:flex" aria-label={t('views_heading')}>
      {views.map((view) => {
        const Icon = view.icon;
        const active = activeView === view.id;
        return (
          <button
            key={view.id}
            type="button"
            className={cn(
              'flex h-full shrink-0 items-center gap-2 border-r border-border px-3 text-sm font-semibold transition-colors sm:px-4',
              active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => openView(view.id)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4" />
            {view.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <nav className="grid h-12 shrink-0 grid-cols-3 border-b border-border bg-white md:hidden dark:bg-card" aria-label={t('views_heading')}>
        {views.map((view, index) => {
          const Icon = view.icon;
          const active = activeView === view.id;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => openView(view.id)}
              className={cn(
                'relative flex min-w-0 items-center justify-center gap-1.5 border-r border-border px-2 text-xs font-semibold last:border-r-0',
                active ? 'text-[#002FA7] dark:text-blue-400' : 'text-muted-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <span className="absolute left-0 top-0 px-1.5 pt-1 text-[8px] tabular-nums text-muted-foreground/60">0{index + 1}</span>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{view.label}</span>
              <span className={cn('absolute inset-x-3 bottom-0 h-0.5 bg-transparent', active && 'bg-[#002FA7] dark:bg-blue-400')} />
            </button>
          );
        })}
      </nav>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {mountedViews.has('kanban') && (
          <section className={cn('h-full bg-muted/35', activeView !== 'kanban' && 'hidden')} aria-hidden={activeView !== 'kanban'}>
            <KanbanBoard
              viewSwitcher={desktopViewSwitcher}
              selectedGroupId={selectedFunnelGroupId}
              onSelectedGroupChange={selectFunnelGroup}
            />
          </section>
        )}
        {mountedViews.has('bookmarks') && (
          <section className={cn('h-full', activeView !== 'bookmarks' && 'hidden')} aria-hidden={activeView !== 'bookmarks'}>
            <BookmarksBoard
              viewSwitcher={desktopViewSwitcher}
              selectedGroupId={selectedFunnelGroupId}
              onSelectedGroupChange={selectFunnelGroup}
            />
          </section>
        )}
        {mountedViews.has('tasks') && (
          <section className={cn('h-full', activeView !== 'tasks' && 'hidden')} aria-hidden={activeView !== 'tasks'}>
            <DashboardTasksBoard viewSwitcher={desktopViewSwitcher} />
          </section>
        )}
      </div>
    </div>
  );
}
