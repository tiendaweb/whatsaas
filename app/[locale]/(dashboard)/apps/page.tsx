'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  LayoutGrid,
  Loader2,
  LockKeyhole,
  PackageOpen,
  Puzzle,
  Search,
  Sparkles,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildLauncherApps,
  type InstalledMiniApp,
  type PublishedAppMakerApp,
  type LauncherApp,
  type PluginNavItem,
} from '@/components/apps/launcher-catalog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
};

type AppSection = 'library' | 'catalog';
type CatalogFilter = 'all' | 'active' | 'available';
type PluginCategory = 'ai' | 'business' | 'connectors' | 'content' | 'marketing' | 'productivity' | 'tools' | 'web';

type MarketplacePrice = {
  id?: number;
  amount: number;
  currency: string;
  billingType: string;
  enabled: boolean;
};

type MarketplaceCatalogItem = {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string;
  iconUrl: string | null;
  imageUrl?: string | null;
  tags?: string[];
  features?: Array<{ id?: string; name: string; description: string; enabled?: boolean }>;
  prices?: MarketplacePrice[];
};

type PluginCatalogItem = {
  id: string;
  displayName: string;
  activationMode: 'system' | 'global' | 'user' | 'hybrid';
  category: PluginCategory;
  free: boolean;
  routes: Array<{ path: string; title: string }>;
  navItems: PluginNavItem[];
  featureFlags: string[];
  state: {
    installed: boolean;
    enabled: boolean;
    teamEnabled: boolean;
    memberOverride: boolean | null;
    canToggle: boolean;
    lockedReason: 'system' | 'team_admin' | null;
  };
};

type MarketplaceEntitlement = { itemId: number; status: string };

export default function AppsPage() {
  const t = useTranslations('Apps');
  const locale = useLocale();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<AppSection>('library');
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingPluginId, setPendingPluginId] = useState<string | null>(null);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<MarketplaceCatalogItem | null>(null);

  const {
    data: pluginNavItems,
    error: pluginNavError,
    isLoading: isLoadingPlugins,
    mutate: mutatePluginNav,
  } = useSWR<PluginNavItem[]>('/api/plugins/nav', fetcher);
  const {
    data: installedMiniApps = [],
    error: miniAppsError,
    isLoading: isLoadingMiniApps,
  } = useSWR<InstalledMiniApp[]>('/api/mini-apps', fetcher);
  const { data: appMakerResponse } = useSWR<{ apps: PublishedAppMakerApp[] }>(
    '/api/plugins/app-maker/apps?published=1',
    fetcher,
  );
  const { data: menuConfig } = useSWR<{ overrides: { itemKey: string; pinned: boolean; order: number }[] }>(
    '/api/menu/config',
    fetcher,
  );
  const {
    data: pluginCatalogResponse,
    error: pluginCatalogError,
    isLoading: isLoadingPluginCatalog,
    mutate: mutatePluginCatalog,
  } = useSWR<{ data: PluginCatalogItem[] }>('/api/plugins/catalog', fetcher);
  const {
    data: marketplaceItems = [],
    error: marketplaceError,
    isLoading: isLoadingMarketplace,
  } = useSWR<MarketplaceCatalogItem[]>('/api/plugins/marketplace/items', fetcher);
  const { data: marketplaceEntitlements = [] } = useSWR<MarketplaceEntitlement[]>(
    '/api/plugins/marketplace/entitlements',
    fetcher,
  );

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const launcherApps = useMemo(
    () => buildLauncherApps(pluginNavItems ?? [], installedMiniApps, menuConfig?.overrides ?? [], appMakerResponse?.apps ?? []),
    [appMakerResponse?.apps, installedMiniApps, pluginNavItems, menuConfig],
  );
  const pluginCatalog = pluginCatalogResponse?.data ?? [];
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase(locale);
  const filteredLauncherApps = launcherApps.filter((app) =>
    !normalizedSearch || `${app.label} ${app.description}`.toLocaleLowerCase(locale).includes(normalizedSearch),
  );
  const filteredPlugins = pluginCatalog.filter((plugin) => {
    const matchesSearch = !normalizedSearch
      || `${plugin.displayName} ${plugin.id} ${plugin.category}`.toLocaleLowerCase(locale).includes(normalizedSearch);
    const matchesFilter = catalogFilter === 'all'
      || (catalogFilter === 'active' && plugin.state.enabled)
      || (catalogFilter === 'available' && !plugin.state.enabled);
    return matchesSearch && matchesFilter;
  });
  const filteredMarketplaceItems = marketplaceItems.filter((item) =>
    !normalizedSearch
    || `${item.title} ${item.subtitle ?? ''} ${item.description ?? ''} ${item.category}`
      .toLocaleLowerCase(locale)
      .includes(normalizedSearch),
  );
  const activeEntitlementIds = new Set(
    marketplaceEntitlements.filter((item) => item.status === 'active').map((item) => item.itemId),
  );
  const activePluginCount = pluginCatalog.filter((plugin) => plugin.state.enabled).length;
  const libraryError = pluginNavError || miniAppsError;
  const catalogError = pluginCatalogError || marketplaceError;

  const chooseSection = (nextSection: AppSection) => {
    setSection(nextSection);
    setSearchQuery('');
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  async function togglePlugin(plugin: PluginCatalogItem) {
    if (!plugin.state.canToggle || pendingPluginId) return;
    const enabled = !plugin.state.enabled;
    setPendingPluginId(plugin.id);
    try {
      const response = await fetch('/api/plugins/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: plugin.id, enabled }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || t('toggle_error'));
      await Promise.all([mutatePluginCatalog(), mutatePluginNav()]);
      toast.success(enabled ? t('activated_success', { name: plugin.displayName }) : t('deactivated_success', { name: plugin.displayName }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toggle_error'));
    } finally {
      setPendingPluginId(null);
    }
  }

  return (
    <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-muted/40 font-sans text-foreground">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-3 pb-28 pt-3 sm:px-5 md:px-8 md:pb-10 md:pt-5">
          <section className="overflow-hidden rounded-[1.75rem] border border-border bg-background shadow-sm">
            <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-3 sm:px-4 md:px-5">
              <SearchField
                inputRef={searchInputRef}
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={section === 'library' ? t('search_library') : t('search_catalog')}
                label={section === 'library' ? t('search_library') : t('search_catalog')}
              />
              <Badge variant="secondary" className="hidden shrink-0 gap-1.5 py-1.5 md:flex">
                <Check className="size-3" />
                {t('active_count', { count: activePluginCount })}
              </Badge>
              <Button variant="outline" size="sm" className="hidden shrink-0 lg:inline-flex" asChild>
                <Link href="/apps/requests">{t('request_improvement')}</Link>
              </Button>
            </div>

            {section === 'library' ? (
              <LibraryView
                apps={filteredLauncherApps}
                totalCount={launcherApps.length}
                isLoading={isLoadingPlugins || isLoadingMiniApps}
                error={libraryError}
                hasSearch={Boolean(normalizedSearch)}
                onOpen={(href) => router.push(href)}
                onRetry={() => void mutatePluginNav()}
                t={t}
              />
            ) : (
              <CatalogView
                plugins={filteredPlugins}
                marketplaceItems={filteredMarketplaceItems}
                activeEntitlementIds={activeEntitlementIds}
                activePluginCount={activePluginCount}
                totalPluginCount={pluginCatalog.length}
                filter={catalogFilter}
                onFilterChange={setCatalogFilter}
                pendingPluginId={pendingPluginId}
                isLoading={isLoadingPluginCatalog || isLoadingMarketplace}
                error={catalogError}
                onToggle={togglePlugin}
                onOpenPlugin={(plugin) => {
                  const href = plugin.navItems[0]?.href ?? plugin.routes[0]?.path;
                  if (href) router.push(href);
                }}
                onOpenMarketplace={setSelectedCatalogItem}
                onRetry={() => void Promise.all([mutatePluginCatalog(), mutatePluginNav()])}
                t={t}
                locale={locale}
              />
            )}

            <nav className="sticky bottom-3 z-20 mx-auto mb-4 mt-2 flex w-[calc(100%-1.5rem)] max-w-md items-center gap-1 rounded-2xl border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur md:bottom-5 md:mb-6" aria-label={t('section_navigation')}>
              <DockButton
                active={section === 'library'}
                icon={LayoutGrid}
                label={t('library_tab')}
                count={launcherApps.length}
                onClick={() => chooseSection('library')}
              />
              <DockButton
                active={section === 'catalog'}
                icon={Store}
                label={t('catalog_tab')}
                count={pluginCatalog.length + marketplaceItems.length}
                onClick={() => chooseSection('catalog')}
              />
            </nav>
          </section>
        </div>
      </main>

      <MarketplaceDetailDialog
        item={selectedCatalogItem}
        locale={locale}
        onClose={() => setSelectedCatalogItem(null)}
        onOpenDetail={(item) => router.push(`/apps/${item.id}`)}
        t={t}
      />
    </div>
  );
}

function SearchField({ inputRef, value, onChange, placeholder, label }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 w-full rounded-xl border-border bg-background pl-11 pr-12 focus-visible:ring-ring"
      />
      <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground sm:block">/</kbd>
    </div>
  );
}

function LibraryView({ apps, totalCount, isLoading, error, hasSearch, onOpen, onRetry, t }: {
  apps: LauncherApp[];
  totalCount: number;
  isLoading: boolean;
  error: unknown;
  hasSearch: boolean;
  onOpen: (href: string) => void;
  onRetry: () => void;
  t: ReturnType<typeof useTranslations<'Apps'>>;
}) {
  if (error) return <StatePanel icon={CircleAlert} title={t('load_error_title')} detail={t('load_error_detail')} action={t('retry')} onAction={onRetry} />;
  if (isLoading) return <AppIconSkeleton />;
  if (!apps.length) {
    return <StatePanel icon={PackageOpen} title={hasSearch ? t('no_search_results') : t('empty_library_title')} detail={hasSearch ? t('try_another_search') : t('empty_library_detail')} />;
  }

  return (
    <div className="relative min-h-[30rem] bg-muted/30 px-4 py-7 sm:px-7 md:min-h-[36rem] md:px-10 md:py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{t('my_space')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('apps_available', { count: totalCount })}</p>
        </div>
        <span className="flex size-10 items-center justify-center rounded-full border border-border bg-background text-primary">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-7 min-[430px]:grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {apps.map((app) => <HomeScreenApp key={app.href} app={app} openLabel={t('open_app', { name: app.label })} onOpen={() => onOpen(app.href)} />)}
      </div>
    </div>
  );
}

function HomeScreenApp({ app, openLabel, onOpen }: { app: LauncherApp; openLabel: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={openLabel}
      className="group flex min-w-0 flex-col items-center gap-2 rounded-xl p-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-muted/30"
    >
      <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-sm motion-safe:transition motion-safe:duration-200 motion-safe:group-hover:-translate-y-1 group-hover:shadow-md sm:size-[4.5rem]">
        {app.visual.imageUrl ? (
          <span className="flex size-full items-center justify-center bg-background p-3">
            <Image
              src={app.visual.imageUrl}
              alt={app.visual.imageAlt ?? app.label}
              width={72}
              height={72}
              className={cn('size-full object-contain', app.visual.invertInDark && 'dark:invert')}
            />
          </span>
        ) : (
          <app.icon className="size-7 text-primary sm:size-8" aria-hidden="true" />
        )}
        <span className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-primary/0 motion-safe:transition-colors group-hover:bg-primary/60" />
      </span>
      <span className="line-clamp-2 max-w-24 text-xs font-semibold leading-4 text-foreground">{app.label}</span>
    </button>
  );
}

function CatalogView({
  plugins,
  marketplaceItems,
  activeEntitlementIds,
  activePluginCount,
  totalPluginCount,
  filter,
  onFilterChange,
  pendingPluginId,
  isLoading,
  error,
  onToggle,
  onOpenPlugin,
  onOpenMarketplace,
  onRetry,
  t,
  locale,
}: {
  plugins: PluginCatalogItem[];
  marketplaceItems: MarketplaceCatalogItem[];
  activeEntitlementIds: Set<number>;
  activePluginCount: number;
  totalPluginCount: number;
  filter: CatalogFilter;
  onFilterChange: (filter: CatalogFilter) => void;
  pendingPluginId: string | null;
  isLoading: boolean;
  error: unknown;
  onToggle: (plugin: PluginCatalogItem) => void;
  onOpenPlugin: (plugin: PluginCatalogItem) => void;
  onOpenMarketplace: (item: MarketplaceCatalogItem) => void;
  onRetry: () => void;
  t: ReturnType<typeof useTranslations<'Apps'>>;
  locale: string;
}) {
  if (error) return <StatePanel icon={CircleAlert} title={t('load_error_title')} detail={t('load_error_detail')} action={t('retry')} onAction={onRetry} />;
  if (isLoading) return <CatalogSkeleton />;

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 md:px-8 md:py-9">
      <section className="grid overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.06] md:grid-cols-[1fr_auto]">
        <div className="p-5 md:p-7">
          <Badge className="mb-4">{t('included_badge')}</Badge>
          <h3 className="max-w-2xl text-2xl font-bold tracking-[-0.04em] md:text-3xl">{t('included_title')}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t('included_description')}</p>
        </div>
        <div className="grid grid-cols-2 border-t border-primary/15 md:min-w-64 md:border-l md:border-t-0">
          <StoreMetric value={totalPluginCount} label={t('included_apps')} />
          <StoreMetric value={activePluginCount} label={t('active_apps')} />
        </div>
      </section>

      <section aria-labelledby="included-plugins-title">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 id="included-plugins-title" className="text-xl font-bold tracking-[-0.03em]">{t('free_plugins_title')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('free_plugins_description')}</p>
          </div>
          <div className="flex w-full rounded-xl bg-muted p-1 md:w-auto" aria-label={t('filter_apps')}>
            {(['all', 'active', 'available'] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={filter === item}
                onClick={() => onFilterChange(item)}
                className={cn(
                  'min-h-9 flex-1 rounded-lg px-3 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-none',
                  filter === item ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`filter_${item}`)}
              </button>
            ))}
          </div>
        </div>

        {plugins.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plugins.map((plugin) => (
              <PluginStoreCard
                key={plugin.id}
                plugin={plugin}
                pending={pendingPluginId === plugin.id}
                onToggle={() => onToggle(plugin)}
                onOpen={() => onOpenPlugin(plugin)}
                t={t}
              />
            ))}
          </div>
        ) : (
          <StatePanel icon={Search} title={t('no_search_results')} detail={t('try_another_search')} compact />
        )}
      </section>

      {marketplaceItems.length ? (
        <section aria-labelledby="marketplace-title">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h3 id="marketplace-title" className="text-xl font-bold tracking-[-0.03em]">{t('marketplace_title')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('marketplace_description')}</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/plugins/marketplace">
                {t('view_marketplace')}
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {marketplaceItems.map((item) => (
              <MarketplaceStoreCard
                key={item.id}
                item={item}
                active={activeEntitlementIds.has(item.id)}
                locale={locale}
                onOpen={() => onOpenMarketplace(item)}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PluginStoreCard({ plugin, pending, onToggle, onOpen, t }: {
  plugin: PluginCatalogItem;
  pending: boolean;
  onToggle: () => void;
  onOpen: () => void;
  t: ReturnType<typeof useTranslations<'Apps'>>;
}) {
  const visual = catalogVisual(plugin);
  const Icon = visual.icon;
  const hasRoute = Boolean(plugin.navItems[0]?.href ?? plugin.routes[0]?.path);
  return (
    <article className="flex min-h-52 flex-col rounded-2xl border border-border bg-card p-4 shadow-xs motion-safe:transition motion-safe:duration-200 hover:border-primary/35 hover:shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <AppStoreIcon icon={Icon} imageUrl={visual.imageUrl} imageAlt={visual.imageAlt ?? plugin.displayName} invertInDark={visual.invertInDark} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h4 className="truncate text-base font-bold">{plugin.displayName}</h4>
          <p className="mt-0.5 text-xs font-medium text-primary">{t(`category_${plugin.category}`)}</p>
        </div>
        {plugin.state.enabled ? <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" aria-label={t('active')} /> : null}
      </div>
      <p className="mt-4 line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">{t(`category_descriptions.${plugin.category}`)}</p>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs font-bold text-foreground">{t('free')}</span>
        <div className="flex items-center gap-2">
          {plugin.state.enabled && hasRoute ? (
            <Button variant="outline" size="sm" onClick={onOpen}>{t('open')}</Button>
          ) : null}
          {plugin.state.canToggle ? (
            <Button variant={plugin.state.enabled ? 'ghost' : 'default'} size="sm" disabled={pending} onClick={onToggle}>
              {pending ? <Loader2 className="size-4 motion-safe:animate-spin" /> : null}
              {plugin.state.enabled ? t('deactivate') : t('activate')}
            </Button>
          ) : (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-muted px-3 text-xs font-semibold text-muted-foreground">
              <LockKeyhole className="size-3" />
              {plugin.state.lockedReason === 'system' ? t('included') : t('managed_by_team')}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function MarketplaceStoreCard({ item, active, locale, onOpen, t }: {
  item: MarketplaceCatalogItem;
  active: boolean;
  locale: string;
  onOpen: () => void;
  t: ReturnType<typeof useTranslations<'Apps'>>;
}) {
  return (
    <article className="flex min-h-48 flex-col rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-start gap-3">
        <RemoteIcon iconUrl={item.iconUrl} title={item.title} />
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-base font-bold">{item.title}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{item.category}</p>
        </div>
        {active ? <Badge variant="secondary">{t('active')}</Badge> : null}
      </div>
      <p className="mt-4 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">{item.subtitle || item.description || t('details_available')}</p>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs font-bold">{formatMarketplacePrice(item.prices, locale, t('consult_price'), t('free'))}</span>
        <Button variant="secondary" size="sm" onClick={onOpen}>{t('view_details')}</Button>
      </div>
    </article>
  );
}

function AppStoreIcon({ icon: Icon, imageUrl, imageAlt, invertInDark }: { icon: LucideIcon; imageUrl?: string; imageAlt: string; invertInDark?: boolean }) {
  return (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-primary/10 text-primary shadow-xs">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={imageAlt}
          width={56}
          height={56}
          className={cn('size-full object-contain p-2.5', invertInDark ? 'bg-background dark:bg-transparent dark:invert' : 'bg-background')}
        />
      ) : (
        <Icon className="size-6" />
      )}
    </span>
  );
}

function RemoteIcon({ iconUrl, title, size = 'card' }: { iconUrl: string | null; title: string; size?: 'card' | 'dialog' }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-primary/10 text-primary', size === 'dialog' ? 'size-20' : 'size-14')}>
      {iconUrl && !failed ? (
        <img src={iconUrl} alt={title} className="size-full bg-background object-contain p-2.5" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="text-base font-bold">{initials(title)}</span>
      )}
    </span>
  );
}

function DockButton({ active, icon: Icon, label, count, onClick }: { active: boolean; icon: LucideIcon; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold outline-none motion-safe:transition focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
      <span className={cn('text-[11px] tabular-nums', active ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{count}</span>
    </button>
  );
}

function StoreMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-h-24 flex-col justify-center border-r border-primary/15 px-5 last:border-r-0 md:min-h-full">
      <span className="text-3xl font-bold tabular-nums text-primary">{value}</span>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function StatePanel({ icon: Icon, title, detail, action, onAction, compact = false }: { icon: LucideIcon; title: string; detail: string; action?: string; onAction?: () => void; compact?: boolean }) {
  return (
    <div className={cn('flex items-center justify-center p-6 text-center', compact ? 'min-h-48 rounded-2xl border border-dashed border-border' : 'min-h-[30rem]')}>
      <div className="max-w-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Icon className="size-5" /></span>
        <h3 className="mt-4 text-base font-bold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
        {action && onAction ? <Button variant="outline" size="sm" className="mt-4" onClick={onAction}>{action}</Button> : null}
      </div>
    </div>
  );
}

function AppIconSkeleton() {
  return (
    <div className="grid min-h-[30rem] grid-cols-3 gap-x-3 gap-y-7 bg-muted/30 px-4 py-10 min-[430px]:grid-cols-4 sm:grid-cols-5 md:px-10 lg:grid-cols-6 xl:grid-cols-7" aria-busy="true">
      {Array.from({ length: 14 }).map((_, index) => (
        <div key={index} className="flex flex-col items-center gap-2 motion-safe:animate-pulse">
          <div className="size-16 rounded-[1.25rem] bg-muted sm:size-[4.5rem]" />
          <div className="h-3 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="space-y-8 px-4 py-7 sm:px-6 md:px-8" aria-busy="true">
      <div className="h-44 rounded-2xl bg-muted motion-safe:animate-pulse" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => <div key={index} className="h-52 rounded-2xl bg-muted motion-safe:animate-pulse" />)}
      </div>
    </div>
  );
}

function MarketplaceDetailDialog({ item, locale, onClose, onOpenDetail, t }: {
  item: MarketplaceCatalogItem | null;
  locale: string;
  onClose: () => void;
  onOpenDetail: (item: MarketplaceCatalogItem) => void;
  t: ReturnType<typeof useTranslations<'Apps'>>;
}) {
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[88dvh] max-w-2xl overflow-y-auto rounded-2xl border-border bg-card p-0 text-card-foreground">
        <DialogHeader className="border-b border-border p-5 text-left md:p-7">
          <div className="flex items-start gap-4">
            <RemoteIcon iconUrl={item.iconUrl} title={item.title} size="dialog" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-primary">{item.category}</p>
              <DialogTitle className="mt-1 text-2xl font-bold tracking-[-0.03em]">{item.title}</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">{item.subtitle || t('details_available')}</DialogDescription>
              <p className="mt-3 text-xs font-bold">{formatMarketplacePrice(item.prices, locale, t('consult_price'), t('free'))}</p>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-6 p-5 md:p-7">
          <div>
            <h3 className="text-sm font-bold">{t('app_description')}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.description || t('no_description')}</p>
          </div>
          {item.features?.length ? (
            <ul className="divide-y divide-border border-y border-border">
              {item.features.filter((feature) => feature.enabled !== false).slice(0, 5).map((feature) => (
                <li key={feature.id ?? feature.name} className="py-3">
                  <p className="text-sm font-semibold">{feature.name}</p>
                  {feature.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{feature.description}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button onClick={() => onOpenDetail(item)}>{t('view_full_details')}<ArrowRight className="size-4" /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function catalogVisual(plugin: PluginCatalogItem): { icon: LucideIcon; imageUrl?: string; imageAlt?: string; invertInDark?: boolean } {
  const href = plugin.navItems[0]?.href;
  const app = href ? buildLauncherApps(plugin.navItems, []).find((candidate) => candidate.href === href) : null;
  return app
    ? { icon: app.icon, imageUrl: app.visual.imageUrl, imageAlt: app.visual.imageAlt, invertInDark: app.visual.invertInDark }
    : { icon: Puzzle };
}

function initials(title: string) {
  return title.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function formatMarketplacePrice(prices: MarketplacePrice[] | undefined, locale: string, quoteLabel: string, freeLabel: string) {
  const price = prices?.find((item) => item.enabled && item.amount > 0)
    ?? prices?.find((item) => item.enabled)
    ?? prices?.[0];
  if (!price || price.billingType === 'quote') return quoteLabel;
  if (price.billingType === 'free' || price.amount === 0) return freeLabel;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(price.amount / 100);
}
