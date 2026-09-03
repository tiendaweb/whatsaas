'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Globe2,
  Hash,
  Link2,
  ListTodo,
  Loader2,
  Mail,
  MessageCircle,
  Paperclip,
  Phone,
  RefreshCw,
  Save,
  Trash2,
  Unlink,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link, useRouter } from '@/i18n/routing';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CustomerDetailData } from './types';

type ContactOption = { id: number; name: string; phone: string | null };
type PendingAction =
  | 'notes'
  | 'contact'
  | 'task'
  | 'attachment'
  | 'delete'
  | `unlink-contact-${number}`
  | null;

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
};

function initials(name: string) {
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

export function CustomerDetail({ customerId }: { customerId: number }) {
  const t = useTranslations('CustomerDetail');
  const locale = useLocale();
  const router = useRouter();
  const { data, error, mutate, isValidating } = useSWR<CustomerDetailData>(
    `/api/plugins/customers/${customerId}`,
    fetcher,
  );
  const { data: contactOptions = [] } = useSWR<ContactOption[]>(
    '/api/contacts/list',
    fetcher,
  );
  const [contactId, setContactId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }),
    [locale],
  );

  function formatDate(value: string | null, dateOnly = false) {
    if (!value) return t('not_available');
    const date = new Date(dateOnly ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? t('not_available') : dateFormatter.format(date);
  }

  function formatMoney(value: number | string | null, currency: string | null, cents = false) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return value ? `${value} ${currency ?? ''}`.trim() : t('not_available');
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
      }).format(cents ? amount / 100 : amount);
    } catch {
      return `${cents ? amount / 100 : amount} ${currency ?? ''}`.trim();
    }
  }

  function statusLabel(status: string | null) {
    if (!status) return t('status_unknown');
    const labels: Record<string, string> = {
      active: t('status_active'),
      inactive: t('status_inactive'),
      archived: t('status_archived'),
      pending: t('status_pending'),
      paid: t('status_paid'),
      overdue: t('status_overdue'),
      expired: t('status_expired'),
      cancelled: t('status_cancelled'),
      canceled: t('status_cancelled'),
      completed: t('status_completed'),
      approved: t('status_approved'),
      rejected: t('status_rejected'),
    };
    return labels[status.toLowerCase()] ?? status;
  }

  function statusVariant(status: string | null): 'default' | 'secondary' | 'outline' | 'destructive' {
    if (!status) return 'outline';
    const normalized = status.toLowerCase();
    if (['active', 'paid', 'completed', 'approved'].includes(normalized)) return 'default';
    if (['overdue', 'expired', 'cancelled', 'canceled', 'rejected'].includes(normalized)) {
      return 'destructive';
    }
    if (['pending', 'inactive'].includes(normalized)) return 'secondary';
    return 'outline';
  }

  async function patch(body: unknown) {
    setPendingAction('notes');
    try {
      const response = await fetch(`/api/plugins/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      toast.success(t('save_success'));
      setNotesDraft(null);
      await mutate();
    } catch {
      toast.error(t('save_error'));
    } finally {
      setPendingAction(null);
    }
  }

  async function linkContact() {
    if (!contactId) return;
    setPendingAction('contact');
    try {
      const response = await fetch(`/api/plugins/customers/${customerId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: Number(contactId) }),
      });
      if (!response.ok) throw new Error();
      setContactId('');
      toast.success(t('contact_linked'));
      await mutate();
    } catch {
      toast.error(t('contact_link_error'));
    } finally {
      setPendingAction(null);
    }
  }

  async function unlinkContact(id: number) {
    setPendingAction(`unlink-contact-${id}`);
    try {
      const response = await fetch(
        `/api/plugins/customers/${customerId}/contacts?contactId=${id}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error();
      toast.success(t('contact_unlinked'));
      await mutate();
    } catch {
      toast.error(t('contact_unlink_error'));
    } finally {
      setPendingAction(null);
    }
  }

  async function linkTask() {
    if (!taskId) return;
    setPendingAction('task');
    try {
      const response = await fetch(`/api/plugins/customers/${customerId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: Number(taskId) }),
      });
      if (!response.ok) throw new Error();
      setTaskId('');
      toast.success(t('task_linked'));
      await mutate();
    } catch {
      toast.error(t('task_link_error'));
    } finally {
      setPendingAction(null);
    }
  }

  async function upload(file: File) {
    setPendingAction('attachment');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch(`/api/plugins/customers/${customerId}/attachments`, {
        method: 'POST',
        body: form,
      });
      if (!response.ok) throw new Error();
      toast.success(t('attachment_uploaded'));
      await mutate();
    } catch {
      toast.error(t('attachment_error'));
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteCustomer() {
    setPendingAction('delete');
    try {
      const response = await fetch(`/api/plugins/customers/${customerId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      toast.success(t('delete_success'));
      router.push('/plugins/customers');
    } catch {
      toast.error(t('delete_error'));
      setPendingAction(null);
    }
  }

  if (error) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <UserRound className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">{t('error_title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('error_description')}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void mutate()}>
            <RefreshCw className="h-4 w-4" />
            {t('retry_button')}
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return <CustomerDetailLoading loadingLabel={t('loading')} />;

  const currentNotes = notesDraft ?? data.notes;
  const notesDirty = notesDraft !== null && notesDraft !== data.notes;
  const availableContacts = contactOptions.filter(
    (contact) => !data.contacts.some((linked) => linked.id === contact.id),
  );
  const primaryContact = data.contacts[0];
  const primaryStore = data.stores.find((store) => Boolean(store.url));
  const activeMemberships = data.subscriptions.filter(
    (subscription) => subscription.status === 'active',
  ).length;

  return (
    <div className="h-full overflow-y-auto bg-muted/20 text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-xs">
              <Link href="/plugins/customers">
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('back_to_customers')}
              </Link>
            </Button>
            {isValidating ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('updating')}
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar className="h-16 w-16 rounded-xl border border-border sm:h-20 sm:w-20">
                <AvatarImage src={data.profileImage ?? undefined} alt={data.name} />
                <AvatarFallback className="rounded-xl text-lg font-semibold">
                  {initials(data.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                    {data.name}
                  </h1>
                  <Badge variant={statusVariant(data.status)}>{statusLabel(data.status)}</Badge>
                  <Badge variant="outline">
                    {data.source === 'aapp_space' ? t('source_aapp_space') : t('source_manual')}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  {data.email ? (
                    <a href={`mailto:${data.email}`} className="flex items-center gap-1.5 hover:text-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      {data.email}
                    </a>
                  ) : null}
                  {data.phone ? (
                    <a href={`tel:${data.phone}`} className="flex items-center gap-1.5 hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {data.phone}
                    </a>
                  ) : null}
                  {!data.email && !data.phone ? (
                    <span>{t('no_contact_data')}</span>
                  ) : null}
                  <span className="flex items-center gap-1.5 tabular-nums">
                    <Hash className="h-3.5 w-3.5" />
                    {data.id}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {primaryContact ? (
                <Button asChild size="sm">
                  <Link href={`/dashboard/chat/${encodeURIComponent(primaryContact.remoteJid)}`}>
                    <MessageCircle className="h-4 w-4" />
                    {t('open_chat_button')}
                  </Link>
                </Button>
              ) : null}
              {primaryStore?.url ? (
                <Button asChild variant="outline" size="sm">
                  <a href={primaryStore.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t('open_site_button')}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid border-x border-t border-border sm:grid-cols-2 xl:grid-cols-4">
            <Metric value={activeMemberships} label={t('metric_active_memberships')} />
            <Metric value={data.stores.length} label={t('metric_sites')} />
            <Metric value={data.transactions.length} label={t('metric_transactions')} />
            <Metric value={data.contacts.length} label={t('metric_contacts')} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-5 p-4 sm:p-6 lg:p-8 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <div className="min-w-0 space-y-5">
          <SectionCard
            icon={CheckCircle2}
            title={t('memberships_title')}
            count={data.subscriptions.length}
          >
            {data.subscriptions.length ? (
              <div className="divide-y divide-border">
                {data.subscriptions.map((subscription) => (
                  <article
                    key={subscription.id}
                    className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(8rem,0.8fr)_auto] sm:items-center sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {subscription.planName || subscription.subscriptionNumber}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {subscription.subscriptionNumber} · {formatMoney(subscription.price, subscription.currency, true)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {t('expiration_label')}
                      </p>
                      <p className="mt-1 text-xs tabular-nums">
                        {subscription.endDate
                          ? formatDate(subscription.endDate, true)
                          : t('no_expiration')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      <Badge variant={statusVariant(subscription.status)}>
                        {statusLabel(subscription.status)}
                      </Badge>
                      <Badge variant={statusVariant(subscription.paymentStatus)}>
                        {statusLabel(subscription.paymentStatus)}
                      </Badge>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} text={t('memberships_empty')} />
            )}
          </SectionCard>

          <SectionCard
            icon={CircleDollarSign}
            title={t('payments_title')}
            count={data.transactions.length}
          >
            {data.transactions.length ? (
              <div className="divide-y divide-border">
                {data.transactions.map((transaction) => (
                  <article
                    key={transaction.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-3.5 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {transaction.gateway || t('payment_fallback')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(transaction.transactionDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(transaction.amount, transaction.currency)}
                      </p>
                      <Badge className="mt-1" variant={statusVariant(transaction.paymentStatus)}>
                        {statusLabel(transaction.paymentStatus)}
                      </Badge>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={CircleDollarSign} text={t('payments_empty')} />
            )}
          </SectionCard>

          <SectionCard icon={Globe2} title={t('sites_title')} count={data.stores.length}>
            {data.stores.length ? (
              <div className="divide-y divide-border">
                {data.stores.map((store) => (
                  <article
                    key={store.id}
                    className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {store.title || t('site_fallback', { id: store.id })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {statusLabel(store.status)}
                      </p>
                    </div>
                    {store.url ? (
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <a
                          href={store.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('open_site_named', { name: store.title || String(store.id) })}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={Globe2} text={t('sites_empty')} />
            )}
          </SectionCard>
        </div>

        <aside className="min-w-0 space-y-5">
          <SectionCard icon={Users} title={t('contacts_title')} count={data.contacts.length}>
            <div className="flex gap-2 border-b border-border p-4">
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger className="h-9 w-full bg-background text-xs">
                  <SelectValue placeholder={t('contact_select_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {availableContacts.map((contact) => (
                    <SelectItem key={contact.id} value={String(contact.id)}>
                      {contact.name}{contact.phone ? ` · ${contact.phone}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => void linkContact()}
                disabled={!contactId || pendingAction === 'contact'}
                aria-label={t('link_contact_button')}
                title={t('link_contact_button')}
              >
                {pendingAction === 'contact' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            {data.contacts.length ? (
              <div className="divide-y divide-border">
                {data.contacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarImage src={contact.profilePicUrl ?? undefined} alt={contact.name} />
                      <AvatarFallback className="text-[10px] font-semibold">
                        {initials(contact.name)}
                      </AvatarFallback>
                    </Avatar>
                    <Link
                      href={`/dashboard/chat/${encodeURIComponent(contact.remoteJid)}`}
                      className="min-w-0 flex-1"
                    >
                      <p className="truncate text-sm font-medium">{contact.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MessageCircle className="h-3 w-3" />
                        {t('open_conversation')}
                      </p>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void unlinkContact(contact.id)}
                      disabled={pendingAction === `unlink-contact-${contact.id}`}
                      aria-label={t('unlink_contact_named', { name: contact.name })}
                      title={t('unlink_contact_button')}
                    >
                      {pendingAction === `unlink-contact-${contact.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Unlink className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Users} text={t('contacts_empty')} />
            )}
          </SectionCard>

          <SectionCard icon={ListTodo} title={t('tasks_title')} count={data.tasks.length}>
            <div className="flex gap-2 border-b border-border p-4">
              <Input
                inputMode="numeric"
                aria-label={t('task_id_label')}
                placeholder={t('task_id_placeholder')}
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                className="h-9 text-xs"
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => void linkTask()}
                disabled={!taskId || pendingAction === 'task'}
                aria-label={t('link_task_button')}
                title={t('link_task_button')}
              >
                {pendingAction === 'task' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            {data.tasks.length ? (
              <div className="divide-y divide-border">
                {data.tasks.map((task) => (
                  <div key={task.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">{task.title}</p>
                      <Badge variant={statusVariant(task.status)}>{statusLabel(task.status)}</Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Hash className="h-3 w-3" />
                      {task.id}
                      {task.dueDate ? (
                        <>
                          <span>·</span>
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(task.dueDate)}
                        </>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={ListTodo} text={t('tasks_empty')} />
            )}
          </SectionCard>

          <SectionCard icon={FileText} title={t('notes_title')}>
            <CardContent className="p-4">
              <Textarea
                rows={6}
                value={currentNotes}
                onChange={(event) => setNotesDraft(event.target.value)}
                aria-label={t('notes_label')}
                placeholder={t('notes_placeholder')}
                className="resize-y bg-background text-sm"
              />
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => void patch({ notes: currentNotes })}
                  disabled={!notesDirty || pendingAction === 'notes'}
                >
                  {pendingAction === 'notes' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t('save_notes_button')}
                </Button>
              </div>
            </CardContent>
          </SectionCard>

          <SectionCard icon={Paperclip} title={t('attachments_title')} count={data.attachments.length}>
            <div className="border-b border-border p-4">
              <Button asChild variant="outline" size="sm" className="w-full">
                <label className="cursor-pointer">
                  {pendingAction === 'attachment' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {t('upload_attachment_button')}
                  <input
                    type="file"
                    className="hidden"
                    disabled={pendingAction === 'attachment'}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              </Button>
            </div>
            {data.attachments.length ? (
              <div className="divide-y divide-border">
                {data.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState icon={Paperclip} text={t('attachments_empty')} />
            )}
          </SectionCard>

          <SectionCard icon={Hash} title={t('record_title')}>
            <CardContent className="grid gap-3 p-4 text-xs sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <RecordField label={t('record_id_label')} value={String(data.id)} />
              <RecordField
                label={t('record_source_label')}
                value={data.source === 'aapp_space' ? t('source_aapp_space') : t('source_manual')}
              />
              <RecordField label={t('record_status_label')} value={statusLabel(data.status)} />
              <RecordField
                label={t('record_sync_label')}
                value={data.lastSyncedAt ? formatDate(data.lastSyncedAt) : t('never_synced')}
              />
            </CardContent>
            {data.source === 'manual' ? (
              <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">{t('delete_help')}</p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('delete_button')}
                </Button>
              </div>
            ) : null}
          </SectionCard>
        </aside>
      </main>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm:max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_dialog_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_dialog_description', { name: data.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction === 'delete'}>
              {t('cancel_button')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void deleteCustomer();
              }}
              disabled={pendingAction === 'delete'}
            >
              {pendingAction === 'delete' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t('confirm_delete_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-b border-r border-border px-4 py-4 last:border-r-0 sm:px-5">
      <p className="text-3xl font-bold leading-none tabular-nums tracking-tight">{value}</p>
      <p className="mt-2 text-[10px] font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <div className="flex flex-row items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
        {typeof count === 'number' ? (
          <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof UserRound; text: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-8 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function RecordField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

function CustomerDetailLoading({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div className="h-full overflow-hidden bg-background p-4 sm:p-6" aria-label={loadingLabel}>
      <div className="mx-auto max-w-[1600px] animate-pulse">
        <div className="h-8 w-28 rounded-md bg-muted" />
        <div className="mt-6 flex items-center gap-4">
          <div className="h-20 w-20 rounded-xl bg-muted" />
          <div className="space-y-3">
            <div className="h-7 w-56 rounded-md bg-muted" />
            <div className="h-4 w-40 rounded-md bg-muted" />
          </div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 rounded-lg bg-muted" />
          ))}
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
          <div className="h-80 rounded-xl bg-muted" />
          <div className="h-80 rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
