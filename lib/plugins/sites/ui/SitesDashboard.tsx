'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useFormatter, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  File,
  FileArchive,
  FilePlus2,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Globe2,
  Grid2X2,
  Images,
  Link2,
  Loader2,
  MoreHorizontal,
  PanelsTopLeft,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Table2,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { OnMount } from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  buildVisualEditorDocument,
  SITES_VISUAL_EDITOR_CHANNEL,
  type VisualEditorMessage,
  type VisualImage,
  type VisualLink,
} from './visual-editor-bridge';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/40">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

type Site = {
  id: number;
  name: string;
  category: string | null;
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  settings: Record<string, unknown>;
  published: boolean;
  fileCount: number;
  sizeBytes: number;
  updatedAt: string;
  publicPath: string;
  subdomainHost: string | null;
};

type SiteFile = {
  id: number;
  path: string;
  kind: 'file' | 'folder';
  mimeType: string | null;
  encoding: 'utf8' | 'base64';
  sizeBytes: number;
  updatedAt: string;
};

type FileDetail = SiteFile & {
  content: string | null;
  editable: boolean;
};

type SitesViewMode = 'grid' | 'table' | 'bookmarks';

const SITES_VIEW_KEY = 'whatsaas.sites.view-mode';
const SITES_GROUP_KEY = 'whatsaas.sites.group-by-category';

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error || `Request failed with status ${response.status}`);
  return json as T;
};

async function apiMutation<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error || 'Request failed');
  return json as T;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function languageForPath(filePath: string) {
  const extension = filePath.split('.').pop()?.toLowerCase();
  return (
    {
      css: 'css',
      htm: 'html',
      html: 'html',
      js: 'javascript',
      json: 'json',
      jsx: 'javascript',
      md: 'markdown',
      mjs: 'javascript',
      svg: 'xml',
      ts: 'typescript',
      tsx: 'typescript',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
    }[extension ?? ''] ?? 'plaintext'
  );
}

function isSafeVisualUrl(value: string, allowEmpty = false) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return allowEmpty;
  return !normalized.startsWith('javascript:') && !normalized.startsWith('vbscript:');
}

function resolveVisualAssetUrl(src: string, publicUrl: string) {
  try {
    return new URL(src, `${publicUrl.replace(/\/+$/, '')}/`).toString();
  } catch {
    return src;
  }
}

export function SitesDashboard() {
  const t = useTranslations('Sites');
  const { data: sites, error, isLoading, isValidating, mutate } = useSWR<Site[]>('/api/plugins/sites', fetchJson);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<SitesViewMode>('grid');
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (selectedId && sites && !sites.some((site) => site.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, sites]);

  useEffect(() => {
    const savedView = window.localStorage.getItem(SITES_VIEW_KEY);
    if (savedView === 'grid' || savedView === 'table' || savedView === 'bookmarks') {
      setViewMode(savedView);
    }
    setGroupByCategory(window.localStorage.getItem(SITES_GROUP_KEY) === 'true');
  }, []);

  const selectedSite = sites?.find((site) => site.id === selectedId) ?? null;

  function changeViewMode(nextView: SitesViewMode) {
    setViewMode(nextView);
    window.localStorage.setItem(SITES_VIEW_KEY, nextView);
  }

  function changeGrouping(nextValue: boolean) {
    setGroupByCategory(nextValue);
    window.localStorage.setItem(SITES_GROUP_KEY, String(nextValue));
  }

  async function createSite() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const site = await apiMutation<Site>('/api/plugins/sites', 'POST', {
        name: newName.trim(),
        category: newCategory.trim() || null,
      });
      toast.success(t('site_created_toast'));
      setCreateOpen(false);
      setNewName('');
      setNewCategory('');
      await mutate();
      setSelectedId(site.id);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : t('generic_error'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-screen min-h-0 w-full flex-col overflow-hidden bg-muted/30 text-foreground">
      {!selectedSite ? (
        <header className="flex shrink-0 flex-col gap-4 border-b border-border bg-background px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-primary bg-primary text-primary-foreground">
              <PanelsTopLeft className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
              <p className="text-sm text-muted-foreground">{t('description')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void mutate()} disabled={isValidating}>
              {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('refresh_button')}
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('new_site_button')}
            </Button>
          </div>
        </header>
      ) : null}

      <main className="min-h-0 flex-1">
        {selectedSite ? (
          <SiteWorkspace
            site={selectedSite}
            refreshSites={mutate}
            onBack={() => setSelectedId(null)}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <SitesLibrary
            sites={sites ?? []}
            error={error}
            isLoading={isLoading}
            viewMode={viewMode}
            groupByCategory={groupByCategory}
            onViewModeChange={changeViewMode}
            onGroupingChange={changeGrouping}
            onEdit={setSelectedId}
            onCreate={() => setCreateOpen(true)}
          />
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('create_dialog_title')}</DialogTitle>
            <DialogDescription>{t('create_dialog_description')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createSite();
            }}
            className="space-y-4 py-2"
          >
            <div className="space-y-2">
              <Label htmlFor="site-name">{t('site_name_label')}</Label>
              <Input
                id="site-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t('site_name_placeholder')}
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-category">{t('category_label')}</Label>
              <Input
                id="site-category"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder={t('category_placeholder')}
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">{t('category_help')}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t('cancel_button')}</Button>
              <Button type="submit" disabled={creating || !newName.trim()}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('create_button')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SitesLibrary({
  sites,
  error,
  isLoading,
  viewMode,
  groupByCategory,
  onViewModeChange,
  onGroupingChange,
  onEdit,
  onCreate,
}: {
  sites: Site[];
  error: unknown;
  isLoading: boolean;
  viewMode: SitesViewMode;
  groupByCategory: boolean;
  onViewModeChange: (view: SitesViewMode) => void;
  onGroupingChange: (grouped: boolean) => void;
  onEdit: (siteId: number) => void;
  onCreate: () => void;
}) {
  const t = useTranslations('Sites');
  const format = useFormatter();
  const groups = useMemo(() => {
    if (!groupByCategory) return [{ key: 'all', label: '', sites }];

    const categoryMap = new Map<string, Site[]>();
    for (const site of sites) {
      const category = site.category?.trim() || '';
      const categorySites = categoryMap.get(category) ?? [];
      categorySites.push(site);
      categoryMap.set(category, categorySites);
    }

    return Array.from(categoryMap.entries())
      .sort(([categoryA], [categoryB]) => {
        if (!categoryA) return 1;
        if (!categoryB) return -1;
        return categoryA.localeCompare(categoryB);
      })
      .map(([category, categorySites]) => ({
        key: category || 'uncategorized',
        label: category || t('uncategorized_label'),
        sites: categorySites,
      }));
  }, [groupByCategory, sites, t]);

  const viewOptions: Array<{ value: SitesViewMode; label: string; icon: typeof Grid2X2 }> = [
    { value: 'grid', label: t('grid_view'), icon: Grid2X2 },
    { value: 'table', label: t('table_view'), icon: Table2 },
    { value: 'bookmarks', label: t('bookmarks_view'), icon: Bookmark },
  ];

  if (isLoading) {
    return (
      <div className="grid h-full grid-cols-1 gap-px bg-border p-px sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="h-44 animate-pulse bg-background p-5">
            <div className="h-4 w-2/3 bg-muted" />
            <div className="mt-4 h-3 w-1/2 bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="border border-border bg-background p-8 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-3 text-sm text-muted-foreground">{t('load_error')}</p>
        </div>
      </div>
    );
  }

  if (!sites.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm border border-border bg-background p-8 text-center">
          <PanelsTopLeft className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-4 text-base font-semibold">{t('empty_title')}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('empty_description')}</p>
          <Button className="mt-5" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            {t('create_first_button')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-background px-5 py-3 md:flex-row md:items-center md:justify-between md:px-7">
        <p className="text-sm font-medium text-muted-foreground">{t('sites_count', { count: sites.length })}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={groupByCategory} onCheckedChange={onGroupingChange} />
            <Tag className="h-4 w-4" />
            {t('group_by_category')}
          </label>
          <div className="flex border border-border bg-background p-0.5" role="group" aria-label={t('view_selector_label')}>
            {viewOptions.map((option) => {
              const Icon = option.icon;
              const active = viewMode === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 rounded-none px-2.5 text-muted-foreground',
                    active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                  )}
                  aria-pressed={active}
                  onClick={() => onViewModeChange(option.value)}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{option.label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-[1500px] space-y-7">
          {groups.map((group) => (
            <section key={group.key}>
              {groupByCategory ? (
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                  <span className="text-xs tabular-nums text-muted-foreground">{group.sites.length}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
                  {group.sites.map((site) => (
                    <article key={site.id} className="flex min-h-44 flex-col bg-background p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('h-2 w-2 shrink-0', site.published ? 'bg-primary' : 'bg-muted-foreground/40')} />
                            <h3 className="truncate text-base font-semibold">{site.name}</h3>
                          </div>
                          <a
                            href={site.publicPath}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary hover:underline"
                          >
                            /s/{site.slug}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>
                        {site.category ? (
                          <span className="max-w-32 truncate border border-border px-2 py-1 text-[11px] text-muted-foreground">{site.category}</span>
                        ) : null}
                      </div>
                      <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                        <div className="text-xs text-muted-foreground">
                          <p>{site.fileCount} {t('files_short')}</p>
                          <p className="mt-1">{formatBytes(site.sizeBytes)}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={site.publicPath} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                              {t('open_button')}
                            </a>
                          </Button>
                          <Button size="sm" onClick={() => onEdit(site.id)}>
                            <Pencil className="h-4 w-4" />
                            {t('edit_button')}
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : viewMode === 'table' ? (
                <div className="overflow-x-auto border border-border bg-background">
                  <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                        <th className="px-4 py-3 font-medium">{t('site_column')}</th>
                        <th className="px-4 py-3 font-medium">{t('category_column')}</th>
                        <th className="px-4 py-3 font-medium">{t('status_column')}</th>
                        <th className="px-4 py-3 font-medium">{t('files_column')}</th>
                        <th className="px-4 py-3 font-medium">{t('updated_column')}</th>
                        <th className="px-4 py-3 text-right font-medium">{t('actions_column')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.sites.map((site) => (
                        <tr key={site.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{site.name}</p>
                            <a href={site.publicPath} target="_blank" rel="noreferrer" className="mt-0.5 block text-xs text-muted-foreground hover:text-primary hover:underline">
                              /s/{site.slug}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{site.category || t('uncategorized_label')}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <span className={cn('h-2 w-2', site.published ? 'bg-primary' : 'bg-muted-foreground/40')} />
                              {site.published ? t('published_status') : t('draft_status')}
                            </span>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {site.fileCount} · {formatBytes(site.sizeBytes)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {format.dateTime(new Date(site.updatedAt), { year: 'numeric', month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" asChild>
                                <a href={site.publicPath} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  {t('open_button')}
                                </a>
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onEdit(site.id)}>
                                <Pencil className="h-4 w-4" />
                                {t('edit_button')}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.sites.map((site) => (
                    <div key={site.id} className="flex h-12 min-w-0 items-center bg-background">
                      <a
                        href={site.publicPath}
                        target="_blank"
                        rel="noreferrer"
                        title={`${t('open_button')}: ${site.name}`}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 text-sm hover:text-primary"
                      >
                        <Globe2 className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{site.name}</span>
                        <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-full w-11 shrink-0 rounded-none border-l border-border"
                        aria-label={`${t('edit_button')}: ${site.name}`}
                        onClick={() => onEdit(site.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

function SiteWorkspace({
  site,
  refreshSites,
  onBack,
  onDeleted,
}: {
  site: Site;
  refreshSites: () => Promise<unknown>;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations('Sites');
  const { resolvedTheme } = useTheme();
  const { data: files, error, isLoading, mutate } = useSWR<SiteFile[]>(`/api/plugins/sites/${site.id}/files`, fetchJson);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const selectedFile = files?.find((file) => file.id === selectedFileId) ?? null;
  const { data: detail, isLoading: detailLoading, mutate: mutateDetail } = useSWR<FileDetail>(
    selectedFile?.kind === 'file' ? `/api/plugins/sites/${site.id}/files/${selectedFile.id}` : null,
    fetchJson,
  );
  const [editorValue, setEditorValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [view, setView] = useState<'code' | 'preview'>('code');
  const [previewKey, setPreviewKey] = useState(0);
  const [visualEditing, setVisualEditing] = useState(false);
  const [visualReady, setVisualReady] = useState(false);
  const [visualDirty, setVisualDirty] = useState(false);
  const [visualSaving, setVisualSaving] = useState(false);
  const [visualLink, setVisualLink] = useState<VisualLink | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<VisualImage[]>([]);
  const [gallerySelectedId, setGallerySelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nodeDialog, setNodeDialog] = useState<'file' | 'folder' | 'rename' | null>(null);
  const [nodeName, setNodeName] = useState('');
  const [nodeSaving, setNodeSaving] = useState(false);
  const [deleteNodeOpen, setDeleteNodeOpen] = useState(false);
  const [deleteSiteOpen, setDeleteSiteOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const saveFileRef = useRef<() => Promise<void>>(async () => {});
  const saveVisualHtmlRef = useRef<(html: string) => Promise<void>>(async () => {});
  const visualSaveRequestedRef = useRef(false);

  const publicUrl = site.customDomain
    ? `https://${site.customDomain}`
    : site.subdomainHost
      ? `https://${site.subdomainHost}`
      : typeof window === 'undefined'
        ? site.publicPath
        : `${window.location.origin}${site.publicPath}`;
  const indexFile = files?.find((file) => file.path === 'index.html' && file.kind === 'file') ?? null;
  const {
    data: indexDetail,
    isLoading: indexDetailLoading,
    mutate: mutateIndexDetail,
  } = useSWR<FileDetail>(
    visualEditing && indexFile ? `/api/plugins/sites/${site.id}/files/${indexFile.id}` : null,
    fetchJson,
  );
  const visualEditorDocument = useMemo(
    () =>
      visualEditing && indexDetail?.editable
        ? buildVisualEditorDocument(
            indexDetail.content ?? '',
            `${publicUrl.replace(/\/+$/, '')}/`,
            { editLink: t('visual_edit_link_tooltip') },
          )
        : '',
    [indexDetail?.content, indexDetail?.editable, publicUrl, t, visualEditing],
  );

  useEffect(() => {
    setSelectedFileId(null);
    setExpanded(new Set());
    setVisualEditing(false);
    setVisualReady(false);
    setVisualDirty(false);
    setVisualLink(null);
    setGalleryOpen(false);
    visualSaveRequestedRef.current = false;
  }, [site.id]);

  useEffect(() => {
    if (!selectedFileId && files?.length) {
      const indexFile = files.find((file) => file.path === 'index.html' && file.kind === 'file');
      setSelectedFileId(indexFile?.id ?? files.find((file) => file.kind === 'file')?.id ?? null);
    }
  }, [files, selectedFileId]);

  useEffect(() => {
    if (detail?.editable) {
      setEditorValue(detail.content ?? '');
      setDirty(false);
    }
  }, [detail?.id, detail?.content, detail?.editable]);

  useEffect(() => {
    if (!visualEditing) return;

    const handleVisualMessage = (event: MessageEvent<VisualEditorMessage>) => {
      if (event.source !== previewFrameRef.current?.contentWindow) return;
      const message = event.data;
      if (!message || message.channel !== SITES_VISUAL_EDITOR_CHANNEL) return;

      if (message.type === 'ready') {
        setVisualReady(true);
      } else if (message.type === 'dirty') {
        setVisualDirty(true);
      } else if (message.type === 'link') {
        setVisualLink(message.link);
      } else if (message.type === 'gallery') {
        setGalleryImages(message.images);
        setGallerySelectedId(message.selectedId ?? message.images[0]?.id ?? null);
        setGalleryOpen(true);
      } else if (message.type === 'html') {
        if (!visualSaveRequestedRef.current) return;
        visualSaveRequestedRef.current = false;
        void saveVisualHtmlRef.current(message.html);
      }
    };

    window.addEventListener('message', handleVisualMessage);
    return () => window.removeEventListener('message', handleVisualMessage);
  }, [visualEditing]);

  function postVisualEditorMessage(action: string, payload: Record<string, unknown> = {}) {
    previewFrameRef.current?.contentWindow?.postMessage(
      { channel: SITES_VISUAL_EDITOR_CHANNEL, action, ...payload },
      '*',
    );
  }

  function startVisualEditing() {
    if (!indexFile) {
      toast.error(t('visual_index_missing'));
      return;
    }
    setVisualReady(false);
    setVisualDirty(false);
    setVisualLink(null);
    setGalleryOpen(false);
    visualSaveRequestedRef.current = false;
    setVisualEditing(true);
  }

  function cancelVisualEditing() {
    setVisualEditing(false);
    setVisualReady(false);
    setVisualDirty(false);
    setVisualLink(null);
    setGalleryOpen(false);
    setGalleryImages([]);
    visualSaveRequestedRef.current = false;
    setPreviewKey((key) => key + 1);
  }

  async function saveVisualHtml(html: string) {
    if (!indexFile) return;
    setVisualSaving(true);
    try {
      await apiMutation(`/api/plugins/sites/${site.id}/files/${indexFile.id}`, 'PATCH', { content: html });
      if (selectedFileId === indexFile.id) {
        setEditorValue(html);
        setDirty(false);
      }
      await Promise.all([
        mutate(),
        mutateIndexDetail(),
        selectedFileId === indexFile.id ? mutateDetail() : Promise.resolve(),
        refreshSites(),
      ]);
      toast.success(t('visual_saved_toast'));
      setVisualEditing(false);
      setVisualReady(false);
      setVisualDirty(false);
      setVisualLink(null);
      setGalleryOpen(false);
      setPreviewKey((key) => key + 1);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : t('generic_error'));
    } finally {
      visualSaveRequestedRef.current = false;
      setVisualSaving(false);
    }
  }
  saveVisualHtmlRef.current = saveVisualHtml;

  function requestVisualSave() {
    if (!visualReady || visualSaving) return;
    visualSaveRequestedRef.current = true;
    setVisualSaving(true);
    postVisualEditorMessage('request-save');
  }

  function openVisualGallery() {
    postVisualEditorMessage('request-gallery', { selectedId: gallerySelectedId });
  }

  function updateVisualLink(link: VisualLink) {
    if (!isSafeVisualUrl(link.href, true)) {
      toast.error(t('visual_unsafe_url'));
      return;
    }
    postVisualEditorMessage('update-link', { link });
    setVisualDirty(true);
    setVisualLink(null);
  }

  function updateVisualImage(image: VisualImage) {
    if (!isSafeVisualUrl(image.src)) {
      toast.error(t('visual_unsafe_url'));
      return;
    }
    postVisualEditorMessage('update-image', { image });
    setVisualDirty(true);
  }

  function deleteVisualImage(id: string) {
    postVisualEditorMessage('delete-image', { id });
    setVisualDirty(true);
  }

  async function saveFile() {
    if (!detail?.editable) return;
    setSavingFile(true);
    try {
      await apiMutation(`/api/plugins/sites/${site.id}/files/${detail.id}`, 'PATCH', { content: editorValue });
      setDirty(false);
      toast.success(t('file_saved_toast'));
      await Promise.all([mutate(), mutateDetail(), refreshSites()]);
      setPreviewKey((key) => key + 1);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : t('generic_error'));
    } finally {
      setSavingFile(false);
    }
  }
  saveFileRef.current = saveFile;

  const editorMount: OnMount = (_editor, monaco) => {
    _editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveFileRef.current());
  };

  function targetParentPath() {
    if (!selectedFile) return '';
    return selectedFile.kind === 'folder' ? selectedFile.path : selectedFile.path.split('/').slice(0, -1).join('/');
  }

  async function submitNodeDialog() {
    if (!nodeDialog || !nodeName.trim()) return;
    setNodeSaving(true);
    try {
      if (nodeDialog === 'rename' && selectedFile) {
        await apiMutation(`/api/plugins/sites/${site.id}/files/${selectedFile.id}`, 'PATCH', { name: nodeName.trim() });
        toast.success(t('renamed_toast'));
      } else {
        const created = await apiMutation<SiteFile>(`/api/plugins/sites/${site.id}/files`, 'POST', {
          kind: nodeDialog,
          name: nodeName.trim(),
          parentPath: targetParentPath(),
        });
        setSelectedFileId(created.id);
        toast.success(nodeDialog === 'folder' ? t('folder_created_toast') : t('file_created_toast'));
      }
      setNodeDialog(null);
      setNodeName('');
      await Promise.all([mutate(), refreshSites()]);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : t('generic_error'));
    } finally {
      setNodeSaving(false);
    }
  }

  async function deleteNode() {
    if (!selectedFile) return;
    setNodeSaving(true);
    try {
      await apiMutation(`/api/plugins/sites/${site.id}/files/${selectedFile.id}`, 'DELETE');
      setSelectedFileId(null);
      setDeleteNodeOpen(false);
      toast.success(t('deleted_toast'));
      await Promise.all([mutate(), refreshSites()]);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : t('generic_error'));
    } finally {
      setNodeSaving(false);
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const inputFiles = Array.from(fileList);
    if (!inputFiles.length) return;
    const body = new FormData();
    const paths: string[] = [];
    for (const file of inputFiles) {
      body.append('files', file);
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      paths.push(relativePath || file.name);
    }
    body.append('paths', JSON.stringify(paths));
    const toastId = toast.loading(t('uploading_toast'));
    try {
      const response = await fetch(`/api/plugins/sites/${site.id}/upload`, { method: 'POST', body });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error || t('generic_error'));
      toast.success(t('uploaded_toast', { count: json.imported }), { id: toastId });
      await Promise.all([mutate(), refreshSites()]);
      setPreviewKey((key) => key + 1);
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : t('generic_error'), { id: toastId });
    }
  }

  async function moveNode(nodeId: number, parentPath: string) {
    try {
      await apiMutation(`/api/plugins/sites/${site.id}/files/${nodeId}`, 'PATCH', { parentPath });
      toast.success(t('moved_toast'));
      await mutate();
    } catch (moveError) {
      toast.error(moveError instanceof Error ? moveError.message : t('generic_error'));
    }
  }

  async function deleteSite() {
    setNodeSaving(true);
    try {
      await apiMutation(`/api/plugins/sites/${site.id}`, 'DELETE');
      toast.success(t('site_deleted_toast'));
      setDeleteSiteOpen(false);
      await refreshSites();
      onDeleted();
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : t('generic_error'));
    } finally {
      setNodeSaving(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-none"
            aria-label={t('back_to_sites')}
            disabled={visualEditing}
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 shrink-0', site.published ? 'bg-primary' : 'bg-muted-foreground/40')} />
              <h2 className="truncate text-base font-semibold">{site.name}</h2>
              <span className="font-mono text-xs text-muted-foreground">{site.fileCount} {t('files_short')}</span>
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-center gap-1 truncate font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              {publicUrl}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border p-0.5">
            <Button
              size="sm"
              variant={view === 'code' ? 'secondary' : 'ghost'}
              disabled={visualEditing}
              onClick={() => setView('code')}
            >
              <Code2 className="h-4 w-4" />
              {t('code_tab')}
            </Button>
            <Button size="sm" variant={view === 'preview' ? 'secondary' : 'ghost'} onClick={() => setView('preview')}>
              <Play className="h-4 w-4" />
              {t('preview_tab')}
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" />
            {t('settings_button')}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1',
          view === 'code' && 'lg:grid-cols-[17rem_minmax(0,1fr)]',
        )}
      >
        {view === 'code' ? (
          <div
            className="flex min-h-52 flex-col border-b bg-muted/10 lg:min-h-0 lg:border-b-0 lg:border-r"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const nodeId = Number(event.dataTransfer.getData('application/x-whatsaas-site-node'));
              if (Number.isInteger(nodeId)) void moveNode(nodeId, '');
              else if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files);
            }}
          >
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('explorer_title')}
            </span>
            <div className="flex">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={t('new_file_button')}
                onClick={() => {
                  setNodeName('');
                  setNodeDialog('file');
                }}
              >
                <FilePlus2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={t('new_folder_button')}
                onClick={() => {
                  setNodeName('');
                  setNodeDialog('folder');
                }}
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={t('upload_button')}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : error ? (
              <p className="p-4 text-center text-xs text-destructive">{t('files_load_error')}</p>
            ) : files?.length ? (
              <FileTree
                files={files}
                selectedId={selectedFileId}
                expanded={expanded}
                setExpanded={setExpanded}
                onSelect={setSelectedFileId}
                onMove={moveNode}
              />
            ) : (
              <div className="p-5 text-center">
                <FolderOpen className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">{t('files_empty')}</p>
              </div>
            )}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-1 border-t p-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <FileArchive className="h-4 w-4" />
              {t('files_zip_button')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
              <FolderInput className="h-4 w-4" />
              {t('folder_upload_button')}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".zip,.html,.htm,.css,.js,.mjs,.json,.svg,image/*,video/*,audio/*,.woff,.woff2"
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files);
              event.target.value = '';
            }}
          />
          </div>
        ) : null}

        <div className="flex min-h-[26rem] min-w-0 flex-col bg-background lg:min-h-0">
          {view === 'preview' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-xs text-muted-foreground">{publicUrl}</span>
                  {visualEditing ? (
                    <span className="shrink-0 border border-primary px-2 py-0.5 text-[11px] font-medium text-primary">
                      {visualDirty ? t('visual_unsaved_label') : t('visual_editing_label')}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {visualEditing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!visualReady || visualSaving}
                        onClick={openVisualGallery}
                      >
                        <Images className="h-4 w-4" />
                        {t('visual_gallery_button')}
                      </Button>
                      <Button variant="outline" size="sm" disabled={visualSaving} onClick={cancelVisualEditing}>
                        <X className="h-4 w-4" />
                        {t('cancel_button')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={!visualReady || visualSaving}
                        onClick={requestVisualSave}
                      >
                        {visualSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('save_button')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setPreviewKey((key) => key + 1)}>
                        <RefreshCw className="h-4 w-4" />
                        {t('reload_preview_button')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={startVisualEditing}
                      >
                        <Pencil className="h-4 w-4" />
                        {t('visual_edit_button')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {visualEditing ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="shrink-0 border-b border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    {t('visual_edit_help')}
                  </div>
                  {indexDetailLoading || !visualEditorDocument ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <iframe
                      ref={previewFrameRef}
                      key={`visual-${previewKey}-${indexDetail?.updatedAt ?? ''}`}
                      srcDoc={visualEditorDocument}
                      title={t('visual_editor_title')}
                      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
                      className="min-h-0 flex-1 bg-background"
                    />
                  )}
                </div>
              ) : (
                <iframe
                  ref={previewFrameRef}
                  key={previewKey}
                  src={site.publicPath}
                  title={t('preview_title')}
                  sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
                  className="min-h-0 flex-1 bg-background"
                />
              )}
            </div>
          ) : selectedFile ? (
            <>
              <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
                <div className="flex min-w-0 items-center gap-2">
                  {selectedFile.kind === 'folder' ? <Folder className="h-4 w-4" /> : <File className="h-4 w-4" />}
                  <span className="truncate font-mono text-xs">{selectedFile.path}</span>
                  {dirty && <span className="font-mono text-xs text-muted-foreground">{t('unsaved_label')}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t('rename_button')}
                    onClick={() => {
                      setNodeName(selectedFile.path.split('/').pop() ?? '');
                      setNodeDialog('rename');
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    aria-label={t('delete_button')}
                    onClick={() => setDeleteNodeOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={() => void saveFile()} disabled={!dirty || savingFile || !detail?.editable}>
                    {savingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t('save_button')}
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {selectedFile.kind === 'folder' ? (
                  <div className="flex h-full items-center justify-center p-8 text-center">
                    <div>
                      <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground" />
                      <p className="mt-3 text-sm font-semibold">{t('folder_selected_title')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t('folder_selected_description')}</p>
                    </div>
                  </div>
                ) : detailLoading ? (
                  <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : detail?.editable ? (
                  <MonacoEditor
                    path={`${site.id}/${selectedFile.path}`}
                    language={languageForPath(selectedFile.path)}
                    value={editorValue}
                    theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                    onMount={editorMount}
                    onChange={(value) => {
                      setEditorValue(value ?? '');
                      setDirty(true);
                    }}
                    options={{
                      automaticLayout: true,
                      fontSize: 14,
                      fontLigatures: true,
                      minimap: { enabled: true },
                      padding: { top: 16 },
                      smoothScrolling: true,
                      tabSize: 2,
                      wordWrap: 'on',
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-8 text-center">
                    <div>
                      <FileArchive className="mx-auto h-8 w-8 text-muted-foreground" />
                      <p className="mt-3 text-sm font-semibold">{t('binary_file_title')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t('binary_file_description')}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex h-7 shrink-0 items-center justify-between border-t bg-foreground px-3 font-mono text-[11px] text-background">
                <span>{languageForPath(selectedFile.path)}</span>
                <span>{formatBytes(selectedFile.sizeBytes)} · UTF-8</span>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div>
                <Code2 className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">{t('no_file_title')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('no_file_description')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <SiteSettingsDialog
        site={site}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        refreshSites={refreshSites}
        onDelete={() => setDeleteSiteOpen(true)}
      />

      <VisualLinkDialog
        link={visualLink}
        onClose={() => setVisualLink(null)}
        onSave={updateVisualLink}
      />

      <VisualGalleryDialog
        open={galleryOpen}
        images={galleryImages}
        selectedId={gallerySelectedId}
        publicUrl={publicUrl}
        onOpenChange={setGalleryOpen}
        onSelect={setGallerySelectedId}
        onSave={updateVisualImage}
        onDelete={deleteVisualImage}
      />

      <Dialog open={nodeDialog !== null} onOpenChange={(open) => !open && setNodeDialog(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {nodeDialog === 'rename' ? t('rename_dialog_title') : nodeDialog === 'folder' ? t('folder_dialog_title') : t('file_dialog_title')}
            </DialogTitle>
            <DialogDescription>{t('node_dialog_description')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitNodeDialog();
            }}
            className="space-y-4 py-2"
          >
            <div className="space-y-2">
              <Label htmlFor="node-name">{t('node_name_label')}</Label>
              <Input id="node-name" value={nodeName} onChange={(event) => setNodeName(event.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNodeDialog(null)}>{t('cancel_button')}</Button>
              <Button type="submit" disabled={!nodeName.trim() || nodeSaving}>
                {nodeSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('save_button')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteNodeOpen} onOpenChange={setDeleteNodeOpen}>
        <AlertDialogContent className="sm:max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_node_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('delete_node_description', { name: selectedFile?.path ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel_button')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteNode()} className="bg-destructive text-destructive-foreground">
              {t('delete_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteSiteOpen} onOpenChange={setDeleteSiteOpen}>
        <AlertDialogContent className="sm:max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_site_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('delete_site_description', { name: site.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel_button')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteSite()} className="bg-destructive text-destructive-foreground">
              {nodeSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('delete_site_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function VisualLinkDialog({
  link,
  onClose,
  onSave,
}: {
  link: VisualLink | null;
  onClose: () => void;
  onSave: (link: VisualLink) => void;
}) {
  const t = useTranslations('Sites');
  const [text, setText] = useState('');
  const [href, setHref] = useState('');
  const [newWindow, setNewWindow] = useState(false);

  useEffect(() => {
    if (!link) return;
    setText(link.text);
    setHref(link.href);
    setNewWindow(link.target === '_blank');
  }, [link]);

  return (
    <Dialog open={Boolean(link)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            {t('visual_link_dialog_title')}
          </DialogTitle>
          <DialogDescription>{t('visual_link_dialog_description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!link) return;
            onSave({
              ...link,
              text,
              href,
              target: newWindow ? '_blank' : '',
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="visual-link-text">{t('visual_link_text_label')}</Label>
            <Input id="visual-link-text" value={text} onChange={(event) => setText(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="visual-link-href">{t('visual_link_url_label')}</Label>
            <Input
              id="visual-link-href"
              value={href}
              onChange={(event) => setHref(event.target.value)}
              placeholder="https://"
              className="font-mono"
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between border border-border p-3">
            <span>
              <span className="block text-sm font-medium">{t('visual_link_new_window_label')}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t('visual_link_new_window_help')}</span>
            </span>
            <Switch checked={newWindow} onCheckedChange={setNewWindow} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('cancel_button')}</Button>
            <Button type="submit">
              {t('visual_apply_button')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VisualGalleryDialog({
  open,
  images,
  selectedId,
  publicUrl,
  onOpenChange,
  onSelect,
  onSave,
  onDelete,
}: {
  open: boolean;
  images: VisualImage[];
  selectedId: string | null;
  publicUrl: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onSave: (image: VisualImage) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations('Sites');
  const selected = images.find((image) => image.id === selectedId) ?? images[0] ?? null;
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');

  useEffect(() => {
    setSrc(selected?.src ?? '');
    setAlt(selected?.alt ?? '');
  }, [selected?.id, selected?.src, selected?.alt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] flex-col sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="h-5 w-5 text-primary" />
            {t('visual_gallery_dialog_title')}
          </DialogTitle>
          <DialogDescription>{t('visual_gallery_dialog_description')}</DialogDescription>
        </DialogHeader>

        {images.length ? (
          <div className="grid min-h-0 flex-1 gap-5 overflow-hidden md:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="min-h-0 overflow-y-auto border border-border bg-muted/20 p-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    className={cn(
                      'group relative aspect-[4/3] overflow-hidden border bg-background text-left',
                      selected?.id === image.id ? 'border-primary ring-1 ring-primary' : 'border-border',
                    )}
                    onClick={() => onSelect(image.id)}
                  >
                    <img
                      src={resolveVisualAssetUrl(image.src, publicUrl)}
                      alt={image.alt}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-2 py-1 text-[11px] text-white">
                      {image.alt || t('visual_image_number', { number: index + 1 })}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {selected ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="visual-image-src">{t('visual_image_url_label')}</Label>
                  <Input
                    id="visual-image-src"
                    value={src}
                    onChange={(event) => setSrc(event.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visual-image-alt">{t('visual_image_alt_label')}</Label>
                  <Input
                    id="visual-image-alt"
                    value={alt}
                    onChange={(event) => setAlt(event.target.value)}
                    placeholder={t('visual_image_alt_placeholder')}
                  />
                  <p className="text-xs text-muted-foreground">{t('visual_image_alt_help')}</p>
                </div>
                <div className="grid gap-2">
                  <Button
                    type="button"
                    disabled={!src.trim()}
                    onClick={() => onSave({ ...selected, src: src.trim(), alt: alt.trim() })}
                  >
                    <Save className="h-4 w-4" />
                    {t('visual_apply_image_button')}
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => onDelete(selected.id)}>
                    <Trash2 className="h-4 w-4" />
                    {t('visual_delete_image_button')}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="border border-dashed border-border py-12 text-center">
            <Images className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">{t('visual_gallery_empty_title')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('visual_gallery_empty_description')}</p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('close_button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileTree({
  files,
  selectedId,
  expanded,
  setExpanded,
  onSelect,
  onMove,
}: {
  files: SiteFile[];
  selectedId: number | null;
  expanded: Set<string>;
  setExpanded: (next: Set<string>) => void;
  onSelect: (id: number) => void;
  onMove: (nodeId: number, parentPath: string) => Promise<void>;
}) {
  const children = useMemo(() => {
    const result = new Map<string, SiteFile[]>();
    for (const file of files) {
      const parent = file.path.split('/').slice(0, -1).join('/');
      const siblings = result.get(parent) ?? [];
      siblings.push(file);
      result.set(parent, siblings);
    }
    for (const siblings of result.values()) {
      siblings.sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.path.localeCompare(b.path));
    }
    return result;
  }, [files]);

  function renderLevel(parentPath: string, depth: number): React.ReactNode {
    return (children.get(parentPath) ?? []).map((node) => {
      const isExpanded = expanded.has(node.path);
      const name = node.path.split('/').pop();
      return (
        <div key={node.id}>
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.setData('application/x-whatsaas-site-node', String(node.id));
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              if (node.kind === 'folder') event.preventDefault();
            }}
            onDrop={(event) => {
              if (node.kind !== 'folder') return;
              event.preventDefault();
              event.stopPropagation();
              const nodeId = Number(event.dataTransfer.getData('application/x-whatsaas-site-node'));
              if (Number.isInteger(nodeId) && nodeId !== node.id) void onMove(nodeId, node.path);
            }}
            onClick={() => {
              onSelect(node.id);
              if (node.kind === 'folder') {
                const next = new Set(expanded);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                setExpanded(next);
              }
            }}
            className={cn(
              'flex h-8 w-full items-center gap-1.5 pr-2 text-left font-mono text-xs transition hover:bg-muted',
              selectedId === node.id && 'bg-foreground text-background hover:bg-foreground',
            )}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            {node.kind === 'folder' ? (
              isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            {node.kind === 'folder' ? <Folder className="h-4 w-4 shrink-0" /> : <File className="h-4 w-4 shrink-0" />}
            <span className="truncate">{name}</span>
          </button>
          {node.kind === 'folder' && isExpanded ? renderLevel(node.path, depth + 1) : null}
        </div>
      );
    });
  }

  return renderLevel('', 0);
}

function SiteSettingsDialog({
  site,
  open,
  onOpenChange,
  refreshSites,
  onDelete,
}: {
  site: Site;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refreshSites: () => Promise<unknown>;
  onDelete: () => void;
}) {
  const t = useTranslations('Sites');
  const [name, setName] = useState(site.name);
  const [category, setCategory] = useState(site.category ?? '');
  const [slug, setSlug] = useState(site.slug);
  const [subdomain, setSubdomain] = useState(site.subdomain ?? '');
  const [customDomain, setCustomDomain] = useState(site.customDomain ?? '');
  const [published, setPublished] = useState(site.published);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(site.name);
    setCategory(site.category ?? '');
    setSlug(site.slug);
    setSubdomain(site.subdomain ?? '');
    setCustomDomain(site.customDomain ?? '');
    setPublished(site.published);
  }, [site]);

  async function saveSettings() {
    setSaving(true);
    try {
      await apiMutation(`/api/plugins/sites/${site.id}`, 'PATCH', {
        name,
        category: category.trim() || null,
        slug,
        subdomain: subdomain || null,
        customDomain: customDomain || null,
        published,
      });
      toast.success(t('settings_saved_toast'));
      await refreshSites();
      onOpenChange(false);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : t('generic_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('settings_dialog_title')}</DialogTitle>
          <DialogDescription>{t('settings_dialog_description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="settings-name">{t('site_name_label')}</Label>
            <Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-category">{t('category_label')}</Label>
            <Input
              id="settings-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={t('category_placeholder')}
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">{t('category_help')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-slug">{t('slug_label')}</Label>
            <div className="flex items-center rounded-md border bg-muted/30 pl-3">
              <span className="font-mono text-xs text-muted-foreground">/s/</span>
              <Input id="settings-slug" value={slug} onChange={(event) => setSlug(event.target.value)} className="border-0 bg-transparent font-mono shadow-none focus-visible:ring-0" maxLength={63} />
            </div>
            <p className="text-xs text-muted-foreground">{t('slug_help')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-subdomain">{t('subdomain_label')}</Label>
            <div className="flex items-center rounded-md border bg-muted/30 pr-3">
              <Input id="settings-subdomain" value={subdomain} onChange={(event) => setSubdomain(event.target.value)} className="border-0 bg-transparent font-mono shadow-none focus-visible:ring-0" maxLength={63} />
              <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">.whatspro.uno</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('subdomain_help')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-custom-domain">{t('custom_domain_label')}</Label>
            <Input
              id="settings-custom-domain"
              value={customDomain}
              onChange={(event) => setCustomDomain(event.target.value)}
              placeholder={t('custom_domain_placeholder')}
              className="font-mono"
              maxLength={253}
            />
            <p className="text-xs text-muted-foreground">{t('custom_domain_help')}</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="site-published">{t('published_label')}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('published_help')}</p>
            </div>
            <Switch id="site-published" checked={published} onCheckedChange={setPublished} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-destructive/40 p-3">
            <div>
              <p className="text-sm font-semibold text-destructive">{t('danger_title')}</p>
              <p className="text-xs text-muted-foreground">{t('danger_description')}</p>
            </div>
            <Button variant="destructive" size="sm" onClick={onDelete}>{t('delete_site_button')}</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel_button')}</Button>
          <Button onClick={() => void saveSettings()} disabled={saving || !name.trim() || !slug.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('save_button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
