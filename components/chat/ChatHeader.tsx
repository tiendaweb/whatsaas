import React, { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Loader2, Zap, ZapOff, Bot, BotOff, ChevronLeft, ChevronRight, Workflow } from 'lucide-react';
import { ChatDetails } from './types';
import { ServiceWindowTimer } from './ServiceWindowTimer';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useSWR, { useSWRConfig } from 'swr';
import { useTranslations } from 'next-intl';

type FunnelStage = {
  id: number;
  name: string;
  emoji: string;
  order: number;
};

type ContactData = {
  id: number;
  funnelStage: FunnelStage | null;
};

type TriggerAutomationNode = {
  id: string;
  type: string;
  label: string;
};

type TriggerAutomationItem = {
  id: number;
  name: string;
  isActive: boolean;
  availableStartNodes: TriggerAutomationNode[];
};

interface ChatHeaderProps {
  chatDetails: ChatDetails;
  showSearch: boolean;
  setShowSearch: (show: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  isGroup?: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function ChatHeader({ chatDetails, showSearch, setShowSearch, searchQuery, setSearchQuery, isSidebarCollapsed, onToggleSidebar, isGroup }: ChatHeaderProps) {
  const t = useTranslations('Chat');
  const isWaba = chatDetails.integration === 'WHATSAPP-BUSINESS';
  const { mutate } = useSWRConfig();
  const [isClosing, setIsClosing] = useState(false);
  const [isTogglingAi, setIsTogglingAi] = useState(false);
  const [isSettingFunnel, setIsSettingFunnel] = useState(false);
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>('');
  const [selectedStartNodeId, setSelectedStartNodeId] = useState<string>('start');
  const [isTriggeringAutomation, setIsTriggeringAutomation] = useState(false);

  const remoteJid = chatDetails.remoteJid;
  const { data: contact, mutate: mutateContact } = useSWR<ContactData | null>(
    remoteJid ? `/api/contacts/by-chat?jid=${remoteJid}` : null,
    fetcher
  );
  const { data: funnelStages } = useSWR<FunnelStage[]>('/api/funnel-stages', fetcher);

  const { data: chats } = useSWR<any[]>('/api/chats', null);
  const activeChat = chats?.find(c => c.remoteJid === chatDetails.remoteJid);
  
  const { data: sessionData, mutate: mutateSession } = useSWR<{ hasActiveSession: boolean }>(
    activeChat?.id ? `/api/chats/${activeChat.id}/session` : null,
    fetcher
  );

  const { data: aiData, mutate: mutateAi } = useSWR<{ isActive: boolean }>(
    activeChat?.id ? `/api/chats/${activeChat.id}/ai-status` : null,
    fetcher
  );
  const { data: triggerData, mutate: mutateTriggerData } = useSWR<{ automations: TriggerAutomationItem[] }>(
    isTriggerModalOpen && activeChat?.id ? `/api/chats/${activeChat.id}/automation/trigger` : null,
    fetcher
  );

  const availableAutomations = triggerData?.automations || [];
  const selectedAutomation = availableAutomations.find((automation) => automation.id.toString() === selectedAutomationId);
  const selectedAutomationNodes = selectedAutomation?.availableStartNodes || [];

  const handleEndChat = async () => {
    if (!activeChat?.id) return;
    setIsClosing(true);
    try {
        const res = await fetch(`/api/chats/${activeChat.id}/close`, { method: 'POST' });
        if (!res.ok) throw new Error();
        toast.success(t('chat_ended_success_toast'));
        mutate('/api/chats'); 
        mutateSession(); 
    } catch (e) {
        toast.error(t('failed_to_end_chat_toast'));
    } finally {
        setIsClosing(false);
    }
  };

  const handleToggleAi = async () => {
      if (!activeChat?.id) return;
      setIsTogglingAi(true);
      const newStatus = aiData?.isActive ? 'paused' : 'active';
      try {
          const res = await fetch(`/api/chats/${activeChat.id}/ai-status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus })
          });
          if (!res.ok) throw new Error();
          mutateAi();
          toast.success(newStatus === 'active' ? t('ai_activated_toast') : t('ai_paused_toast'));
      } catch (e) {
          toast.error(t('failed_to_toggle_ai_toast'));
      } finally {
          setIsTogglingAi(false);
      }
  };

  const handleSetFunnelStage = async (stageId: string) => {
    if (!contact) return;
    const newStageId = stageId === 'null' ? null : parseInt(stageId, 10);
    const oldStage = contact.funnelStage;
    mutateContact((prev) => {
      if (!prev) return prev;
      const newStage = funnelStages?.find(s => s.id === newStageId) || null;
      return { ...prev, funnelStage: newStage };
    }, false);
    setIsSettingFunnel(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/funnel-stage`, {
        method: 'PUT',
        body: JSON.stringify({ stageId: newStageId }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('funnel_stage_updated'));
    } catch {
      toast.error(t('funnel_stage_error'));
      mutateContact((prev) => ({ ...prev!, funnelStage: oldStage }), false);
    } finally {
      setIsSettingFunnel(false);
      mutateContact();
      const newStage = funnelStages?.find(s => s.id === newStageId) || null;
      mutate('/api/chats', (currentChats: any[] | undefined) => {
        if (!currentChats) return currentChats;
        return currentChats.map((c: any) => {
          if (c.contact?.id === contact.id) {
            return { ...c, contact: { ...c.contact, funnelStage: newStage } };
          }
          return c;
        });
      }, { revalidate: true });
    }
  };

  const handleOpenTriggerModal = () => {
    if (!activeChat || isGroup) return;
    setIsTriggerModalOpen(true);
    setSelectedAutomationId('');
    setSelectedStartNodeId('start');
    mutateTriggerData();
  };

  const handleTriggerAutomation = async () => {
    if (!activeChat?.id || !selectedAutomationId) return;

    setIsTriggeringAutomation(true);
    try {
      const response = await fetch(`/api/chats/${activeChat.id}/automation/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationId: Number(selectedAutomationId),
          startNodeId: selectedStartNodeId,
        }),
      });

      if (!response.ok) throw new Error();

      toast.success(t('trigger_automation_success_toast'));
      mutateSession();
      setIsTriggerModalOpen(false);
    } catch (error) {
      toast.error(t('trigger_automation_error_toast'));
    } finally {
      setIsTriggeringAutomation(false);
    }
  };

  useEffect(() => {
    if (isGroup) return;

    const openModalShortcut = () => handleOpenTriggerModal();

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
        event.preventDefault();
        openModalShortcut();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('chat:open-trigger-automation', openModalShortcut);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('chat:open-trigger-automation', openModalShortcut);
    };
  }, [activeChat, isGroup]);

  return (
    <header className="flex items-center justify-between p-3 border-b bg-card shadow-sm z-10 shrink-0 h-[60px]">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={chatDetails?.profilePicUrl || undefined} alt={chatDetails?.name ?? undefined} />
          <AvatarFallback>{chatDetails?.name?.substring(0, 2).toUpperCase() || '?'}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-medium truncate text-sm">{chatDetails?.name || t('loading_chat_name')}</span>
          <span className="text-xs text-muted-foreground">{isGroup ? t('group_label') : (chatDetails.remoteJid ? `+${chatDetails.remoteJid.split('@')[0]}` : '')}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isGroup && isWaba && chatDetails.lastCustomerInteraction && (
            <ServiceWindowTimer lastInteraction={chatDetails.lastCustomerInteraction} />
        )}

        {!isGroup && contact && funnelStages && funnelStages.length > 0 && (
          <Select
            onValueChange={handleSetFunnelStage}
            value={contact.funnelStage?.id?.toString() || 'null'}
            disabled={isSettingFunnel}
          >
            <SelectTrigger size="sm" className="h-8 w-auto px-2 py-0 text-xs [&>span]:truncate">
              <SelectValue placeholder={t('funnel_stage_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">{t('funnel_no_stage')}</SelectItem>
              {funnelStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id.toString()}>
                  {stage.emoji} {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {!isGroup && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleOpenTriggerModal}
                  disabled={!activeChat}
                >
                  <Workflow className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('trigger_automation_tooltip')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {!isGroup && (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className={`h-8 w-8 transition-colors ${aiData?.isActive
                            ? 'text-purple-600 border-purple-200 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:border-purple-800'
                            : 'text-muted-foreground hover:text-purple-600'}`}
                        onClick={handleToggleAi}
                        disabled={isTogglingAi || !activeChat}
                    >
                        {isTogglingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                            aiData?.isActive ? <Bot className="h-4 w-4" /> : <BotOff className="h-4 w-4" />
                        )}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{aiData?.isActive ? t('disable_ai_agent_tooltip') : t('enable_ai_agent_tooltip')}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
        )}

        {!isGroup && sessionData?.hasActiveSession ? (
            <AlertDialog>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <AlertDialogTrigger asChild>
                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-8 w-8 text-green-600 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-900 dark:hover:bg-green-900/20" 
                                    disabled={isClosing || !activeChat}
                                >
                                    {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                                </Button>
                            </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t('end_automation_session_tooltip')}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('end_automation_dialog_title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('end_automation_dialog_desc')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel_btn')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleEndChat} className="bg-green-600 hover:bg-green-700">{t('confirm_btn')}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        ) : !isGroup ? (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground opacity-50 cursor-not-allowed"
                            disabled
                        >
                            <ZapOff className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{t('no_active_automation_tooltip')}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ) : null}

        {showSearch ? (
          <div className="flex items-center bg-muted rounded-md px-2 py-1 animate-in slide-in-from-right-5">
            <Search className="h-4 w-4 text-muted-foreground mr-2" />
            <input
              autoFocus
              type="text"
              placeholder={t('search_placeholder')}
              className="bg-transparent border-none focus:outline-none text-sm text-foreground w-32"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="ml-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setShowSearch(true)} className="text-muted-foreground hover:text-foreground">
            <Search className="h-5 w-5" />
          </Button>
        )}

        <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="text-muted-foreground hover:text-foreground">
          {isSidebarCollapsed ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </Button>
      </div>

      <Dialog open={isTriggerModalOpen} onOpenChange={setIsTriggerModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('trigger_automation_dialog_title')}</DialogTitle>
            <DialogDescription>{t('trigger_automation_dialog_desc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('trigger_automation_select_label')}</label>
              <Select value={selectedAutomationId} onValueChange={(value) => {
                setSelectedAutomationId(value);
                setSelectedStartNodeId('start');
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('trigger_automation_select_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {availableAutomations.map((automation) => (
                    <SelectItem key={automation.id} value={automation.id.toString()}>
                      {automation.name} · {automation.isActive ? t('active_status') : t('inactive_status')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('trigger_automation_start_from_label')}</label>
              <Select
                value={selectedStartNodeId}
                onValueChange={setSelectedStartNodeId}
                disabled={!selectedAutomationId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('trigger_automation_start_from_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">{t('trigger_automation_start_from_beginning')}</SelectItem>
                  {selectedAutomationNodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.label} ({node.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTriggerModalOpen(false)}>
              {t('cancel_btn')}
            </Button>
            <Button onClick={handleTriggerAutomation} disabled={!selectedAutomationId || isTriggeringAutomation}>
              {isTriggeringAutomation ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('trigger_automation_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
