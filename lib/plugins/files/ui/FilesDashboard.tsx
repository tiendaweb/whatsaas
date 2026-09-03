'use client';

import Image from 'next/image';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import {
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileAudio,
  FileText,
  FileVideo,
  Files,
  Grid2X2,
  ImageIcon,
  List,
  Loader2,
  MessageCircle,
  PanelLeft,
  RefreshCw,
  Rows3,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type FileType = 'image' | 'video' | 'audio' | 'document';
type FileView = 'grid' | 'list' | 'details';
type GroupMode = 'none' | 'date' | 'size' | 'type' | 'chat';
type SortMode = 'newest' | 'oldest' | 'largest' | 'smallest';

type ChatFile = {
  id: string;
  chatId: number;
  remoteJid: string;
  chatName: string;
  type: FileType;
  fileName: string;
  caption: string | null;
  mediaUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  fromMe: boolean;
  timestamp: string;
};

type ChatFacet = {
  id: number;
  remoteJid: string;
  name: string;
  count: number;
};

type FilesResponse = {
  items: ChatFile[];
  pagination: { page: number; limit: number; total: number; pages: number };
  facets: {
    counts: Record<FileType, number>;
    total: number;
    chats: ChatFacet[];
  };
};

type GroupLabels = {
  today: string;
  yesterday: string;
  last7: string;
  last30: string;
  older: string;
  under1: string;
  from1To10: string;
  from10To100: string;
  over100: string;
  unknown: string;
  types: Record<FileType, string>;
};

const fetcher = async (url: string): Promise<FilesResponse> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
};

const TYPE_ICONS = {
  image: ImageIcon,
  video: FileVideo,
  audio: FileAudio,
  document: FileText,
} satisfies Record<FileType, typeof FileText>;

function formatSize(bytes: number | null, emptyLabel: string) {
  if (bytes === null) return emptyLabel;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'
  );
}

function getGroup(file: ChatFile, mode: GroupMode, labels: GroupLabels) {
  if (mode === 'chat') {
    return { key: `chat:${file.chatId}`, label: file.chatName };
  }
  if (mode === 'type') {
    return { key: `type:${file.type}`, label: labels.types[file.type] };
  }
  if (mode === 'size') {
    if (file.sizeBytes === null) return { key: 'size:unknown', label: labels.unknown };
    if (file.sizeBytes < 1024 ** 2) return { key: 'size:under1', label: labels.under1 };
    if (file.sizeBytes < 10 * 1024 ** 2) {
      return { key: 'size:1to10', label: labels.from1To10 };
    }
    if (file.sizeBytes < 100 * 1024 ** 2) {
      return { key: 'size:10to100', label: labels.from10To100 };
    }
    return { key: 'size:over100', label: labels.over100 };
  }
  if (mode === 'date') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const date = new Date(file.timestamp);
    const fileDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.floor((today.getTime() - fileDay.getTime()) / 86_400_000);
    if (days <= 0) return { key: 'date:today', label: labels.today };
    if (days === 1) return { key: 'date:yesterday', label: labels.yesterday };
    if (days < 7) return { key: 'date:last7', label: labels.last7 };
    if (days < 30) return { key: 'date:last30', label: labels.last30 };
    return { key: 'date:older', label: labels.older };
  }
  return { key: 'all', label: '' };
}

export function FilesDashboard() {
  const t = useTranslations('Files');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [chatQuery, setChatQuery] = useState('');
  const [type, setType] = useState<'all' | FileType>('all');
  const [chatId, setChatId] = useState('all');
  const [period, setPeriod] = useState('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [group, setGroup] = useState<GroupMode>('date');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<FileView>('grid');
  const [previewFile, setPreviewFile] = useState<ChatFile | null>(null);
  const [mobileChatsOpen, setMobileChatsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  const archiveFilters = useMemo(() => {
    const filters: {
      query?: string;
      type?: FileType;
      chatId?: number;
      from?: string;
      sort: SortMode;
    } = { sort };
    if (deferredQuery.trim()) filters.query = deferredQuery.trim();
    if (type !== 'all') filters.type = type;
    if (chatId !== 'all') filters.chatId = Number(chatId);
    if (period !== 'all') {
      const from = new Date();
      from.setDate(from.getDate() - Number(period));
      filters.from = from.toISOString();
    }
    return filters;
  }, [chatId, deferredQuery, period, sort, type]);

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '60', sort });
    if (archiveFilters.query) params.set('q', archiveFilters.query);
    if (archiveFilters.type) params.set('type', archiveFilters.type);
    if (archiveFilters.chatId) params.set('chatId', String(archiveFilters.chatId));
    if (archiveFilters.from) params.set('from', archiveFilters.from);
    return `/api/plugins/files?${params.toString()}`;
  }, [archiveFilters, page, sort]);

  const { data, error, isLoading, isValidating, mutate } = useSWR(apiUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  const typeLabels: Record<FileType, string> = {
    image: t('type_image'),
    video: t('type_video'),
    audio: t('type_audio'),
    document: t('type_document'),
  };

  const groupLabels: GroupLabels = {
    today: t('date_today'),
    yesterday: t('date_yesterday'),
    last7: t('date_last_7'),
    last30: t('date_last_30'),
    older: t('date_older'),
    under1: t('size_under_1'),
    from1To10: t('size_1_to_10'),
    from10To100: t('size_10_to_100'),
    over100: t('size_over_100'),
    unknown: t('unknown_size'),
    types: typeLabels,
  };

  const filteredChats = useMemo(() => {
    const normalized = chatQuery.trim().toLocaleLowerCase();
    if (!normalized) return data?.facets.chats ?? [];
    return (data?.facets.chats ?? []).filter((chat) =>
      `${chat.name} ${chat.remoteJid}`.toLocaleLowerCase().includes(normalized),
    );
  }, [chatQuery, data?.facets.chats]);

  const selectedChat = data?.facets.chats.find((chat) => String(chat.id) === chatId);
  const visibleItems = data?.items ?? [];
  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((file) => selectedIds.has(file.id));
  const previewIndex = previewFile
    ? visibleItems.findIndex((file) => file.id === previewFile.id)
    : -1;

  useEffect(() => {
    setSelectedIds(new Set());
  }, [archiveFilters]);

  const groupedFiles = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; items: ChatFile[] }>();
    for (const file of data?.items ?? []) {
      const definition = getGroup(file, group, groupLabels);
      const current = groups.get(definition.key) ?? { ...definition, items: [] };
      current.items.push(file);
      groups.set(definition.key, current);
    }
    return [...groups.values()];
  }, [
    data?.items,
    group,
    groupLabels.from10To100,
    groupLabels.from1To10,
    groupLabels.last30,
    groupLabels.last7,
    groupLabels.older,
    groupLabels.over100,
    groupLabels.today,
    groupLabels.types.audio,
    groupLabels.types.document,
    groupLabels.types.image,
    groupLabels.types.video,
    groupLabels.under1,
    groupLabels.unknown,
    groupLabels.yesterday,
  ]);

  function updateFilter(action: () => void) {
    setPage(1);
    action();
  }

  function clearFilters() {
    setPage(1);
    setQuery('');
    setType('all');
    setChatId('all');
    setPeriod('all');
    setSort('newest');
    setGroup('date');
  }

  function toggleSelected(fileId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleItems.forEach((file) => next.delete(file.id));
      } else {
        visibleItems.forEach((file) => next.add(file.id));
      }
      return next;
    });
  }

  function movePreview(offset: number) {
    const nextFile = visibleItems[previewIndex + offset];
    if (nextFile) setPreviewFile(nextFile);
  }

  async function downloadArchive(mode: 'all' | 'selected') {
    if (isDownloading || (mode === 'selected' && selectedIds.size === 0)) return;
    setIsDownloading(true);

    try {
      const response = await fetch('/api/plugins/files/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          ids: mode === 'selected' ? [...selectedIds] : undefined,
          ...archiveFilters,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        const message =
          payload.error === 'archive_too_many_files'
            ? t('archive_too_many_files')
            : payload.error === 'archive_too_large'
              ? t('archive_too_large')
              : payload.error === 'archive_files_unavailable'
                ? t('archive_files_unavailable')
                : t('archive_error');
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition');
      const fileName = disposition?.match(/filename="([^"]+)"/)?.[1] ?? 'archivos.zip';
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);

      const archived = Number(response.headers.get('x-files-archived') ?? 0);
      const skipped = Number(response.headers.get('x-files-skipped') ?? 0);
      toast.success(
        skipped > 0
          ? t('archive_downloaded_with_skips', { count: archived, skipped })
          : t('archive_downloaded', { count: archived }),
      );
      if (mode === 'selected') setSelectedIds(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('archive_error'));
    } finally {
      setIsDownloading(false);
    }
  }

  const hasFilters =
    query.trim() !== '' ||
    type !== 'all' ||
    chatId !== 'all' ||
    period !== 'all' ||
    sort !== 'newest';

  const sidebar = (
    <ChatSidebar
      t={t}
      chats={filteredChats}
      total={data?.facets.total}
      counts={data?.facets.counts}
      selectedChatId={chatId}
      selectedType={type}
      chatQuery={chatQuery}
      onChatQueryChange={setChatQuery}
      onSelectChat={(value) => {
        updateFilter(() => setChatId(value));
        setMobileChatsOpen(false);
      }}
      onSelectType={(value) => updateFilter(() => setType(value))}
      onClose={() => setMobileChatsOpen(false)}
    />
  );

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-muted/40 p-2 pb-[4.5rem] text-foreground md:p-4">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[1.5rem] border border-border bg-background shadow-sm">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-muted/30 lg:flex">
          {sidebar}
        </aside>

        {mobileChatsOpen ? (
          <div className="absolute inset-0 z-40 flex lg:hidden">
            <button
              type="button"
              aria-label={t('hide_chats')}
              className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
              onClick={() => setMobileChatsOpen(false)}
            />
            <aside className="relative h-full w-[min(20rem,88vw)] border-r border-border bg-background shadow-xl">
              {sidebar}
            </aside>
          </div>
        ) : null}

        <section className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="shrink-0 border-b border-border bg-card/95 px-3 py-3 md:px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Files className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h1 className="shrink-0 text-sm font-semibold tracking-tight">{t('title')}</h1>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <span className="truncate text-xs font-medium">
                      {selectedChat?.name ?? t('all_chats')}
                    </span>
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {t('result_count', { count: data?.pagination.total ?? 0 })}
                    {selectedIds.size > 0
                      ? ` · ${t('selected_count', { count: selectedIds.size })}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="relative order-3 min-w-full flex-1 md:order-none md:min-w-48">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={query}
                  onChange={(event) => updateFilter(() => setQuery(event.target.value))}
                  placeholder={t('search_placeholder')}
                  aria-label={t('search_label')}
                  className="h-10 w-full rounded-xl border-border bg-background pl-9 shadow-none focus-visible:ring-ring"
                />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {hasFilters ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden h-9 px-2.5 text-xs text-muted-foreground sm:flex"
                    onClick={clearFilters}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t('clear_filters')}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden h-9 gap-1.5 px-2.5 text-xs md:flex"
                  onClick={toggleVisibleSelection}
                  disabled={!visibleItems.length}
                >
                  <Check className="h-3.5 w-3.5" />
                  {allVisibleSelected ? t('clear_selection') : t('select_visible')}
                </Button>
                {selectedIds.size > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 px-2.5 text-xs"
                    onClick={() => void downloadArchive('selected')}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                    ) : (
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{t('download_selected')}</span>
                    <span className="tabular-nums">({selectedIds.size})</span>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  className="h-9 gap-1.5 px-2.5 text-xs"
                  onClick={() => void downloadArchive('all')}
                  disabled={isDownloading || !data?.pagination.total}
                >
                  {isDownloading && selectedIds.size === 0 ? (
                    <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                  ) : (
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{t('download_all')}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void mutate()}
                  disabled={isValidating}
                  className="h-9 w-9 rounded-lg"
                  aria-label={t('refresh_button')}
                >
                  {isValidating ? (
                    <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 lg:hidden"
                onClick={() => setMobileChatsOpen(true)}
                aria-label={t('show_chats')}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              <Select
                value={period}
                onValueChange={(value) => updateFilter(() => setPeriod(value))}
              >
                <SelectTrigger
                  className="hidden h-9 w-full rounded-lg bg-background sm:flex sm:w-[9.5rem]"
                  aria-label={t('period_filter_label')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('period_all')}</SelectItem>
                  <SelectItem value="7">{t('period_7')}</SelectItem>
                  <SelectItem value="30">{t('period_30')}</SelectItem>
                  <SelectItem value="90">{t('period_90')}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sort}
                onValueChange={(value) =>
                  updateFilter(() => setSort(value as SortMode))
                }
              >
                <SelectTrigger
                  className="hidden h-9 w-full rounded-lg bg-background md:flex md:w-[10.5rem]"
                  aria-label={t('sort_label')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t('sort_newest')}</SelectItem>
                  <SelectItem value="oldest">{t('sort_oldest')}</SelectItem>
                  <SelectItem value="largest">{t('sort_largest')}</SelectItem>
                  <SelectItem value="smallest">{t('sort_smallest')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={group} onValueChange={(value) => setGroup(value as GroupMode)}>
                <SelectTrigger
                  className="hidden h-9 w-full rounded-lg bg-background xl:flex xl:w-[10.5rem]"
                  aria-label={t('group_label')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('group_none')}</SelectItem>
                  <SelectItem value="date">{t('group_date')}</SelectItem>
                  <SelectItem value="size">{t('group_size')}</SelectItem>
                  <SelectItem value="type">{t('group_type')}</SelectItem>
                  <SelectItem value="chat">{t('group_chat')}</SelectItem>
                </SelectContent>
              </Select>
              <ViewSwitcher view={view} onChange={setView} t={t} />
            </div>

            <div className="mt-2 flex flex-wrap gap-2 xl:hidden">
              <div className="min-w-36 flex-1 sm:hidden">
                <Select
                  value={period}
                  onValueChange={(value) => updateFilter(() => setPeriod(value))}
                >
                  <SelectTrigger className="h-8 w-full bg-card text-xs" aria-label={t('period_filter_label')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('period_all')}</SelectItem>
                    <SelectItem value="7">{t('period_7')}</SelectItem>
                    <SelectItem value="30">{t('period_30')}</SelectItem>
                    <SelectItem value="90">{t('period_90')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-36 flex-1 md:hidden">
                <Select
                  value={sort}
                  onValueChange={(value) =>
                    updateFilter(() => setSort(value as SortMode))
                  }
                >
                  <SelectTrigger className="h-8 w-full bg-card text-xs" aria-label={t('sort_label')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">{t('sort_newest')}</SelectItem>
                    <SelectItem value="oldest">{t('sort_oldest')}</SelectItem>
                    <SelectItem value="largest">{t('sort_largest')}</SelectItem>
                    <SelectItem value="smallest">{t('sort_smallest')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-36 flex-1">
                <Select
                  value={group}
                  onValueChange={(value) => setGroup(value as GroupMode)}
                >
                  <SelectTrigger className="h-8 w-full bg-card text-xs" aria-label={t('group_label')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('group_none')}</SelectItem>
                    <SelectItem value="date">{t('group_date')}</SelectItem>
                    <SelectItem value="size">{t('group_size')}</SelectItem>
                    <SelectItem value="type">{t('group_type')}</SelectItem>
                    <SelectItem value="chat">{t('group_chat')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs md:hidden"
                onClick={toggleVisibleSelection}
                disabled={!visibleItems.length}
              >
                <Check className="h-3.5 w-3.5" />
                {allVisibleSelected ? t('clear_selection') : t('select_visible')}
              </Button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
            {isLoading && !data ? (
              <LoadingState view={view} />
            ) : error ? (
              <CenteredState
                icon={Files}
                title={t('error_title')}
                description={t('error_description')}
                action={
                  <Button variant="outline" size="sm" onClick={() => void mutate()}>
                    {t('retry_button')}
                  </Button>
                }
              />
            ) : data?.items.length ? (
              <div className="p-3 sm:p-4 md:p-5">
                {isValidating ? (
                  <div className="pointer-events-none fixed bottom-20 right-5 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background shadow-md md:bottom-5">
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                  </div>
                ) : null}
                <div className="space-y-6">
                  {groupedFiles.map((fileGroup) => (
                    <FileGroup
                      key={fileGroup.key}
                      label={group === 'none' ? null : fileGroup.label}
                      items={fileGroup.items}
                      view={view}
                      typeLabels={typeLabels}
                      dateFormatter={dateFormatter}
                      unknownSizeLabel={t('unknown_size')}
                      sentByMeLabel={t('sent_by_me')}
                      receivedLabel={t('received')}
                      openLabel={t('open_file')}
                      downloadLabel={t('download_file')}
                      chatLabel={t('open_chat')}
                      columnLabels={{
                        name: t('column_name'),
                        chat: t('column_chat'),
                        date: t('column_date'),
                        size: t('column_size'),
                      }}
                      resultCount={(count) => t('result_count', { count })}
                      onPreview={setPreviewFile}
                      selectedIds={selectedIds}
                      onToggleSelected={toggleSelected}
                      selectLabel={t('select_file')}
                    />
                  ))}
                </div>
                <Pagination
                  page={data.pagination.page}
                  pages={data.pagination.pages}
                  onPageChange={setPage}
                  previousLabel={t('previous_page')}
                  nextLabel={t('next_page')}
                  pageLabel={t('page_of', {
                    page: data.pagination.page,
                    pages: data.pagination.pages,
                  })}
                />
              </div>
            ) : (
              <CenteredState
                icon={Files}
                title={t('empty_title')}
                description={t('empty_description')}
                action={
                  hasFilters ? (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      {t('clear_filters')}
                    </Button>
                  ) : null
                }
              />
            )}
          </main>
        </section>
      </div>

      <FilePreviewDialog
        file={previewFile}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
        dateLabel={
          previewFile ? dateFormatter.format(new Date(previewFile.timestamp)) : ''
        }
        sizeLabel={
          previewFile
            ? formatSize(previewFile.sizeBytes, t('unknown_size'))
            : t('unknown_size')
        }
        typeLabel={previewFile ? typeLabels[previewFile.type] : ''}
        openLabel={t('open_file')}
        downloadLabel={t('download_file')}
        chatLabel={t('open_chat')}
        previewLabel={t('preview_file')}
        previousLabel={t('previous_file')}
        nextLabel={t('next_file')}
        positionLabel={
          previewIndex >= 0
            ? t('file_position', { current: previewIndex + 1, total: visibleItems.length })
            : ''
        }
        canGoPrevious={previewIndex > 0}
        canGoNext={previewIndex >= 0 && previewIndex < visibleItems.length - 1}
        onPrevious={() => movePreview(-1)}
        onNext={() => movePreview(1)}
      />
    </div>
  );
}

function ChatSidebar({
  t,
  chats,
  total,
  counts,
  selectedChatId,
  selectedType,
  chatQuery,
  onChatQueryChange,
  onSelectChat,
  onSelectType,
  onClose,
}: {
  t: ReturnType<typeof useTranslations<'Files'>>;
  chats: ChatFacet[];
  total?: number;
  counts?: Record<FileType, number>;
  selectedChatId: string;
  selectedType: 'all' | FileType;
  chatQuery: string;
  onChatQueryChange: (value: string) => void;
  onSelectChat: (value: string) => void;
  onSelectType: (value: 'all' | FileType) => void;
  onClose: () => void;
}) {
  const typeItems: Array<{
    value: 'all' | FileType;
    label: string;
    icon: typeof Files;
    count?: number;
  }> = [
    { value: 'all', label: t('all_files'), icon: Files, count: total },
    { value: 'image', label: t('type_image'), icon: ImageIcon, count: counts?.image },
    { value: 'video', label: t('type_video'), icon: FileVideo, count: counts?.video },
    { value: 'audio', label: t('type_audio'), icon: FileAudio, count: counts?.audio },
    {
      value: 'document',
      label: t('type_document'),
      icon: FileText,
      count: counts?.document,
    },
  ];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Files className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">{t('library_label')}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 lg:hidden"
          onClick={onClose}
          aria-label={t('hide_chats')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <nav className="space-y-1 px-3" aria-label={t('summary_label')}>
        {typeItems.map((item) => {
          const Icon = item.icon;
          const active = selectedType === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onSelectType(item.value)}
              className={cn(
                'flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-background hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  active ? 'text-primary/80' : 'text-muted-foreground',
                )}
              >
                {item.count ?? '—'}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mx-4 my-4 h-px bg-border" />

      <div className="px-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-muted-foreground">{t('chats_label')}</h2>
          <span className="text-[10px] tabular-nums text-muted-foreground">{chats.length}</span>
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={chatQuery}
            onChange={(event) => onChatQueryChange(event.target.value)}
            placeholder={t('chat_search_placeholder')}
            className="h-9 rounded-lg bg-background pl-8 text-xs shadow-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <button
          type="button"
          onClick={() => onSelectChat('all')}
          className={cn(
            'mb-1 flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selectedChatId === 'all'
              ? 'bg-background font-semibold text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/80 hover:text-foreground',
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">{t('all_chats')}</span>
        </button>
        {chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            onClick={() => onSelectChat(String(chat.id))}
            className={cn(
            'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selectedChatId === String(chat.id)
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/80 hover:text-foreground',
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[9px] font-bold text-primary">
              {getInitials(chat.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{chat.name}</span>
              <span className="block truncate text-[9px] opacity-70">
                {chat.remoteJid.split('@')[0]}
              </span>
            </span>
            <span className="text-[10px] tabular-nums">{chat.count}</span>
          </button>
        ))}
        {chats.length === 0 ? (
          <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">
            {t('no_chats')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ViewSwitcher({
  view,
  onChange,
  t,
}: {
  view: FileView;
  onChange: (value: FileView) => void;
  t: ReturnType<typeof useTranslations<'Files'>>;
}) {
  const items: Array<{ value: FileView; label: string; icon: typeof Grid2X2 }> = [
    { value: 'grid', label: t('grid_view'), icon: Grid2X2 },
    { value: 'list', label: t('list_view'), icon: List },
    { value: 'details', label: t('details_view'), icon: Rows3 },
  ];
  return (
    <div className="flex shrink-0 rounded-lg border border-border bg-card p-0.5" aria-label={t('view_label')}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.value}
            type="button"
            size="icon"
            variant={view === item.value ? 'secondary' : 'ghost'}
            onClick={() => onChange(item.value)}
            aria-label={item.label}
            title={item.label}
            className="h-7 w-7 rounded-md"
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        );
      })}
    </div>
  );
}

function FileGroup({
  label,
  items,
  view,
  typeLabels,
  dateFormatter,
  unknownSizeLabel,
  sentByMeLabel,
  receivedLabel,
  openLabel,
  downloadLabel,
  chatLabel,
  columnLabels,
  resultCount,
  onPreview,
  selectedIds,
  onToggleSelected,
  selectLabel,
}: {
  label: string | null;
  items: ChatFile[];
  view: FileView;
  typeLabels: Record<FileType, string>;
  dateFormatter: Intl.DateTimeFormat;
  unknownSizeLabel: string;
  sentByMeLabel: string;
  receivedLabel: string;
  openLabel: string;
  downloadLabel: string;
  chatLabel: string;
  columnLabels: { name: string; chat: string; date: string; size: string };
  resultCount: (count: number) => string;
  onPreview: (file: ChatFile) => void;
  selectedIds: Set<string>;
  onToggleSelected: (fileId: string) => void;
  selectLabel: string;
}) {
  return (
    <section>
      {label ? (
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold">{label}</h2>
          <span className="text-[10px] text-muted-foreground">{resultCount(items.length)}</span>
          <div className="h-px min-w-6 flex-1 bg-border" />
        </div>
      ) : null}
      {view === 'details' ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_10rem_7rem_5rem] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium text-muted-foreground md:grid">
            <span>{columnLabels.name}</span>
            <span>{columnLabels.chat}</span>
            <span>{columnLabels.date}</span>
            <span>{columnLabels.size}</span>
            <span />
          </div>
          {items.map((file) => (
            <FileDetailsRow
              key={file.id}
              file={file}
              typeLabel={typeLabels[file.type]}
              sizeLabel={formatSize(file.sizeBytes, unknownSizeLabel)}
              dateLabel={dateFormatter.format(new Date(file.timestamp))}
              openLabel={openLabel}
              downloadLabel={downloadLabel}
              chatLabel={chatLabel}
              onPreview={() => onPreview(file)}
              selected={selectedIds.has(file.id)}
              onToggleSelected={() => onToggleSelected(file.id)}
              selectLabel={selectLabel}
            />
          ))}
        </div>
      ) : (
        <div
          className={cn(
            view === 'grid'
              ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1500px]:grid-cols-5'
              : 'space-y-3',
          )}
        >
          {items.map((file) => (
            <FileItem
              key={file.id}
              file={file}
              view={view}
              typeLabel={typeLabels[file.type]}
              sizeLabel={formatSize(file.sizeBytes, unknownSizeLabel)}
              dateLabel={dateFormatter.format(new Date(file.timestamp))}
              openLabel={openLabel}
              downloadLabel={downloadLabel}
              chatLabel={chatLabel}
              sentByMeLabel={sentByMeLabel}
              receivedLabel={receivedLabel}
              onPreview={() => onPreview(file)}
              selected={selectedIds.has(file.id)}
              onToggleSelected={() => onToggleSelected(file.id)}
              selectLabel={selectLabel}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FileMedia({
  file,
  className,
}: {
  file: ChatFile;
  className?: string;
}) {
  const Icon = TYPE_ICONS[file.type];
  if (file.type === 'image') {
    return (
      <span className={cn('relative block overflow-hidden bg-muted', className)}>
        <Image
          src={file.mediaUrl}
          alt={file.fileName}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.02]"
        />
      </span>
    );
  }
  if (file.type === 'video') {
    return <VideoThumbnail file={file} className={className} />;
  }
  return (
    <span className={cn('flex items-center justify-center bg-muted', className)}>
      <Icon className="h-8 w-8 text-muted-foreground" />
    </span>
  );
}

function VideoThumbnail({
  file,
  className,
}: {
  file: ChatFile;
  className?: string;
}) {
  const [loadPreview, setLoadPreview] = useState(false);
  return (
    <span
      className={cn('relative block overflow-hidden bg-foreground', className)}
      onMouseEnter={() => setLoadPreview(true)}
    >
      {loadPreview ? (
        <video
          src={file.mediaUrl}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-muted">
          <FileVideo className="h-8 w-8 text-muted-foreground" />
        </span>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-foreground/10">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
          <Eye className="h-4 w-4" />
        </span>
      </span>
    </span>
  );
}

function SelectionButton({
  selected,
  onClick,
  label,
  className,
}: {
  selected: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border shadow-sm transition-colors motion-reduce:transition-none',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background/90 text-transparent hover:text-muted-foreground',
        className,
      )}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

function FileItem({
  file,
  view,
  typeLabel,
  sizeLabel,
  dateLabel,
  openLabel,
  downloadLabel,
  chatLabel,
  sentByMeLabel,
  receivedLabel,
  onPreview,
  selected,
  onToggleSelected,
  selectLabel,
}: {
  file: ChatFile;
  view: Exclude<FileView, 'details'>;
  typeLabel: string;
  sizeLabel: string;
  dateLabel: string;
  openLabel: string;
  downloadLabel: string;
  chatLabel: string;
  sentByMeLabel: string;
  receivedLabel: string;
  onPreview: () => void;
  selected: boolean;
  onToggleSelected: () => void;
  selectLabel: string;
}) {
  if (view === 'list') {
    return (
      <article
        className={cn(
          'group relative flex min-h-28 items-stretch overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] motion-reduce:transition-none',
          selected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40 hover:shadow-sm',
        )}
      >
        <SelectionButton
          selected={selected}
          onClick={onToggleSelected}
          label={`${selectLabel}: ${file.fileName}`}
          className="absolute left-2 top-2 z-10"
        />
        <button
          type="button"
          onClick={onPreview}
          aria-label={`${openLabel}: ${file.fileName}`}
          className="shrink-0"
        >
          <FileMedia file={file} className="h-full w-28 sm:w-36" />
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="min-w-0 flex-1 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">{typeLabel}</span>
            <span>{sizeLabel}</span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold" title={file.fileName}>
            {file.fileName}
          </h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{file.chatName}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {dateLabel} · {file.fromMe ? sentByMeLabel : receivedLabel}
          </p>
        </button>
        <FileActions
          file={file}
          downloadLabel={downloadLabel}
          chatLabel={chatLabel}
          onPreview={onPreview}
          openLabel={openLabel}
          className="mr-2 self-center"
        />
      </article>
    );
  }

  return (
    <article
      className={cn(
          'group relative overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] motion-reduce:transition-none',
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-primary/40 hover:shadow-md',
      )}
    >
      <SelectionButton
        selected={selected}
        onClick={onToggleSelected}
        label={`${selectLabel}: ${file.fileName}`}
        className="absolute left-2 top-2 z-10"
      />
      <button
        type="button"
        onClick={onPreview}
        aria-label={`${openLabel}: ${file.fileName}`}
        className="block w-full text-left"
      >
        <FileMedia file={file} className="h-44 w-full" />
      </button>
      <div className="px-3 py-2.5">
        <button type="button" onClick={onPreview} className="block w-full text-left">
          <h3 className="truncate text-sm font-semibold" title={file.fileName}>
            {file.fileName}
          </h3>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">
            {typeLabel} · {sizeLabel} · {file.chatName}
          </p>
        </button>
        <div className="mt-2 flex h-8 items-center justify-between gap-1 border-t border-border pt-1">
          <span className="truncate text-[10px] text-muted-foreground">{dateLabel}</span>
          <FileActions
            file={file}
            downloadLabel={downloadLabel}
            chatLabel={chatLabel}
            onPreview={onPreview}
            openLabel={openLabel}
          />
        </div>
      </div>
    </article>
  );
}

function FileDetailsRow({
  file,
  typeLabel,
  sizeLabel,
  dateLabel,
  openLabel,
  downloadLabel,
  chatLabel,
  onPreview,
  selected,
  onToggleSelected,
  selectLabel,
}: {
  file: ChatFile;
  typeLabel: string;
  sizeLabel: string;
  dateLabel: string;
  openLabel: string;
  downloadLabel: string;
  chatLabel: string;
  onPreview: () => void;
  selected: boolean;
  onToggleSelected: () => void;
  selectLabel: string;
}) {
  const Icon = TYPE_ICONS[file.type];
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_10rem_7rem_5rem]',
        selected ? 'border-primary/30 bg-primary/5' : 'border-border',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SelectionButton
          selected={selected}
          onClick={onToggleSelected}
          label={`${selectLabel}: ${file.fileName}`}
        />
        <button
          type="button"
          onClick={onPreview}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">{file.fileName}</span>
            <span className="block text-[10px] text-muted-foreground md:hidden">
              {typeLabel} · {sizeLabel}
            </span>
          </span>
        </button>
      </div>
      <span className="hidden truncate text-xs text-muted-foreground md:block">
        {file.chatName}
      </span>
      <span className="hidden truncate text-xs text-muted-foreground md:block">
        {dateLabel}
      </span>
      <span className="hidden text-xs tabular-nums text-muted-foreground md:block">
        {sizeLabel}
      </span>
      <FileActions
        file={file}
        downloadLabel={downloadLabel}
        chatLabel={chatLabel}
        onPreview={onPreview}
        openLabel={openLabel}
      />
    </div>
  );
}

function FileActions({
  file,
  downloadLabel,
  chatLabel,
  openLabel,
  onPreview,
  className,
}: {
  file: ChatFile;
  downloadLabel: string;
  chatLabel: string;
  openLabel: string;
  onPreview: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex shrink-0 items-center gap-0.5', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onPreview}
        aria-label={`${openLabel}: ${file.fileName}`}
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7">
        <a
          href={file.mediaUrl}
          download={file.fileName}
          target="_blank"
          rel="noreferrer"
          aria-label={`${downloadLabel}: ${file.fileName}`}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </a>
      </Button>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7">
        <Link
          href={`/dashboard/chat/${encodeURIComponent(file.remoteJid)}`}
          aria-label={`${chatLabel}: ${file.chatName}`}
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function FilePreviewDialog({
  file,
  onOpenChange,
  dateLabel,
  sizeLabel,
  typeLabel,
  openLabel,
  downloadLabel,
  chatLabel,
  previewLabel,
  previousLabel,
  nextLabel,
  positionLabel,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: {
  file: ChatFile | null;
  onOpenChange: (open: boolean) => void;
  dateLabel: string;
  sizeLabel: string;
  typeLabel: string;
  openLabel: string;
  downloadLabel: string;
  chatLabel: string;
  previewLabel: string;
  previousLabel: string;
  nextLabel: string;
  positionLabel: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <Dialog open={Boolean(file)} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' && canGoPrevious) {
            event.preventDefault();
            onPrevious();
          }
          if (event.key === 'ArrowRight' && canGoNext) {
            event.preventDefault();
            onNext();
          }
        }}
      >
        {file ? (
          <>
            <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
              <DialogTitle className="truncate text-base">{file.fileName}</DialogTitle>
              <DialogDescription className="truncate text-xs">
                {positionLabel} · {previewLabel} · {typeLabel} · {sizeLabel} · {dateLabel}
              </DialogDescription>
            </DialogHeader>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-3 md:p-5">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full shadow-md md:left-4"
                onClick={onPrevious}
                disabled={!canGoPrevious}
                aria-label={previousLabel}
                title={previousLabel}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full shadow-md md:right-4"
                onClick={onNext}
                disabled={!canGoNext}
                aria-label={nextLabel}
                title={nextLabel}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
              {file.type === 'image' ? (
                <div className="relative h-[min(68dvh,760px)] w-full">
                  <Image
                    src={file.mediaUrl}
                    alt={file.fileName}
                    fill
                    unoptimized
                    sizes="100vw"
                    className="object-contain"
                  />
                </div>
              ) : file.type === 'video' ? (
                <video
                  src={file.mediaUrl}
                  controls
                  playsInline
                  preload="metadata"
                className="max-h-[68dvh] max-w-full rounded-xl bg-foreground"
                />
              ) : file.type === 'audio' ? (
                <div className="flex w-full max-w-xl flex-col items-center gap-5 rounded-xl border border-border bg-card p-8">
                  <FileAudio className="h-12 w-12 text-muted-foreground" />
                  <audio src={file.mediaUrl} controls preload="metadata" className="w-full" />
                </div>
              ) : file.mimeType === 'application/pdf' ? (
                <iframe
                  src={file.mediaUrl}
                  title={file.fileName}
                  className="h-[68dvh] w-full rounded-lg border border-border bg-background"
                />
              ) : (
                <div className="flex max-w-md flex-col items-center rounded-xl border border-border bg-card p-10 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 break-all text-sm font-medium">{file.fileName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {file.mimeType ?? typeLabel}
                  </p>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{file.chatName}</p>
                {file.caption ? (
                  <p className="mt-0.5 max-w-xl truncate text-[10px] text-muted-foreground">
                    {file.caption}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                  <Link href={`/dashboard/chat/${encodeURIComponent(file.remoteJid)}`}>
                    <MessageCircle className="h-3.5 w-3.5" />
                    {chatLabel}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                  <a
                    href={file.mediaUrl}
                    download={file.fileName}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    {downloadLabel}
                  </a>
                </Button>
                <Button asChild size="sm" className="h-8 text-xs">
                  <a href={file.mediaUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {openLabel}
                  </a>
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LoadingState({ view }: { view: FileView }) {
  return (
    <div
      className={cn(
        'p-4',
        view === 'grid'
          ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1500px]:grid-cols-5'
          : 'space-y-3',
      )}
    >
      {Array.from({ length: view === 'grid' ? 12 : 9 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'rounded-xl border border-border bg-card motion-safe:animate-pulse',
            view === 'grid' ? 'h-64' : view === 'list' ? 'h-24' : 'h-12',
          )}
        />
      ))}
    </div>
  );
}

function CenteredState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Files;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-80 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-base font-semibold">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

function Pagination({
  page,
  pages,
  onPageChange,
  previousLabel,
  nextLabel,
  pageLabel,
}: {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  pageLabel: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-center gap-3 border-t border-border pt-4" aria-label={pageLabel}>
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="h-8 gap-1 text-xs"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> {previousLabel}
      </Button>
      <span className="text-xs text-muted-foreground">{pageLabel}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        className="h-8 gap-1 text-xs"
      >
        {nextLabel} <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </nav>
  );
}
