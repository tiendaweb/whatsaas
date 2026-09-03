'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { usePathname, useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  CalendarRange,
  CheckCircle2,
  FolderPlus,
  FolderKanban,
  GripVertical,
  LayoutList,
  Layers,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  PanelRightOpen,
  Pencil,
  Plus,
  Rows3,
  Search,
  Share2,
  Tag,
  Trash2,
  UserRoundCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const GROUP_COLORS = [
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#059669',
  '#0891B2',
] as const;

type BookmarkChat = {
  id: number;
  remoteJid: string;
  instanceId: number | null;
  name: string;
  profilePicUrl: string | null;
  unreadCount: number;
  lastMessageText: string | null;
  lastMessageStatus: string | null;
  lastMessageFromMe: boolean | null;
  automationDisabled: boolean;
  funnelStage: { id: number; name: string; emoji: string } | null;
  contactId: number | null;
  isCustomer: boolean;
  tags: Array<{ id: number; name: string; color: string | null }>;
};

type BookmarkProject = {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  workspaceId: number | null;
  workspaceName: string | null;
  taskCount: number;
  completedCount: number;
};

type BookmarkItem = {
  id: number;
  groupId: number;
  entityType: 'chat' | 'project';
  order: number;
  chat?: BookmarkChat;
  project?: BookmarkProject;
};

type BookmarkGroup = {
  id: number;
  name: string;
  color: string;
  order: number;
  funnelStageGroupId: number | null;
  funnelStageGroupName: string | null;
  items: BookmarkItem[];
};

type FunnelGroup = {
  id: number;
  name: string;
  description: string | null;
  order: number;
};

type CardDensity = 'compact' | 'normal' | 'complete';

type BookmarksResponse = {
  groups: BookmarkGroup[];
  funnelGroups: FunnelGroup[];
  catalog: {
    chats: BookmarkChat[];
    projects: BookmarkProject[];
  };
  capabilities: {
    projects: boolean;
    customers: boolean;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
};

async function postAction(body: Record<string, unknown>) {
  const response = await fetch('/api/dashboard/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Request failed');
  }
  return response.json();
}

export default function BookmarksBoard({
  viewSwitcher,
  selectedGroupId,
  onSelectedGroupChange,
}: {
  viewSwitcher: React.ReactNode;
  selectedGroupId: string;
  onSelectedGroupChange: (groupId: string) => void;
}) {
  const t = useTranslations('DashboardBookmarks');
  const pathname = usePathname();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<BookmarksResponse>('/api/dashboard/bookmarks', fetcher);
  const { mutate: globalMutate } = useSWRConfig();
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BookmarkGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState<string>(GROUP_COLORS[0]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [addToGroup, setAddToGroup] = useState<BookmarkGroup | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [addingEntityKey, setAddingEntityKey] = useState<string | null>(null);
  const [sharedFunnelGroupId, setSharedFunnelGroupId] = useState<string>('none');
  const [cardDensity, setCardDensity] = useState<CardDensity>('normal');
  const [funnelGroupDialogOpen, setFunnelGroupDialogOpen] = useState(false);
  const [newFunnelGroupName, setNewFunnelGroupName] = useState('');
  const [newFunnelGroupDescription, setNewFunnelGroupDescription] = useState('');
  const [savingFunnelGroup, setSavingFunnelGroup] = useState(false);
  const restoredAgendaRef = useRef(false);
  const { data: funnelStages } = useSWR<Array<{ id: number; name: string; emoji: string }>>('/api/funnel-stages', fetcher);
  const { data: allTags } = useSWR<Array<{ id: number; name: string; color: string | null }>>('/api/tags', fetcher);

  const groups = data?.groups ?? [];
  const visibleAgendas = useMemo(() => selectedGroupId === 'all'
    ? groups
    : groups.filter((agenda) => String(agenda.funnelStageGroupId) === selectedGroupId), [groups, selectedGroupId]);
  const localePrefix = pathname.match(/^\/(pt|en|es)(?=\/|$)/)?.[0] ?? '';

  useEffect(() => {
    const stored = localStorage.getItem('dashboardAgendaCardDensity');
    if (stored === 'compact' || stored === 'normal' || stored === 'complete') setCardDensity(stored);
  }, []);

  const changeCardDensity = (density: CardDensity) => {
    setCardDensity(density);
    localStorage.setItem('dashboardAgendaCardDensity', density);
  };

  const availableFunnelGroups = data?.funnelGroups ?? [];

  useEffect(() => {
    if (!data || restoredAgendaRef.current) return;
    restoredAgendaRef.current = true;
    const lastAgendaId = Number(localStorage.getItem('dashboardLastAgendaId'));
    if (!Number.isFinite(lastAgendaId)) return;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-agenda-id="${lastAgendaId}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, [data, selectedGroupId]);

  useEffect(() => {
    if (!data || selectedGroupId === 'all') return;
    if (!data.funnelGroups.some((group) => String(group.id) === selectedGroupId)) {
      onSelectedGroupChange('all');
    }
  }, [data, onSelectedGroupChange, selectedGroupId]);

  const availableCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    const existingChatIds = new Set(addToGroup?.items.flatMap((item) => item.chat ? [item.chat.id] : []) ?? []);
    const existingProjectIds = new Set(addToGroup?.items.flatMap((item) => item.project ? [item.project.id] : []) ?? []);
    return {
      chats: (data?.catalog.chats ?? []).filter((chat) => {
        if (existingChatIds.has(chat.id)) return false;
        if (!query) return true;
        return chat.name.toLowerCase().includes(query) || chat.remoteJid.includes(query);
      }),
      projects: (data?.catalog.projects ?? []).filter((project) => {
        if (existingProjectIds.has(project.id)) return false;
        if (!query) return true;
        return project.name.toLowerCase().includes(query)
          || project.workspaceName?.toLowerCase().includes(query);
      }),
    };
  }, [addToGroup, catalogSearch, data]);

  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupName('');
    setGroupColor(GROUP_COLORS[0]);
    const lastAgendaId = Number(localStorage.getItem('dashboardLastAgendaId'));
    const lastAgenda = groups.find((agenda) => agenda.id === lastAgendaId);
    const preferredGroupId = selectedGroupId !== 'all'
      ? selectedGroupId
      : lastAgenda?.funnelStageGroupId
        ? String(lastAgenda.funnelStageGroupId)
        : availableFunnelGroups[0]
          ? String(availableFunnelGroups[0].id)
          : 'none';
    setSharedFunnelGroupId(preferredGroupId);
    setGroupDialogOpen(true);
  };

  const openEditGroup = (group: BookmarkGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupColor(group.color);
    setSharedFunnelGroupId(group.funnelStageGroupId ? String(group.funnelStageGroupId) : 'none');
    setGroupDialogOpen(true);
  };

  const saveGroup = async () => {
    const effectiveName = groupName.trim();
    if (!effectiveName || sharedFunnelGroupId === 'none') return;
    setSavingGroup(true);
    try {
      const savedAgenda = await postAction(editingGroup
        ? {
            action: 'update_group',
            groupId: editingGroup.id,
            name: effectiveName,
            color: groupColor,
            funnelStageGroupId: sharedFunnelGroupId === 'none' ? null : Number(sharedFunnelGroupId),
          }
        : {
            action: 'create_group',
            name: effectiveName,
            color: groupColor,
            funnelStageGroupId: sharedFunnelGroupId === 'none' ? null : Number(sharedFunnelGroupId),
          });
      const savedAgendaId = editingGroup?.id ?? savedAgenda?.id;
      if (savedAgendaId) localStorage.setItem('dashboardLastAgendaId', String(savedAgendaId));
      if (sharedFunnelGroupId !== 'none') onSelectedGroupChange(sharedFunnelGroupId);
      toast.success(t(editingGroup ? 'group_updated_toast' : 'group_created_toast'));
      setGroupDialogOpen(false);
      await mutate();
    } catch {
      toast.error(t('save_error_toast'));
    } finally {
      setSavingGroup(false);
    }
  };

  const createFunnelGroup = async () => {
    if (!newFunnelGroupName.trim()) return;
    setSavingFunnelGroup(true);
    try {
      const response = await fetch('/api/funnel-stage-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFunnelGroupName.trim(),
          description: newFunnelGroupDescription.trim() || null,
        }),
      });
      if (!response.ok) throw new Error('group_create_failed');
      const createdGroup = await response.json() as FunnelGroup;
      setNewFunnelGroupName('');
      setNewFunnelGroupDescription('');
      setFunnelGroupDialogOpen(false);
      onSelectedGroupChange(String(createdGroup.id));
      await Promise.all([mutate(), globalMutate('/api/funnel-stage-groups')]);
      toast.success(t('funnel_group_created_toast'));
    } catch {
      toast.error(t('save_error_toast'));
    } finally {
      setSavingFunnelGroup(false);
    }
  };

  const rememberAgenda = (agenda: BookmarkGroup) => {
    localStorage.setItem('dashboardLastAgendaId', String(agenda.id));
  };

  const deleteGroup = async (group: BookmarkGroup) => {
    if (!window.confirm(t('delete_group_confirm', { name: group.name }))) return;
    try {
      await postAction({ action: 'delete_group', groupId: group.id });
      toast.success(t('group_deleted_toast'));
      await mutate();
    } catch {
      toast.error(t('save_error_toast'));
    }
  };

  const addItem = async (entityType: 'chat' | 'project', entityId: number) => {
    if (!addToGroup) return;
    rememberAgenda(addToGroup);
    const entityKey = `${entityType}-${entityId}`;
    setAddingEntityKey(entityKey);
    try {
      await postAction({
        action: 'add_item',
        groupId: addToGroup.id,
        entityType,
        entityId,
      });
      toast.success(t('item_added_toast'));
      const refreshed = await mutate();
      setAddToGroup((current) => current
        ? refreshed?.groups.find((group) => group.id === current.id) ?? current
        : null);
    } catch {
      toast.error(t('save_error_toast'));
    } finally {
      setAddingEntityKey(null);
    }
  };

  const removeItem = async (itemId: number) => {
    try {
      await postAction({ action: 'remove_item', itemId });
      toast.success(t('item_removed_toast'));
      await mutate();
    } catch {
      toast.error(t('save_error_toast'));
    }
  };

  const updateChatStage = async (chatId: number, contactId: number, stageId: string) => {
    const nextStageId = stageId === 'none' ? null : Number(stageId);
    const nextStage = funnelStages?.find((stage) => stage.id === nextStageId) ?? null;
    const previous = data;
    await mutate((current) => current ? {
      ...current,
      groups: current.groups.map((group) => ({
        ...group,
        items: group.items.map((item) => item.chat?.id === chatId
          ? { ...item, chat: { ...item.chat, funnelStage: nextStage } }
          : item),
      })),
    } : current, { revalidate: false });
    try {
      const response = await fetch(`/api/contacts/${contactId}/funnel-stage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: nextStageId }),
      });
      if (!response.ok) throw new Error('stage_update_failed');
      toast.success(t('stage_updated_toast'));
      await mutate();
    } catch {
      await mutate(previous, { revalidate: false });
      toast.error(t('save_error_toast'));
    }
  };

  const toggleChatTag = async (chatId: number, contactId: number, tag: { id: number; name: string; color: string | null }) => {
    const chat = data?.catalog.chats.find((candidate) => candidate.id === chatId);
    const removing = chat?.tags.some((candidate) => candidate.id === tag.id) ?? false;
    const previous = data;
    const nextTags = removing
      ? (chat?.tags ?? []).filter((candidate) => candidate.id !== tag.id)
      : [...(chat?.tags ?? []), tag];
    await mutate((current) => current ? {
      ...current,
      catalog: {
        ...current.catalog,
        chats: current.catalog.chats.map((candidate) => candidate.id === chatId ? { ...candidate, tags: nextTags } : candidate),
      },
      groups: current.groups.map((group) => ({
        ...group,
        items: group.items.map((item) => item.chat?.id === chatId
          ? { ...item, chat: { ...item.chat, tags: nextTags } }
          : item),
      })),
    } : current, { revalidate: false });
    try {
      const response = await fetch(removing
        ? `/api/contacts/${contactId}/tags/${tag.id}`
        : `/api/contacts/${contactId}/tags`, {
        method: removing ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: removing ? undefined : JSON.stringify({ tagId: tag.id }),
      });
      if (!response.ok) throw new Error('tag_update_failed');
      await mutate();
    } catch {
      await mutate(previous, { revalidate: false });
      toast.error(t('save_error_toast'));
    }
  };

  const chatPath = (chat: BookmarkChat, openPanel = false) => {
    const identifier = chat.remoteJid.endsWith('@g.us')
      ? encodeURIComponent(chat.remoteJid)
      : chat.remoteJid.split('@')[0];
    const query = new URLSearchParams();
    if (chat.instanceId) query.set('instanceId', String(chat.instanceId));
    if (openPanel) query.set('panel', 'contact');
    const queryString = query.toString();
    return `${localePrefix}/dashboard/chat/${identifier}${queryString ? `?${queryString}` : ''}`;
  };

  const persistGroupOrder = async (nextGroups: BookmarkGroup[], previous: BookmarksResponse) => {
    if (!data) return;
    const optimistic = {
      ...data,
      groups: nextGroups.map((group, order) => ({ ...group, order })),
    };
    await mutate(optimistic, { revalidate: false });
    try {
      await postAction({
        action: 'reorder_groups',
        groupIds: nextGroups.map((group) => group.id),
      });
    } catch {
      await mutate(previous, { revalidate: false });
      toast.error(t('reorder_error_toast'));
    }
  };

  const moveGroup = async (groupId: number, direction: -1 | 1) => {
    if (!data) return;
    const visibleIndex = visibleAgendas.findIndex((group) => group.id === groupId);
    const targetAgenda = visibleAgendas[visibleIndex + direction];
    if (visibleIndex < 0 || !targetAgenda) return;
    const sourceIndex = groups.findIndex((group) => group.id === groupId);
    const targetIndex = groups.findIndex((group) => group.id === targetAgenda.id);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextGroups = [...groups];
    const [moved] = nextGroups.splice(sourceIndex, 1);
    nextGroups.splice(targetIndex, 0, moved);
    await persistGroupOrder(nextGroups, data);
  };

  const onDragEnd = async (result: DropResult) => {
    if (!data || !result.destination) return;
    const { source, destination, type } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (type === 'BOOKMARK_GROUP') {
      const nextGroups = [...groups];
      const [moved] = nextGroups.splice(source.index, 1);
      nextGroups.splice(destination.index, 0, moved);
      await persistGroupOrder(nextGroups, data);
      return;
    }

    const sourceGroupId = Number(source.droppableId.replace('bookmark-items-', ''));
    const destinationGroupId = Number(destination.droppableId.replace('bookmark-items-', ''));
    const nextGroups = groups.map((group) => ({ ...group, items: [...group.items] }));
    const sourceGroup = nextGroups.find((group) => group.id === sourceGroupId);
    const destinationGroup = nextGroups.find((group) => group.id === destinationGroupId);
    if (!sourceGroup || !destinationGroup) return;

    const sourceItem = sourceGroup.items[source.index];
    const destinationHasEntity = sourceGroupId !== destinationGroupId
      && destinationGroup.items.some((item) =>
        item.entityType === sourceItem?.entityType
        && (item.chat?.id ?? item.project?.id) === (sourceItem?.chat?.id ?? sourceItem?.project?.id),
      );
    if (destinationHasEntity) {
      toast.error(t('duplicate_item_toast'));
      return;
    }

    const [moved] = sourceGroup.items.splice(source.index, 1);
    if (!moved) return;
    destinationGroup.items.splice(destination.index, 0, { ...moved, groupId: destinationGroup.id });

    const optimistic = {
      ...data,
      groups: nextGroups.map((group) => ({
        ...group,
        items: group.items.map((item, order) => ({ ...item, order })),
      })),
    };
    await mutate(optimistic, { revalidate: false });
    try {
      await postAction({
        action: 'reorder_items',
        groups: nextGroups.map((group) => ({
          groupId: group.id,
          itemIds: group.items.map((item) => item.id),
        })),
      });
    } catch {
      await mutate(data, { revalidate: false });
      toast.error(t('reorder_error_toast'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="hidden h-11 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card md:flex">
          {viewSwitcher}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center" aria-label={t('loading_label')}>
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="hidden h-11 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card md:flex">
          {viewSwitcher}
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">{t('load_error')}</p>
          <Button variant="outline" onClick={() => mutate()}>{t('retry_button')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="hidden h-11 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card md:flex">
        {viewSwitcher}
      </div>

      <header className="shrink-0 border-b border-border bg-background px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <CalendarRange className="h-5 w-5 shrink-0 text-primary" />
              <h1 className="min-w-0 flex-1 text-lg font-bold text-foreground sm:text-xl">{t('title')}</h1>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Select value={selectedGroupId} onValueChange={onSelectedGroupChange}>
                <SelectTrigger className="h-10 min-w-0 flex-1 sm:w-[200px] sm:flex-none">
                  <div className="flex min-w-0 items-center gap-2">
                    <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder={t('all_funnel_groups_option')} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_funnel_groups_option')}</SelectItem>
                  {data.funnelGroups.map((group) => (
                    <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 shrink-0 px-0 sm:w-auto sm:px-3"
                onClick={() => setFunnelGroupDialogOpen(true)}
                aria-label={t('add_funnel_group_button')}
              >
                <FolderPlus className="h-4 w-4" />
                <span className="hidden sm:inline">{t('add_funnel_group_button')}</span>
              </Button>
              <Button
                size="sm"
                className="h-10 min-w-0 flex-1 px-3 sm:flex-none"
                onClick={openCreateGroup}
                disabled={data.funnelGroups.length === 0}
              >
                <Plus className="h-4 w-4" />
                <span className="truncate">{t('new_agenda_button')}</span>
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="hidden min-w-0 flex-1 text-xs text-muted-foreground md:block">{t('description')}</p>
            <div className="grid h-10 min-w-0 flex-1 grid-cols-3 overflow-hidden rounded-md border border-border bg-card sm:h-9 sm:max-w-md" aria-label={t('card_density_label')}>
              {([
                { value: 'compact' as const, label: t('density_compact'), icon: LayoutList },
                { value: 'normal' as const, label: t('density_normal'), icon: Rows3 },
                { value: 'complete' as const, label: t('density_complete'), icon: PanelRightOpen },
              ]).map((option) => {
                const Icon = option.icon;
                const active = cardDensity === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'flex h-full min-w-0 items-center justify-center gap-1.5 border-r border-border px-2 text-[11px] font-medium last:border-r-0 hover:bg-muted sm:px-2.5 sm:text-xs',
                      active && 'bg-primary text-primary-foreground hover:bg-primary',
                    )}
                    aria-pressed={active}
                    onClick={() => changeCardDensity(option.value)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <div className="@container/bookmarks min-h-0 flex-1 overflow-y-auto bg-muted/35 p-2.5 sm:p-5">
        {visibleAgendas.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="max-w-md rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <Bookmark className="mx-auto h-9 w-9 text-muted-foreground" />
              <h2 className="mt-4 text-base font-semibold text-foreground">
                {t(groups.length === 0 ? 'empty_title' : 'empty_filtered_title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(groups.length === 0 ? 'empty_description' : 'empty_filtered_description')}
              </p>
              <Button className="mt-5" onClick={openCreateGroup} disabled={data.funnelGroups.length === 0}>
                <Plus className="h-4 w-4" />
                {t('create_first_agenda_button')}
              </Button>
            </div>
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 @3xl/bookmarks:grid-cols-2 @5xl/bookmarks:grid-cols-3">
              {visibleAgendas.map((group, index) => (
                <section
                  key={group.id}
                  data-agenda-id={group.id}
                  onPointerDown={() => rememberAgenda(group)}
                  onFocusCapture={() => rememberAgenda(group)}
                  className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
                  style={{ borderTopColor: group.color, borderTopWidth: 4 }}
                >
                          <div className="flex min-h-14 items-center gap-2 border-b border-border px-3">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: group.color }}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <h2 className="truncate text-sm font-semibold text-foreground">{group.name}</h2>
                                {group.funnelStageGroupId && <Share2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t('shared_funnel_group_label')} />}
                              </div>
                              <p className="text-xs tabular-nums text-muted-foreground">
                                {group.funnelStageGroupName
                                  ? `${group.funnelStageGroupName} · ${t('agenda_item_count', { count: group.items.length })}`
                                  : t('agenda_item_count', { count: group.items.length })}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="hidden sm:inline-flex"
                              onClick={() => {
                                rememberAgenda(group);
                                setCatalogSearch('');
                                setAddToGroup(group);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {t('add_button')}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:hidden"
                              aria-label={t('add_to_group_label', { name: group.name })}
                              onClick={() => {
                                rememberAgenda(group);
                                setCatalogSearch('');
                                setAddToGroup(group);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-9 sm:w-9" aria-label={t('group_actions_label')}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditGroup(group)}>
                                  <Pencil className="h-4 w-4" />
                                  {t('edit_group_button')}
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={index === 0} onClick={() => moveGroup(group.id, -1)}>
                                  <ArrowUp className="h-4 w-4" />
                                  {t('move_group_up_button')}
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={index === visibleAgendas.length - 1} onClick={() => moveGroup(group.id, 1)}>
                                  <ArrowDown className="h-4 w-4" />
                                  {t('move_group_down_button')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => deleteGroup(group)}>
                                  <Trash2 className="h-4 w-4" />
                                  {t('delete_group_button')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <Droppable droppableId={`bookmark-items-${group.id}`} type="BOOKMARK_ITEM">
                            {(itemsProvided, itemsSnapshot) => (
                              <div
                                ref={itemsProvided.innerRef}
                                {...itemsProvided.droppableProps}
                                className={cn(
                                  'min-h-28 space-y-2 p-3 transition-colors',
                                  itemsSnapshot.isDraggingOver && 'bg-primary/5',
                                )}
                              >
                                {group.items.length === 0 && (
                                  <button
                                    type="button"
                                    className="flex min-h-24 w-full items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground hover:border-primary/50 hover:bg-muted/50 hover:text-foreground"
                                    onClick={() => {
                                      rememberAgenda(group);
                                      setCatalogSearch('');
                                      setAddToGroup(group);
                                    }}
                                  >
                                    {t('empty_group_button')}
                                  </button>
                                )}
                                {group.items.map((item, itemIndex) => (
                                  <Draggable
                                    key={item.id}
                                    draggableId={`bookmark-item-${item.id}`}
                                    index={itemIndex}
                                  >
                                    {(itemProvided, itemSnapshot) => (
                                      <div
                                        ref={itemProvided.innerRef}
                                        {...itemProvided.draggableProps}
                                        className={cn(itemSnapshot.isDragging && 'rotate-1 shadow-lg')}
                                        style={itemProvided.draggableProps.style}
                                      >
                                        {item.chat ? (
                                          <ChatBookmarkCard
                                            chat={item.chat}
                                            density={cardDensity}
                                            funnelStages={funnelStages ?? []}
                                            allTags={allTags ?? []}
                                            dragHandleProps={itemProvided.dragHandleProps}
                                            onOpen={() => router.push(chatPath(item.chat!))}
                                            onOpenPanel={() => router.push(chatPath(item.chat!, true))}
                                            onSetStage={(stageId) => {
                                              if (item.chat?.contactId) void updateChatStage(item.chat.id, item.chat.contactId, stageId);
                                            }}
                                            onToggleTag={(tag) => {
                                              if (item.chat?.contactId) void toggleChatTag(item.chat.id, item.chat.contactId, tag);
                                            }}
                                            onRemove={() => removeItem(item.id)}
                                            t={t}
                                          />
                                        ) : item.project ? (
                                          <ProjectBookmarkCard
                                            project={item.project}
                                            dragHandleProps={itemProvided.dragHandleProps}
                                            onOpen={() => router.push(`${localePrefix}/plugins/tasks?projectId=${item.project!.id}`)}
                                            onRemove={() => removeItem(item.id)}
                                            t={t}
                                          />
                                        ) : null}
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {itemsProvided.placeholder}
                              </div>
                            )}
                          </Droppable>
                </section>
              ))}
            </div>
          </DragDropContext>
        )}
      </div>

      <Dialog open={funnelGroupDialogOpen} onOpenChange={setFunnelGroupDialogOpen}>
        <DialogContent className="max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:p-4 md:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('new_funnel_group_title')}</DialogTitle>
            <DialogDescription>{t('new_funnel_group_description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agenda-funnel-group-name">{t('funnel_group_name_label')}</Label>
              <Input
                id="agenda-funnel-group-name"
                value={newFunnelGroupName}
                maxLength={120}
                autoFocus
                onChange={(event) => setNewFunnelGroupName(event.target.value)}
                placeholder={t('funnel_group_name_placeholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agenda-funnel-group-description">{t('funnel_group_description_label')}</Label>
              <Textarea
                id="agenda-funnel-group-description"
                value={newFunnelGroupDescription}
                maxLength={240}
                rows={3}
                className="resize-none"
                onChange={(event) => setNewFunnelGroupDescription(event.target.value)}
                placeholder={t('funnel_group_description_placeholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFunnelGroupDialogOpen(false)}>{t('cancel_button')}</Button>
            <Button disabled={savingFunnelGroup || !newFunnelGroupName.trim()} onClick={createFunnelGroup}>
              {savingFunnelGroup && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('create_funnel_group_button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:p-4 md:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t(editingGroup ? 'edit_group_title' : 'new_group_title')}</DialogTitle>
            <DialogDescription>{t('group_dialog_description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {availableFunnelGroups.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="bookmark-funnel-group">{t('agenda_funnel_group_label')}</Label>
                <Select value={sharedFunnelGroupId} onValueChange={setSharedFunnelGroupId}>
                  <SelectTrigger id="bookmark-funnel-group" className="w-full">
                    <SelectValue placeholder={t('agenda_funnel_group_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {editingGroup?.funnelStageGroupId == null && (
                      <SelectItem value="none">{t('unassigned_funnel_group_option')}</SelectItem>
                    )}
                    {availableFunnelGroups.map((group) => (
                      <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('agenda_funnel_group_help')}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="bookmark-group-name">{t('group_name_label')}</Label>
              <Input
                id="bookmark-group-name"
                value={groupName}
                maxLength={120}
                autoFocus
                onChange={(event) => setGroupName(event.target.value)}
                placeholder={t('group_name_placeholder')}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">{t('group_color_label')}</legend>
              <div className="flex flex-wrap gap-2">
                {GROUP_COLORS.map((color, index) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border-2 border-background ring-offset-2 ring-offset-background',
                      groupColor === color && 'ring-2 ring-ring',
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={t('color_option_label', { number: index + 1 })}
                    aria-pressed={groupColor === color}
                    onClick={() => setGroupColor(color)}
                  >
                    {groupColor === color && <CheckCircle2 className="h-5 w-5 text-white" />}
                  </button>
                ))}
                <label
                  className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground"
                >
                  <span>{t('custom_color_label')}</span>
                  <input
                    type="color"
                    value={groupColor}
                    aria-label={t('custom_color_label')}
                    className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0"
                    onChange={(event) => setGroupColor(event.target.value.toUpperCase())}
                  />
                </label>
              </div>
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>{t('cancel_button')}</Button>
            <Button disabled={savingGroup || !groupName.trim() || sharedFunnelGroupId === 'none'} onClick={saveGroup}>
              {savingGroup && <Loader2 className="h-4 w-4 animate-spin" />}
              {t(editingGroup ? 'save_changes_button' : 'create_group_button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(addToGroup)}
        onOpenChange={(open) => {
          if (!open) setAddToGroup(null);
        }}
      >
        <DialogContent className="max-h-[min(90vh,760px)] overflow-hidden max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:h-[88dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:p-4 md:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>{t('add_bookmark_title', { group: addToGroup?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('add_bookmark_description')}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder={t('search_placeholder')}
            />
          </div>
          <Tabs defaultValue="chats" className="min-h-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chats">{t('conversations_tab')}</TabsTrigger>
              <TabsTrigger value="projects" disabled={!data.capabilities.projects}>
                {t('projects_tab')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chats" className="mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">
              {availableCatalog.chats.length === 0 ? (
                <CatalogEmpty message={t('no_conversations_found')} />
              ) : availableCatalog.chats.map((chat) => (
                <CatalogChatRow
                  key={chat.id}
                  chat={chat}
                  isAdding={addingEntityKey === `chat-${chat.id}`}
                  onAdd={() => addItem('chat', chat.id)}
                  t={t}
                />
              ))}
            </TabsContent>
            <TabsContent value="projects" className="mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">
              {availableCatalog.projects.length === 0 ? (
                <CatalogEmpty message={t('no_projects_found')} />
              ) : availableCatalog.projects.map((project) => (
                <CatalogProjectRow
                  key={project.id}
                  project={project}
                  isAdding={addingEntityKey === `project-${project.id}`}
                  onAdd={() => addItem('project', project.id)}
                  t={t}
                />
              ))}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChatBookmarkCard({
  chat,
  density,
  funnelStages,
  allTags,
  dragHandleProps,
  onOpen,
  onOpenPanel,
  onSetStage,
  onToggleTag,
  onRemove,
  t,
}: {
  chat: BookmarkChat;
  density: CardDensity;
  funnelStages: Array<{ id: number; name: string; emoji: string }>;
  allTags: Array<{ id: number; name: string; color: string | null }>;
  dragHandleProps: React.HTMLAttributes<HTMLElement> | null;
  onOpen: () => void;
  onOpenPanel: () => void;
  onSetStage: (stageId: string) => void;
  onToggleTag: (tag: { id: number; name: string; color: string | null }) => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const number = chat.remoteJid.split('@')[0];
  const status = chat.automationDisabled ? 'closed' : chat.unreadCount > 0 ? 'pending' : 'active';
  const statusClass = status === 'closed'
    ? 'border-border bg-muted text-muted-foreground'
    : status === 'pending'
      ? 'border-primary/35 bg-primary/10 text-primary'
      : 'border-border bg-card text-foreground';
  return (
    <article className="group min-w-0 rounded-lg border border-border bg-background">
      <div className={cn('flex min-w-0 items-center gap-2', density === 'compact' ? 'p-1.5' : 'p-2')}>
        <button
          type="button"
          className="flex h-10 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={t('drag_item_label', { name: chat.name })}
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="relative shrink-0">
          <Avatar className={cn('border border-border', density === 'compact' ? 'h-8 w-8' : 'h-10 w-10')}>
            <AvatarImage src={chat.profilePicUrl || ''} alt={chat.name} />
            <AvatarFallback className="bg-muted text-xs text-foreground">
              {chat.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {chat.unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-primary-foreground">
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-foreground">{chat.name}</h3>
            {chat.isCustomer && density !== 'compact' && (
              <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                <UserRoundCheck className="h-3 w-3" />
                {t('client_badge')}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs tabular-nums text-muted-foreground">{number}</p>
          {density !== 'compact' && chat.lastMessageText && (
            <p className={cn('mt-0.5 text-[11px] text-muted-foreground/85', density === 'complete' ? 'line-clamp-2' : 'truncate')}>
              {chat.lastMessageText}
            </p>
          )}
          {density !== 'compact' && (
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium', statusClass)}>
                {t(`chat_status_${status}`)}
              </Badge>
              {chat.funnelStage && (
                <span className="truncate text-[10px] text-muted-foreground">
                  {chat.funnelStage.emoji} {chat.funnelStage.name}
                </span>
              )}
            </div>
          )}
        </div>
        {density !== 'complete' && (
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 sm:h-8 sm:w-8" onClick={onOpen} aria-label={t('open_chat_button')}>
            <MessageCircle className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
          aria-label={t('remove_item_label', { name: chat.name })}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {density === 'complete' && (
        <div className="grid grid-cols-1 gap-2 border-t border-border p-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">{t('stage_field_label')}</Label>
            <Select value={chat.funnelStage?.id ? String(chat.funnelStage.id) : 'none'} onValueChange={onSetStage} disabled={!chat.contactId}>
              <SelectTrigger className="h-10 w-full text-xs sm:h-8">
                <SelectValue placeholder={t('no_stage_option')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('no_stage_option')}</SelectItem>
                {funnelStages.map((stage) => (
                  <SelectItem key={stage.id} value={String(stage.id)}>{stage.emoji} {stage.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">{t('tags_field_label')}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 w-full justify-start overflow-hidden px-2 text-xs font-normal sm:h-8" disabled={!chat.contactId}>
                  <Tag className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{chat.tags.length > 0 ? chat.tags.map((tag) => tag.name).join(', ') : t('no_tags_option')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>{t('tags_field_label')}</DropdownMenuLabel>
                {allTags.length === 0 ? (
                  <DropdownMenuItem disabled>{t('no_tags_option')}</DropdownMenuItem>
                ) : allTags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={chat.tags.some((current) => current.id === tag.id)}
                    onCheckedChange={() => onToggleTag(tag)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {tag.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button variant="outline" size="sm" className="h-10 flex-1 sm:h-8" onClick={onOpen}>
              <MessageCircle className="h-3.5 w-3.5" />
              {t('open_chat_button')}
            </Button>
            <Button variant="outline" size="sm" className="h-10 flex-1 sm:h-8" onClick={onOpenPanel}>
              <PanelRightOpen className="h-3.5 w-3.5" />
              {t('open_contact_panel_button')}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function ProjectBookmarkCard({
  project,
  dragHandleProps,
  onOpen,
  onRemove,
  t,
}: {
  project: BookmarkProject;
  dragHandleProps: React.HTMLAttributes<HTMLElement> | null;
  onOpen: () => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const progress = project.taskCount > 0
    ? Math.round((project.completedCount / project.taskCount) * 100)
    : 0;
  const projectColor = project.color && /^#[0-9A-F]{6}$/i.test(project.color)
    ? project.color
    : null;
  return (
    <article className="group flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background p-2">
      <button
        type="button"
        className="flex h-10 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={t('drag_item_label', { name: project.name })}
        {...dragHandleProps}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
        style={projectColor ? { backgroundColor: `${projectColor}1A`, color: projectColor } : undefined}
      >
        <FolderKanban className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-foreground">{project.name}</h3>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{t('project_badge')}</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {project.workspaceName || t('workspace_fallback')}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${progress}%`, backgroundColor: projectColor ?? undefined }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {t('project_progress', { completed: project.completedCount, total: project.taskCount })}
          </span>
        </div>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onOpen}>
        <FolderKanban className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">{t('open_project_button')}</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={t('remove_item_label', { name: project.name })}
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </article>
  );
}

function CatalogChatRow({
  chat,
  isAdding,
  onAdd,
  t,
}: {
  chat: BookmarkChat;
  isAdding: boolean;
  onAdd: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card p-2">
      <Avatar className="h-9 w-9">
        <AvatarImage src={chat.profilePicUrl || ''} alt={chat.name} />
        <AvatarFallback className="bg-muted text-xs">{chat.name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{chat.name}</p>
          {chat.isCustomer && <Badge variant="secondary" className="h-5 text-[10px]">{t('client_badge')}</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">{chat.remoteJid.split('@')[0]}</p>
      </div>
      <Button size="sm" disabled={isAdding} onClick={onAdd}>
        {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {t('add_button')}
      </Button>
    </div>
  );
}

function CatalogProjectRow({
  project,
  isAdding,
  onAdd,
  t,
}: {
  project: BookmarkProject;
  isAdding: boolean;
  onAdd: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card p-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FolderKanban className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {project.workspaceName || t('workspace_fallback')} · {t('project_task_count', { count: project.taskCount })}
        </p>
      </div>
      <Button size="sm" disabled={isAdding} onClick={onAdd}>
        {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {t('add_button')}
      </Button>
    </div>
  );
}

function CatalogEmpty({ message }: { message: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
