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
  BriefcaseBusiness,
  UserRoundPlus,
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
import { ChatAgendaPicker } from '@/components/dashboard/ChatAgendaPicker';
import { CommercialPanel } from '@/components/chat/CommercialPanel';
import { ContactTaskPanel } from '@/components/chat/ContactTaskPanel';
import { ContactTagsEditor } from '@/components/chat/ContactTagsEditor';
import { CustomerProfileDialog } from '@/components/chat/CustomerProfileDialog';
import { RadarPanel } from '@/lib/plugins/radar/ui/RadarPanel';
import { isRadarEnabledInNav } from '@/lib/plugins/radar/shared/constants';
import { Radar as RadarIcon } from 'lucide-react';
import { Handshake, Wand2 } from 'lucide-react';
import { CommandCenterChip, trabajoEnCola, usePanelCommandCenter } from '@/components/chat/panel/CommandCenter';
import { ComercialTab } from '@/components/chat/panel/ComercialTab';
import { ClienteTab } from '@/components/chat/panel/ClienteTab';
import { IaTab } from '@/components/chat/panel/IaTab';
import type { ClienteVinculado } from '@/components/chat/panel/tipos';
import '@/components/maqueta/maqueta.css';

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

/** Las seis pestañas del panel, en el orden de la grilla de 3×2. */
type PanelTab = 'datos' | 'comercial' | 'cliente' | 'ia' | 'radar' | 'archivos';

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

const fetcher = (url: string) => fetch(url).then((res) => res.json());
const BUSINESS_WOMAN_SLUG = 'business-woman-planner';

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
  // Radar se muestra a quien lo tenga habilitado: `/api/plugins/nav` ya resuelve
  // la activación por usuario, así que basta con ver si la ruta viene ahí.
  const { data: radarNav } = useSWR<Array<{ href?: string }>>('/api/plugins/nav', fetcher, { revalidateOnFocus: false });
  const isRadarUser = isRadarEnabledInNav(radarNav);

  const [isAssigningAgent, setIsAssigningAgent] = useState(false);
  const [isAssigningDepartment, setIsAssigningDepartment] = useState(false);
  const [isSettingFunnel, setIsSettingFunnel] = useState(false);
  const [isCustomerProfileOpen, setIsCustomerProfileOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState('images');
  /** Qué pestaña del panel se está mirando. */
  const [panelTab, setPanelTab] = useState<PanelTab>('datos');
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
    // Y a la pestaña de Datos: quedarse en "Archivos" al abrir otra
    // conversación esconde justo lo que se va a mirar primero.
    setPanelTab('datos');
  }, [remoteJid]);

  /**
   * Cómo ve el Command Center a este contacto y qué tiene encolado.
   *
   * Se pide siempre (es una consulta chica con índice) porque alimenta el
   * símbolo del encabezado y el puntito de la pestaña IA; si el equipo no tiene
   * el Command Center vuelve `null` y esas dos cosas no se dibujan.
   */
  const { snapshot: ccSnapshot, refrescar: refrescarCc } = usePanelCommandCenter(chatId ?? null);
  const pendientesEnCola = trabajoEnCola(ccSnapshot);

  /**
   * El cliente vinculado, pedido UNA vez para las dos pestañas que lo usan.
   *
   * Comercial y Cliente miraban dos fuentes distintas del mismo cliente —una la
   * ruta de AAPP SPACE, que devolvía una sola membresía, y la otra el snapshot
   * comercial— y por eso se contradecían. Ahora las dos leen la ficha del
   * cliente, que es la que tiene TODAS sus membresías y dice de dónde salió.
   */
  /**
   * El id del cliente sale del snapshot comercial, que es quien resuelve el
   * vínculo contacto→cliente. Es la MISMA clave SWR que pide la pestaña
   * Comercial, así que no agrega un request: se comparte la respuesta.
   */
  const { data: comercial } = useSWR<{ scope?: { customerId: number | null } } | null>(
    contact?.id ? `/api/contacts/commercial-snapshot?contactId=${contact.id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const clienteId = comercial?.scope?.customerId ?? null;
  const { data: cliente, isLoading: cargandoCliente } = useSWR<ClienteVinculado | null>(
    clienteId ? `/api/plugins/customers/${clienteId}` : null,
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
          <BriefcaseBusiness className="h-4 w-4 mr-2" />
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
        {isCreatingBusinessWomanClient ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserRoundPlus className="h-4 w-4 mr-2" />}
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

  const renderLoading = () => (<div className="flex flex-1 items-center justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>);
  const renderError = (message: string) => (<p className="py-10 text-center text-sm text-destructive">{message}</p>);
  
  /**
   * Los archivos del chat: la misma grilla de siempre, con el selector de tipo
   * como píldoras en vez de siete iconos apretados.
   *
   * Está acá adentro y no como componente suelto porque necesita `remoteJid`,
   * `instanceId` y la pestaña elegida, que son estado de este panel.
   */
  /**
   * Los archivos del chat: la misma grilla de siempre, con el selector de tipo
   * como píldoras en vez de siete iconos apretados.
   *
   * Está acá adentro y no como componente suelto porque necesita `remoteJid`,
   * `instanceId` y la pestaña elegida, que son estado de este panel.
   */
  const renderArchivos = () => {
    if (!remoteJid) return null;
    const TIPOS: Array<[string, string]> = [
      ['images', t('media.tab_images')],
      ['videos', t('media.tab_videos')],
      ['audio', t('media.tab_audio')],
      ['docs', t('media.tab_docs')],
      ['location', t('media.tab_location')],
      ['contacts', t('media.tab_contacts')],
      ['links', t('media.tab_links')],
    ];
    return (
      <div className="ctx-sec">
        <div className="ctx-t"><HardDrive className="h-3 w-3" /> {t('media.assets_title')}</div>
        <div className="mb-3 flex flex-wrap gap-1">
          {TIPOS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              className={`fchip${activeMediaTab === k ? ' active' : ''}`}
              onClick={() => setActiveMediaTab(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {['images', 'videos'].includes(activeMediaTab)
            ? <MediaGrid type={activeMediaTab} remoteJid={remoteJid} instanceId={instanceId} />
            : activeMediaTab === 'links'
              ? <LinksList remoteJid={remoteJid} instanceId={instanceId} />
              : <MediaList type={activeMediaTab} remoteJid={remoteJid} instanceId={instanceId} />}
        </div>
      </div>
    );
  };

  /** El encabezado del panel: quién es, su número y el menú de los tres puntos. */
  const renderCabecera = (titulo: string, subtitulo: string, onAbrirFicha?: () => void) => (
    <div className="mb-3.5 flex items-center gap-2.5">
      <Avatar className="h-10 w-10 shrink-0 border">
        <AvatarImage src={chatDetails.profilePicUrl || undefined} alt={titulo} />
        <AvatarFallback className="bg-primary/10 text-primary">{titulo.substring(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      {onAbrirFicha ? (
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onAbrirFicha}
          aria-label={t('main.open_customer_profile', { name: titulo })}
        >
          <div className="truncate text-[13.5px] font-bold" title={titulo}>{titulo}</div>
          <div className="mono truncate text-[11px]" style={{ color: 'var(--mq-muted)' }}>{subtitulo}</div>
        </button>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold" title={titulo}>{titulo}</div>
          <div className="mono truncate text-[11px]" style={{ color: 'var(--mq-muted)' }}>{subtitulo}</div>
        </div>
      )}
      {onSyncMessages && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn sm ghost" aria-label={t('sync_messages_menu_btn')}>
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSyncMessages} disabled={isSyncingMessages}>
              {isSyncingMessages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {t('sync_messages_menu_btn')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  const renderGroupSidebar = () => {
    if (!remoteJid) return <div className="ctx-sec text-center text-sm" style={{ color: 'var(--mq-muted)' }}>{t('main.select_chat_hint')}</div>;
    return (
      <>
        {renderCabecera(name, t('main.group_label'))}
        <div className="ctx-sec">
          <ContactTaskPanel chatId={chatId} />
        </div>
        {renderArchivos()}
      </>
    );
  };

  /** El bloque de datos del contacto: lo que se toca todos los días. */
  const renderDatos = (contact: ContactData) => (
    <>
      <div className="ctx-sec">
        <ContactTagsEditor
          contactId={contact.id}
          tags={contact.tags}
          onChange={(tags) => mutateContact((current) => current ? { ...current, tags } : current, false)}
        />
      </div>

      <div className="ctx-sec">
        <div className="ctx-t"><Users className="h-3 w-3" /> {t('main.assign_agent_title')}</div>
        <select
          className="input"
          value={contact.assignedUser?.id?.toString() || 'null'}
          onChange={(e) => handleAssignAgent(e.target.value)}
          disabled={isAssigningAgent}
          aria-label={t('main.assign_agent_title')}
        >
          <option value="null">{t('contact_dialog.nobody_option')}</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id.toString()}>{agent.name || agent.email}</option>
          ))}
        </select>
      </div>

      <div className="ctx-sec">
        <div className="ctx-t"><Building2 className="h-3 w-3" /> {t('main.assign_department_title')}</div>
        <select
          className="input"
          value={contact.assignedDepartment?.id?.toString() || 'null'}
          onChange={(e) => handleAssignDepartment(e.target.value)}
          disabled={isAssigningDepartment}
          aria-label={t('main.assign_department_title')}
        >
          <option value="null">{t('main.no_department')}</option>
          {departments?.map((dept) => (
            <option key={dept.id} value={dept.id.toString()}>{dept.name}</option>
          ))}
        </select>
      </div>

      <div className="ctx-sec">
        <div className="ctx-t"><ChevronDown className="h-3 w-3" /> {t('main.funnel_stage_title')}</div>
        <select
          className="input"
          value={contact.funnelStage?.id?.toString() || 'null'}
          onChange={(e) => handleSetFunnelStage(e.target.value)}
          disabled={isSettingFunnel || !funnelStages}
          aria-label={t('main.funnel_stage_title')}
        >
          <option value="null">{t('contact_dialog.no_stage_option')}</option>
          {funnelStages?.map((stage) => (
            <option key={stage.id} value={stage.id.toString()}>{stage.emoji} {stage.name}</option>
          ))}
        </select>
      </div>

      <div className="ctx-sec">
        <div className="ctx-t">
          <FileText className="h-3 w-3" /> {t('main.notes_title')}
          <span className="sp" />
          {localNotes !== (contact.notes || '') && (
            <button
              type="button"
              className="btn sm ghost"
              style={{ color: 'var(--mq-green)' }}
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
            >
              {isSavingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} {t('main.save_notes_btn')}
            </button>
          )}
        </div>
        <textarea
          className="input"
          rows={4}
          style={{ resize: 'vertical' }}
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          placeholder={t('main.notes_placeholder')}
        />
      </div>

      <div className="ctx-sec"><ChatAgendaPicker remoteJid={remoteJid!} /></div>

      {renderBusinessWomanAction() && <div className="ctx-sec">{renderBusinessWomanAction()}</div>}

      <div className="ctx-sec"><ContactTaskPanel chatId={chatId} /></div>

      {/* Los campos personalizados dejaron de ser una pestaña: son datos del
          contacto, se editan poco y arrancan plegados para no empujar hacia
          abajo lo que sí se toca todos los días. */}
      {customFields && customFields.length > 0 && (
        <details className="ctx-sec">
          <summary className="ctx-t cursor-pointer select-none">
            <Settings2 className="h-3 w-3" /> {t('main.custom_fields_title')} ({customFields.length})
          </summary>
          <div className="mt-2">
            {customFields.map(cf => (
              <div key={cf.id} className="mb-2.5">
                <label className="fl" htmlFor={`cf-panel-${cf.id}`}>{cf.name}</label>
                {cf.type === 'boolean' ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`cf-panel-${cf.id}`}
                      checked={!!localCustomData[cf.key]}
                      onCheckedChange={(checked) => handleUpdateCustomData(cf.key, checked)}
                    />
                    <span className="text-[11.5px]" style={{ color: 'var(--mq-muted)' }}>
                      {localCustomData[cf.key] ? t('yes') : t('no')}
                    </span>
                  </div>
                ) : (
                  <input
                    id={`cf-panel-${cf.id}`}
                    className="input"
                    value={localCustomData[cf.key] || ''}
                    onChange={(e) => setLocalCustomData(prev => ({ ...prev, [cf.key]: e.target.value }))}
                    onBlur={(e) => handleUpdateCustomData(cf.key, e.target.value)}
                    placeholder="—"
                  />
                )}
              </div>
            ))}
            <p className="mt-1.5 text-[10.5px] leading-relaxed" style={{ color: 'var(--mq-muted2)' }}>
              {t('main.custom_fields_hint')}
            </p>
          </div>
        </details>
      )}
    </>
  );

  const renderSidebarContent = () => {
    if (isGroup) return renderGroupSidebar();
    if (!remoteJid) return <div className="ctx-sec text-center text-sm" style={{ color: 'var(--mq-muted)' }}>{t('main.select_chat_hint')}</div>;
    if (isLoading) return renderLoading();
    if (contactError) return renderError(t('main.error_loading'));

    if (!contact) {
      return (
        <>
          {renderCabecera(name, `+${number}`)}
          <div className="ctx-sec">
            <p className="mb-2.5 text-[11.5px]" style={{ color: 'var(--mq-muted)' }}>{t('main.not_in_crm')}</p>
            <SaveContactDialog chatDetails={chatDetails} onContactSaved={() => mutateContact()} agents={agents} />
            {isBusinessWomanActive && <div className="mt-2">{renderBusinessWomanAction()}</div>}
          </div>
          <div className="ctx-sec">
            <ContactTaskPanel chatId={chatId} />
          </div>
          {renderArchivos()}
        </>
      );
    }

    const displayName = contact.name || name;

    /**
     * Seis pestañas en dos filas de tres.
     *
     * Antes esto era una sola columna de dos metros de alto donde lo comercial,
     * lo de AAPP SPACE y lo del contacto se mezclaban sin separación. Cada
     * pestaña contesta una pregunta distinta: quién es (Datos), qué le vendemos
     * (Comercial), quién es del otro lado (Cliente), qué le preparamos (IA),
     * qué detectó el radar y qué archivos hay.
     */
    const solapas: Array<{ id: PanelTab; label: string; Icon: typeof User; marca?: boolean }> = [
      { id: 'datos', label: t('main.tab_data'), Icon: User },
      { id: 'comercial', label: t('main.tab_commercial'), Icon: Handshake, marca: Boolean(ccSnapshot?.crmFixPendiente) },
      { id: 'cliente', label: t('main.tab_customer'), Icon: Building2 },
      { id: 'ia', label: 'IA', Icon: Wand2, marca: pendientesEnCola > 0 },
      { id: 'radar', label: 'Radar', Icon: RadarIcon },
      { id: 'archivos', label: t('main.tab_files'), Icon: HardDrive },
    ];
    const visibles = solapas.filter((s) => s.id !== 'radar' || isRadarUser);

    return (
      <>
        {renderCabecera(displayName, `+${number}`, () => setIsCustomerProfileOpen(true))}
        <CommandCenterChip snapshot={ccSnapshot} />

        <div className="ctx-tabs" role="tablist">
          {visibles.map(({ id, label, Icon, marca }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={panelTab === id}
              className={`ctx-tab${panelTab === id ? ' active' : ''}`}
              onClick={() => setPanelTab(id)}
              title={label}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span>{label}</span>
              {marca && <span className="marca" aria-hidden />}
            </button>
          ))}
        </div>

        {panelTab === 'datos' && renderDatos(contact)}

        {panelTab === 'comercial' && (
          <ComercialTab contactId={contact.id} cliente={cliente ?? null} cargandoCliente={cargandoCliente} snapshot={ccSnapshot} />
        )}

        {panelTab === 'cliente' && (
          <ClienteTab
            cliente={cliente ?? null}
            cargando={cargandoCliente}
            contactoActual={contact.id}
            onVincular={() => setIsCustomerProfileOpen(true)}
          />
        )}

        {panelTab === 'ia' && <IaTab chatId={chatId ?? 0} snapshot={ccSnapshot} onEncolado={() => void refrescarCc()} />}

        {/* Radar dejó de reemplazar el panel entero: es una pestaña más, así que
            volver de Radar no exige acordarse de apretar "atrás". */}
        {panelTab === 'radar' && isRadarUser && (
          <div className="-mx-4 -mb-4 flex min-h-[50vh] flex-col">
            <RadarPanel
              contactId={contact.id}
              chatId={chatId}
              contactName={contact.name}
              remoteJid={remoteJid}
              // Radar ya no reemplaza el panel, así que su "volver" devuelve a
              // Datos en vez de desmontar la pestaña.
              onBack={() => setPanelTab('datos')}
              onUseSuggestion={(text) => onInsertComposerText?.(text)}
              onSuggestionsLoaded={onRadarSuggestionsLoaded}
            />
          </div>
        )}

        {panelTab === 'archivos' && renderArchivos()}

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
        "flex h-screen flex-col overflow-hidden border-l transition-all duration-300 ease-in-out",
        // Mobile: fixed overlay sliding from the right
        "fixed right-0 top-0 z-50 w-72",
        // Desktop: inline, collapses by width
        "md:relative md:z-auto md:shrink-0",
        isCollapsed
          ? "translate-x-full md:translate-x-0 md:w-0 md:min-w-0 md:max-w-0 md:border-l-0"
          : "translate-x-0 md:w-72 md:min-w-[18rem] md:max-w-[18rem]",
        // El panel lleva las variables `--mq-*` de la maqueta, que no se
        // filtran al resto del chat porque cuelgan de `.maqueta`.
        "maqueta bg-[var(--mq-bg2)]"
      )}>
        {!isCollapsed && (
          /* `ctx` es el cuerpo que scrollea. */
          <div className="ctx">{renderSidebarContent()}</div>
        )}
      </aside>
    </>
  );
}
