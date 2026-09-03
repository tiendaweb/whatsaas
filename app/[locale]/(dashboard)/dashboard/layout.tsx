'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { usePusher } from '@/providers/pusher-provider';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  PlusCircle,
  MoreVertical,
  XCircle,
  Trash2,
  X,
  Bell,
  BellRing,
  BellOff,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { ChatListItem, ChatListSkeleton, Chat, Agent, FunnelStage, TagData } from '@/components/dashboard/ChatListItem';
import { TeamDataWithMembers } from '@/lib/db/schema';
import { ChatFilters } from '@/components/dashboard/ChatFilters';
import { NewChatDialog } from '@/components/dashboard/NewChatDialog';
import { cn } from '@/lib/utils';

type InstanceData = {
    dbId: number;
    instanceName: string;
    integration: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS';
};

type TeamData = { id: number; };

type ChatListUpdatePayload = Partial<Omit<Chat, 'id' | 'teamId'>> & {
  remoteJid: string;
  id?: number;
};

type FilterState = {
  funnelStageId: number | null;
  tagId: number | null;
  agentId: number | null;
  instanceId: number | null;
  bookmarkGroupId: number | null;
  customerType: 'customer' | 'lead' | null;
};

type ChatMetadata = {
  capabilities: { customers: boolean };
  metadata: Record<string, { customerIds: number[] }>;
};

const SOUNDS = [
  { id: 'sound1', name: 'Pop', src: '/sounds/notification_1.mp3' },
  { id: 'sound2', name: 'Ding', src: '/sounds/notification_2.mp3' },
  { id: 'sound3', name: 'Chime', src: '/sounds/notification_3.mp3' },
  { id: 'sound4', name: 'Ping', src: '/sounds/notification_4.mp3' },
  { id: 'sound5', name: 'Glass', src: '/sounds/notification_5.mp3' },
];

const INITIAL_CHAT_DISPLAY_LIMIT = 20;
const CHAT_LOAD_MORE_BATCH_SIZE = 10;
const CHAT_LIST_WIDTH_STORAGE_KEY = 'dashboardChatListWidth';
const CHAT_LIST_MIN_WIDTH = 240;
const CHAT_LIST_MAX_WIDTH = 560;

function clampChatListWidth(width: number) {
  const availableWidth = typeof window === 'undefined'
    ? CHAT_LIST_MAX_WIDTH
    : Math.max(CHAT_LIST_MIN_WIDTH, window.innerWidth - 360);
  return Math.min(Math.max(width, CHAT_LIST_MIN_WIDTH), CHAT_LIST_MAX_WIDTH, availableWidth);
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return res.json();
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('Chat');
  const dashboardT = useTranslations('DashboardViews');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const activeChatNumber = pathname.split('/chat/')[1] || null;
  const activeInstanceId = searchParams.get('instanceId');

  const parentRef = useRef<HTMLElement | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchedChatRouteRef = useRef<string | null>(null);
  const mobileSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const chatListResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null>(null);
  const { mutate } = useSWRConfig();
  const pusher = usePusher();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [detailedFilters, setDetailedFilters] = useState<FilterState>({
    funnelStageId: null,
    tagId: null,
    agentId: null,
    instanceId: null,
    bookmarkGroupId: null,
    customerType: null,
  });

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<Set<number>>(new Set());
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedSound, setSelectedSound] = useState('sound1');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [mutedChats, setMutedChats] = useState<Set<string>>(new Set());
  const [displayLimit, setDisplayLimit] = useState(INITIAL_CHAT_DISPLAY_LIMIT);
  const [mobileDashboardOpen, setMobileDashboardOpen] = useState(() => {
    const view = searchParams.get('view');
    return view === 'kanban' || view === 'bookmarks' || view === 'tasks' || view === 'desktop';
  });
  const [isChatListCollapsed, setIsChatListCollapsed] = useState(false);
  const [chatListWidth, setChatListWidth] = useState<number | null>(null);
  const [isResizingChatList, setIsResizingChatList] = useState(false);

  const { data: teamData } = useSWR<TeamData>('/api/team', fetcher);
  const teamId = teamData?.id;

  const { data: chats, error, isLoading, mutate: mutateChats } = useSWR<Chat[]>('/api/chats', fetcher, {
    refreshInterval: pusher ? 0 : 10000,
  });

  useEffect(() => {
    const firstChat = chats?.[0];
    if (!firstChat) return;

    const isGroupChat = firstChat.remoteJid.endsWith('@g.us');
    const routeParam = isGroupChat ? firstChat.remoteJid : firstChat.remoteJid.split('@')[0];
    const query = firstChat.instanceId ? `?instanceId=${firstChat.instanceId}` : '';
    const route = `/dashboard/chat/${routeParam}${query}`;

    if (prefetchedChatRouteRef.current === route) return;
    prefetchedChatRouteRef.current = route;

    const timeoutId = window.setTimeout(() => router.prefetch(route), 200);
    return () => window.clearTimeout(timeoutId);
  }, [chats, router]);

  const { data: instances } = useSWR<InstanceData[]>('/api/instance/details', fetcher);

  const { data: teamMembers } = useSWR<TeamDataWithMembers>('/api/team', fetcher);
  const instancesList = Array.isArray(instances) ? instances : [];
  const contextAgents: Agent[] = Array.isArray(teamMembers?.teamMembers) ? teamMembers.teamMembers.map(tm => tm.user) : [];
  const { data: contextFunnelStages } = useSWR<FunnelStage[]>('/api/funnel-stages', fetcher);
  const { data: contextTags } = useSWR<TagData[]>('/api/tags', fetcher);
  const { data: agendasData } = useSWR<{ groups: Array<{ id: number; items: Array<{ chat?: { id: number } }> }> }>('/api/dashboard/bookmarks', fetcher);
  const { data: chatMetadata } = useSWR<ChatMetadata>('/api/chats/kanban-metadata', fetcher);
  const contextFunnelStagesList = Array.isArray(contextFunnelStages) ? contextFunnelStages : [];
  const contextTagsList = Array.isArray(contextTags) ? contextTags : [];

  useEffect(() => {
    if (error instanceof Error && error.message.includes('401')) {
      router.push('/sign-in');
    }
  }, [error, router]);

  useEffect(() => {
    const storedSoundEnabled = localStorage.getItem('soundEnabled');
    const storedSelectedSound = localStorage.getItem('selectedSound');
    
    if (storedSoundEnabled !== null) setSoundEnabled(storedSoundEnabled === 'true');
    if (storedSelectedSound) setSelectedSound(storedSelectedSound);

    const storedMutedChats = localStorage.getItem('mutedChats');
    if (storedMutedChats) {
      try { setMutedChats(new Set(JSON.parse(storedMutedChats))); } catch {}
    }
    setIsChatListCollapsed(localStorage.getItem('dashboardChatListCollapsed') === 'true');
    const storedChatListWidth = Number(localStorage.getItem(CHAT_LIST_WIDTH_STORAGE_KEY));
    if (Number.isFinite(storedChatListWidth) && storedChatListWidth > 0) {
      setChatListWidth(clampChatListWidth(storedChatListWidth));
    }

    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    const handleNotificationPermissionChange = () => {
      if ('Notification' in window) setNotificationPermission(Notification.permission);
    };

    const handleOpenNewChat = () => setIsNewChatOpen(true);
    const handleShowChatList = () => setMobileDashboardOpen(false);
    const handleShowBoard = () => setMobileDashboardOpen(true);
    window.addEventListener('dashboard:open-new-chat', handleOpenNewChat);
    window.addEventListener('dashboard:show-chat-list', handleShowChatList);
    window.addEventListener('dashboard:show-board', handleShowBoard);
    window.addEventListener('chat-notification-permission-change', handleNotificationPermissionChange);

    return () => {
      const audio = notificationAudioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        notificationAudioRef.current = null;
      }

      window.removeEventListener('dashboard:open-new-chat', handleOpenNewChat);
      window.removeEventListener('dashboard:show-chat-list', handleShowChatList);
      window.removeEventListener('dashboard:show-board', handleShowBoard);
      window.removeEventListener('chat-notification-permission-change', handleNotificationPermissionChange);
    };
  }, []);

  useEffect(() => {
    const view = searchParams.get('view');
    setMobileDashboardOpen(view === 'kanban' || view === 'bookmarks' || view === 'tasks' || view === 'desktop');
  }, [searchParams]);

  useEffect(() => {
    const handleViewportResize = () => {
      setChatListWidth((currentWidth) => (
        currentWidth === null ? null : clampChatListWidth(currentWidth)
      ));
    };

    window.addEventListener('resize', handleViewportResize);
    return () => {
      window.removeEventListener('resize', handleViewportResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const handleMobileChatListTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    mobileSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleMobileChatListTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const start = mobileSwipeStartRef.current;
    mobileSwipeStartRef.current = null;
    if (!start || window.matchMedia('(min-width: 768px)').matches) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (deltaX > -72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('view', 'kanban');
    nextParams.delete('contactId');
    localStorage.setItem('dashboardActiveView', 'kanban');
    setMobileDashboardOpen(true);
    window.dispatchEvent(new CustomEvent('dashboard:show-board', { detail: { view: 'kanban' } }));
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  const toggleChatList = () => {
    setIsChatListCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem('dashboardChatListCollapsed', String(next));
      return next;
    });
  };

  const handleChatListResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isChatListCollapsed) return;
    const sidebar = event.currentTarget.parentElement;
    if (!sidebar) return;

    const startWidth = sidebar.getBoundingClientRect().width;
    chatListResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      currentWidth: startWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setIsResizingChatList(true);
  };

  const handleChatListResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = chatListResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    const nextWidth = clampChatListWidth(resize.startWidth + event.clientX - resize.startX);
    resize.currentWidth = nextWidth;
    setChatListWidth(nextWidth);
  };

  const handleChatListResizeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = chatListResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    localStorage.setItem(CHAT_LIST_WIDTH_STORAGE_KEY, String(Math.round(resize.currentWidth)));
    chatListResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setIsResizingChatList(false);
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        toast.error("El navegador no soporta notificaciones");
        return;
    }
    
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    window.dispatchEvent(new Event('chat-notification-permission-change'));
    
    if (permission === 'granted') {
      new Notification("Notificaciones habilitadas", { body: "Ahora recibirás alertas de mensajes nuevos." });
    } else if (permission === 'denied') {
      toast.error("Permiso denegado. Habilita las notificaciones en la configuración del navegador.");
    }
  };

  const playNotificationSound = (soundId?: string) => {
    if (!soundEnabled && !soundId) return;
    
    const idToPlay = soundId || selectedSound;
    const soundData = SOUNDS.find(s => s.id === idToPlay);
    
    if (soundData) {
      try {
        const audio = notificationAudioRef.current ?? new Audio();
        notificationAudioRef.current = audio;

        if (!audio.src.endsWith(soundData.src)) {
          audio.src = soundData.src;
        }

        audio.pause();
        audio.volume = 0.5;
        audio.currentTime = 0;
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error("Audio playback error:", error);
                if (error.name === 'NotSupportedError') {
                    toast.error("Formato de audio no soportado o archivo no encontrado.");
                }
            });
        }
      } catch (e) {
        console.error("Failed to initialize audio:", e);
      }
    }
  };

  useEffect(() => {
    if (!pusher || !teamId) return;

    const channelName = `team-${teamId}`;
    const channel = pusher.subscribe(channelName);

    const sortChats = (chatList: Chat[]) => {
      return [...chatList].sort((a, b) => {
        const timeA = a.lastMessageTimestamp ? new Date(a.lastMessageTimestamp).getTime() : 0;
        const timeB = b.lastMessageTimestamp ? new Date(b.lastMessageTimestamp).getTime() : 0;
        return timeB - timeA;
      });
    };

    const handleChatListUpdate = (updateData: ChatListUpdatePayload) => {
      mutate('/api/chats', async (currentChats: Chat[] | undefined = []) => {
        const chatsList = Array.isArray(currentChats) ? currentChats : [];

        const existingIndex = chatsList.findIndex(c => {
            if (updateData.id && c.id === updateData.id) return true;
            return c.remoteJid === updateData.remoteJid && (!updateData.instanceId || c.instanceId === updateData.instanceId);
        });

        let updatedList;

        if (existingIndex > -1) {
            const updatedChat = { ...chatsList[existingIndex], ...updateData };
            updatedList = [...chatsList];
            updatedList[existingIndex] = updatedChat as Chat;
        } else {
            const newChat = {
                id: updateData.id || Date.now(),
                teamId: teamId,
                name: updateData.remoteJid.split('@')[0],
                unreadCount: 1,
                ...updateData
            } as Chat;
            updatedList = [newChat, ...chatsList];
        }

        return sortChats(updatedList);
      }, { revalidate: false });
    };

    channel.bind('chat-list-update', handleChatListUpdate);

    return () => {
      channel.unbind('chat-list-update', handleChatListUpdate);
    };
  }, [teamId, pusher, mutate]);

  const validChats = useMemo(() => {
    if (!Array.isArray(chats)) return [];

    return chats.filter((chat) => {
      if (!chat.remoteJid) return false;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = chat.name?.toLowerCase().includes(query);
        const matchPushName = chat.pushName?.toLowerCase().includes(query);
        const matchPhone = chat.remoteJid.includes(query);
        const matchContactName = chat.contact?.name?.toLowerCase().includes(query);

        if (!matchName && !matchPushName && !matchPhone && !matchContactName) return false;
      }

      if (activeTab === 'unread') {
        if (!chat.unreadCount || chat.unreadCount === 0) return false;
      }

      if (detailedFilters.funnelStageId) {
        if (chat.contact?.funnelStage?.id !== detailedFilters.funnelStageId) return false;
      }

      if (detailedFilters.agentId) {
        if (chat.contact?.assignedUser?.id !== detailedFilters.agentId) return false;
      }

      if (detailedFilters.tagId) {
        const hasTag = chat.contact?.tags?.some(t => t.id === detailedFilters.tagId);
        if (!hasTag) return false;
      }

      if (detailedFilters.instanceId) {
        if (chat.instanceId !== detailedFilters.instanceId) return false;
      }

      if (detailedFilters.bookmarkGroupId) {
        const agenda = agendasData?.groups.find((group) => group.id === detailedFilters.bookmarkGroupId);
        if (!agenda?.items.some((item) => item.chat?.id === chat.id)) return false;
      }

      if (detailedFilters.customerType) {
        const contactId = chat.contact?.id;
        const isCustomer = Boolean(contactId && chatMetadata?.metadata[String(contactId)]?.customerIds?.length);
        if (detailedFilters.customerType === 'customer' && !isCustomer) return false;
        if (detailedFilters.customerType === 'lead' && isCustomer) return false;
      }

      return true;
    });
  }, [agendasData?.groups, chats, searchQuery, activeTab, detailedFilters, chatMetadata?.metadata]);

  const displayedChatsForVirtualizer = validChats.slice(0, displayLimit);
  const hasMore = validChats.length > displayLimit;

  const rowVirtualizer = useVirtualizer({
    count: displayedChatsForVirtualizer.length + (hasMore ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (index === displayedChatsForVirtualizer.length) return 45;
      const chat = displayedChatsForVirtualizer[index];
      return chat?.contact?.funnelStage ? 105 : 82;
    },
    measureElement: (element) => (element as HTMLElement).offsetHeight,
    overscan: 5,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [validChats, displayLimit]);

  const handleSelectChat = (chatId: number) => {
    const newSelected = new Set(selectedChats);
    if (newSelected.has(chatId)) {
      newSelected.delete(chatId);
    } else {
      newSelected.add(chatId);
    }
    setSelectedChats(newSelected);
    
    if (!isSelectionMode && newSelected.size > 0) {
        setIsSelectionMode(true);
    }
  };

  const handleOpenChat = (chat: Chat) => {
    const view = searchParams.get('view');
    if ((view !== 'tasks' && view !== 'desktop') || !chat.contact?.id) return false;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('view', 'tasks');
    nextParams.set('contactId', String(chat.contact.id));
    setMobileDashboardOpen(true);
    window.dispatchEvent(new CustomEvent('dashboard:show-board', { detail: { view: 'tasks' } }));
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    return true;
  };

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setSelectedChats(new Set());
      setIsSelectionMode(false);
    } else {
      setIsSelectionMode(true);
    }
  };

  const handleDeleteChats = async () => {
    setIsDeleting(true);
    const previousChats = chats;

    mutate(
        '/api/chats',
        (currentChats: Chat[] | undefined = []) => {
            return Array.isArray(currentChats) ? currentChats.filter(chat => !selectedChats.has(chat.id)) : [];
        },
        { revalidate: false }
    );

    try {
      const response = await fetch('/api/chats/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatIds: Array.from(selectedChats) }),
      });

      if (!response.ok) throw new Error('No se pudieron eliminar los chats');

      toast.success('Chats eliminados correctamente');
      
      const currentChat = chats?.find(c => c.remoteJid.includes(activeChatNumber || ''));
      if (currentChat && selectedChats.has(currentChat.id)) {
        router.push('/dashboard');
      }

      setSelectedChats(new Set());
      setIsSelectionMode(false);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast.error('Error al eliminar chats');
      mutate('/api/chats', previousChats, { revalidate: true });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSoundToggle = (checked: boolean) => {
    setSoundEnabled(checked);
    localStorage.setItem('soundEnabled', String(checked));
  };

  const handleSoundChange = (value: string) => {
    setSelectedSound(value);
    localStorage.setItem('selectedSound', value);
    playNotificationSound(value);
  };

  const handleToggleMuteChat = (remoteJid: string) => {
    setMutedChats(prev => {
      const next = new Set(prev);
      if (next.has(remoteJid)) {
        next.delete(remoteJid);
      } else {
        next.add(remoteJid);
      }
      localStorage.setItem('mutedChats', JSON.stringify([...next]));
      return next;
    });
  };

  const renderChatList = () => {
    if (isLoading) return <ChatListSkeleton />;
    if (error) return <div className="p-4 text-center text-destructive text-sm">{t('chat_list_error')}</div>;
    if (!validChats || validChats.length === 0) {
      if (searchQuery || activeTab === 'unread' || Object.values(detailedFilters).some(Boolean)) {
        return <div className="p-8 text-center text-muted-foreground text-sm">{t('chat_list_empty_filtered')}</div>;
      }
      return <div className="p-8 text-center text-muted-foreground text-sm">{t('chat_list_empty')}</div>;
    }

    return (
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          if (virtualItem.index === displayedChatsForVirtualizer.length) {
            return (
              <div
                key="load-more"
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div style={{ padding: '12px 8px' }}>
                  <Button
                    variant="outline"
                    className="w-full h-9 text-sm"
                    onClick={() => setDisplayLimit((previousLimit) => (
                      Math.min(previousLimit + CHAT_LOAD_MORE_BATCH_SIZE, validChats.length)
                    ))}
                  >
                    {t('chat_list_load_more', { remaining: validChats.length - displayLimit })}
                  </Button>
                </div>
              </div>
            );
          }

          const chat = displayedChatsForVirtualizer[virtualItem.index];
          if (!chat) return null;
          const isGroupChat = chat.remoteJid.endsWith('@g.us');
          const chatIdentifier = isGroupChat ? chat.remoteJid : chat.remoteJid.split('@')[0];
          const decodedActiveChatNumber = activeChatNumber ? decodeURIComponent(activeChatNumber) : null;
          const dashboardView = searchParams.get('view');
          const selectedTaskContactId = Number(searchParams.get('contactId')) || null;
          const isTaskView = dashboardView === 'tasks' || dashboardView === 'desktop';
          const isActive = isTaskView
            ? chat.contact?.id === selectedTaskContactId
            : chatIdentifier === decodedActiveChatNumber
              && (!activeInstanceId || chat.instanceId === parseInt(activeInstanceId));

          return (
            <div
              key={chat.id}
              data-index={virtualItem.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ChatListItem
                chat={chat}
                isActive={isActive}
                instances={instancesList}
                isSelectionMode={isSelectionMode && !isTaskView}
                isSelected={!isTaskView && selectedChats.has(chat.id)}
                onSelect={handleSelectChat}
                onOpen={handleOpenChat}
                selectionEnabled={!isTaskView}
                agents={contextAgents}
                funnelStages={contextFunnelStagesList}
                tags={contextTagsList}
                onContactUpdate={(updater) => {
                  if (updater) {
                    mutateChats((current) => updater(Array.isArray(current) ? current : []), { revalidate: false });
                    setTimeout(() => rowVirtualizer.measure(), 50);
                  } else {
                    mutateChats();
                  }
                }}
                isMuted={mutedChats.has(chat.remoteJid)}
                onToggleMute={() => handleToggleMuteChat(chat.remoteJid)}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative flex h-screen w-full min-w-0 max-w-full overflow-hidden bg-muted/40 dark:bg-background">
      <aside
        onTouchStart={handleMobileChatListTouchStart}
        onTouchEnd={handleMobileChatListTouchEnd}
        style={chatListWidth === null ? undefined : ({
          '--dashboard-chat-list-width': `${chatListWidth}px`,
        } as React.CSSProperties)}
        className={cn(
        "flex h-screen flex-col overflow-hidden bg-card border-r",
        "transition-transform duration-150 ease-out motion-reduce:transition-none",
        isResizingChatList ? "md:transition-none" : "md:transition-[width,max-width] md:duration-200",
        "absolute inset-0 w-full z-10",
        "md:relative md:shrink-0 md:translate-x-0",
        isChatListCollapsed
          ? "md:w-12 md:max-w-12 lg:w-12"
          : chatListWidth === null
            ? "md:max-w-md md:w-[35%] lg:w-[28%]"
            : "md:w-[var(--dashboard-chat-list-width)] md:max-w-none lg:w-[var(--dashboard-chat-list-width)]",
        activeChatNumber || mobileDashboardOpen ? "-translate-x-full md:translate-x-0" : "translate-x-0"
      )}>
        {isChatListCollapsed && (
          <div className="hidden h-full w-full flex-col items-center bg-card md:flex">
            <Button
              variant="ghost"
              size="icon"
              className="mt-3 h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={toggleChatList}
              aria-label={t('expand_chat_list')}
              title={t('expand_chat_list')}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className={cn("flex h-full min-h-0 flex-col", isChatListCollapsed && "md:hidden")}>
          <header className="flex h-[60px] items-center justify-between border-b px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2">
            {!isSelectionMode && (
              <h1 className="text-xl font-bold tracking-tight text-foreground md:hidden">
                {dashboardT('chats_label')}
              </h1>
            )}
            {isSelectionMode ? (
                <div className="flex items-center gap-2 animate-in slide-in-from-left-2 fade-in duration-200">
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={toggleSelectionMode}>
                        <X className="h-5 w-5" />
                    </Button>
                    <span className="text-sm font-medium text-primary">{t('selected_chats', { count: selectedChats.size })}</span>
                </div>
            ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative hidden h-9 w-9 text-muted-foreground hover:bg-muted md:inline-flex">
                        {notificationPermission === 'granted' && soundEnabled ? (
                            <Bell className="h-5 w-5" />
                        ) : (
                            <BellOff className="h-5 w-5 text-muted-foreground/70" />
                        )}
                        {notificationPermission !== 'granted' && (
                            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive border border-card" />
                        )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64" align="start">
                    <DropdownMenuLabel>{t('notifications_label')}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    
                    {notificationPermission !== 'granted' && (
                        <>
                            <DropdownMenuItem onClick={requestNotificationPermission} className="text-destructive focus:text-destructive cursor-pointer">
                                <BellRing className="mr-2 h-4 w-4" />
                                {t('allow_notifications')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                        </>
                    )}

                    <DropdownMenuCheckboxItem 
                        checked={soundEnabled} 
                        onCheckedChange={handleSoundToggle}
                    >
                        {t('enable_sound')}
                    </DropdownMenuCheckboxItem>
                    
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">{t('alert_tone')}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={selectedSound} onValueChange={handleSoundChange}>
                        {SOUNDS.map(sound => (
                            <DropdownMenuRadioItem key={sound.id} value={sound.id} className="cursor-pointer">
                                {sound.name}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
            )}
          </div>
          
          <div className="flex items-center space-x-1">
            {isSelectionMode ? (
               <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 text-destructive hover:bg-destructive/10"
                  disabled={selectedChats.size === 0}
                  onClick={() => setIsDeleteDialogOpen(true)}
               >
                  <Trash2 className="h-5 w-5" />
               </Button>
            ) : (
               <>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => setIsNewChatOpen(true)}>
                  <PlusCircle className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden text-muted-foreground hover:text-foreground md:inline-flex"
                  onClick={toggleChatList}
                  aria-label={t('collapse_chat_list')}
                  title={t('collapse_chat_list')}
                >
                  <PanelLeftClose className="h-5 w-5" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1" align="end">
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start text-sm h-8 px-2"
                      onClick={toggleSelectionMode}
                    >
                      {t('select_chats')}
                    </Button>
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>
        </header>

        <div className="border-b border-border bg-background px-3 py-2 md:bg-muted/50 md:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('search_placeholder')}
              className="h-10 rounded-full border-transparent bg-muted pl-10 focus-visible:ring-ring md:h-11 md:rounded-lg md:border-border md:bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <ChatFilters
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          filters={detailedFilters}
          setFilters={setDetailedFilters}
          instances={instancesList}
          customerFilterAvailable={Boolean(chatMetadata?.capabilities.customers)}
        />

        <nav ref={parentRef} className="flex-1 overflow-y-auto relative bg-background pt-2 pb-24 md:pb-0">
          {renderChatList()}
        </nav>
        </div>

        {!isChatListCollapsed && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 z-30 hidden w-2 cursor-col-resize touch-none md:block"
            onPointerDown={handleChatListResizeStart}
            onPointerMove={handleChatListResize}
            onPointerUp={handleChatListResizeEnd}
            onPointerCancel={handleChatListResizeEnd}
          />
        )}
      </aside>

      <main className={cn(
        "flex h-screen flex-col overflow-hidden",
        "transition-transform duration-150 ease-out motion-reduce:transition-none md:transition-none",
        "absolute inset-0 w-full",
        "md:relative md:flex-1 md:min-w-0 md:basis-0 md:max-w-full md:translate-x-0",
        activeChatNumber || mobileDashboardOpen ? "translate-x-0" : "translate-x-full md:translate-x-0",
        !activeChatNumber && "pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0",
      )}>{children}</main>

      <NewChatDialog 
        isOpen={isNewChatOpen} 
        onClose={() => setIsNewChatOpen(false)} 
        instances={instancesList}
      />

      {/* Acá había un cajón lateral con la barra de escritorio metida adentro,
          abierto desde un hamburguesa en esta cabecera. Era un segundo punto de
          entrada al mismo sitio: el menú del móvil ahora es uno solo y se abre
          desde la barra inferior. */}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete_chats_title')}</DialogTitle>
            <DialogDescription>
              {t('delete_chats_description', { count: selectedChats.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>{t('cancel')}</Button>
            <Button variant="destructive" onClick={handleDeleteChats} disabled={isDeleting}>
              {isDeleting ? t('deleting') : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
