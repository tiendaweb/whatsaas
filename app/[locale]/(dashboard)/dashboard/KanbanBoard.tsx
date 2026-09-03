'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import useSWR, { useSWRConfig } from 'swr';
import { usePusher } from '@/providers/pusher-provider';
import { useRouter } from 'next/navigation';
import {
    Plus, MoreHorizontal, Loader2,
    Pencil, Trash2, Clock, ChevronLeft, ChevronRight, MessageCircle,
    Layers, FolderPlus, ListPlus, Filter, X, FileText, Building2,
    ContactRound, ExternalLink, Phone, Tags
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker from 'emoji-picker-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ContactProfileExtras } from '@/components/dashboard/ContactProfileExtras';

type FunnelStageGroup = {
  id: number;
  name: string;
  description: string | null;
  order: number;
};

type FunnelStage = {
  id: number;
  name: string;
  emoji: string;
  order: number;
  groupId: number | null;
  groupOrder?: number;
};

type ChatCard = {
  id: number;
  remoteJid: string;
  name: string;
  profilePicUrl?: string;
  contactId: number;
  funnelStageId: number | null;
  lastMessageText: string;
  unreadCount: number;
  updatedAt: string;
  notes: string;
  showTimeInStage: boolean;
  instanceId?: number;
  tags: Array<{ id: number; name: string; color?: string | null }>;
  customerIds: number[];
  companyIds: number[];
  projects: Array<{ id: number; name: string }>;
};

type ContactProfile = {
  id: number;
  name: string | null;
  notes: string | null;
  phone: string | null;
  remoteJid: string | null;
  profilePicUrl: string | null;
  instanceName: string | null;
  customerId: number | null;
  customData: Record<string, unknown> | null;
  assignedUser: { id: number; name: string | null; email: string } | null;
  assignedDepartment: { id: number; name: string } | null;
  funnelStage: { id: number; name: string; emoji: string } | null;
  tags: Array<{ id: number; name: string; color?: string | null }>;
};

type KanbanMetadata = {
  capabilities: {
    customers: boolean;
    memberships: boolean;
    tasks: boolean;
  };
  companies: Array<{ id: number; name: string }>;
  metadata: Record<string, {
    customerIds: number[];
    companyIds: number[];
    projects: Array<{ id: number; name: string }>;
  }>;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return res.json();
};

function getDaysInStage(dateString: string) {
  if (!dateString) return 0;
  const updated = new Date(dateString);
  const now = new Date();
  return Math.ceil(Math.abs(now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
}

export default function KanbanBoard({
  viewSwitcher,
  selectedGroupId,
  onSelectedGroupChange,
}: {
  viewSwitcher: React.ReactNode;
  selectedGroupId: string;
  onSelectedGroupChange: (groupId: string) => void;
}) {
  const t = useTranslations('Dashboard');
  const { data: allStagesData, isLoading: loadingStages, mutate: mutateStages } = useSWR<FunnelStage[]>('/api/funnel-stages', fetcher);
  const { data: groupsData, mutate: mutateGroups } = useSWR<FunnelStageGroup[]>('/api/funnel-stage-groups', fetcher);
  const { data: chats, isLoading: loadingChats, mutate: mutateChats } = useSWR<any[]>('/api/chats?scope=kanban', fetcher);
  const { data: kanbanMetadata, isLoading: loadingMetadata, mutate: mutateKanbanMetadata } = useSWR<KanbanMetadata>('/api/chats/kanban-metadata', fetcher);
  const { data: teamData } = useSWR<{ id: number }>('/api/team', fetcher);
  const { mutate: globalMutate } = useSWRConfig();
  const pusher = usePusher();

  const [tagFilter, setTagFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');

  // Stages for selected group (fetched separately when a group is selected)
  const { data: groupStagesData, mutate: mutateGroupStages } = useSWR<FunnelStage[]>(
    selectedGroupId !== 'all' ? `/api/funnel-stage-groups/${selectedGroupId}/stages` : null,
    fetcher
  );

  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [columns, setColumns] = useState<Record<string, ChatCard[]>>({});

  // New stage modal
  const [isNewStageOpen, setIsNewStageOpen] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageEmoji, setNewStageEmoji] = useState('📌');
  const [newStageGroupId, setNewStageGroupId] = useState<string>('none');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingStage, setEditingStage] = useState<FunnelStage | null>(null);

  // Existing stage selection (for adding to a group)
  const [selectedExistingIds, setSelectedExistingIds] = useState<Set<number>>(new Set());

  // Group modals
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [editingGroup, setEditingGroup] = useState<FunnelStageGroup | null>(null);
  const [isGroupProcessing, setIsGroupProcessing] = useState(false);
  const [activeMobileStageId, setActiveMobileStageId] = useState('unassigned');
  const [profileCard, setProfileCard] = useState<ChatCard | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const groups = Array.isArray(groupsData) ? groupsData : [];
  const allStages = Array.isArray(allStagesData) ? allStagesData : [];
  const capabilities = kanbanMetadata?.capabilities ?? { customers: false, memberships: false, tasks: false };
  const companies = Array.isArray(kanbanMetadata?.companies) ? kanbanMetadata.companies : [];
  const showUnassigned = selectedGroupId === 'all' && (columns.unassigned?.length ?? 0) > 0;
  const { data: profileContact, isLoading: loadingProfile } = useSWR<ContactProfile>(
    profileCard?.contactId ? `/api/contacts/${profileCard.contactId}` : null,
    fetcher,
    { keepPreviousData: false },
  );
  const availableTags = useMemo(() => {
    const tagsById = new Map<number, { id: number; name: string; color?: string | null }>();
    for (const chat of Array.isArray(chats) ? chats : []) {
      for (const tag of Array.isArray(chat.contact?.tags) ? chat.contact.tags : []) {
        tagsById.set(tag.id, tag);
      }
    }
    return Array.from(tagsById.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [chats]);

  useEffect(() => {
    if (!groupsData || selectedGroupId === 'all') return;
    if (!groups.some((group) => String(group.id) === selectedGroupId)) {
      onSelectedGroupChange('all');
    }
  }, [groups, groupsData, onSelectedGroupChange, selectedGroupId]);
  const activeFilterCount = [
    tagFilter !== 'all',
    capabilities.customers && customerFilter !== 'all',
    capabilities.memberships && companyFilter !== 'all',
    capabilities.tasks && projectFilter !== 'all',
  ].filter(Boolean).length;
  const activeFilterLabels = [
    tagFilter !== 'all' ? availableTags.find((tag) => String(tag.id) === tagFilter)?.name : null,
    capabilities.customers && customerFilter !== 'all'
      ? t(customerFilter === 'customer' ? 'filter_customers_only' : 'filter_non_customers_only')
      : null,
    capabilities.memberships && companyFilter !== 'all'
      ? companies.find((company) => String(company.id) === companyFilter)?.name
      : null,
    capabilities.tasks && projectFilter !== 'all'
      ? t(projectFilter === 'linked' ? 'filter_with_project' : 'filter_without_project')
      : null,
  ].filter((label): label is string => Boolean(label));

  // Determine which stages to show based on selected group
  useEffect(() => {
    if (selectedGroupId === 'all') {
      setStages((Array.isArray(allStagesData) ? [...allStagesData] : []).sort((a, b) => a.order - b.order));
    } else if (Array.isArray(groupStagesData)) {
      setStages([...groupStagesData].sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0)));
    } else {
      setStages([]);
    }
  }, [selectedGroupId, allStagesData, groupStagesData]);

  useEffect(() => {
    const availableIds = [
      ...(showUnassigned ? ['unassigned'] : []),
      ...stages.map((stage) => String(stage.id)),
    ];
    if (!availableIds.includes(activeMobileStageId)) {
      setActiveMobileStageId(availableIds[0] ?? '');
    }
  }, [activeMobileStageId, showUnassigned, stages]);

  // Set default group for new stage when group is selected
  useEffect(() => {
    if (selectedGroupId !== 'all') setNewStageGroupId(selectedGroupId);
  }, [selectedGroupId]);

  // Build kanban columns
  useEffect(() => {
    const newCols: Record<string, ChatCard[]> = { unassigned: [] };
    stages.forEach(s => newCols[s.id] = []);

    const chatList = Array.isArray(chats) ? chats : [];
    if (chatList.length > 0) {
      chatList.forEach(chat => {
        const contactMetadata = chat.contact?.id
          ? kanbanMetadata?.metadata?.[String(chat.contact.id)]
          : undefined;
        const card: ChatCard = {
          id: chat.id,
          remoteJid: chat.remoteJid,
          name: chat.contact?.name || chat.name || chat.remoteJid,
          profilePicUrl: chat.profilePicUrl,
          contactId: chat.contact?.id,
          funnelStageId: chat.contact?.funnelStage?.id,
          lastMessageText: chat.lastMessageText,
          unreadCount: chat.unreadCount,
          updatedAt: chat.contact?.updatedAt || new Date().toISOString(),
          notes: typeof chat.contact?.notes === 'string' ? chat.contact.notes : '',
          showTimeInStage: chat.contact?.showTimeInStage || false,
          instanceId: chat.instanceId,
          tags: Array.isArray(chat.contact?.tags) ? chat.contact.tags : [],
          customerIds: contactMetadata?.customerIds ?? [],
          companyIds: contactMetadata?.companyIds ?? [],
          projects: contactMetadata?.projects ?? [],
        };
        const matchesTag = tagFilter === 'all' || card.tags.some((tag) => String(tag.id) === tagFilter);
        const matchesCustomer = !capabilities.customers
          || customerFilter === 'all'
          || (customerFilter === 'customer' ? card.customerIds.length > 0 : card.customerIds.length === 0);
        const matchesCompany = !capabilities.memberships
          || companyFilter === 'all'
          || card.companyIds.some((companyId) => String(companyId) === companyFilter);
        const matchesProject = !capabilities.tasks
          || projectFilter === 'all'
          || (projectFilter === 'linked' ? card.projects.length > 0 : card.projects.length === 0);
        if (!matchesTag || !matchesCustomer || !matchesCompany || !matchesProject) return;

        if (chat.contact?.funnelStage) {
          const sid = chat.contact.funnelStage.id;
          if (newCols[sid] !== undefined) newCols[sid].push(card);
          else if (selectedGroupId === 'all') newCols['unassigned'].push(card);
        } else if (chat.contact && selectedGroupId === 'all') {
          newCols['unassigned'].push(card);
        }
      });
    }
    setColumns(newCols);
  }, [stages, chats, selectedGroupId, kanbanMetadata, tagFilter, customerFilter, companyFilter, projectFilter, capabilities.customers, capabilities.memberships, capabilities.tasks]);

  useEffect(() => {
    if (!capabilities.customers) setCustomerFilter('all');
    if (!capabilities.memberships) setCompanyFilter('all');
    if (!capabilities.tasks) setProjectFilter('all');
  }, [capabilities.customers, capabilities.memberships, capabilities.tasks]);

  const clearFilters = () => {
    setTagFilter('all');
    setCustomerFilter('all');
    setCompanyFilter('all');
    setProjectFilter('all');
  };

  // Real-time kanban sync via Pusher
  useEffect(() => {
    if (!pusher || !teamData?.id) return;
    const channelName = `team-${teamData.id}`;
    const channel = pusher.subscribe(channelName);
    const handler = () => {
      mutateChats();
      mutateKanbanMetadata();
    };
    channel.bind('kanban-stage-update', handler);
    return () => {
      channel.unbind('kanban-stage-update', handler);
    };
  }, [pusher, teamData?.id, mutateChats, mutateKanbanMetadata]);

  const mutateCurrentStages = () => {
    mutateStages();
    if (selectedGroupId !== 'all') mutateGroupStages();
  };

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (type === 'COLUMN') {
      const newStages = Array.from(stages);
      const [removed] = newStages.splice(source.index, 1);
      newStages.splice(destination.index, 0, removed);
      setStages(newStages);

      try {
        if (selectedGroupId !== 'all') {
          // Reorder within group
          const payload = newStages.map((s, i) => ({ stageId: s.id, order: i + 1 }));
          await fetch(`/api/funnel-stage-groups/${selectedGroupId}/stages/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stages: payload }),
          });
          mutateGroupStages();
        } else {
          // Global reorder
          const payload = newStages.map((s, i) => ({ id: s.id, order: i + 1 }));
          await fetch('/api/funnel-stages/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stages: payload }),
          });
          globalMutate('/api/funnel-stages');
        }
      } catch {
        toast.error(t('toast_error'));
        mutateCurrentStages();
      }
      return;
    }

    const srcId = source.droppableId;
    const dstId = destination.droppableId;
    const srcItems = [...(columns[srcId] || [])];
    const dstItems = srcId === dstId ? srcItems : [...(columns[dstId] || [])];
    const [movedItem] = srcItems.splice(source.index, 1);
    if (srcId !== dstId) movedItem.updatedAt = new Date().toISOString();

    if (srcId === dstId) {
      srcItems.splice(destination.index, 0, movedItem);
      setColumns({ ...columns, [srcId]: srcItems });
    } else {
      dstItems.splice(destination.index, 0, movedItem);
      setColumns({ ...columns, [srcId]: srcItems, [dstId]: dstItems });
    }

    try {
      if (!movedItem.contactId) { mutateChats(); return; }
      const newStageId = dstId === 'unassigned' ? null : parseInt(dstId);
      await fetch(`/api/contacts/${movedItem.contactId}/funnel-stage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: newStageId }),
      });
      mutateChats();
    } catch {
      toast.error(t('toast_error'));
      mutateChats();
    }
  };

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return;
    setIsProcessing(true);
    try {
      const groupId = newStageGroupId !== 'none' ? parseInt(newStageGroupId) : null;
      const res = await fetch('/api/funnel-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStageName, emoji: newStageEmoji, groupId }),
      });
      if (!res.ok) throw new Error();
      const newStage = await res.json();

      // Also add to junction table if group selected
      if (groupId) {
        await fetch(`/api/funnel-stage-groups/${groupId}/stages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageIds: [newStage.id] }),
        });
      }

      toast.success(t('toast_created'));
      setNewStageName(''); setNewStageEmoji('📌');
      setNewStageGroupId(selectedGroupId !== 'all' ? selectedGroupId : 'none');
      setIsNewStageOpen(false);
      mutateCurrentStages();
    } catch { toast.error(t('toast_error')); }
    finally { setIsProcessing(false); }
  };

  const handleAddExistingStages = async () => {
    if (selectedExistingIds.size === 0 || selectedGroupId === 'all') return;
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/funnel-stage-groups/${selectedGroupId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageIds: Array.from(selectedExistingIds) }),
      });
      if (!res.ok) throw new Error();
      toast.success('Etapas agregadas al grupo');
      setSelectedExistingIds(new Set());
      setIsNewStageOpen(false);
      mutateGroupStages();
    } catch { toast.error(t('toast_error')); }
    finally { setIsProcessing(false); }
  };

  const handleUpdateStage = async () => {
    if (!editingStage || !editingStage.name.trim()) return;
    setIsProcessing(true);
    try {
      await fetch(`/api/funnel-stages/${editingStage.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingStage.name, emoji: editingStage.emoji }),
      });
      toast.success(t('toast_updated'));
      setEditingStage(null);
      mutateCurrentStages();
    } catch { toast.error(t('toast_error')); }
    finally { setIsProcessing(false); }
  };

  const handleDeleteStage = async (id: number) => {
    if (!confirm(t('delete_confirm'))) return;
    try {
      await fetch(`/api/funnel-stages/${id}`, { method: 'DELETE' });
      toast.success(t('toast_deleted'));
      mutateCurrentStages(); mutateChats();
    } catch { toast.error(t('toast_error')); }
  };

  const handleRemoveFromGroup = async (stageId: number) => {
    if (selectedGroupId === 'all') return;
    if (!confirm('¿Quitar esta etapa del grupo? La etapa no se eliminará.')) return;
    try {
      await fetch(`/api/funnel-stage-groups/${selectedGroupId}/stages/${stageId}`, { method: 'DELETE' });
      toast.success('Etapa quitada del grupo');
      mutateGroupStages();
    } catch { toast.error(t('toast_error')); }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setIsGroupProcessing(true);
    try {
      const res = await fetch('/api/funnel-stage-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName, description: newGroupDescription }),
      });
      if (!res.ok) throw new Error();
      toast.success('Grupo creado');
      setNewGroupName(''); setNewGroupDescription(''); setIsNewGroupOpen(false);
      mutateGroups();
    } catch { toast.error(t('toast_error')); }
    finally { setIsGroupProcessing(false); }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !editingGroup.name.trim()) return;
    setIsGroupProcessing(true);
    try {
      await fetch(`/api/funnel-stage-groups/${editingGroup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingGroup.name, description: editingGroup.description }),
      });
      toast.success('Grupo actualizado');
      setEditingGroup(null);
      mutateGroups();
    } catch { toast.error(t('toast_error')); }
    finally { setIsGroupProcessing(false); }
  };

  const handleDeleteGroup = async (id: number) => {
    if (!confirm('¿Eliminar este grupo? Las etapas no se eliminarán.')) return;
    try {
      await fetch(`/api/funnel-stage-groups/${id}`, { method: 'DELETE' });
      toast.success('Grupo eliminado');
      if (selectedGroupId === String(id)) onSelectedGroupChange('all');
      mutateGroups(); mutateStages();
    } catch { toast.error(t('toast_error')); }
  };

  const handleToggleAlert = async (card: ChatCard) => {
    const newStatus = !card.showTimeInStage;
    const newCols = { ...columns };
    Object.keys(newCols).forEach(key => {
      const idx = newCols[key].findIndex(c => c.id === card.id);
      if (idx !== -1) newCols[key][idx] = { ...newCols[key][idx], showTimeInStage: newStatus };
    });
    setColumns(newCols);
    try {
      await fetch(`/api/contacts/${card.contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showTimeInStage: newStatus }),
      });
      globalMutate('/api/chats');
    } catch { mutateChats(); }
  };

  const scrollBoard = (direction: 'left' | 'right') => {
    scrollContainerRef.current?.scrollBy({
      left: direction === 'left' ? -340 : 340,
      behavior: 'smooth',
    });
  };

  const scrollToMobileStage = (stageId: string) => {
    setActiveMobileStageId(stageId);
    const column = scrollContainerRef.current?.querySelector<HTMLElement>(`[data-kanban-column="${stageId}"]`);
    column?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  };

  const syncActiveMobileStage = () => {
    const container = scrollContainerRef.current;
    if (!container || window.innerWidth >= 768) return;
    const columns = Array.from(container.querySelectorAll<HTMLElement>('[data-kanban-column]'));
    const nearest = columns.reduce<{ id: string; distance: number } | null>((current, column) => {
      const distance = Math.abs(column.offsetLeft - container.scrollLeft);
      const id = column.dataset.kanbanColumn;
      if (!id || (current && current.distance <= distance)) return current;
      return { id, distance };
    }, null);
    if (nearest) setActiveMobileStageId(nearest.id);
  };

  // Stages already in the current group (for "add existing" filter)
  const stagesInGroup = new Set(stages.map(s => s.id));
  // Stages that can be added to the group
  const availableToAdd = allStages.filter(s => !stagesInGroup.has(s.id));

  const selectedGroupLabel =
    selectedGroupId === 'all' ? 'Todos los grupos' :
    groups.find(g => String(g.id) === selectedGroupId)?.name || 'Todos los grupos';

  if (loadingStages || loadingChats || loadingMetadata) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Header */}
      <header className="order-1 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-3 py-2.5 md:order-2 md:gap-3 md:px-5 md:py-3">
        <h2 className="text-lg font-bold text-foreground sm:text-xl">{t('title')}</h2>

        <div className="flex w-full min-w-0 items-center justify-end gap-2 md:ml-auto md:w-auto md:flex-1 md:flex-wrap">
          <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
            <Select value={selectedGroupId} onValueChange={onSelectedGroupChange}>
              <SelectTrigger className="h-10 w-full min-w-0 md:h-9 md:w-[200px]">
                <div className="flex min-w-0 items-center gap-2">
                  <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Todos los grupos" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los grupos</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={String(group.id)}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedGroupId !== 'all' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 md:h-9 md:w-9">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    const g = groups.find(g => String(g.id) === selectedGroupId);
                    if (g) setEditingGroup(g);
                  }}>
                    <Pencil className="mr-2 h-3 w-3" /> Editar grupo
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteGroup(parseInt(selectedGroupId))}>
                    <Trash2 className="mr-2 h-3 w-3" /> Eliminar grupo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Add group */}
          <Dialog open={isNewGroupOpen} onOpenChange={setIsNewGroupOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 w-10 shrink-0 gap-1.5 px-0 sm:w-auto sm:px-3 md:h-9">
                <FolderPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Agregar Grupo</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:p-4">
              <DialogHeader><DialogTitle>Nuevo Grupo de Etapas</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-3 py-2">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Nombre del grupo</label>
                  <Input placeholder="Ej: Ventas, Producción..." value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Descripción (opcional)</label>
                  <Textarea placeholder="Descripción..." value={newGroupDescription} onChange={e => setNewGroupDescription(e.target.value)} rows={2} className="resize-none" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsNewGroupOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreateGroup} disabled={isGroupProcessing}>
                  {isGroupProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear Grupo'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add stage */}
          <Dialog open={isNewStageOpen} onOpenChange={(o) => {
            setIsNewStageOpen(o);
            if (!o) { setSelectedExistingIds(new Set()); }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-10 w-10 shrink-0 gap-1.5 bg-primary px-0 text-primary-foreground hover:bg-primary/90 sm:w-auto sm:px-3 md:h-9">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t('add_stage')}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:p-4">
              <DialogHeader>
                <DialogTitle>
                  {selectedGroupId !== 'all'
                    ? `Agregar Etapa — ${selectedGroupLabel}`
                    : t('new_stage_modal')}
                </DialogTitle>
              </DialogHeader>

              {/* Show tabs only when a group is selected and there are available stages */}
              {selectedGroupId !== 'all' && availableToAdd.length > 0 ? (
                <Tabs defaultValue="nueva">
                  <TabsList className="w-full">
                    <TabsTrigger value="nueva" className="flex-1 gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Nueva etapa
                    </TabsTrigger>
                    <TabsTrigger value="existente" className="flex-1 gap-1.5">
                      <ListPlus className="h-3.5 w-3.5" /> Etapa existente
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab: crear nueva */}
                  <TabsContent value="nueva" className="mt-3">
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="text-xl shrink-0">{newStageEmoji}</Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0 border-none">
                            <EmojiPicker onEmojiClick={e => setNewStageEmoji(e.emoji)} />
                          </PopoverContent>
                        </Popover>
                        <Input placeholder={t('stage_name_placeholder')} value={newStageName} onChange={e => setNewStageName(e.target.value)} />
                      </div>
                    </div>
                    <DialogFooter className="mt-4">
                      <Button onClick={handleCreateStage} disabled={isProcessing}>
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear y agregar al grupo'}
                      </Button>
                    </DialogFooter>
                  </TabsContent>

                  {/* Tab: agregar existente */}
                  <TabsContent value="existente" className="mt-3">
                    <p className="text-sm text-muted-foreground mb-3">
                      Seleccioná las etapas que querés agregar al grupo <strong>{selectedGroupLabel}</strong>.
                      Las etapas pueden estar en múltiples grupos.
                    </p>
                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                      {availableToAdd.map(stage => (
                        <label
                          key={stage.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={selectedExistingIds.has(stage.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedExistingIds);
                              if (checked) next.add(stage.id);
                              else next.delete(stage.id);
                              setSelectedExistingIds(next);
                            }}
                          />
                          <span className="text-lg">{stage.emoji}</span>
                          <span className="text-sm font-medium">{stage.name}</span>
                        </label>
                      ))}
                    </div>
                    <DialogFooter className="mt-4">
                      <Button
                        onClick={handleAddExistingStages}
                        disabled={isProcessing || selectedExistingIds.size === 0}
                      >
                        {isProcessing
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : `Agregar ${selectedExistingIds.size > 0 ? `(${selectedExistingIds.size})` : ''} al grupo`}
                      </Button>
                    </DialogFooter>
                  </TabsContent>
                </Tabs>
              ) : (
                /* Simple form: no group or no available stages */
                <>
                  <div className="flex flex-col gap-3 py-2">
                    <div className="flex gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="text-xl shrink-0">{newStageEmoji}</Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0 border-none">
                          <EmojiPicker onEmojiClick={e => setNewStageEmoji(e.emoji)} />
                        </PopoverContent>
                      </Popover>
                      <Input placeholder={t('stage_name_placeholder')} value={newStageName} onChange={e => setNewStageName(e.target.value)} />
                    </div>
                    {groups.length > 0 && (
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Grupo (opcional)</label>
                        <Select value={newStageGroupId} onValueChange={setNewStageGroupId}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Sin grupo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin grupo</SelectItem>
                            {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateStage} disabled={isProcessing}>
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : t('create_btn')}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Compact Swiss filter rail */}
      <div className="order-2 flex h-11 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card text-foreground [scrollbar-width:none] md:order-1 [&::-webkit-scrollbar]:hidden">
        {viewSwitcher}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="h-full shrink-0 gap-2 rounded-none border-r border-border bg-card px-3 text-foreground hover:bg-muted hover:text-foreground sm:px-4"
            >
              <Filter className="h-4 w-4" />
              <span className="text-sm font-semibold">{t('filters_button')}</span>
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
                  {String(activeFilterCount).padStart(2, '0')}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="max-h-[min(70vh,560px)] w-[calc(100vw-2rem)] overflow-y-auto rounded-none border border-border bg-popover p-0 text-popover-foreground shadow-none sm:w-[420px]"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold">{t('filters_button')}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{String(activeFilterCount).padStart(2, '0')}</span>
              </div>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-none px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={clearFilters}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> {t('clear_all_button')}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
              <div className="bg-popover p-3">
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{t('filter_tag_label')}</label>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="h-10 w-full rounded-none border-input bg-muted/60 text-sm text-foreground"><SelectValue placeholder={t('filter_all_tags')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filter_all_tags')}</SelectItem>
                    {availableTags.map((tag) => <SelectItem key={tag.id} value={String(tag.id)}>{tag.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {capabilities.customers && (
                <div className="bg-popover p-3">
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{t('filter_customer_label')}</label>
                  <Select value={customerFilter} onValueChange={setCustomerFilter}>
                    <SelectTrigger className="h-10 w-full rounded-none border-input bg-muted/60 text-sm text-foreground"><SelectValue placeholder={t('filter_all_contacts')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('filter_all_contacts')}</SelectItem>
                      <SelectItem value="customer">{t('filter_customers_only')}</SelectItem>
                      <SelectItem value="not_customer">{t('filter_non_customers_only')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {capabilities.memberships && companies.length > 0 && (
                <div className="bg-popover p-3">
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{t('filter_company_label')}</label>
                  <Select value={companyFilter} onValueChange={setCompanyFilter}>
                    <SelectTrigger className="h-10 w-full rounded-none border-input bg-muted/60 text-sm text-foreground"><SelectValue placeholder={t('filter_all_companies')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('filter_all_companies')}</SelectItem>
                      {companies.map((company) => <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {capabilities.tasks && (
                <div className="bg-popover p-3">
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{t('filter_project_label')}</label>
                  <Select value={projectFilter} onValueChange={setProjectFilter}>
                    <SelectTrigger className="h-10 w-full rounded-none border-input bg-muted/60 text-sm text-foreground"><SelectValue placeholder={t('filter_all_project_states')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('filter_all_project_states')}</SelectItem>
                      <SelectItem value="linked">{t('filter_with_project')}</SelectItem>
                      <SelectItem value="unlinked">{t('filter_without_project')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {activeFilterLabels.length > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeFilterLabels.map((label, index) => (
              <span key={`${label}-${index}`} className="flex h-full shrink-0 items-center border-r border-border px-3 text-xs font-medium text-foreground">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Group indicator */}
      {selectedGroupId !== 'all' && (
        <div className="order-3 flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2 sm:px-5">
          <Badge variant="secondary" className="gap-1.5 text-xs px-2 py-0.5">
            <Layers className="h-3 w-3" /> {selectedGroupLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {stages.length} etapa{stages.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="order-4 flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-background px-3 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        {showUnassigned && (
          <button
            type="button"
            className={cn(
              'h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors',
              activeMobileStageId === 'unassigned'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground',
            )}
            onClick={() => scrollToMobileStage('unassigned')}
          >
            {t('unassigned')} · {columns.unassigned?.length ?? 0}
          </button>
        )}
        {stages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={cn(
              'h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors',
              activeMobileStageId === String(stage.id)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground',
            )}
            onClick={() => scrollToMobileStage(String(stage.id))}
          >
            {stage.emoji} {stage.name} · {columns[stage.id]?.length ?? 0}
          </button>
        ))}
      </div>

      {/* Kanban board */}
      <div
        ref={scrollContainerRef}
        onScroll={syncActiveMobileStage}
        data-dashboard-horizontal-scroll
        className="order-5 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden p-3 md:order-4 md:snap-none md:p-5
                   scrollbar-thin scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent
                   [&::-webkit-scrollbar]:h-3
                   [&::-webkit-scrollbar-thumb]:bg-muted-foreground/50
                   [&::-webkit-scrollbar-thumb]:rounded-full
                   [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="board" direction="horizontal" type="COLUMN">
            {(provided) => (
              <div className="flex h-full min-w-max gap-3 pb-4 md:gap-4 md:px-1" ref={provided.innerRef} {...provided.droppableProps}>
                {/* Unassigned column — solo visible en vista "Todas las etapas" */}
                {showUnassigned && (
                  <div data-kanban-column="unassigned" className="flex h-full max-h-full w-[calc(100vw-2rem)] min-w-[calc(100vw-2rem)] snap-start flex-col rounded-xl border bg-muted/50 dark:bg-muted/20 md:w-80 md:min-w-80">
                    <div className="p-3 border-b bg-card/50 dark:bg-card/80 rounded-t-xl flex justify-between items-center sticky top-0 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📍</span>
                        <h3 className="font-semibold text-foreground text-sm uppercase">{t('unassigned')}</h3>
                      </div>
                      <Badge variant="secondary">{columns['unassigned']?.length || 0}</Badge>
                    </div>
                    <Droppable droppableId="unassigned" type="CARD">
                      {(prov, snap) => (
                        <div {...prov.droppableProps} ref={prov.innerRef} className={`flex-1 overflow-y-auto p-2 space-y-2 ${snap.isDraggingOver ? 'bg-primary/10' : ''}`}>
                          {(columns['unassigned'] || []).map((card, idx) => (
                            <CardItem key={card.id} card={card} index={idx} toggleAlert={handleToggleAlert} onOpenProfile={setProfileCard} t={t} />
                          ))}
                          {prov.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )}

                {/* Stage columns */}
                {stages.map((stage, index) => (
                  <Draggable key={stage.id} draggableId={stage.id.toString()} index={index}>
                    {(provided) => (
                      <div data-kanban-column={stage.id} ref={provided.innerRef} {...provided.draggableProps} className="flex h-full max-h-full w-[calc(100vw-2rem)] min-w-[calc(100vw-2rem)] snap-start flex-col rounded-xl border bg-muted/50 dark:bg-muted/20 md:w-80 md:min-w-80">
                        <div {...provided.dragHandleProps} className="p-3 border-b bg-card/50 dark:bg-card/80 rounded-t-xl flex justify-between items-center sticky top-0 backdrop-blur-sm group cursor-grab active:cursor-grabbing">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{stage.emoji}</span>
                            <h3 className="font-semibold text-foreground text-sm uppercase">{stage.name}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{columns[stage.id]?.length || 0}</Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => setEditingStage(stage)}>
                                  <Pencil className="mr-2 h-3 w-3" /> {t('edit')}
                                </DropdownMenuItem>
                                {selectedGroupId !== 'all' && (
                                  <DropdownMenuItem onClick={() => handleRemoveFromGroup(stage.id)}>
                                    <Layers className="mr-2 h-3 w-3" /> Quitar del grupo
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleDeleteStage(stage.id)} className="text-destructive">
                                  <Trash2 className="mr-2 h-3 w-3" /> {t('delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        <Droppable droppableId={stage.id.toString()} type="CARD">
                          {(prov, snap) => (
                            <div {...prov.droppableProps} ref={prov.innerRef} className={`flex-1 overflow-y-auto p-2 space-y-2 ${snap.isDraggingOver ? 'bg-primary/10' : ''}`}>
                              {(columns[stage.id] || []).map((card, idx) => (
                                <CardItem key={card.id} card={card} index={idx} toggleAlert={handleToggleAlert} onOpenProfile={setProfileCard} t={t} />
                              ))}
                              {prov.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Scroll buttons */}
      <div className="absolute bottom-6 right-6 z-10 hidden gap-2 md:flex">
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-full shadow-md bg-background border-border hover:bg-muted" onClick={() => scrollBoard('left')}>
          <ChevronLeft className="h-5 w-5 text-muted-foreground" />
        </Button>
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-full shadow-md bg-background border-border hover:bg-muted" onClick={() => scrollBoard('right')}>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>

      {/* Edit stage modal */}
      {editingStage && (
        <Dialog open={!!editingStage} onOpenChange={o => !o && setEditingStage(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:p-4">
            <DialogHeader><DialogTitle>{t('edit_stage_modal')}</DialogTitle></DialogHeader>
            <div className="flex gap-2 py-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="text-xl shrink-0">{editingStage.emoji}</Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0 border-none">
                  <EmojiPicker onEmojiClick={e => setEditingStage({ ...editingStage, emoji: e.emoji })} />
                </PopoverContent>
              </Popover>
              <Input value={editingStage.name} onChange={e => setEditingStage({ ...editingStage, name: e.target.value })} />
            </div>
            <DialogFooter>
              <Button onClick={handleUpdateStage} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : t('save_btn')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit group modal */}
      {editingGroup && (
        <Dialog open={!!editingGroup} onOpenChange={o => !o && setEditingGroup(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:p-4">
            <DialogHeader><DialogTitle>Editar Grupo</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Nombre del grupo</label>
                <Input value={editingGroup.name} onChange={e => setEditingGroup({ ...editingGroup, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Descripción (opcional)</label>
                <Textarea value={editingGroup.description || ''} onChange={e => setEditingGroup({ ...editingGroup, description: e.target.value })} rows={2} className="resize-none" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingGroup(null)}>Cancelar</Button>
              <Button onClick={handleUpdateGroup} disabled={isGroupProcessing}>
                {isGroupProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {profileCard && (
        <ContactProfilePanel
          card={profileCard}
          contact={profileContact}
          loading={loadingProfile}
          onClose={() => setProfileCard(null)}
          t={t}
        />
      )}
    </div>
  );
}

function CardItem({ card, index, toggleAlert, onOpenProfile, t }: {
  card: ChatCard;
  index: number;
  toggleAlert: (c: ChatCard) => void;
  onOpenProfile: (card: ChatCard) => void;
  t: any;
}) {
  const router = useRouter();
  const daysInStage = getDaysInStage(card.updatedAt);

  const handleOpenChat = () => {
    const isGroupChat = card.remoteJid.endsWith('@g.us');
    const chatNumber = isGroupChat ? card.remoteJid : card.remoteJid.split('@')[0];
    const query = card.instanceId ? `?instanceId=${card.instanceId}` : '';
    router.push(`/dashboard/chat/${chatNumber}${query}`);
  };

  return (
    <Draggable draggableId={card.id.toString()} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-card p-3 rounded-lg border shadow-sm group hover:shadow-md transition-all relative flex flex-col gap-2 ${snapshot.isDragging ? 'rotate-2 shadow-lg ring-2 ring-primary/20' : ''}`}
          style={provided.draggableProps.style}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-[#002FA7] focus-visible:ring-offset-2"
                aria-label={t('open_contact_profile')}
                onPointerDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenProfile(card);
                }}
              >
                <Avatar className="h-8 w-8 transition-transform active:scale-95">
                  <AvatarImage src={card.profilePicUrl || ''} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {card.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
              <div>
                <p className="text-sm font-medium text-foreground line-clamp-1">{card.name}</p>
                <p className="text-xs text-muted-foreground">{card.remoteJid.split('@')[0]}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleOpenChat}>
                  <MessageCircle className="mr-2 h-3 w-3" /> {t('open_chat')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleAlert(card)}>
                  <Clock className="mr-2 h-3 w-3" /> {card.showTimeInStage ? t('hide_time') : t('view_time')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="text-xs text-muted-foreground bg-muted p-2 rounded-md min-h-[40px] flex items-center">
            <span className="line-clamp-3 break-words" title={card.lastMessageText}>
              {card.lastMessageText && !card.lastMessageText.startsWith('@@') ? card.lastMessageText : '...'}
            </span>
          </div>

          {card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label={t('card_tags_label')}>
              {card.tags.slice(0, 3).map((tag) => (
                <Badge key={tag.id} variant="secondary" className="h-5 max-w-[120px] px-1.5 text-[10px] font-normal">
                  <span className="truncate">{tag.name}</span>
                </Badge>
              ))}
              {card.tags.length > 3 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">+{card.tags.length - 3}</Badge>
              )}
            </div>
          )}

          {card.notes.trim() && (
            <div
              className="border-t border-border pt-2"
              aria-label={t('card_note_label')}
            >
              <div className="flex items-start gap-1.5">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                    {t('card_note_label')}
                  </p>
                  <p
                    className="line-clamp-4 whitespace-pre-line break-words text-[11px] leading-4 text-muted-foreground"
                    title={card.notes}
                  >
                    {card.notes}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end items-center gap-2 mt-auto pt-1">
            {card.showTimeInStage && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 font-normal">
                <Clock className="w-3 h-3" /> {t('days', { count: daysInStage })}
              </Badge>
            )}
            {card.unreadCount > 0 && (
              <Badge className="h-5 px-1.5 text-[10px]">
                {card.unreadCount}
              </Badge>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

function ContactProfilePanel({ card, contact, loading, onClose, t }: {
  card: ChatCard;
  contact?: ContactProfile;
  loading: boolean;
  onClose: () => void;
  t: any;
}) {
  const router = useRouter();
  const displayName = contact?.name || card.name;
  const phone = contact?.phone || card.remoteJid.split('@')[0];
  const profilePicUrl = contact?.profilePicUrl || card.profilePicUrl;
  const tags = contact?.tags ?? card.tags;
  const notes = contact?.notes ?? card.notes;
  const customEntries = Object.entries(contact?.customData ?? {}).filter(([, value]) => (
    value !== null && value !== undefined && String(value).trim() !== ''
  ));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const openChat = () => {
    const isGroupChat = card.remoteJid.endsWith('@g.us');
    const chatNumber = isGroupChat ? card.remoteJid : card.remoteJid.split('@')[0];
    const query = card.instanceId ? `?instanceId=${card.instanceId}` : '';
    router.push(`/dashboard/chat/${chatNumber}${query}`);
  };

  return (
    <aside
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#F7F7F8] font-sans text-[#111217] animate-in slide-in-from-right duration-200 dark:bg-[#0b0d12] dark:text-white"
      aria-label={t('contact_profile')}
      aria-modal="true"
      role="dialog"
      data-dashboard-swipe-lock
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/10 bg-white px-3 sm:h-16 sm:px-6 dark:border-white/10 dark:bg-[#0b0d12]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-[10px] font-bold tabular-nums tracking-[0.12em] text-[#002FA7] dark:text-blue-400">
            #{card.contactId}
          </span>
          <h2 className="truncate text-sm font-bold sm:text-base">{t('contact_profile')}</h2>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label={t('loading_contact_profile')} />}
        </div>
        <div className="flex items-center gap-2">
          <Button className="h-9 rounded-none bg-[#002FA7] px-3 text-white hover:bg-[#002FA7]/90" onClick={openChat}>
            <MessageCircle className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{t('open_chat')}</span>
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-none bg-white dark:bg-[#0b0d12]" onClick={onClose} aria-label={t('close_contact_profile')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 border-x border-black/10 bg-white lg:grid-cols-12 dark:border-white/10 dark:bg-[#0b0d12]">
          <section className="border-b border-black/10 p-5 sm:p-8 lg:col-span-4 lg:min-h-[calc(100dvh-4rem)] lg:border-b-0 lg:border-r dark:border-white/10">
            <Avatar className="h-24 w-24 rounded-none sm:h-32 sm:w-32">
              <AvatarImage className="rounded-none object-cover" src={profilePicUrl || ''} />
              <AvatarFallback className="rounded-none bg-[#002FA7] text-2xl font-bold text-white sm:text-3xl">
                {displayName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h1 className="mt-6 break-words text-3xl font-bold leading-none tracking-[-0.045em] sm:text-5xl">{displayName}</h1>
            <a href={`tel:${phone}`} className="mt-4 flex items-center gap-2 text-sm text-[#002FA7] underline-offset-4 hover:underline dark:text-blue-400">
              <Phone className="h-4 w-4" /> {phone}
            </a>

            <dl className="mt-8 divide-y divide-black/10 border-y border-black/10 text-sm dark:divide-white/10 dark:border-white/10">
              <ProfileRow label={t('profile_instance')} value={contact?.instanceName || t('not_available')} />
              <ProfileRow label={t('profile_agent')} value={contact?.assignedUser?.name || contact?.assignedUser?.email || t('unassigned')} />
              <ProfileRow label={t('profile_department')} value={contact?.assignedDepartment?.name || t('unassigned')} />
              <ProfileRow label={t('profile_stage')} value={contact?.funnelStage ? `${contact.funnelStage.emoji} ${contact.funnelStage.name}` : t('unassigned')} />
            </dl>
          </section>

          <div className="lg:col-span-8">
            {/* Radar primero: si el contacto tiene análisis, es lo que hay que
                leer antes que nada. Debajo van las tareas — que esta ficha no
                mostraba — y los documentos vinculados. */}
            <section className="border-b border-black/10 p-5 sm:p-8 dark:border-white/10">
              <ContactProfileExtras
                contactId={card.contactId}
                chatId={card.id}
                remoteJid={card.remoteJid}
                instanceId={card.instanceId}
                customData={contact?.customData}
                labels={{
                  radar: t('profile_radar'),
                  tasks: t('profile_tasks'),
                  documents: t('profile_documents'),
                }}
              />
            </section>

            <section className="border-b border-black/10 p-5 sm:p-8 dark:border-white/10">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.09em]">{t('profile_latest_conversation')}</h3>
                {card.unreadCount > 0 && <Badge className="rounded-none bg-[#002FA7] text-white">{t('profile_unread', { count: card.unreadCount })}</Badge>}
              </div>
              <p className="max-w-4xl whitespace-pre-wrap break-words text-base leading-7 text-black/70 dark:text-white/70">
                {card.lastMessageText && !card.lastMessageText.startsWith('@@') ? card.lastMessageText : t('no_recent_message')}
              </p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2">
              <section className="border-b border-black/10 p-5 sm:p-8 md:border-r dark:border-white/10">
                <div className="mb-4 flex items-center gap-2">
                  <Tags className="h-4 w-4 text-[#002FA7] dark:text-blue-400" />
                  <h3 className="text-xs font-bold uppercase tracking-[0.09em]">{t('profile_tags')}</h3>
                </div>
                {tags.length ? (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => <Badge key={tag.id} variant="outline" className="rounded-none px-2.5 py-1">{tag.name}</Badge>)}
                  </div>
                ) : <p className="text-sm text-muted-foreground">{t('no_tags')}</p>}
              </section>

              <section className="border-b border-black/10 p-5 sm:p-8 dark:border-white/10">
                <div className="mb-4 flex items-center gap-2">
                  <ContactRound className="h-4 w-4 text-[#002FA7] dark:text-blue-400" />
                  <h3 className="text-xs font-bold uppercase tracking-[0.09em]">{t('profile_relationships')}</h3>
                </div>
                <div className="grid grid-cols-3 divide-x divide-black/10 border border-black/10 dark:divide-white/10 dark:border-white/10">
                  <ProfileMetric value={contact?.customerId || card.customerIds.length ? String(card.customerIds.length || 1) : '0'} label={t('profile_customers')} />
                  <ProfileMetric value={String(card.companyIds.length)} label={t('profile_companies')} />
                  <ProfileMetric value={String(card.projects.length)} label={t('profile_projects')} />
                </div>
                {card.projects.length > 0 && (
                  <div className="mt-4 divide-y divide-black/10 border-y border-black/10 dark:divide-white/10 dark:border-white/10">
                    {card.projects.map((project) => (
                      <div key={project.id} className="flex items-center gap-2 py-2 text-sm">
                        <ExternalLink className="h-3.5 w-3.5 text-[#002FA7] dark:text-blue-400" />
                        <span className="min-w-0 truncate">{project.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="border-b border-black/10 p-5 sm:p-8 md:border-r dark:border-white/10">
                <div className="mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#002FA7] dark:text-blue-400" />
                  <h3 className="text-xs font-bold uppercase tracking-[0.09em]">{t('profile_notes')}</h3>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-black/70 dark:text-white/70">
                  {notes?.trim() || t('no_notes')}
                </p>
              </section>

              <section className="border-b border-black/10 p-5 sm:p-8 dark:border-white/10">
                <div className="mb-4 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#002FA7] dark:text-blue-400" />
                  <h3 className="text-xs font-bold uppercase tracking-[0.09em]">{t('profile_custom_fields')}</h3>
                </div>
                {customEntries.length ? (
                  <dl className="divide-y divide-black/10 border-y border-black/10 dark:divide-white/10 dark:border-white/10">
                    {customEntries.map(([key, value]) => <ProfileRow key={key} label={key} value={typeof value === 'boolean' ? t(value ? 'yes' : 'no') : String(value)} />)}
                  </dl>
                ) : <p className="text-sm text-muted-foreground">{t('no_custom_fields')}</p>}
              </section>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">{label}</dt>
      <dd className="break-words text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function ProfileMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 p-3">
      <strong className="block text-2xl font-bold tabular-nums tracking-[-0.04em]">{value.padStart(2, '0')}</strong>
      <span className="mt-1 block truncate text-[9px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
    </div>
  );
}
