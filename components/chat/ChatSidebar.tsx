'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from '@/components/ui/switch';
import {
  User,
  Phone,
  Tag,
  Users,
  Image as ImageIcon,
  Video as VideoIcon,
  Mic,
  FileText,
  MapPin,
  Contact,
  HardDrive,
  Loader2,
  Check,
  ChevronDown,
  Save,
  Download,
  Play,
  ExternalLink,
  Settings2,
  MoreVertical,
  Building2,
  Sparkles,
  Link2,
  Mail,
  Globe2,
  CalendarClock
} from 'lucide-react';
import useSWR, { mutate as globalMutate } from 'swr';
import { toast } from 'sonner';
import { TeamDataWithMembers, Message } from '@/lib/db/schema';
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Video from "yet-another-react-lightbox/plugins/video";
import "yet-another-react-lightbox/styles.css";
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import { daysUntil, serviceUrgency, type ServiceUrgency } from '@/lib/aapp/subscription';
import { ChatAgendaPicker } from '@/components/dashboard/ChatAgendaPicker';
import { ContactTaskPanel } from '@/components/chat/ContactTaskPanel';
import { ContactTagsEditor } from '@/components/chat/ContactTagsEditor';
import { CustomerProfileDialog } from '@/components/chat/CustomerProfileDialog';
import { RadarPanel } from '@/lib/plugins/radar/ui/RadarPanel';
import { isRadarUserEmail } from '@/lib/plugins/radar/shared/constants';
import { Radar as RadarIcon } from 'lucide-react';

type Agent = Pick<import('@/lib/db/schema').User, 'id' | 'name' | 'email'>;

type ChatDetails = {
    remoteJid: string | null;
    name?: string | null;
    profilePicUrl?: string | null;
};

interface ChatSidebarProps {
    chatDetails: ChatDetails;
    chatId?: number | null;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    isGroup?: boolean;
    onSyncMessages?: () => void;
    isSyncingMessages?: boolean;
    /** Inserta texto en el composer del chat — usado por los mensajes sugeridos de Radar. */
    onInsertComposerText?: (text: string) => void;
    /** Levanta las sugerencias de Radar al padre para mostrar un chip sobre el composer. */
    onRadarSuggestionsLoaded?: (suggestions: string[]) => void;
}

type Tag = {
  id: number;
  name: string;
  color: string;
};

type FunnelStage = {
  id: number;
  name: string;
  emoji: string;
  order: number;
};

type CustomField = {
    id: number;
    name: string;
    key: string;
    type: 'text' | 'boolean';
};

type DepartmentRef = {
  id: number;
  name: string;
};

type ContactData = {
  id: number;
  name: string;
  assignedUser: Agent | null;
  assignedDepartment: DepartmentRef | null;
  funnelStage: FunnelStage | null;
  tags: Tag[];
  notes: string | null;
  customData?: Record<string, any>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AappSpaceContactSummary = {
  customer: { id: number; name: string; email: string | null; phone: string | null };
  subscription: {
    id: number;
    status: string;
    paymentStatus: string;
    startDate: string;
    endDate: string | null;
    planName: string | null;
    billingType: string;
  } | null;
  websites: Array<{ id: number; title: string; url: string | null; status: string | null }>;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());
const BUSINESS_WOMAN_SLUG = 'business-woman-planner';

const AAPP_SERVICE_BADGE: Record<ServiceUrgency, string> = {
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  critical: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300',
  warning: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-300',
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const AAPP_SERVICE_BORDER: Record<ServiceUrgency, string> = {
  expired: 'border-red-500',
  critical: 'border-amber-500',
  warning: 'border-yellow-500',
  ok: 'border-primary',
};

type InstalledMiniApp = {
  slug: string;
  installedAt: string;
};

type BusinessWomanClient = {
  _recordId: string;
  name: string;
  status: string;
  notes: string;
  contacted: boolean;
  phone?: string;
};

type MiniAppDataResponse = Record<string, Array<{ recordId: string; data: unknown; createdAt?: string }>>;

function normalizeBusinessWomanPhone(value?: string | null) {
  return (value ?? '').replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^\d]/g, '');
}

function createBusinessWomanRecordId(phone: string) {
  return phone ? `chat-${phone}` : `chat-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeBusinessWomanClient(record: { recordId: string; data: unknown }): BusinessWomanClient | null {
  if (!record.data || typeof record.data !== 'object') return null;
  const data = record.data as Partial<BusinessWomanClient>;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) return null;
  return {
    _recordId: typeof data._recordId === 'string' && data._recordId ? data._recordId : record.recordId,
    name,
    status: typeof data.status === 'string' && data.status ? data.status : 'potencial',
    notes: typeof data.notes === 'string' ? data.notes : '',
    contacted: Boolean(data.contacted),
    phone: typeof data.phone === 'string' ? data.phone : undefined,
  };
}

function MediaGrid({ type, remoteJid, instanceId }: { type: string, remoteJid: string, instanceId: string | null }) {
    const t = useTranslations('chat_Sidebar');
    const [lightboxIndex, setLightboxIndex] = useState(-1);
    
    const url = instanceId 
      ? `/api/chats/media?jid=${remoteJid}&type=${type}&instanceId=${instanceId}`
      : `/api/chats/media?jid=${remoteJid}&type=${type}`;

    const { data: mediaItems, isLoading } = useSWR<Message[]>(url, fetcher);

    if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;
    if (!mediaItems || mediaItems.length === 0) return <p className="text-sm text-center text-muted-foreground p-4">{t('media.no_items')}</p>;

    const slides = mediaItems.map((item) => {
        if (type === 'videos') {
            return {
                type: "video" as const,
                width: 1280,
                height: 720,
                sources: [
                    {
                        src: item.mediaUrl || "",
                        type: item.mediaMimetype || "video/mp4"
                    }
                ]
            };
        }
        return { src: item.mediaUrl || "" };
    });

    return (
        <>
            <div className="grid grid-cols-3 gap-2 p-1">
                {mediaItems.map((item, index) => (
                    <div 
                        key={item.id} 
                        className="relative aspect-square bg-muted rounded overflow-hidden border cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setLightboxIndex(index)}
                    >
                        {type === 'videos' ? (
                           <>
                                <div className="h-full w-full bg-black/10" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Play className="h-6 w-6 text-white fill-white opacity-80" />
                                </div>
                            </>
                        ) : (
                            <img src={item.mediaUrl || undefined} alt={t('media.file')} className="w-full h-full object-cover" />
                        )}
                    </div>
                ))}
            </div>

            <Lightbox
                open={lightboxIndex >= 0}
                index={lightboxIndex}
                close={() => setLightboxIndex(-1)}
                slides={slides}
                plugins={[Zoom, Video]}
            />
        </>
    );
}

function MediaList({ type, remoteJid, instanceId }: { type: string, remoteJid: string, instanceId: string | null }) {
    const t = useTranslations('chat_Sidebar');
    
    const url = instanceId 
      ? `/api/chats/media?jid=${remoteJid}&type=${type}&instanceId=${instanceId}`
      : `/api/chats/media?jid=${remoteJid}&type=${type}`;

    const { data: mediaItems, isLoading } = useSWR<Message[]>(url, fetcher);

    if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;
    if (!mediaItems || mediaItems.length === 0) return <p className="text-sm text-center text-muted-foreground p-4">{t('media.no_items')}</p>;

    return (
        <div className="space-y-2 p-1">
            {mediaItems.map((item) => (
                <div key={item.id} className="flex items-center p-2 bg-card border rounded-md hover:bg-muted transition-colors">
                    <div className="h-10 w-10 flex items-center justify-center bg-muted rounded-full shrink-0 mr-3 text-muted-foreground">
                        {type === 'audio' && <Mic className="h-5 w-5" />}
                        {type === 'docs' && <FileText className="h-5 w-5" />}
                        {type === 'location' && <MapPin className="h-5 w-5" />}
                        {type === 'contacts' && <Contact className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="text-sm font-medium truncate">
                             {item.text || item.mediaCaption || item.contactName || item.locationName || (type === 'audio' ? t('media.audio') : t('media.file'))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {new Date(item.timestamp).toLocaleDateString()}
                        </p>
                    </div>
                    {(item.mediaUrl || item.locationLatitude) && (
                         <a 
                            href={item.mediaUrl || `http://googleusercontent.com/maps.google.com/?q=${item.locationLatitude},${item.locationLongitude}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="p-2 text-muted-foreground hover:text-primary"
                         >
                             {type === 'location' ? <ExternalLink className="h-4 w-4"/> : <Download className="h-4 w-4"/>}
                         </a>
                    )}
                </div>
            ))}
        </div>
    );
}

type LinkItem = {
    id: string;
    kind: 'url' | 'email';
    value: string;
    timestamp: string;
    fromMe: boolean;
    messageText: string | null;
};

function LinksList({ remoteJid, instanceId }: { remoteJid: string, instanceId: string | null }) {
    const t = useTranslations('chat_Sidebar');

    const url = instanceId
      ? `/api/chats/media?jid=${remoteJid}&type=links&instanceId=${instanceId}`
      : `/api/chats/media?jid=${remoteJid}&type=links`;

    const { data: items, isLoading } = useSWR<LinkItem[]>(url, fetcher);

    if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;
    if (!items || items.length === 0) return <p className="text-sm text-center text-muted-foreground p-4">{t('media.no_items')}</p>;

    return (
        <div className="space-y-2 p-1">
            {items.map((item) => (
                <div key={item.id} className="flex items-center p-2 bg-card border rounded-md hover:bg-muted transition-colors">
                    <div className="h-10 w-10 flex items-center justify-center bg-muted rounded-full shrink-0 mr-3 text-muted-foreground">
                        {item.kind === 'email' ? <Mail className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="text-sm font-medium truncate" title={item.value}>{item.value}</p>
                        <p className="text-xs text-muted-foreground">
                            {new Date(item.timestamp).toLocaleDateString()} · {item.fromMe ? t('media.sent') : t('media.received')}
                        </p>
                    </div>
                    <a
                        href={item.kind === 'email' ? `mailto:${item.value}` : item.value}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-muted-foreground hover:text-primary"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </div>
            ))}
        </div>
    );
}

interface SaveContactDialogProps {
  chatDetails: ChatDetails;
  onContactSaved: () => void;
  agents: Agent[];
}

function SaveContactDialog({ chatDetails, onContactSaved, agents }: SaveContactDialogProps) {
  const t = useTranslations('chat_Sidebar');
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [name, setName] = useState(chatDetails.name || chatDetails.remoteJid?.split('@')[0] || '');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState('');
  const [customData, setCustomData] = useState<Record<string, any>>({});

  const { data: allTags } = useSWR<Tag[]>('/api/tags', fetcher);
  const { data: funnelStages } = useSWR<FunnelStage[]>('/api/funnel-stages', fetcher);
  const { data: customFields } = useSWR<CustomField[]>('/api/custom-fields', fetcher);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDetails.remoteJid || !name.trim()) {
      toast.error(t('contact_dialog.error_name_required'));
      return;
    }
    setIsSaving(true);

    try {
      const body = {
        jid: chatDetails.remoteJid,
        name: name.trim(),
        assignedUserId: agentId ? parseInt(agentId) : null,
        funnelStageId: stageId ? parseInt(stageId) : null,
        notes: notes.trim(),
        tagIds: Array.from(selectedTags),
        customData: customData
      };

      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t('contact_dialog.error_save_failed'));
      }

      toast.success(t('contact_dialog.success_saved'));
      onContactSaved();
      setIsOpen(false);
    
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          <Save className="h-4 w-4 mr-2" />
          {t('contact_dialog.trigger_btn')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('contact_dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('contact_dialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            
            <div className="grid gap-2">
              <Label htmlFor="name">{t('contact_dialog.name_label')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="agent">{t('contact_dialog.agent_label')}</Label>
                    <Select onValueChange={setAgentId} value={agentId || 'null'}>
                        <SelectTrigger><SelectValue placeholder={t('contact_dialog.nobody_option')} /></SelectTrigger>
                        <SelectContent>
                        <SelectItem value="null">{t('contact_dialog.nobody_option')}</SelectItem>
                        {agents?.map((agent) => (<SelectItem key={agent.id} value={agent.id.toString()}>{agent.name || agent.email}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="funnel">{t('contact_dialog.funnel_label')}</Label>
                    <Select onValueChange={setStageId} value={stageId || 'null'}>
                        <SelectTrigger><SelectValue placeholder={t('contact_dialog.no_stage_option')} /></SelectTrigger>
                        <SelectContent>
                        <SelectItem value="null">{t('contact_dialog.no_stage_option')}</SelectItem>
                        {funnelStages?.map((stage) => (<SelectItem key={stage.id} value={stage.id.toString()}>{stage.name}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tags">{t('contact_dialog.tags_label')}</Label>
              <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <Tag className="h-4 w-4 mr-2" />
                      {selectedTags.size > 0 ? t('contact_dialog.tags_selected', {count: selectedTags.size}) : t('contact_dialog.select_tags')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t('contact_dialog.search_tags')} />
                      <CommandList>
                        <CommandEmpty>{t('contact_dialog.no_tags_found')}</CommandEmpty>
                        <CommandGroup>
                          {allTags?.map((tag) => (
                            <CommandItem key={tag.id} onSelect={() => {
                                setSelectedTags(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(tag.id)) newSet.delete(tag.id); else newSet.add(tag.id);
                                  return newSet;
                                });
                              }}>
                              <Check className={`mr-2 h-4 w-4 ${selectedTags.has(tag.id) ? "opacity-100" : "opacity-0"}`} />
                              {tag.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">{t('contact_dialog.notes_label')}</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('contact_dialog.notes_placeholder')} />
            </div>

             {customFields && customFields.length > 0 && (
                <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px bg-border flex-1"></div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase">{t('main.custom_fields_title')}</span>
                        <div className="h-px bg-border flex-1"></div>
                    </div>
                    {customFields.map((cf) => (
                        <div key={cf.id} className="grid gap-2">
                            <Label htmlFor={`cf-${cf.key}`}>{cf.name}</Label>
                            <div>
                                {cf.type === 'boolean' ? (
                                    <div className="flex items-center space-x-2 border p-2 rounded-md">
                                        <Switch 
                                            id={`cf-${cf.key}`}
                                            checked={!!customData[cf.key]} 
                                            onCheckedChange={(checked) => setCustomData(prev => ({ ...prev, [cf.key]: checked }))} 
                                        />
                                        <span className="text-sm text-muted-foreground">
                                            {customData[cf.key] ? 'Sim' : 'Não'}
                                        </span>
                                    </div>
                                ) : (
                                    <Input 
                                        id={`cf-${cf.key}`}
                                        value={customData[cf.key] || ''} 
                                        onChange={e => setCustomData(prev => ({ ...prev, [cf.key]: e.target.value }))}
                                        placeholder={cf.name}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>{t('contact_dialog.cancel_btn')}</Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {t('contact_dialog.save_btn')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChatSidebar({ chatDetails, chatId, isCollapsed = false, onToggleCollapse, isGroup = false, onSyncMessages, isSyncingMessages, onInsertComposerText, onRadarSuggestionsLoaded }: ChatSidebarProps) {
  const t = useTranslations('chat_Sidebar');
  const router = useRouter();
  const searchParams = useSearchParams();
  const instanceId = searchParams.get('instanceId');

  const [sidebarView, setSidebarView] = useState<'contact' | 'radar'>('contact');
  const { data: currentUser } = useSWR<{ email?: string }>('/api/user', fetcher);
  const isRadarUser = isRadarUserEmail(currentUser?.email);

  const [isAssigningAgent, setIsAssigningAgent] = useState(false);
  const [isAssigningDepartment, setIsAssigningDepartment] = useState(false);
  const [isSettingFunnel, setIsSettingFunnel] = useState(false);
  const [isCustomerProfileOpen, setIsCustomerProfileOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState('images');
  const [isCreatingBusinessWomanClient, setIsCreatingBusinessWomanClient] = useState(false);
  
  const [localCustomData, setLocalCustomData] = useState<Record<string, any>>({});

  const number = chatDetails.remoteJid ? chatDetails.remoteJid.split('@')[0] : '...';
  const name = chatDetails.name || number;
  const remoteJid = chatDetails.remoteJid;

  const { data: teamData } = useSWR<TeamDataWithMembers>('/api/team', fetcher);
  const agents: Agent[] = teamData?.teamMembers.map(tm => tm.user) || [];

  const swrKey = remoteJid 
    ? (instanceId ? `/api/contacts/by-chat?jid=${remoteJid}&instanceId=${instanceId}` : `/api/contacts/by-chat?jid=${remoteJid}`) 
    : null;
    
  const { data: contact, error: contactError, mutate: mutateContact, isLoading } = useSWR<ContactData | null>(swrKey, fetcher);

  // Al cambiar de chat, volvemos siempre a la vista de contacto — nunca dejar
  // a alguien "atascado" mirando el Radar de un contacto que ya no es este.
  useEffect(() => {
    setSidebarView('contact');
  }, [remoteJid]);

  const { data: aappSpaceSummary } = useSWR<AappSpaceContactSummary | null>(
    contact?.id ? `/api/plugins/aapp-space/contact?contactId=${contact.id}` : null,
    fetcher,
  );

  const { data: funnelStages } = useSWR<FunnelStage[]>('/api/funnel-stages', fetcher);
  const { data: departments } = useSWR<DepartmentRef[]>('/api/departments', fetcher);
  const { data: customFields } = useSWR<CustomField[]>('/api/custom-fields', fetcher);
  const { data: installedMiniApps } = useSWR<InstalledMiniApp[]>('/api/mini-apps', fetcher);

  const isBusinessWomanActive = useMemo(
    () => Array.isArray(installedMiniApps) && installedMiniApps.some((app) => app.slug === BUSINESS_WOMAN_SLUG),
    [installedMiniApps],
  );

  const { data: businessWomanData, mutate: mutateBusinessWomanData } = useSWR<MiniAppDataResponse>(
    isBusinessWomanActive && !isGroup && remoteJid ? `/api/mini-apps/${BUSINESS_WOMAN_SLUG}/data` : null,
    fetcher,
  );

  const businessWomanClients = useMemo(() => {
    const records = businessWomanData?.clients;
    if (!Array.isArray(records)) return [];
    return records.map(normalizeBusinessWomanClient).filter(Boolean) as BusinessWomanClient[];
  }, [businessWomanData]);

  const currentBusinessWomanPhone = useMemo(
    () => normalizeBusinessWomanPhone(remoteJid || number),
    [remoteJid, number],
  );

  const currentBusinessWomanClient = useMemo(() => {
    if (!currentBusinessWomanPhone) return null;
    return businessWomanClients.find((client) => normalizeBusinessWomanPhone(client.phone) === currentBusinessWomanPhone) || null;
  }, [businessWomanClients, currentBusinessWomanPhone]);

  useEffect(() => {
    if (contact) {
        setLocalNotes(contact.notes || "");
        setLocalCustomData(contact.customData || {});
    } else {
        setLocalNotes("");
        setLocalCustomData({});
    }
  }, [contact]);

  const handleSaveNotes = async () => {
    if (!contact) return;
    setIsSavingNotes(true);
    mutateContact((prevData) => { if (!prevData) return prevData; return { ...prevData, notes: localNotes }; }, false);

    try {
      const res = await fetch(`/api/contacts/${contact.id}/notes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: localNotes }),
      });
      if (!res.ok) throw new Error(t('toasts.notes_save_failed'));
      toast.success(t('toasts.notes_updated'));
    } catch (error) {
      toast.error(t('toasts.notes_save_failed'));
      mutateContact();
    } finally { setIsSavingNotes(false); }
  };

  const openBusinessWomanClient = () => {
    if (!currentBusinessWomanPhone) return;
    router.push(`/plugins/mini-apps/${BUSINESS_WOMAN_SLUG}?clientPhone=${encodeURIComponent(currentBusinessWomanPhone)}`);
  };

  const handleCreateBusinessWomanClient = async () => {
    if (!isBusinessWomanActive || !remoteJid || !currentBusinessWomanPhone || currentBusinessWomanClient) return;
    setIsCreatingBusinessWomanClient(true);

    const recordId = createBusinessWomanRecordId(currentBusinessWomanPhone);
    const clientName = (contact?.name || name || currentBusinessWomanPhone).trim();
    const payload: BusinessWomanClient = {
      _recordId: recordId,
      name: clientName || currentBusinessWomanPhone,
      status: 'potencial',
      notes: contact?.notes ?? '',
      contacted: false,
      phone: currentBusinessWomanPhone,
    };

    try {
      const res = await fetch(`/api/mini-apps/${BUSINESS_WOMAN_SLUG}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'clients', recordId, data: payload }),
      });
      if (!res.ok) throw new Error('create_failed');
      toast.success('Cliente creado en Business Woman');
      await mutateBusinessWomanData();
      openBusinessWomanClient();
    } catch {
      toast.error('No se pudo crear el cliente en Business Woman');
    } finally {
      setIsCreatingBusinessWomanClient(false);
    }
  };

  const renderBusinessWomanAction = () => {
    if (!isBusinessWomanActive || isGroup || !remoteJid || !currentBusinessWomanPhone) return null;

    if (currentBusinessWomanClient) {
      return (
        <Button
          type="button"
          className="w-full justify-center bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:from-rose-600 hover:to-pink-600"
          onClick={openBusinessWomanClient}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Ver en Business Womman
        </Button>
      );
    }

    return (
      <Button
        type="button"
        className="w-full justify-center border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
        variant="outline"
        onClick={handleCreateBusinessWomanClient}
        disabled={isCreatingBusinessWomanClient}
      >
        {isCreatingBusinessWomanClient ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
        Crear Cliente
      </Button>
    );
  };

  const handleUpdateCustomData = async (key: string, value: any) => {
    if (!contact) return;
    const newData = { ...localCustomData, [key]: value };
    setLocalCustomData(newData);
    
    mutateContact(prev => prev ? ({ ...prev, customData: newData }) : null, false);

    try {
        await fetch(`/api/contacts/${contact.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customData: newData })
        });
        toast.success(t('toasts.update_success') || "Updated");
    } catch(e) {
        toast.error(t('toasts.update_error') || "Error updating");
        mutateContact();
    }
  };

  const handleAssignAgent = async (agentId: string) => {
    if (!contact) return;
    const newAgentId = agentId === 'null' ? null : parseInt(agentId, 10);
    const oldAgent = contact.assignedUser;
    mutateContact((prev) => { if (!prev) return prev; const newAgent = agents.find(a => a.id === newAgentId) || null; return { ...prev, assignedUser: newAgent }; }, false);
    setIsAssigningAgent(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/assign-agent`, { method: 'PUT', body: JSON.stringify({ agentId: newAgentId }), });
      if (!res.ok) throw new Error();
      toast.success(newAgentId ? t('toasts.agent_assigned') : t('toasts.agent_removed'));
    } catch (error) {
      toast.error(t('toasts.agent_save_error'));
      mutateContact((prev) => ({ ...prev!, assignedUser: oldAgent }), false);
    } finally { setIsAssigningAgent(false); mutateContact(); }
  };

  const handleAssignDepartment = async (deptId: string) => {
    if (!contact) return;
    const newDeptId = deptId === 'null' ? null : parseInt(deptId, 10);
    const oldDept = contact.assignedDepartment;
    mutateContact((prev) => {
      if (!prev) return prev;
      const newDept = departments?.find(d => d.id === newDeptId) || null;
      return { ...prev, assignedDepartment: newDept };
    }, false);
    setIsAssigningDepartment(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/assign-department`, {
        method: 'PUT',
        body: JSON.stringify({ departmentId: newDeptId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      mutateContact((prev) => ({ ...prev!, assignedDepartment: oldDept }), false);
    } finally {
      setIsAssigningDepartment(false);
      mutateContact();
    }
  };

  const handleSetFunnelStage = async (stageId: string) => {
    if (!contact) return;
    const newStageId = stageId === 'null' ? null : parseInt(stageId, 10);
    const oldStage = contact.funnelStage;
    mutateContact((prev) => { if (!prev) return prev; const newStage = funnelStages?.find(s => s.id === newStageId) || null; return { ...prev, funnelStage: newStage }; }, false);
    setIsSettingFunnel(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/funnel-stage`, { method: 'PUT', body: JSON.stringify({ stageId: newStageId }), });
      if (!res.ok) throw new Error();
      toast.success(t('toasts.stage_updated'));
    } catch (error) {
      toast.error(t('toasts.stage_save_error'));
      mutateContact((prev) => ({ ...prev!, funnelStage: oldStage }), false);
    } finally {
      setIsSettingFunnel(false);
      mutateContact();
      const newStage = funnelStages?.find(s => s.id === newStageId) || null;
      globalMutate('/api/chats', (currentChats: any[] | undefined) => {
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

  const renderLoading = () => (<div className="flex-1 overflow-y-auto p-4 space-y-6 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>);
  const renderError = (message: string) => (<div className="flex-1 overflow-y-auto p-4 space-y-6"><p className="text-center text-destructive">{message}</p></div>);
  
  const renderGroupSidebar = () => {
    if (!remoteJid) return <div className="p-4 text-center text-sm text-muted-foreground">{t('main.select_chat_hint')}</div>;
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="p-3 border rounded-lg bg-muted/30 flex items-center gap-3">
          <Avatar className="h-12 w-12 border">
            <AvatarImage src={chatDetails.profilePicUrl || undefined} alt={name} />
            <AvatarFallback>{name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="overflow-hidden min-w-0 flex-1">
            <h3 className="font-medium text-base truncate" title={name}>{name}</h3>
            <div className="flex items-center text-xs text-muted-foreground mt-0.5">
              <Users className="h-3 w-3 mr-1" />
              <span>{t('main.group_label') || 'Grupo'}</span>
            </div>
          </div>
          {onSyncMessages && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onSyncMessages} disabled={isSyncingMessages}>
                  {isSyncingMessages ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  {t('sync_messages_menu_btn')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <ContactTaskPanel chatId={chatId} />

        <div className="space-y-2">
          <h3 className="font-medium flex items-center mb-2"><HardDrive className="h-4 w-4 mr-2 text-muted-foreground" /> {t('media.assets_title')}</h3>
          <Tabs value={activeMediaTab} onValueChange={setActiveMediaTab}>
            <TabsList className="grid w-full grid-cols-7 h-12">
              <TabsTrigger value="images" className="h-10"><ImageIcon className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="videos" className="h-10"><VideoIcon className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="audio" className="h-10"><Mic className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="docs" className="h-10"><FileText className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="location" className="h-10"><MapPin className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="contacts" className="h-10"><Contact className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="links" className="h-10"><Link2 className="h-5 w-5" /></TabsTrigger>
            </TabsList>
            <div className="mt-2 border rounded-md min-h-[100px] max-h-[300px] overflow-y-auto">
              {['images', 'videos'].includes(activeMediaTab)
                ? <MediaGrid type={activeMediaTab} remoteJid={remoteJid} instanceId={instanceId} />
                : activeMediaTab === 'links'
                  ? <LinksList remoteJid={remoteJid} instanceId={instanceId} />
                  : <MediaList type={activeMediaTab} remoteJid={remoteJid} instanceId={instanceId} />
              }
            </div>
          </Tabs>
        </div>
      </div>
    );
  };

  const renderSidebarContent = () => {
    if (isGroup) return renderGroupSidebar();
    if (!remoteJid) return <div className="p-4 text-center text-sm text-muted-foreground">{t('main.select_chat_hint')}</div>;
    if (isLoading) return renderLoading();
    if (contactError) return renderError(t('main.error_loading'));

    if (!contact) {
      return (
        <div className="flex-1 flex flex-col p-4">
          <div className="p-4 border rounded-lg bg-muted/50 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 text-center">
                <h3 className="font-medium text-lg">{name}</h3>
                <p className="text-sm text-muted-foreground">+{number}</p>
              </div>
              {onSyncMessages && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onSyncMessages} disabled={isSyncingMessages}>
                      {isSyncingMessages ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                      {t('sync_messages_menu_btn')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2 text-center">{t('main.not_in_crm')}</p>
          </div>
          <SaveContactDialog chatDetails={chatDetails} onContactSaved={() => mutateContact()} agents={agents} />
          {isBusinessWomanActive && <div className="mt-2">{renderBusinessWomanAction()}</div>}
          <div className="mt-4">
            <ContactTaskPanel chatId={chatId} />
          </div>
          
          <div className="space-y-2 mt-auto pt-6">
              <h3 className="font-medium flex items-center mb-2"><HardDrive className="h-4 w-4 mr-2 text-muted-foreground" /> {t('media.assets_title')}</h3>
              <Tabs value={activeMediaTab} onValueChange={setActiveMediaTab}>
                <TabsList className="grid w-full grid-cols-7 h-12">
                  <TabsTrigger value="images" className="h-10"><ImageIcon className="h-5 w-5" /></TabsTrigger>
                  <TabsTrigger value="videos" className="h-10"><VideoIcon className="h-5 w-5" /></TabsTrigger>
                  <TabsTrigger value="audio" className="h-10"><Mic className="h-5 w-5" /></TabsTrigger>
                  <TabsTrigger value="docs" className="h-10"><FileText className="h-5 w-5" /></TabsTrigger>
                  <TabsTrigger value="location" className="h-10"><MapPin className="h-5 w-5" /></TabsTrigger>
                  <TabsTrigger value="contacts" className="h-10"><Contact className="h-5 w-5" /></TabsTrigger>
                  <TabsTrigger value="links" className="h-10"><Link2 className="h-5 w-5" /></TabsTrigger>
                </TabsList>
                <div className="mt-2 border rounded-md min-h-[100px] max-h-[300px] overflow-y-auto">
                    {['images', 'videos'].includes(activeMediaTab)
                        ? <MediaGrid type={activeMediaTab} remoteJid={remoteJid} instanceId={instanceId} />
                        : activeMediaTab === 'links'
                          ? <LinksList remoteJid={remoteJid} instanceId={instanceId} />
                          : <MediaList type={activeMediaTab} remoteJid={remoteJid} instanceId={instanceId} />
                    }
                </div>
              </Tabs>
          </div>
        </div>
      );
    }

    const displayName = contact.name || name;

    return (
      <>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="flex items-center gap-2 rounded-xl border bg-card p-2 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.03]">
          <button
            type="button"
            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => setIsCustomerProfileOpen(true)}
            aria-label={t('main.open_customer_profile', { name: displayName })}
          >
            <Avatar className="h-12 w-12 shrink-0 border">
              <AvatarImage src={chatDetails.profilePicUrl || undefined} alt={displayName} />
              <AvatarFallback className="bg-primary/10 text-primary">{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h3 className="truncate text-base font-semibold" title={displayName}>{displayName}</h3>
              <div className="mt-0.5 flex items-center text-xs text-muted-foreground">
                <Phone className="mr-1 h-3 w-3" />
                <span className="truncate">+{number}</span>
              </div>
              <p className="mt-1 text-[11px] font-medium text-primary">{t('main.view_customer_profile')}</p>
            </div>
          </button>
            {onSyncMessages && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onSyncMessages} disabled={isSyncingMessages}>
                    {isSyncingMessages ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                    {t('sync_messages_menu_btn')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
        </div>

        <ChatAgendaPicker remoteJid={remoteJid} />

        {renderBusinessWomanAction()}

        {aappSpaceSummary?.customer && (
          <section className="space-y-3 border-y py-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center text-sm font-semibold">
                <Globe2 className="mr-2 h-4 w-4 text-primary" />
                {t('main.aapp_space_title')}
              </h3>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => router.push(`/plugins/customers/${aappSpaceSummary.customer.id}`)}>
                {t('main.aapp_space_open_customer')}
              </Button>
            </div>
            <div>
              <p className="truncate text-sm font-medium">{aappSpaceSummary.customer.name}</p>
              {aappSpaceSummary.customer.email && <p className="truncate text-xs text-muted-foreground">{aappSpaceSummary.customer.email}</p>}
            </div>
            {aappSpaceSummary.subscription && (() => {
              const days = daysUntil(aappSpaceSummary.subscription.endDate);
              const urgency = serviceUrgency(days);
              const daysLabel = days === null
                ? null
                : days < 0
                  ? (Math.abs(days) === 1
                      ? t('main.aapp_space_expired_ago_one')
                      : t('main.aapp_space_expired_ago', { days: Math.abs(days) }))
                  : days === 0
                    ? t('main.aapp_space_expires_today')
                    : days === 1
                      ? t('main.aapp_space_days_left_one')
                      : t('main.aapp_space_days_left', { days });

              return (
                <div className={`space-y-1 border-l-2 pl-3 ${AAPP_SERVICE_BORDER[urgency]}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{aappSpaceSummary.subscription.planName || t('main.aapp_space_plan')}</p>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{aappSpaceSummary.subscription.status}</Badge>
                  </div>
                  {daysLabel && (
                    <Badge className={`text-[10px] ${AAPP_SERVICE_BADGE[urgency]}`}>{daysLabel}</Badge>
                  )}
                  <p className="flex items-center text-xs text-muted-foreground">
                    <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                    {aappSpaceSummary.subscription.endDate
                      ? t('main.aapp_space_expires', { date: new Date(`${aappSpaceSummary.subscription.endDate}T00:00:00`).toLocaleDateString() })
                      : t('main.aapp_space_no_expiration')}
                  </p>
                </div>
              );
            })()}
            {aappSpaceSummary.websites.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t('main.aapp_space_websites')}</p>
                {aappSpaceSummary.websites.map((website) => website.url && (
                  <a key={website.id} href={website.url} target="_blank" rel="noreferrer" className="flex min-h-8 items-center justify-between gap-2 text-sm text-primary hover:underline">
                    <span className="truncate">{website.title || t('main.aapp_space_website')}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </section>
        )}

        <ContactTagsEditor
          contactId={contact.id}
          tags={contact.tags}
          onChange={(tags) => mutateContact((current) => current ? { ...current, tags } : current, false)}
        />

        <div className="space-y-2">
          <h3 className="font-medium flex items-center mb-2"><Users className="h-4 w-4 mr-2 text-muted-foreground" /> {t('main.assign_agent_title')}</h3>
          <Select onValueChange={handleAssignAgent} value={contact.assignedUser?.id?.toString() || 'null'} disabled={isAssigningAgent}>
            <SelectTrigger><SelectValue placeholder={t('main.agents_placeholder')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="null">{t('contact_dialog.nobody_option')}</SelectItem>
              {agents.map((agent) => (<SelectItem key={agent.id} value={agent.id.toString()}>{agent.name || agent.email}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium flex items-center mb-2"><Building2 className="h-4 w-4 mr-2 text-muted-foreground" /> {t('main.assign_department_title')}</h3>
          <Select onValueChange={handleAssignDepartment} value={contact.assignedDepartment?.id?.toString() || 'null'} disabled={isAssigningDepartment}>
            <SelectTrigger><SelectValue placeholder={t('main.departments_placeholder')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="null">{t('main.no_department')}</SelectItem>
              {departments?.map((dept) => (<SelectItem key={dept.id} value={dept.id.toString()}>{dept.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium flex items-center mb-2"><ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" /> {t('main.funnel_stage_title')}</h3>
          <Select onValueChange={handleSetFunnelStage} value={contact.funnelStage?.id?.toString() || 'null'} disabled={isSettingFunnel || !funnelStages}>
            <SelectTrigger><SelectValue placeholder={t('main.define_stage_placeholder')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="null">{t('contact_dialog.no_stage_option')}</SelectItem>
              {funnelStages?.map((stage) => (
                <SelectItem key={stage.id} value={stage.id.toString()}>
                   {stage.emoji} {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
           <div className="flex justify-between items-center mb-2">
             <h3 className="font-medium flex items-center"><FileText className="h-4 w-4 mr-2 text-muted-foreground" /> {t('main.notes_title')}</h3>
             {localNotes !== (contact.notes || "") && (
               <Button size="sm" variant="ghost" onClick={handleSaveNotes} disabled={isSavingNotes} className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-500 dark:hover:bg-green-900/20">
                 {isSavingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} {t('main.save_notes_btn')}
               </Button>
             )}
           </div>
          <Textarea value={localNotes} onChange={(e) => setLocalNotes(e.target.value)} className="min-h-[80px] resize-none bg-muted/50 focus:bg-background text-sm" placeholder={t('main.notes_placeholder')} />
        </div>

        <ContactTaskPanel chatId={chatId} />

        {customFields && customFields.length > 0 && (
             <div className="space-y-3 border-t pt-4">
                <h3 className="font-medium flex items-center text-sm uppercase text-muted-foreground"><Settings2 className="h-4 w-4 mr-2" /> {t('main.custom_fields_title')}</h3>
                <div className="space-y-3">
                    {customFields.map(cf => (
                        <div key={cf.id} className="grid gap-1.5">
                            <Label className="text-xs font-normal text-muted-foreground">{cf.name}</Label>
                            {cf.type === 'boolean' ? (
                                <div className="flex items-center space-x-2">
                                    <Switch 
                                        checked={!!localCustomData[cf.key]} 
                                        onCheckedChange={(checked) => handleUpdateCustomData(cf.key, checked)} 
                                    />
                                    <span className="text-sm">{localCustomData[cf.key] ? t('yes') : t('no')}</span>
                                </div>
                            ) : (
                                <Input 
                                    value={localCustomData[cf.key] || ''} 
                                    onChange={(e) => setLocalCustomData(prev => ({...prev, [cf.key]: e.target.value}))}
                                    onBlur={(e) => handleUpdateCustomData(cf.key, e.target.value)}
                                    className="h-8 text-sm"
                                />
                            )}
                        </div>
                    ))}
                </div>
             </div>
        )}

        <div className="space-y-2 border-t pt-4">
           <h3 className="font-medium flex items-center mb-2"><HardDrive className="h-4 w-4 mr-2 text-muted-foreground" /> {t('media.assets_title')}</h3>
           <Tabs value={activeMediaTab} onValueChange={setActiveMediaTab}>
            <TabsList className="grid w-full grid-cols-7 h-12">
              <TabsTrigger value="images" className="h-10"><ImageIcon className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="videos" className="h-10"><VideoIcon className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="audio" className="h-10"><Mic className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="docs" className="h-10"><FileText className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="location" className="h-10"><MapPin className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="contacts" className="h-10"><Contact className="h-5 w-5" /></TabsTrigger>
              <TabsTrigger value="links" className="h-10"><Link2 className="h-5 w-5" /></TabsTrigger>
            </TabsList>

            <div className="mt-2 border rounded-md min-h-[100px] max-h-[300px] overflow-y-auto">
                {['images', 'videos'].includes(activeMediaTab)
                    ? <MediaGrid type={activeMediaTab} remoteJid={remoteJid} instanceId={instanceId} />
                    : activeMediaTab === 'links'
                      ? <LinksList remoteJid={remoteJid} instanceId={instanceId} />
                      : <MediaList type={activeMediaTab} remoteJid={remoteJid} instanceId={instanceId} />
                }
            </div>
          </Tabs>
        </div>
      </div>
      {remoteJid && (
        <CustomerProfileDialog
          open={isCustomerProfileOpen}
          onOpenChange={setIsCustomerProfileOpen}
          contact={contact}
          chatId={chatId}
          remoteJid={remoteJid}
          instanceId={instanceId}
          profilePicUrl={chatDetails.profilePicUrl}
          customFields={customFields || []}
          onContactChange={(patch) => mutateContact((current) => current ? { ...current, ...patch } : current, false)}
        />
      )}
      </>
    );
  };

  return (
    <>
      {/* Backdrop — mobile only, shown when sidebar is open */}
      {!isCollapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onToggleCollapse}
        />
      )}
      <aside className={cn(
        "flex h-screen flex-col overflow-hidden border-l bg-card transition-all duration-300 ease-in-out",
        // Mobile: fixed overlay sliding from the right
        "fixed right-0 top-0 z-50 w-72",
        // Desktop: inline, collapses by width
        "md:relative md:z-auto md:shrink-0",
        isCollapsed
          ? "translate-x-full md:translate-x-0 md:w-0 md:min-w-0 md:max-w-0 md:border-l-0"
          : "translate-x-0 md:w-72 md:min-w-[18rem] md:max-w-[18rem]"
      )}>
        {!isCollapsed && (
          sidebarView === 'radar' && contact ? (
            <RadarPanel
              contactId={contact.id}
              chatId={chatId}
              onBack={() => setSidebarView('contact')}
              onUseSuggestion={(text) => onInsertComposerText?.(text)}
              onSuggestionsLoaded={onRadarSuggestionsLoaded}
            />
          ) : (
            <>
              {isRadarUser && contact && !isGroup && (
                <div className="flex items-center justify-end border-b px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setSidebarView('radar')}
                    className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                  >
                    <RadarIcon className="h-3.5 w-3.5" />
                    Radar
                  </button>
                </div>
              )}
              {renderSidebarContent()}
            </>
          )
        )}
      </aside>
    </>
  );
}
