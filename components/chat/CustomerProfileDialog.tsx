'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe2,
  Loader2,
  Mail,
  MessageSquareText,
  Paperclip,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'sonner';

import {
  isRadarNoteText,
  isRadarTaskTitle,
  radarNoteBody,
  radarNoteHeadline,
  radarTaskTitle,
} from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { Message } from '@/lib/db/schema';
import type { CustomerDetailData } from '@/lib/plugins/customers/ui/types';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { TagPill, type ContactTag } from './ContactTagsEditor';
import { ConvertLeadActions } from './ConvertLeadActions';
import { formatMoney as formatMoneySeguro, formatMoneyFromCents } from '@/lib/format/money';

type CustomField = { id: number; name: string; key: string; type: 'text' | 'boolean' };
type ContactTask = { id: number; title: string; notes: string; status: string; dueDate: string | null; createdAt: string };
type TasksResponse = { enabled: boolean; contactId: number | null; tasks: ContactTask[] };

export type ProfileContact = {
  id: number;
  name: string;
  notes: string | null;
  customData?: Record<string, unknown>;
  tags: ContactTag[];
  assignedUser: { id: number; name: string | null; email: string } | null;
  assignedDepartment: { id: number; name: string } | null;
  funnelStage: { id: number; name: string; emoji: string; order: number } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type CustomerProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ProfileContact;
  chatId?: number | null;
  remoteJid: string;
  instanceId: string | null;
  profilePicUrl?: string | null;
  customFields: CustomField[];
  onContactChange: (patch: Partial<ProfileContact>) => void;
};

async function jsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'server_error');
  return payload as T;
}

function Section({ title, icon, action, children, className }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card', className)}>
      <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-3">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">{icon}<span className="truncate">{title}</span></h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">{icon}<p>{text}</p></div>;
}

export function CustomerProfileDialog({
  open,
  onOpenChange,
  contact,
  chatId,
  remoteJid,
  instanceId,
  profilePicUrl,
  customFields,
  onContactChange,
}: CustomerProfileDialogProps) {
  const t = useTranslations('CustomerProfile');
  const locale = useLocale();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState(contact.notes || '');
  const [customData, setCustomData] = useState<Record<string, unknown>>(contact.customData || {});
  const [internalNote, setInternalNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [saving, setSaving] = useState<'note' | 'fields' | 'internal' | 'task' | 'upload' | number | null>(null);

  useEffect(() => {
    setNote(contact.notes || '');
    setCustomData(contact.customData || {});
  }, [contact.id, contact.notes, contact.customData]);

  const customerLinkKey = open ? `/api/plugins/customers/by-contact?contactId=${contact.id}` : null;
  const { data: customerLink, error: customerLinkError, isLoading: customerLinkLoading } = useSWR<{ customerId: number | null }>(customerLinkKey, jsonFetcher);
  const customerKey = customerLink?.customerId ? `/api/plugins/customers/${customerLink.customerId}` : null;
  const { data: customer, error: customerError, isLoading: customerLoading, mutate: mutateCustomer } = useSWR<CustomerDetailData>(customerKey, jsonFetcher);
  const messagesKey = open && chatId ? `/api/messages?chatId=${chatId}&limit=100` : null;
  const { data: messages = [], error: messagesError, mutate: mutateMessages } = useSWR<Message[]>(messagesKey, jsonFetcher);
  const tasksKey = open && chatId ? `/api/chats/${chatId}/tasks` : null;
  const { data: tasksData, error: tasksError, mutate: mutateTasks } = useSWR<TasksResponse>(tasksKey, jsonFetcher);
  const docsKey = open
    ? `/api/chats/media?jid=${encodeURIComponent(remoteJid)}&type=docs${instanceId ? `&instanceId=${encodeURIComponent(instanceId)}` : ''}`
    : null;
  const { data: conversationFiles = [], error: docsError } = useSWR<Message[]>(docsKey, jsonFetcher);

  const internalNotes = useMemo(
    () => messages.filter((message) => message.isInternal && message.messageType !== 'task').sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [messages],
  );
  const tasks = tasksData?.tasks || [];
  const activeMembership = customer?.subscriptions.find((subscription) => subscription.status === 'active') || null;
  const pendingTasks = tasks.filter((task) => task.status !== 'done').length;
  const totalFiles = conversationFiles.length + (customer?.attachments.length || 0);
  const phone = remoteJid.split('@')[0];

  const formatDate = (value?: string | null) => value
    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
    : t('no_value');
  const formatMoney = (amount: string | number | null | undefined, currency = 'USD', cents = false) => {
    const numeric = Number(amount || 0) / (cents ? 100 : 1);
    // La moneda puede venir de `team_customer_transactions`, donde el sync de
    // AAPP dejó nombres de acción en vez de códigos ISO. `|| 'USD'` no protege:
    // esos strings son truthy y hacían reventar el diálogo entero.
    return formatMoneySeguro(numeric, currency, { locale, maximumFractionDigits: 2 });
  };

  const saveContact = async (body: Record<string, unknown>, kind: 'note' | 'fields') => {
    setSaving(kind);
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      onContactChange(body as Partial<ProfileContact>);
      toast.success(t('saved'));
    } catch {
      toast.error(t('save_error'));
    } finally {
      setSaving(null);
    }
  };

  const addInternalNote = async () => {
    if (!internalNote.trim()) return;
    setSaving('internal');
    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientJid: remoteJid, text: internalNote.trim(), isInternal: true, instanceId }),
      });
      if (!response.ok) throw new Error();
      setInternalNote('');
      await mutateMessages();
      toast.success(t('internal_note_added'));
    } catch {
      toast.error(t('save_error'));
    } finally {
      setSaving(null);
    }
  };

  const addTask = async () => {
    if (!taskTitle.trim() || !tasksKey) return;
    setSaving('task');
    try {
      const response = await fetch(tasksKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: taskTitle.trim() }),
      });
      if (!response.ok) throw new Error();
      setTaskTitle('');
      await Promise.all([mutateTasks(), mutateMessages()]);
      toast.success(t('task_added'));
    } catch {
      toast.error(t('save_error'));
    } finally {
      setSaving(null);
    }
  };

  const toggleTask = async (task: ContactTask) => {
    if (!tasksKey) return;
    setSaving(task.id);
    try {
      const response = await fetch(tasksKey, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, status: task.status === 'done' ? 'open' : 'done' }),
      });
      if (!response.ok) throw new Error();
      await Promise.all([mutateTasks(), mutateMessages()]);
    } catch {
      toast.error(t('save_error'));
    } finally {
      setSaving(null);
    }
  };

  const uploadFile = async (file?: File) => {
    if (!file || !customer?.id) return;
    setSaving('upload');
    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(`/api/plugins/customers/${customer.id}/attachments`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error();
      await mutateCustomer();
      toast.success(t('file_uploaded'));
    } catch {
      toast.error(t('save_error'));
    } finally {
      setSaving(null);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[96dvh] max-h-[96dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1440px)] lg:max-w-[min(96vw,1440px)]">
        <DialogHeader className="border-b bg-card px-5 py-4 pr-14 text-left sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-12 shrink-0 border">
              <AvatarImage src={profilePicUrl || undefined} alt={contact.name} />
              <AvatarFallback className="bg-primary/10 font-semibold text-primary">{contact.name.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-xl">{contact.name}</DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1"><Phone className="size-3.5" />+{phone}</span>
                {customer?.email && <span className="flex items-center gap-1"><Mail className="size-3.5" />{customer.email}</span>}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ConvertLeadActions
                contactId={contact.id}
                contactName={contact.name}
                isCustomer={Boolean(customerLink?.customerId)}
                onConverted={() => { void mutateCustomer(); }}
              />
              <Badge variant="outline" className={cn('hidden shrink-0 sm:inline-flex', customer ? 'border-primary/25 bg-primary/10 text-primary' : '')}>
                {customer ? t('customer_label') : t('contact_label')}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6">
          <div className="mx-auto grid max-w-[1360px] gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(24rem,.9fr)]">
            <div className="space-y-5">
              <Section
                title={t('main_note_title')}
                icon={<MessageSquareText className="size-4 text-primary" />}
                action={note !== (contact.notes || '') ? (
                  <Button size="sm" onClick={() => void saveContact({ notes: note }, 'note')} disabled={saving === 'note'}>
                    {saving === 'note' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}{t('save')}
                  </Button>
                ) : undefined}
                className="border-primary/20 shadow-sm"
              >
                <p className="mb-3 text-xs leading-5 text-muted-foreground">{t('main_note_description')}</p>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('main_note_placeholder')} className="min-h-40 resize-y bg-background text-sm leading-6" />
              </Section>

              <Section
                title={t('custom_fields_title')}
                icon={<ClipboardList className="size-4 text-primary" />}
                action={customFields.length ? (
                  <Button variant="outline" size="sm" onClick={() => void saveContact({ customData }, 'fields')} disabled={saving === 'fields'}>
                    {saving === 'fields' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}{t('save')}
                  </Button>
                ) : undefined}
              >
                {customFields.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {customFields.map((field) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={`profile-field-${field.id}`}>{field.name}</Label>
                        {field.type === 'boolean' ? (
                          <div className="flex min-h-10 items-center gap-3 rounded-lg border bg-background px-3">
                            <Switch id={`profile-field-${field.id}`} checked={Boolean(customData[field.key])} onCheckedChange={(checked) => setCustomData((current) => ({ ...current, [field.key]: checked }))} />
                            <span className="text-sm">{customData[field.key] ? t('yes') : t('no')}</span>
                          </div>
                        ) : (
                          <Input id={`profile-field-${field.id}`} value={String(customData[field.key] ?? '')} onChange={(event) => setCustomData((current) => ({ ...current, [field.key]: event.target.value }))} />
                        )}
                      </div>
                    ))}
                  </div>
                ) : <EmptyState icon={<ClipboardList className="size-6" />} text={t('custom_fields_empty')} />}
              </Section>

              <Section title={t('situation_title')} icon={<BriefcaseBusiness className="size-4 text-primary" />}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{t('funnel')}</p><p className="mt-1 text-sm font-medium">{contact.funnelStage ? `${contact.funnelStage.emoji} ${contact.funnelStage.name}` : t('unassigned')}</p></div>
                  <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{t('assigned_agent')}</p><p className="mt-1 truncate text-sm font-medium">{contact.assignedUser?.name || contact.assignedUser?.email || t('unassigned')}</p></div>
                  <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{t('department')}</p><p className="mt-1 truncate text-sm font-medium">{contact.assignedDepartment?.name || t('unassigned')}</p></div>
                  <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{t('record_since')}</p><p className="mt-1 text-sm font-medium">{formatDate(contact.createdAt)}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contact.tags.length ? contact.tags.map((tag) => <TagPill key={tag.id} tag={tag} />) : <span className="text-sm text-muted-foreground">{t('tags_empty')}</span>}
                </div>
              </Section>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-3 divide-x rounded-xl border bg-card shadow-sm">
                <div className="p-3 text-center"><p className="text-xl font-semibold tabular-nums">{pendingTasks}</p><p className="text-[11px] text-muted-foreground">{t('pending_tasks')}</p></div>
                <div className="p-3 text-center"><p className="text-xl font-semibold tabular-nums">{internalNotes.length}</p><p className="text-[11px] text-muted-foreground">{t('internal_notes')}</p></div>
                <div className="p-3 text-center"><p className="text-xl font-semibold tabular-nums">{totalFiles}</p><p className="text-[11px] text-muted-foreground">{t('files')}</p></div>
              </div>

              <Tabs defaultValue="activity" className="space-y-4">
                <TabsList className="grid h-auto w-full grid-cols-3">
                  <TabsTrigger value="activity" className="min-h-10">{t('activity_tab')}</TabsTrigger>
                  <TabsTrigger value="files" className="min-h-10">{t('files_tab')}</TabsTrigger>
                  <TabsTrigger value="customer" className="min-h-10">{t('customer_tab')}</TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="space-y-5">
                  <Section title={t('internal_notes_title')} icon={<MessageSquareText className="size-4 text-primary" />}>
                    <div className="mb-4 flex gap-2">
                      <Textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder={t('internal_note_placeholder')} className="min-h-20 resize-none" />
                      <Button size="icon" className="size-10 shrink-0 self-end" onClick={() => void addInternalNote()} disabled={!internalNote.trim() || saving === 'internal'} aria-label={t('add_internal_note')}>
                        {saving === 'internal' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      </Button>
                    </div>
                    {messagesError ? <EmptyState icon={<RefreshCw className="size-6" />} text={t('load_error')} /> : internalNotes.length ? (
                      <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
                        {internalNotes.map((message) => {
                          const esRadar = isRadarNoteText(message.text);
                          return (
                            <li key={message.id} className={cn('rounded-lg border-l-2 bg-muted/30 p-3', esRadar ? 'border-indigo-500' : 'border-primary')}>
                              {esRadar && (
                                <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                  <RadarTag label="Radar" />
                                  <span className="min-w-0 break-words text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                                    {radarNoteHeadline(message.text)}
                                  </span>
                                </div>
                              )}
                              <p className="whitespace-pre-wrap break-words text-sm leading-5">
                                {esRadar ? radarNoteBody(message.text) : message.text}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">{formatDate(String(message.timestamp))}</p>
                            </li>
                          );
                        })}
                      </ul>
                    ) : <EmptyState icon={<MessageSquareText className="size-6" />} text={t('internal_notes_empty')} />}
                  </Section>

                  <Section title={t('tasks_title')} icon={<CheckCircle2 className="size-4 text-primary" />}>
                    <div className="mb-4 flex gap-2"><Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder={t('task_placeholder')} onKeyDown={(event) => { if (event.key === 'Enter') void addTask(); }} /><Button size="icon" className="size-10 shrink-0" onClick={() => void addTask()} disabled={!taskTitle.trim() || saving === 'task'} aria-label={t('add_task')}>{saving === 'task' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}</Button></div>
                    {tasksError ? <EmptyState icon={<ClipboardList className="size-6" />} text={t('tasks_unavailable')} /> : tasks.length ? <ul className="divide-y">{tasks.map((task) => <li key={task.id} className="flex items-start gap-3 py-3"><Checkbox checked={task.status === 'done'} onCheckedChange={() => void toggleTask(task)} disabled={saving === task.id} aria-label={t(task.status === 'done' ? 'reopen_task' : 'complete_task')} className="mt-0.5" /><div className="min-w-0"><p className={cn('flex min-w-0 items-center gap-1.5 break-words text-sm font-medium', task.status === 'done' && 'text-muted-foreground line-through')}>{isRadarTaskTitle(task.title) && <RadarTag size="xs" />}<span className="min-w-0 break-words">{radarTaskTitle(task.title)}</span></p>{task.dueDate && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3" />{formatDate(task.dueDate)}</p>}</div></li>)}</ul> : <EmptyState icon={<CheckCircle2 className="size-6" />} text={t('tasks_empty')} />}
                  </Section>
                </TabsContent>

                <TabsContent value="files" className="space-y-5">
                  <Section title={t('customer_files_title')} icon={<FolderOpen className="size-4 text-primary" />} action={customer ? <><input ref={uploadRef} type="file" className="sr-only" onChange={(event) => void uploadFile(event.target.files?.[0])} /><Button variant="outline" size="sm" onClick={() => uploadRef.current?.click()} disabled={saving === 'upload'}>{saving === 'upload' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}{t('upload_file')}</Button></> : undefined}>
                    {customer?.attachments.length ? <ul className="divide-y">{customer.attachments.map((file) => <li key={file.id}><a href={file.url} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 py-2 text-sm hover:text-primary"><FileText className="size-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.fileName}</span><ExternalLink className="size-4 shrink-0" /></a></li>)}</ul> : <EmptyState icon={<Upload className="size-6" />} text={customer ? t('customer_files_empty') : t('link_customer_for_files')} />}
                  </Section>
                  <Section title={t('conversation_files_title')} icon={<Paperclip className="size-4 text-primary" />}>
                    {docsError ? <EmptyState icon={<Paperclip className="size-6" />} text={t('load_error')} /> : conversationFiles.length ? <ul className="divide-y">{conversationFiles.map((file) => <li key={file.id}><a href={file.mediaUrl || '#'} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 py-2 text-sm hover:text-primary"><FileText className="size-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.text || t('file_fallback')}</span><ExternalLink className="size-4 shrink-0" /></a></li>)}</ul> : <EmptyState icon={<Paperclip className="size-6" />} text={t('conversation_files_empty')} />}
                  </Section>
                </TabsContent>

                <TabsContent value="customer" className="space-y-5">
                  {customerLinkLoading || customerLoading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-7 animate-spin text-primary" /></div> : customerLinkError || customerError ? <EmptyState icon={<Users className="size-6" />} text={t('customer_unavailable')} /> : !customer ? <EmptyState icon={<UserRound className="size-6" />} text={t('not_linked_customer')} /> : <>
                    <Section title={t('membership_title')} icon={<BriefcaseBusiness className="size-4 text-primary" />} action={<Button asChild variant="outline" size="sm"><Link href={`/plugins/customers/${customer.id}`}>{t('open_customer')}<ExternalLink className="ml-2 size-3.5" /></Link></Button>}>
                      {activeMembership ? <div className="space-y-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{activeMembership.planName || activeMembership.subscriptionNumber}</p><p className="mt-1 text-sm text-muted-foreground">{activeMembership.subscriptionNumber}</p></div><Badge className="bg-primary/10 text-primary hover:bg-primary/10">{t('active')}</Badge></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t('price')}</p><p className="mt-1 font-medium">{formatMoney(activeMembership.price, activeMembership.currency, true)}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t('expires')}</p><p className="mt-1 font-medium">{formatDate(activeMembership.endDate)}</p></div></div></div> : <EmptyState icon={<BriefcaseBusiness className="size-6" />} text={t('no_active_membership')} />}
                    </Section>
                    <Section title={t('payment_history_title')} icon={<CircleDollarSign className="size-4 text-primary" />}>
                      {customer.transactions.length ? <ul className="divide-y">{customer.transactions.slice(0, 8).map((payment) => <li key={payment.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{payment.gateway || t('payment')}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(payment.transactionDate)}</p></div><div className="text-right"><p className="text-sm font-semibold">{formatMoney(payment.amount, payment.currency || 'USD')}</p><p className="mt-1 text-xs text-muted-foreground">{payment.paymentStatus || t('no_value')}</p></div></li>)}</ul> : <EmptyState icon={<CircleDollarSign className="size-6" />} text={t('payment_history_empty')} />}
                    </Section>
                    <Section title={t('sites_title')} icon={<Globe2 className="size-4 text-primary" />}>
                      {customer.stores.length ? <ul className="space-y-2">{customer.stores.map((site) => <li key={site.id} className="rounded-lg border bg-background p-3"><a href={site.url || undefined} target="_blank" rel="noreferrer" className={cn('flex items-center justify-between gap-3 text-sm font-medium', site.url && 'hover:text-primary')}><span className="truncate">{site.title || t('site_fallback')}</span>{site.url && <ExternalLink className="size-4 shrink-0" />}</a>{site.status && <p className="mt-1 text-xs text-muted-foreground">{site.status}</p>}</li>)}</ul> : <EmptyState icon={<Globe2 className="size-6" />} text={t('sites_empty')} />}
                    </Section>
                  </>}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
