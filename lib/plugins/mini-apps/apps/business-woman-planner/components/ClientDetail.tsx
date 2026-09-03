'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, Check, RefreshCw, Plus, X, Trash2, MessageCircle,
  Phone, UploadCloud, FileText, Image as ImageIcon, MessageSquareText, Pencil, Tag as TagIcon, SlidersHorizontal,
  Video, Mic, Download, AlertCircle, ExternalLink, Play
} from 'lucide-react';
import { getSafeAvatarSrc } from '@/lib/avatar-url';
import { CustomAudioPlayer } from '@/components/ui/custom-audio-player';
import type {
  ClientItem, CRMContact, CustomerActivity, ClientProduct,
  DetailSource, FunnelStage, CustomField, TeamMember, CustomerInternalNote, CustomerAttachment,
  CustomerChatMedia, ChatMediaMessage
} from './clients/types';

const PRODUCT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'website', label: 'Sitio web' },
  { value: 'ecommerce', label: 'Tienda online' },
  { value: 'ads', label: 'Campaña publicitaria' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'consultoria', label: 'Consultoría' },
  { value: 'otro', label: 'Otro' },
];

const PRODUCT_FREQUENCIES: { value: string; label: string }[] = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'yearly', label: 'Anual' },
  { value: 'onetime', label: 'Pago único' },
];

const CURRENCIES = ['USD', 'MXN', 'ARS', 'EUR', 'COP'];
const PRODUCT_STATUSES: { value: string; label: string; cls: string }[] = [
  { value: 'activo', label: 'Activo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'pausado', label: 'Pausado', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'cancelado', label: 'Cancelado', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
];

const STATUS_CLS: Record<string, string> = {
  potencial: 'bg-blue-50 text-blue-700 border-blue-200',
  activo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  seguimiento: 'bg-amber-50 text-amber-700 border-amber-200',
  cerrado: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

function fmtMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024; if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function normalizePhone(value?: string | null) {
  return (value ?? '').replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^\d]/g, '');
}

function getContactRemoteJid(contact?: CRMContact | null) {
  return contact?.remoteJid || ((contact?.phone || '').includes('@') ? contact?.phone || null : null);
}

function normalizeCrmContact(raw: any): CRMContact {
  const remoteJid = raw.remoteJid || raw.chat?.remoteJid || ((raw.phone || '').includes('@') ? raw.phone : null);
  return {
    ...raw,
    id: raw.id ?? raw.contactId,
    phone: raw.phone ? normalizePhone(raw.phone) || raw.phone : remoteJid ? normalizePhone(remoteJid) : null,
    remoteJid,
    instanceId: raw.instanceId ?? raw.chat?.instanceId ?? raw.chat?.instance?.id ?? null,
    customerId: raw.customerId ?? null,
    instanceName: raw.instanceName ?? raw.chat?.instance?.instanceName ?? null,
    profilePicUrl: raw.profilePicUrl ?? raw.chat?.profilePicUrl ?? null,
    tags: raw.tags ?? raw.contactTags?.map((ct: any) => ct.tag) ?? [],
    customData: raw.customData ?? {},
  };
}

function mediaTitle(item: ChatMediaMessage) {
  return item.mediaCaption || item.text || item.mediaMimetype || 'Archivo';
}

function ChatVideoPlayer({ item }: { item: ChatMediaMessage }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || shouldLoad) return;
    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: '180px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldLoad]);

  const startPlayback = () => {
    setFailed(false);
    setAutoPlay(true);
    setShouldLoad(true);
  };

  return (
    <div ref={containerRef} className="relative h-full w-full bg-zinc-950">
      {failed ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-white">
          <AlertCircle className="h-6 w-6 text-amber-300" />
          <span className="text-xs">El navegador no pudo reproducir este video.</span>
          {item.mediaUrl && (
            <a href={item.mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-sky-300 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir video
            </a>
          )}
        </div>
      ) : shouldLoad && item.mediaUrl ? (
        <video
          key={item.mediaUrl}
          controls
          autoPlay={autoPlay}
          preload="metadata"
          playsInline
          className="h-full w-full bg-black object-contain"
          onError={() => setFailed(true)}
        >
          <source src={item.mediaUrl} type={(item.mediaMimetype || 'video/mp4').split(';')[0]} />
        </video>
      ) : (
        <button type="button" onClick={startPlayback} className="flex h-full w-full flex-col items-center justify-center gap-2 text-white" aria-label="Reproducir video">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
          <span className="text-xs font-semibold">Reproducir</span>
        </button>
      )}
    </div>
  );
}

interface ClientDetailProps {
  source: DetailSource;
  clients: ClientItem[];
  clientProducts: ClientProduct[];
  backgroundStyle: React.CSSProperties;
  onLocalSave: (item: ClientItem) => void;
  onLocalDelete: (id: string) => void;
  onProductsChange: (items: ClientProduct[]) => void;
  onConvertToLocal: (contact: CRMContact) => void;
  onBack: () => void;
}

export function ClientDetail({
  source, clients, clientProducts, backgroundStyle,
  onLocalSave, onLocalDelete, onProductsChange, onConvertToLocal, onBack
}: ClientDetailProps) {
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Local planner fields
  const initialContact = source.type === 'crm' ? source.contact : null;
  const localItem = source.type === 'local' ? source.item : clients.find((c) => c.phone === initialContact?.phone) ?? null;

  const [localName, setLocalName] = useState(localItem?.name ?? initialContact?.name ?? '');
  const [localPhone, setLocalPhone] = useState(localItem?.phone ?? initialContact?.phone ?? '');
  const [localStatus, setLocalStatus] = useState(localItem?.status ?? 'potencial');
  const [localNotes, setLocalNotes] = useState(localItem?.notes ?? '');
  const [localContacted, setLocalContacted] = useState(localItem?.contacted ?? false);
  const [localSaved, setLocalSaved] = useState(false);

  function saveLocal() {
    if (!localItem) return;
    onLocalSave({ ...localItem, name: localName.trim() || localItem.name, phone: localPhone.trim() || undefined, status: localStatus, notes: localNotes, contacted: localContacted });
    setLocalSaved(true); setTimeout(() => setLocalSaved(false), 1500);
  }

  // CRM state
  const [crmContact, setCrmContact] = useState<CRMContact | null>(source.type === 'crm' ? source.contact : null);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [crmName, setCrmName] = useState(initialContact?.name ?? '');
  const [crmNotes, setCrmNotes] = useState(initialContact?.notes ?? '');
  const [crmStageId, setCrmStageId] = useState<number | null>(initialContact?.funnelStage?.id ?? null);
  const [crmAgentId, setCrmAgentId] = useState<number | null>(initialContact?.assignedUser?.id ?? null);
  const [crmCustomData, setCrmCustomData] = useState<Record<string, any>>(initialContact?.customData ?? {});
  const [allTags, setAllTags] = useState<{ id: number; name: string; color: string }[]>([]);
  const [crmTagIds, setCrmTagIds] = useState<number[]>(initialContact?.tags?.map((t) => t.id) ?? []);
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [creatingTag, setCreatingTag] = useState(false);
  const [crmSaving, setCrmSaving] = useState(false);
  const [crmSaved, setCrmSaved] = useState(false);
  const [showNewField, setShowNewField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'boolean'>('text');
  const [creatingField, setCreatingField] = useState(false);

  // Activity
  const [customerActivity, setCustomerActivity] = useState<CustomerActivity | null>(null);
  const [customerActivityLoading, setCustomerActivityLoading] = useState(false);
  const [customerActionError, setCustomerActionError] = useState<string | null>(null);
  const [chatMedia, setChatMedia] = useState<CustomerChatMedia>({ images: [], videos: [], docs: [], audio: [] });
  const [chatMediaLoading, setChatMediaLoading] = useState(false);
  const [internalNoteDraft, setInternalNoteDraft] = useState('');
  const [savingInternalNote, setSavingInternalNote] = useState(false);
  const [uploadingCustomerFile, setUploadingCustomerFile] = useState(false);
  const [customerDropActive, setCustomerDropActive] = useState(false);
  const customerFileInputRef = useRef<HTMLInputElement>(null);

  function applyCrmContact(c: CRMContact) {
    const normalized = normalizeCrmContact(c);
    setCrmContact(normalized);
    setCrmName(normalized.name);
    setCrmNotes(normalized.notes ?? '');
    setCrmStageId(normalized.funnelStage?.id ?? null);
    setCrmAgentId(normalized.assignedUser?.id ?? null);
    setCrmCustomData(normalized.customData ?? {});
    setCrmTagIds(normalized.tags?.map((t) => t.id) ?? []);
  }

  function clearCrmContact() {
    setCrmContact(null);
    setCrmName('');
    setCrmNotes('');
    setCrmStageId(null);
    setCrmAgentId(null);
    setCrmCustomData({});
    setCrmTagIds([]);
  }

  useEffect(() => {
    async function loadSupporting() {
      try {
        const [stagesRes, fieldsRes, membersRes, tagsRes] = await Promise.all([
          fetch('/api/funnel-stages'),
          fetch('/api/custom-fields'),
          fetch('/api/team'),
          fetch('/api/tags'),
        ]);
        if (stagesRes.ok) setFunnelStages(await stagesRes.json());
        if (fieldsRes.ok) setCustomFields(await fieldsRes.json());
        if (membersRes.ok) {
          const td = await membersRes.json();
          setTeamMembers((td.teamMembers || []).map((m: any) => m.user));
        }
        if (tagsRes.ok) setAllTags(await tagsRes.json());
      } catch {}
    }
    loadSupporting();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCrmForSource() {
      setCrmError(null);
      setCustomerActivity(null);
      setCustomerActionError(null);
      setChatMedia({ images: [], videos: [], docs: [], audio: [] });

      const seedContact = source.type === 'crm' ? normalizeCrmContact(source.contact) : null;
      if (seedContact) applyCrmContact(seedContact);
      else clearCrmContact();

      const localPhoneDigits = source.type === 'local' ? normalizePhone(source.item.phone) : '';
      if (!seedContact && !localPhoneDigits) return;

      setCrmLoading(true);
      try {
        let contactId = seedContact?.id ?? null;

        if (!contactId && localPhoneDigits) {
          const listRes = await fetch('/api/contacts/list', { cache: 'no-store' });
          if (listRes.ok) {
            const contacts = await listRes.json();
            const match = Array.isArray(contacts)
              ? contacts.find((contact: CRMContact) => normalizePhone(contact.phone || contact.remoteJid) === localPhoneDigits)
              : null;
            if (match) contactId = match.id;
          }
        }

        if (!contactId) {
          if (!cancelled) setCrmError('No encontramos un contacto CRM vinculado a este teléfono.');
          return;
        }

        const contactRes = await fetch(`/api/contacts/${contactId}`, { cache: 'no-store' });
        if (!contactRes.ok) throw new Error('No se pudo cargar el contacto CRM completo.');
        const fullContact = normalizeCrmContact(await contactRes.json());
        if (!cancelled) applyCrmContact(fullContact);
      } catch (error: any) {
        if (!cancelled) setCrmError(error?.message || 'No se pudo cargar el CRM del sistema.');
      } finally {
        if (!cancelled) setCrmLoading(false);
      }
    }

    loadCrmForSource();
    return () => { cancelled = true; };
  }, [source]);

  useEffect(() => {
    if (crmContact?.customerId) {
      void refreshCustomerActivity(crmContact.customerId);
    } else {
      setCustomerActivity(null);
    }
  }, [crmContact?.customerId]);

  useEffect(() => {
    if (crmContact) {
      void refreshChatMedia(crmContact);
    }
  }, [crmContact?.id, crmContact?.remoteJid, crmContact?.phone]);

  async function refreshChatMedia(contact = crmContact) {
    const jid = getContactRemoteJid(contact);
    if (!jid) {
      setChatMedia({ images: [], videos: [], docs: [], audio: [], error: 'Este cliente no tiene chat vinculado para consultar archivos.' });
      return;
    }

    setChatMediaLoading(true);
    try {
      const fetchType = async (type: 'images' | 'videos' | 'docs' | 'audio') => {
        const res = await fetch(`/api/chats/media?jid=${encodeURIComponent(jid)}&type=${type}`, { cache: 'no-store' });
        if (!res.ok) return [];
        return await res.json();
      };

      const [images, videos, docs, audio] = await Promise.all([
        fetchType('images'),
        fetchType('videos'),
        fetchType('docs'),
        fetchType('audio'),
      ]);

      setChatMedia({ images, videos, docs, audio });
    } catch {
      setChatMedia({ images: [], videos: [], docs: [], audio: [], error: 'No se pudieron cargar los archivos enviados y recibidos.' });
    } finally {
      setChatMediaLoading(false);
    }
  }

  async function refreshCustomerActivity(customerId = crmContact?.customerId) {
    if (!customerId) return;
    setCustomerActivityLoading(true);
    setCustomerActionError(null);
    try {
      const res = await fetch(`/api/plugins/customers/${customerId}`);
      if (res.ok) {
        const data = await res.json();
        setCustomerActivity({
          internalNotes: Array.isArray(data.internalNotes)
            ? data.internalNotes
            : data.notes
              ? [{ id: `customer-${customerId}-notes`, text: data.notes, timestamp: data.updatedAt || data.createdAt }]
              : [],
          attachments: data.attachments || [],
        });
      } else {
        setCustomerActivity({ internalNotes: [], attachments: [], error: 'No se pudo cargar notas internas y adjuntos.' });
      }
    } catch {
      setCustomerActivity({ internalNotes: [], attachments: [], error: 'No se pudo cargar la actividad.' });
    } finally {
      setCustomerActivityLoading(false);
    }
  }

  async function saveInternalNote() {
    if (!crmContact?.customerId || !internalNoteDraft.trim()) return;
    setSavingInternalNote(true);
    setCustomerActionError(null);
    try {
      const res = await fetch(`/api/plugins/customers/${crmContact.customerId}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: internalNoteDraft.trim() })
      });
      if (!res.ok) throw new Error('No se pudo guardar la nota interna.');
      setInternalNoteDraft('');
      await refreshCustomerActivity(crmContact.customerId);
    } catch (error: any) {
      setCustomerActionError(error?.message || 'No se pudo guardar la nota interna.');
    } finally { setSavingInternalNote(false); }
  }

  async function uploadCustomerFiles(files: FileList | File[]) {
    if (!crmContact?.customerId) return;
    setUploadingCustomerFile(true);
    setCustomerActionError(null);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append('file', f);
        const res = await fetch(`/api/plugins/customers/${crmContact.customerId}/attachments`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`No se pudo subir ${f.name}.`);
      }
      await refreshCustomerActivity(crmContact.customerId);
    } catch (error: any) {
      setCustomerActionError(error?.message || 'No se pudieron subir los archivos.');
    } finally { setUploadingCustomerFile(false); }
  }

  async function saveCrm() {
    if (!crmContact) return;
    setCrmSaving(true);
    try {
      const res = await fetch(`/api/contacts/${crmContact.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: crmName, notes: crmNotes, funnelStageId: crmStageId, assignedUserId: crmAgentId, customData: crmCustomData, tagIds: crmTagIds })
      });
      if (!res.ok) throw new Error('No se pudo guardar el CRM.');
      const updatedStage = funnelStages.find(s => s.id === crmStageId) ?? null;
      const updatedAgent = teamMembers.find(m => m.id === crmAgentId) ?? null;
      const updatedTags = allTags.filter(t => crmTagIds.includes(t.id));
      setCrmContact(prev => prev ? { ...prev, name: crmName, notes: crmNotes, funnelStage: updatedStage, assignedUser: updatedAgent, customData: crmCustomData, tags: updatedTags } : null);
      setCrmSaved(true); setTimeout(() => setCrmSaved(false), 1400);
      setCrmError(null);
    } catch (error: any) {
      setCrmError(error?.message || 'No se pudo guardar el CRM.');
    } finally { setCrmSaving(false); }
  }

  async function createCustomField() {
    if (!newFieldName.trim()) return;
    setCreatingField(true);
    try {
      const res = await fetch('/api/custom-fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newFieldName.trim(), type: newFieldType }) });
      if (res.ok) { const f = await res.json(); setCustomFields(p => [...p, f]); setNewFieldName(''); setShowNewField(false); }
    } finally { setCreatingField(false); }
  }

  async function createTag() {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    try {
      const res = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }) });
      if (res.ok) { const tag = await res.json(); setAllTags(p => [...p, tag]); setCrmTagIds(p => [...p, tag.id]); setNewTagName(''); setShowNewTag(false); }
    } finally { setCreatingTag(false); }
  }

  // Products logic (local to this client)
  const clientIdKey = localItem?._recordId ?? `crm-${crmContact?.id}`;
  const myProducts = clientProducts.filter(p => p.clientId === clientIdKey);

  // add form
  const [pName, setPName] = useState(''); const [pCategory, setPCategory] = useState('website');
  const [pFrequency, setPFrequency] = useState('monthly'); const [pAmount, setPAmount] = useState('');
  const [pCurrency, setPCurrency] = useState('USD'); const [pStatus, setPStatus] = useState('activo');
  const [pStart, setPStart] = useState(new Date().toISOString().slice(0,10)); const [pNotes, setPNotes] = useState('');

  // edit form
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eCategory2, setECategory2] = useState('website');
  const [eFrequency2, setEFrequency2] = useState('monthly');
  const [eAmount, setEAmount] = useState('');
  const [eCurrency, setECurrency] = useState('USD');
  const [eStatus, setEStatus] = useState('activo');
  const [eStart, setEStart] = useState('');
  const [eNotes, setENotes] = useState('');

  function openEdit(p: ClientProduct) {
    setEditingProductId(p._recordId);
    setEName(p.name); setECategory2(p.category); setEFrequency2(p.frequency);
    setEAmount(String(p.amount)); setECurrency(p.currency); setEStatus(p.status);
    setEStart(p.startDate); setENotes(p.notes || '');
  }

  function saveEditProduct() {
    if (!editingProductId) return;
    onProductsChange(clientProducts.map(p => p._recordId === editingProductId ? {
      ...p, name: eName || p.name, category: eCategory2, frequency: eFrequency2 || p.frequency,
      amount: parseFloat(eAmount) || p.amount, currency: eCurrency, status: eStatus, startDate: eStart, notes: eNotes
    } : p));
    setEditingProductId(null);
  }

  function deleteProduct(id: string) {
    onProductsChange(clientProducts.filter(p => p._recordId !== id));
  }

  // Calculations for KPIs (early)
  const monthly = myProducts.filter(p => p.frequency === 'monthly' && p.status === 'activo').reduce((s, p) => s + p.amount, 0);
  const yearly = myProducts.filter(p => p.frequency === 'yearly' && p.status === 'activo').reduce((s, p) => s + p.amount, 0);
  const onetime = myProducts.filter(p => p.frequency === 'onetime' && p.status === 'activo').reduce((s, p) => s + p.amount, 0);
  const mrr = monthly + (yearly / 12);
  const arr = monthly * 12 + yearly;
  const primaryCurrency = myProducts[0]?.currency ?? 'USD';

  const displayName = localName || crmName || crmContact?.name || (source.type === 'local' ? source.item.name : source.contact.name);
  const displayPhone = normalizePhone(localPhone || crmContact?.phone || (source.type === 'crm' ? source.contact.phone : null)) || null;
  const displayPic = getSafeAvatarSrc(crmContact?.profilePicUrl || (source.type === 'crm' ? source.contact.profilePicUrl : null));

  const tier = mrr >= 2000 ? { label: 'Premium', cls: 'bg-yellow-400 text-yellow-900' } : mrr >= 500 ? { label: 'Activo', cls: 'bg-amber-300 text-amber-900' } : mrr > 0 ? { label: 'Básico', cls: 'bg-emerald-300 text-emerald-900' } : { label: 'Potencial', cls: 'bg-pink-200 text-pink-800' };

  function addProduct() {
    if (!pName.trim()) return;
    const id = Math.random().toString(36).slice(2) + Date.now();
    onProductsChange([...clientProducts, {
      _recordId: id, clientId: clientIdKey, name: pName.trim(), category: pCategory,
      frequency: pFrequency, amount: parseFloat(pAmount) || 0, currency: pCurrency,
      status: pStatus, startDate: pStart, notes: pNotes,
    }]);
    setShowAddProduct(false);
    setPName(''); setPAmount(''); setPNotes('');
  }

  // Estilos propios (sin heredar de .bw-content): superficie clara, legible en móvil y escritorio.
  const fieldCls = 'w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-200';
  const labelCls = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500';
  const cardCls = 'rounded-2xl border border-zinc-200 bg-white shadow-sm';

  const renderMediaDirection = (item: ChatMediaMessage) => (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.fromMe ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
      {item.fromMe ? 'Enviado' : 'Recibido'}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-zinc-100 text-zinc-900" style={backgroundStyle}>
      <div className="pointer-events-none absolute inset-0 bg-zinc-900/15 backdrop-blur-[2px]" />

      {/* Sticky header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur sm:px-5">
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50 active:scale-[0.98]">
          <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Volver a Clientes</span><span className="sm:hidden">Volver</span>
        </button>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {localItem && (
            <button onClick={() => { if (confirm('¿Eliminar este cliente del planner?')) { onLocalDelete(localItem._recordId); onBack(); } }} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Eliminar</span>
            </button>
          )}

          {crmContact && crmContact.remoteJid && (
            <a href={`/dashboard/chat/${encodeURIComponent(crmContact.remoteJid.split('@')[0])}${crmContact.instanceId ? `?instanceId=${crmContact.instanceId}` : ''}`} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-3.5 py-2 text-sm font-bold text-white shadow-md transition hover:brightness-105">
              <MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline">Abrir chat</span>
            </a>
          )}

          {crmContact && !localItem && (
            <button onClick={() => { if (crmContact?.phone) { onConvertToLocal(crmContact); alert('Agregado a Mis Clientes'); onBack(); } }} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2 text-sm font-bold text-white shadow-md">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Añadir a Mis Clientes</span><span className="sm:hidden">Añadir</span>
            </button>
          )}

          {crmContact ? (
            <button onClick={saveCrm} disabled={crmSaving} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white shadow transition ${crmSaved ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:brightness-105'}`}>
              {crmSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {crmSaved ? 'Guardado' : 'Guardar CRM'}
            </button>
          ) : localItem ? (
            <button onClick={saveLocal} className={`rounded-xl px-4 py-2 text-sm font-bold text-white shadow transition ${localSaved ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:brightness-105'}`}>
              {localSaved ? '✓ Guardado' : 'Guardar'}
            </button>
          ) : null}
        </div>
      </header>

      {/* Scrollable content */}
      <div className="relative z-[1] flex-1 overflow-y-auto">
        {/* Hero / profile band */}
        <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-6 text-white sm:px-8 sm:py-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="relative shrink-0">
                {displayPic ? (
                  <img src={displayPic} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-2xl ring-4 ring-white/20 sm:h-20 sm:w-20" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-500 text-2xl font-black shadow-2xl ring-4 ring-white/20 sm:h-20 sm:w-20 sm:text-3xl">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className={`absolute -bottom-1 -right-1 rounded-full px-2.5 py-px text-[10px] font-black tracking-wider shadow ${tier.cls}`}>{tier.label}</div>
              </div>

              <div className="min-w-0">
                <div className="truncate text-2xl font-black tracking-[-0.5px] sm:text-3xl">{displayName}</div>
                {displayPhone && <div className="mt-1 flex items-center gap-2 font-mono text-sm text-white/80"><Phone className="h-3.5 w-3.5" />{displayPhone}</div>}
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {crmContact?.funnelStage && <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium">{crmContact.funnelStage.emoji} {crmContact.funnelStage.name}</span>}
                  {crmContact?.assignedUser && <span className="rounded-full bg-white/15 px-2.5 py-0.5">👤 {crmContact.assignedUser.name}</span>}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="flex gap-3 text-sm">
              <div className="flex-1 rounded-2xl bg-white/10 px-4 py-2.5 text-center backdrop-blur sm:flex-none">
                <div className="text-[10px] uppercase tracking-widest text-white/60">MRR</div>
                <div className="text-lg font-black tabular-nums sm:text-xl">{fmtMoney(mrr, primaryCurrency)}</div>
              </div>
              <div className="flex-1 rounded-2xl bg-white/10 px-4 py-2.5 text-center backdrop-blur sm:flex-none">
                <div className="text-[10px] uppercase tracking-widest text-white/60">Servicios</div>
                <div className="text-lg font-black sm:text-xl">{myProducts.filter(p => p.status === 'activo').length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Left / main column */}
            <div className="space-y-5 lg:col-span-2">
              {/* Services */}
              <section className={`overflow-hidden ${cardCls}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-gradient-to-r from-rose-50 to-pink-50 px-4 py-3.5 sm:px-6">
                  <div className="flex items-center gap-2 font-bold text-rose-700">💼 Servicios y membresías <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-rose-500 shadow-sm">{myProducts.length}</span></div>
                  <button onClick={() => setShowAddProduct(!showAddProduct)} className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]">
                    {showAddProduct ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showAddProduct ? 'Cerrar' : 'Agregar'}
                  </button>
                </div>

                {showAddProduct && (
                  <div className="border-b border-zinc-100 bg-zinc-50/70 p-4 sm:p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2"><label className={labelCls}>Nombre del servicio</label><input value={pName} onChange={e=>setPName(e.target.value)} placeholder="Ej. Sitio web mensual" className={fieldCls} /></div>
                      <div><label className={labelCls}>Categoría</label><select value={pCategory} onChange={e=>setPCategory(e.target.value)} className={fieldCls}>{PRODUCT_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                      <div><label className={labelCls}>Frecuencia</label><select value={pFrequency} onChange={e=>setPFrequency(e.target.value)} className={fieldCls}>{PRODUCT_FREQUENCIES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelCls}>Monto</label><input value={pAmount} onChange={e=>setPAmount(e.target.value)} type="number" inputMode="decimal" placeholder="0.00" className={fieldCls} /></div>
                        <div><label className={labelCls}>Moneda</label><select value={pCurrency} onChange={e=>setPCurrency(e.target.value)} className={fieldCls}>{CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                      </div>
                      <div><label className={labelCls}>Estado</label><select value={pStatus} onChange={e=>setPStatus(e.target.value)} className={fieldCls}>{PRODUCT_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                      <div><label className={labelCls}>Inicio</label><input value={pStart} onChange={e=>setPStart(e.target.value)} type="date" className={fieldCls} /></div>
                      <div className="sm:col-span-2"><label className={labelCls}>Notas</label><textarea value={pNotes} onChange={e=>setPNotes(e.target.value)} rows={2} placeholder="Detalles del servicio" className={fieldCls} /></div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button onClick={() => setShowAddProduct(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancelar</button>
                      <button onClick={addProduct} disabled={!pName.trim()} className="rounded-xl bg-rose-600 px-6 py-2 text-sm font-bold text-white shadow disabled:opacity-40">Agregar servicio</button>
                    </div>
                  </div>
                )}

                {myProducts.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-zinc-400">Sin servicios registrados para este cliente.</div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {myProducts.map(p => editingProductId === p._recordId ? (
                      <div key={p._recordId} className="bg-zinc-50/70 p-4 sm:p-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="sm:col-span-2"><label className={labelCls}>Nombre</label><input value={eName} onChange={e=>setEName(e.target.value)} className={fieldCls} /></div>
                          <div><label className={labelCls}>Categoría</label><select value={eCategory2} onChange={e=>setECategory2(e.target.value)} className={fieldCls}>{PRODUCT_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                          <div><label className={labelCls}>Frecuencia</label><select value={eFrequency2} onChange={e=>setEFrequency2(e.target.value)} className={fieldCls}>{PRODUCT_FREQUENCIES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                          <div className="grid grid-cols-2 gap-3">
                            <div><label className={labelCls}>Monto</label><input value={eAmount} onChange={e=>setEAmount(e.target.value)} type="number" inputMode="decimal" className={fieldCls} /></div>
                            <div><label className={labelCls}>Moneda</label><select value={eCurrency} onChange={e=>setECurrency(e.target.value)} className={fieldCls}>{CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                          </div>
                          <div><label className={labelCls}>Estado</label><select value={eStatus} onChange={e=>setEStatus(e.target.value)} className={fieldCls}>{PRODUCT_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                          <div><label className={labelCls}>Inicio</label><input value={eStart} onChange={e=>setEStart(e.target.value)} type="date" className={fieldCls} /></div>
                          <div className="sm:col-span-2"><label className={labelCls}>Notas</label><textarea value={eNotes} onChange={e=>setENotes(e.target.value)} rows={2} className={fieldCls} /></div>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button onClick={() => setEditingProductId(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancelar</button>
                          <button onClick={saveEditProduct} className="rounded-xl bg-rose-600 px-6 py-2 text-sm font-bold text-white shadow">Guardar cambios</button>
                        </div>
                      </div>
                    ) : (
                      <div key={p._recordId} className="flex items-center gap-3 px-4 py-3.5 text-sm transition hover:bg-zinc-50 sm:px-6">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-zinc-900">{p.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                            <span>{PRODUCT_CATEGORIES.find(c=>c.value===p.category)?.label ?? p.category}</span>
                            <span>·</span>
                            <span>{PRODUCT_FREQUENCIES.find(f=>f.value===p.frequency)?.label ?? p.frequency}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${PRODUCT_STATUSES.find(s=>s.value===p.status)?.cls ?? 'border-zinc-200 text-zinc-500'}`}>{p.status}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-bold tabular-nums text-emerald-600">{fmtMoney(p.amount, p.currency)}</div>
                          <div className="text-[10px] text-zinc-400">{formatDate(p.startDate)}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button onClick={() => openEdit(p)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-500" title="Editar"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => deleteProduct(p._recordId)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-500" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Chat media (CRM) */}
              {crmContact && (
                <section className={`overflow-hidden ${cardCls}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-sky-50/70 px-4 py-3.5 sm:px-6">
                    <div className="flex items-center gap-2 font-bold text-sky-700">
                      <ImageIcon className="h-4 w-4" />
                      Archivos del chat
                      <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-sky-500 shadow-sm">
                        {chatMedia.images.length + chatMedia.videos.length + chatMedia.docs.length + chatMedia.audio.length}
                      </span>
                    </div>
                    <button onClick={() => refreshChatMedia()} disabled={chatMediaLoading} className="flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 shadow-sm hover:bg-sky-50 disabled:opacity-50">
                      <RefreshCw className={`h-3.5 w-3.5 ${chatMediaLoading ? 'animate-spin' : ''}`} /> Recargar
                    </button>
                  </div>

                  <div className="space-y-5 p-4 sm:p-6">
                    {chatMedia.error && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {chatMedia.error}
                      </div>
                    )}

                    {chatMediaLoading ? (
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-sky-200 py-8 text-sm font-medium text-sky-600">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Cargando media enviada y recibida…
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-800"><ImageIcon className="h-4 w-4 text-blue-500" /> Imágenes y videos</div>
                          {chatMedia.images.length + chatMedia.videos.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-zinc-200 py-5 text-center text-sm text-zinc-400">Sin imágenes ni videos en este chat.</div>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {[...chatMedia.images, ...chatMedia.videos].map((item) => (
                                <article key={item.id} className="group overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 transition hover:border-sky-300 hover:shadow-md">
                                  <div className="relative aspect-video bg-zinc-100">
                                    {item.mediaUrl && item.messageType === 'imageMessage' ? (
                                      <a href={item.mediaUrl} target="_blank" rel="noreferrer">
                                        <img src={item.mediaUrl} alt={mediaTitle(item)} className="h-full w-full object-cover" />
                                      </a>
                                    ) : item.mediaUrl && item.messageType === 'videoMessage' ? (
                                      <ChatVideoPlayer item={item} />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-white">
                                        <Video className="h-8 w-8 opacity-80" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="space-y-1 p-2.5">
                                    <div className="flex items-center justify-between gap-2">{renderMediaDirection(item)}<span className="text-[10px] text-zinc-400">{formatDateTime(item.timestamp)}</span></div>
                                    <div className="flex items-center gap-2">
                                      <div className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-600">{mediaTitle(item)}</div>
                                      {item.mediaUrl && (
                                        <a href={item.mediaUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[10px] font-semibold text-sky-600 hover:underline">Abrir</a>
                                      )}
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-800"><Mic className="h-4 w-4 text-emerald-500" /> Audios enviados y recibidos</div>
                          {chatMedia.audio.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-zinc-200 py-5 text-center text-sm text-zinc-400">Sin audios en este chat.</div>
                          ) : (
                            <div className="space-y-2">
                              {chatMedia.audio.map((item) => item.mediaUrl && (
                                <div key={item.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    {renderMediaDirection(item)}
                                    <span className="text-[10px] text-zinc-400">{formatDateTime(item.timestamp)}</span>
                                  </div>
                                  <CustomAudioPlayer src={item.mediaUrl} isMe={item.fromMe} />
                                  {item.mediaCaption && <div className="mt-1 text-xs text-zinc-500">{item.mediaCaption}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-800"><FileText className="h-4 w-4 text-zinc-500" /> Archivos del chat</div>
                          {chatMedia.docs.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-zinc-200 py-5 text-center text-sm text-zinc-400">Sin documentos en este chat.</div>
                          ) : (
                            <div className="grid gap-2">
                              {chatMedia.docs.map((item) => (
                                <a key={item.id} href={item.mediaUrl || '#'} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 text-sm transition hover:bg-zinc-50">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                                    <div className="min-w-0">
                                      <div className="truncate font-medium text-zinc-700">{mediaTitle(item)}</div>
                                      <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">{renderMediaDirection(item)}<span>{formatDateTime(item.timestamp)}</span></div>
                                    </div>
                                  </div>
                                  <Download className="h-4 w-4 shrink-0 text-zinc-400" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </section>
              )}

              {/* Internal notes + attachments (CRM) */}
              {crmContact && (
                <section className={`overflow-hidden ${cardCls}`}>
                  <div className="flex items-center gap-2 border-b border-zinc-100 bg-amber-50/60 px-4 py-3.5 sm:px-6">
                    <MessageSquareText className="h-4 w-4 text-amber-500" />
                    <span className="font-bold text-amber-700">Notas internas y archivos</span>
                    {customerActivityLoading && <RefreshCw className="h-4 w-4 animate-spin text-amber-500" />}
                  </div>

                  <div className="space-y-5 p-4 sm:p-6">
                    {!crmContact.customerId && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Vincula este contacto con un cliente del sistema para usar notas internas y adjuntos.
                      </div>
                    )}
                    {(customerActivity?.error || customerActionError) && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {customerActionError || customerActivity?.error}
                      </div>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input disabled={!crmContact.customerId} value={internalNoteDraft} onChange={e=>setInternalNoteDraft(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') saveInternalNote(); }} placeholder="Escribe una nota interna..." className={`flex-1 ${fieldCls}`} />
                      <button onClick={saveInternalNote} disabled={!crmContact.customerId || !internalNoteDraft.trim() || savingInternalNote} className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:brightness-105 disabled:opacity-40">Guardar nota</button>
                    </div>

                    <div className="space-y-2.5">
                      {(customerActivity?.internalNotes || []).map((note: CustomerInternalNote) => (
                        <div key={note.id} className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-sm">
                          <div className="mb-1 flex justify-between text-xs text-amber-600"><span className="font-semibold">{note.participantName || 'Nota'}</span><span>{formatDateTime(note.timestamp)}</span></div>
                          <p className="whitespace-pre-wrap text-amber-900/90">{note.text}</p>
                        </div>
                      ))}
                      {(!customerActivity?.internalNotes?.length) && <div className="py-3 text-center text-sm text-zinc-400">Sin notas internas aún.</div>}
                    </div>

                    <div>
                      <div onDrop={(e)=>{e.preventDefault(); setCustomerDropActive(false); if (crmContact.customerId) uploadCustomerFiles(e.dataTransfer.files); }} onDragOver={(e)=>{e.preventDefault(); if (crmContact.customerId) setCustomerDropActive(true);}} onDragLeave={()=>setCustomerDropActive(false)}
                        onClick={() => crmContact.customerId && customerFileInputRef.current?.click()}
                        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${crmContact.customerId ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'} ${customerDropActive ? 'border-rose-400 bg-rose-50/60' : 'border-zinc-300 hover:border-rose-300 hover:bg-rose-50/30'}`}>
                        {uploadingCustomerFile ? <RefreshCw className="mx-auto mb-2 h-7 w-7 animate-spin text-rose-400" /> : <UploadCloud className="mx-auto mb-2 h-7 w-7 text-rose-400" />}
                        <p className="text-sm font-medium text-zinc-600">{uploadingCustomerFile ? 'Subiendo…' : 'Arrastra o haz clic para subir archivos'}</p>
                        <input ref={customerFileInputRef} type="file" multiple disabled={!crmContact.customerId} className="hidden" onChange={e => e.target.files && uploadCustomerFiles(e.target.files)} />
                      </div>
                      <div className="mt-3 grid gap-2">
                        {(customerActivity?.attachments || []).map((f: CustomerAttachment) => (
                          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-sm transition hover:bg-zinc-50">
                            <div className="flex min-w-0 items-center gap-3">
                              {f.mimeType?.startsWith('image') ? <ImageIcon className="h-4 w-4 shrink-0 text-blue-500" /> : <FileText className="h-4 w-4 shrink-0 text-zinc-400" />}
                              <span className="truncate text-zinc-700">{f.fileName}</span>
                            </div>
                            <span className="shrink-0 text-xs text-zinc-400">{formatBytes(f.size)}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Right / sidebar column */}
            <div className="space-y-5">
              {!crmContact && (crmLoading || crmError) && (
                <section className={`${cardCls} p-4 sm:p-5`}>
                  <div className="mb-2 flex items-center gap-2 font-bold text-zinc-900">
                    {crmLoading ? <RefreshCw className="h-4 w-4 animate-spin text-rose-500" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                    CRM del sistema
                  </div>
                  <p className="text-sm text-zinc-500">
                    {crmLoading ? 'Buscando datos del CRM para este cliente…' : crmError}
                  </p>
                </section>
              )}

              {/* CRM data card */}
              {crmContact && (
                <section className={`${cardCls} p-4 sm:p-5`}>
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600"><SlidersHorizontal className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><div className="font-bold text-zinc-900">CRM del sistema</div><div className="text-xs text-zinc-500">Se guarda en el sistema central</div></div>
                    {crmLoading && <RefreshCw className="h-4 w-4 animate-spin text-rose-500" />}
                  </div>

                  <div className="space-y-3.5">
                    {crmError && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {crmError}
                      </div>
                    )}

                    <div><label className={labelCls}>Nombre</label><input value={crmName} onChange={e=>setCrmName(e.target.value)} className={fieldCls} placeholder="Nombre" /></div>

                    <div><label className={labelCls}>Etapa del embudo</label>
                      <select value={crmStageId ?? ''} onChange={e=>setCrmStageId(e.target.value ? Number(e.target.value) : null)} className={fieldCls}>
                        <option value="">Sin etapa</option>
                        {funnelStages.map(s => <option key={s.id} value={s.id}>{s.emoji ? `${s.emoji} ` : ''}{s.name}</option>)}
                      </select>
                    </div>

                    <div><label className={labelCls}>Agente asignado</label>
                      <select value={crmAgentId ?? ''} onChange={e=>setCrmAgentId(e.target.value ? Number(e.target.value) : null)} className={fieldCls}>
                        <option value="">Sin asignar</option>
                        {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>

                    <div><label className={labelCls}>Notas</label><textarea value={crmNotes} onChange={e=>setCrmNotes(e.target.value)} rows={3} className={fieldCls} placeholder="Notas del contacto" /></div>

                    {/* Tags */}
                    <div>
                      <label className={`${labelCls} flex items-center gap-1.5`}><TagIcon className="h-3 w-3" /> Etiquetas</label>
                      <div className="flex flex-wrap gap-1.5">
                        {allTags.map(tag => {
                          const active = crmTagIds.includes(tag.id);
                          return (
                            <button key={tag.id} type="button"
                              onClick={() => setCrmTagIds(prev => prev.includes(tag.id) ? prev.filter(x=>x!==tag.id) : [...prev, tag.id])}
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${active ? 'text-white shadow-sm' : 'bg-white text-zinc-600 hover:bg-zinc-50'}`}
                              style={active ? { backgroundColor: tag.color, borderColor: tag.color } : { borderColor: tag.color }}>
                              {tag.name}
                            </button>
                          );
                        })}
                        <button type="button" onClick={() => setShowNewTag(v=>!v)} className="rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-50">+ Nueva</button>
                      </div>
                      {showNewTag && (
                        <div className="mt-2 flex items-center gap-2">
                          <input value={newTagName} onChange={e=>setNewTagName(e.target.value)} placeholder="Nombre" className={`flex-1 ${fieldCls}`} />
                          <input value={newTagColor} onChange={e=>setNewTagColor(e.target.value)} type="color" className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-zinc-300" />
                          <button onClick={createTag} disabled={!newTagName.trim() || creatingTag} className="shrink-0 rounded-xl bg-zinc-900 px-3.5 py-2.5 text-sm font-bold text-white disabled:opacity-40">Crear</button>
                        </div>
                      )}
                    </div>

                    {/* Custom fields */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className={labelCls}>Campos personalizados</span>
                        <button type="button" onClick={() => setShowNewField(v=>!v)} className="text-xs font-bold text-rose-600 hover:underline">+ Campo</button>
                      </div>
                      {showNewField && (
                        <div className="mb-2 flex items-center gap-2">
                          <input value={newFieldName} onChange={e=>setNewFieldName(e.target.value)} placeholder="Nombre del campo" className={`flex-1 ${fieldCls}`} />
                          <select value={newFieldType} onChange={e=>setNewFieldType(e.target.value as 'text' | 'boolean')} className="shrink-0 rounded-xl border border-zinc-300 bg-white px-2 py-2.5 text-sm">
                            <option value="text">Texto</option><option value="boolean">Sí/No</option>
                          </select>
                          <button onClick={createCustomField} disabled={!newFieldName.trim() || creatingField} className="shrink-0 rounded-xl bg-zinc-900 px-3.5 py-2.5 text-sm font-bold text-white disabled:opacity-40">Crear</button>
                        </div>
                      )}
                      <div className="space-y-2">
                        {customFields.map(f => (
                          <div key={f.id} className="flex items-center gap-2.5">
                            <span className="w-28 shrink-0 truncate text-xs font-medium text-zinc-500" title={f.name}>{f.name}</span>
                            {f.type === 'boolean' ? (
                              <input type="checkbox" checked={!!crmCustomData[f.key]} onChange={e=>setCrmCustomData(prev=>({ ...prev, [f.key]: e.target.checked }))} className="h-5 w-5 cursor-pointer rounded border-zinc-300 text-rose-500 focus:ring-rose-300" />
                            ) : (
                              <input value={crmCustomData[f.key] ?? ''} onChange={e=>setCrmCustomData(prev=>({ ...prev, [f.key]: e.target.value }))} className={`flex-1 ${fieldCls}`} />
                            )}
                          </div>
                        ))}
                        {customFields.length === 0 && <div className="text-xs text-zinc-400">Sin campos personalizados.</div>}
                      </div>
                    </div>

                    <button onClick={saveCrm} disabled={crmSaving} className={`w-full rounded-xl py-2.5 text-sm font-bold text-white shadow transition ${crmSaved ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:brightness-105'}`}>
                      {crmSaved ? '✓ Guardado' : crmSaving ? 'Guardando…' : 'Guardar CRM'}
                    </button>
                  </div>
                </section>
              )}

              {/* Planner local data card */}
              {localItem && (
                <section className={`${cardCls} p-4 sm:p-5`}>
                  <div className="mb-4 font-bold text-rose-700">Datos del planner</div>
                  <div className="space-y-3.5">
                    <div><label className={labelCls}>Nombre</label><input value={localName} onChange={e=>setLocalName(e.target.value)} className={fieldCls} placeholder="Nombre" /></div>
                    <div><label className={labelCls}>Teléfono</label><input value={localPhone} onChange={e=>setLocalPhone(e.target.value)} className={fieldCls} placeholder="Teléfono" /></div>
                    <div><label className={labelCls}>Estado</label>
                      <select value={localStatus} onChange={e=>setLocalStatus(e.target.value)} className={fieldCls}>
                        <option value="potencial">Potencial</option><option value="activo">Activo</option><option value="seguimiento">Seguimiento</option><option value="cerrado">Cerrado</option>
                      </select>
                    </div>
                    <div><label className={labelCls}>Notas</label><textarea value={localNotes} onChange={e=>setLocalNotes(e.target.value)} rows={4} className={fieldCls} placeholder="Notas" /></div>
                    <button onClick={saveLocal} className={`w-full rounded-xl py-2.5 text-sm font-bold text-white shadow transition ${localSaved ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:brightness-105'}`}>
                      {localSaved ? '✓ Guardado' : 'Guardar datos locales'}
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
