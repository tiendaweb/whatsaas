'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuLabel,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, CheckCheck, Smartphone, BadgeCheck, Users, ChevronDown, Tag, UserPlus, Loader2, Save, BellOff, Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export type Chat = {
  id: number;
  teamId: number;
  remoteJid: string;
  instanceId?: number;
  name: string | null;
  pushName: string | null;
  profilePicUrl: string | null;
  lastMessageText: string | null;
  lastMessageTimestamp: string | null;
  unreadCount: number | null;
  lastMessageStatus?: string | null;
  lastMessageFromMe?: boolean | null;
  contact?: {
    id: number;
    name: string;
    funnelStage?: { id: number; name: string; order: number; emoji?: string } | null;
    assignedUser?: { id: number; name: string; email: string } | null;
    tags?: { id: number; name: string; color: string }[];
  } | null;
};

export type Agent = { id: number; name: string | null; email: string };
export type FunnelStage = { id: number; name: string; emoji: string; order: number };
export type TagData = { id: number; name: string; color: string };

type InstanceData = {
    dbId: number;
    instanceName: string;
    integration: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS';
};

function formatMessageTimestamp(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString('en-US', { month: 'numeric', day: '2-digit' });
}

function ReadReceipt({ status }: { status?: string | null }) {
  if (!status) return null;
  const s = status.toLowerCase();

  if (s === 'read' || s === 'played') {
    return <CheckCheck className="h-4 w-4 text-blue-500 shrink-0" />;
  }
  if (s === 'delivered' || s === 'delivery_ack') {
    return <CheckCheck className="h-4 w-4 text-gray-400 shrink-0" />;
  }
  if (s === 'sent') {
    return <Check className="h-4 w-4 text-gray-400 shrink-0" />;
  }
  
  return <Check className="h-4 w-4 text-gray-300 opacity-50 shrink-0" />;
}

interface ChatListItemProps {
  chat: Chat;
  isActive: boolean;
  instances: InstanceData[];
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (id: number) => void;
  agents?: Agent[];
  funnelStages?: FunnelStage[];
  tags?: TagData[];
  onContactUpdate?: (updater?: (chats: Chat[]) => Chat[]) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export function ChatListItem({
  chat,
  isActive,
  instances,
  isSelectionMode,
  isSelected,
  onSelect,
  agents = [],
  funnelStages = [],
  tags = [],
  onContactUpdate,
  isMuted = false,
  onToggleMute,
}: ChatListItemProps) {
  const t = useTranslations('Dashboard');
  const tChat = useTranslations('Chat');
  const router = useRouter();
  const displayName = chat.contact?.name || chat.name || chat.pushName || chat.remoteJid.split('@')[0];
  const time = formatMessageTimestamp(chat.lastMessageTimestamp);

  const hasContact = !!chat.contact;
  const contactId = chat.contact?.id;

  const updateChatContact = (updater: (contact: Chat['contact']) => Chat['contact']) => {
    onContactUpdate?.((currentChats: Chat[]) =>
      currentChats.map(c =>
        c.id === chat.id ? { ...c, contact: updater(c.contact) } : c
      )
    );
  };

  const handleAssignAgent = async (agentId: number | null) => {
    if (!contactId) return;
    const newAgent = agents.find(a => a.id === agentId) || null;
    updateChatContact(contact => contact ? { ...contact, assignedUser: newAgent ? { id: newAgent.id, name: newAgent.name || newAgent.email, email: newAgent.email } : null } : contact);
    try {
      const res = await fetch(`/api/contacts/${contactId}/assign-agent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      if (!res.ok) throw new Error();
      toast.success(agentId ? t('context_menu.agent_assigned') : t('context_menu.agent_removed'));
    } catch {
      toast.error(t('context_menu.error'));
      onContactUpdate?.();
    }
  };

  const handleSetFunnelStage = async (stageId: number | null) => {
    if (!contactId) return;
    const newStage = funnelStages.find(s => s.id === stageId) || null;
    updateChatContact(contact => contact ? { ...contact, funnelStage: newStage } : contact);
    try {
      const res = await fetch(`/api/contacts/${contactId}/funnel-stage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('context_menu.stage_updated'));
    } catch {
      toast.error(t('context_menu.error'));
      onContactUpdate?.();
    }
  };

  const handleToggleTag = async (tag: TagData) => {
    if (!contactId) return;
    const hadTag = chat.contact?.tags?.some(ct => ct.id === tag.id);
    updateChatContact(contact => {
      if (!contact) return contact;
      const newTags = hadTag
        ? (contact.tags || []).filter(ct => ct.id !== tag.id)
        : [...(contact.tags || []), tag];
      return { ...contact, tags: newTags };
    });
    try {
      if (hadTag) {
        const res = await fetch(`/api/contacts/${contactId}/tags/${tag.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        toast.success(t('context_menu.tag_removed', { name: tag.name }));
      } else {
        const res = await fetch(`/api/contacts/${contactId}/tags/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagId: tag.id }),
        });
        if (!res.ok) throw new Error();
        toast.success(t('context_menu.tag_added', { name: tag.name }));
      }
    } catch {
      toast.error(t('context_menu.error'));
      onContactUpdate?.();
    }
  };

  const [saveContactOpen, setSaveContactOpen] = useState(false);
  const [saveContactName, setSaveContactName] = useState('');
  const [isSavingContact, setIsSavingContact] = useState(false);

  const openSaveContactDialog = () => {
    setSaveContactName(chat.name || chat.pushName || chat.remoteJid.split('@')[0]);
    setSaveContactOpen(true);
  };

  const handleSaveContact = async () => {
    if (!saveContactName.trim()) return;
    setIsSavingContact(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: chat.remoteJid,
          name: saveContactName.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success(t('context_menu.contact_saved'));
      onContactUpdate?.();
      setSaveContactOpen(false);
    } catch (e: any) {
      toast.error(e.message || t('context_menu.error'));
    } finally {
      setIsSavingContact(false);
    }
  };
  let lastMessageText = chat.lastMessageText || t('last_message_fallback');
  if (lastMessageText.startsWith('@@')) {
      const parts = lastMessageText.slice(2).split('|');
      const key = parts[0];
      const params: Record<string, string> = {};
      for (let i = 1; i < parts.length; i++) {
          const eqIdx = parts[i].indexOf('=');
          if (eqIdx > 0) params[parts[i].slice(0, eqIdx)] = parts[i].slice(eqIdx + 1);
      }
      try { lastMessageText = tChat(key, params); } catch { /* keep raw */ }
  }
  const unread = chat.unreadCount || 0;
  const isGroupChat = chat.remoteJid.endsWith('@g.us');
  const chatNumber = chat.remoteJid.split('@')[0];
  const chatRouteParam = isGroupChat ? chat.remoteJid : chatNumber;

  const funnelName = chat.contact?.funnelStage?.name;
  const funnelEmoji = chat.contact?.funnelStage?.emoji;

  const chatInstance = instances?.find(i => i.dbId === chat.instanceId);
  const isWaba = chatInstance?.integration === 'WHATSAPP-BUSINESS';

  const formatPreviewText = (text: string) => {
    if (!text) return '';
    const singleLineText = text.replace(/\n/g, ' ');
    return <span className="text-muted-foreground">{singleLineText}</span>;
  };

  const handleClick = () => {
    if (isSelectionMode) {
      onSelect(chat.id);
    } else {
      const query = chat.instanceId ? `?instanceId=${chat.instanceId}` : '';
      router.push(`/dashboard/chat/${chatRouteParam}${query}`);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="w-full px-2 py-0.5">
          <div
            onClick={handleClick}
            className={`
              group relative flex items-start p-3 gap-3 cursor-pointer
              rounded-xl border border-transparent transition-all duration-200 ease-in-out
              hover:bg-accent/50
              ${isActive || isSelected ? 'bg-accent/50' : 'bg-transparent'}
            `}
          >
            <div className="relative shrink-0 mt-1">
              <Avatar className="size-12 shadow-sm">
                <AvatarImage src={chat.profilePicUrl || ''} alt={displayName ?? undefined} className="object-cover" />
                <AvatarFallback className="text-lg bg-primary/10 text-primary font-bold">
                  {displayName?.substring(0, 2).toUpperCase() || t('initials_fallback')}
                </AvatarFallback>
              </Avatar>

              <div
                className={`absolute inset-0 flex items-center justify-center rounded-full z-20 transition-all duration-300 cursor-pointer
                  ${isSelected ? 'bg-primary opacity-90' : 'bg-black/40 opacity-0 group-hover:opacity-100'}
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(chat.id);
                }}
              >
                 {isSelected ? (
                   <Check className="h-6 w-6 text-primary-foreground animate-in zoom-in-50 duration-200" />
                 ) : (
                   <div className="h-5 w-5 border-2 border-white rounded-md" />
                 )}
              </div>

              <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 shadow-sm z-10">
                  {isGroupChat ? (
                      <div className="bg-blue-500 rounded-full h-4 w-4 flex items-center justify-center">
                          <Users className="h-2.5 w-2.5 text-white" />
                      </div>
                  ) : isWaba ? (
                      <BadgeCheck className="h-4 w-4 text-blue-500 fill-white" />
                  ) : (
                      <div className="bg-green-500 rounded-full h-4 w-4 flex items-center justify-center">
                          <Smartphone className="h-2.5 w-2.5 text-white" />
                      </div>
                  )}
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex justify-between items-start">
                <span className="font-semibold truncate text-base text-foreground leading-tight" title={displayName}>
                  {displayName}
                </span>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  {isMuted && <BellOff className="h-3 w-3 text-muted-foreground" />}
                  <span className={`text-[11px] font-medium ${unread > 0 ? 'text-primary' : 'text-muted-foreground'} whitespace-nowrap`}>
                    {time}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center h-5">
                <div className="flex items-center gap-1.5 text-sm truncate flex-1">
                  {chat.lastMessageFromMe !== undefined && chat.lastMessageFromMe !== null && (
                    chat.lastMessageFromMe
                      ? <ReadReceipt status={chat.lastMessageStatus} />
                      : null
                  )}

                  <span className="truncate block text-muted-foreground/90 text-[13px]">
                    {formatPreviewText(lastMessageText)}
                  </span>
                </div>

                {unread > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5 ml-2 shadow-sm shrink-0">
                    {unread > 99 ? t('unread_count_max') : unread}
                  </span>
                )}
              </div>

              {funnelName && (
                <div className="flex items-center gap-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-300">
                  <Badge
                    variant="secondary"
                    className="text-[10px] h-5 px-2 font-semibold rounded-sm bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors border-0"
                  >
                    {funnelEmoji && <span className="mr-1.1 text-[11px]">{funnelEmoji}</span>}
                    {funnelName}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        {isGroupChat ? (
          <ContextMenuLabel className="text-muted-foreground text-xs">
            <Users className="h-4 w-4 mr-2 inline" />
            {t('context_menu.group_chat')}
          </ContextMenuLabel>
        ) : hasContact ? (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Users className="h-4 w-4 mr-2" />
                {t('context_menu.assign_agent')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <ContextMenuItem onClick={() => handleAssignAgent(null)}>
                  {t('context_menu.nobody')}
                  {!chat.contact?.assignedUser && <Check className="h-4 w-4 ml-auto text-primary" />}
                </ContextMenuItem>
                <ContextMenuSeparator />
                {agents.map((agent) => (
                  <ContextMenuItem key={agent.id} onClick={() => handleAssignAgent(agent.id)}>
                    {agent.name || agent.email}
                    {chat.contact?.assignedUser?.id === agent.id && <Check className="h-4 w-4 ml-auto text-primary" />}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <ChevronDown className="h-4 w-4 mr-2" />
                {t('context_menu.funnel_stage')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <ContextMenuItem onClick={() => handleSetFunnelStage(null)}>
                  {t('context_menu.no_stage')}
                  {!chat.contact?.funnelStage && <Check className="h-4 w-4 ml-auto text-primary" />}
                </ContextMenuItem>
                <ContextMenuSeparator />
                {funnelStages.map((stage) => (
                  <ContextMenuItem key={stage.id} onClick={() => handleSetFunnelStage(stage.id)}>
                    {stage.emoji} {stage.name}
                    {chat.contact?.funnelStage?.id === stage.id && <Check className="h-4 w-4 ml-auto text-primary" />}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Tag className="h-4 w-4 mr-2" />
                {t('context_menu.tags')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <ContextMenuItem key={tag.id} onClick={() => handleToggleTag(tag)}>
                      {tag.name}
                      {chat.contact?.tags?.some(ct => ct.id === tag.id) && <Check className="h-4 w-4 ml-auto text-primary" />}
                    </ContextMenuItem>
                  ))
                ) : (
                  <ContextMenuLabel className="text-muted-foreground text-xs">
                    {t('context_menu.no_tags')}
                  </ContextMenuLabel>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        ) : (
          <ContextMenuItem onClick={openSaveContactDialog}>
            <UserPlus className="h-4 w-4 mr-2" />
            {t('context_menu.save_contact')}
          </ContextMenuItem>
        )}
        {onToggleMute && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onToggleMute}>
              {isMuted ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
              {isMuted ? t('context_menu.unmute') : t('context_menu.mute')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>

      <Dialog open={saveContactOpen} onOpenChange={setSaveContactOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('context_menu.save_contact')}</DialogTitle>
            <DialogDescription>
              +{chat.remoteJid.split('@')[0]}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-3">
            <div className="grid gap-2">
              <Label htmlFor="contact-name">{t('context_menu.contact_name')}</Label>
              <Input
                id="contact-name"
                value={saveContactName}
                onChange={(e) => setSaveContactName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveContact(); } }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveContactOpen(false)}>{t('context_menu.cancel')}</Button>
            <Button onClick={handleSaveContact} disabled={isSavingContact || !saveContactName.trim()}>
              {isSavingContact ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {t('context_menu.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContextMenu>
  );
}

export function ChatListSkeleton() {
  return (
    <div className="w-full px-2 py-0.5 space-y-2">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center p-3 gap-3 rounded-xl border border-transparent bg-transparent">
          <div className="rounded-full bg-muted h-12 w-12 shrink-0 animate-pulse"></div>
          <div className="flex-1 space-y-2.5 py-1">
            <div className="h-4 bg-muted rounded w-2/3 animate-pulse"></div>
            <div className="h-3 bg-muted rounded w-1/2 animate-pulse"></div>
          </div>
        </div>
      ))}
    </div>
  );
}