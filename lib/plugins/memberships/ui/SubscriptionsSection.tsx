'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowUpRight,
  CalendarClock,
  CircleCheckBig,
  CircleDollarSign,
  Clock3,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import {
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABELS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_LABELS,
  billingTypeLabel,
  computeDefaultEndDate,
  type PaymentStatus,
  type SubscriptionStatus,
} from '../constants';
import {
  fetcher,
  formatDate,
  formatPrice,
  type ContactOption,
  type CustomerOption,
  type Plan,
  type Subscription,
} from './shared';
import styles from './SubscriptionsSection.module.css';

type SubForm = {
  id?: number;
  subscriptionNumber: string;
  planId: string;
  customerId: string;
  contactId: string;
  price: string;
  currency: string;
  status: SubscriptionStatus;
  paymentStatus: PaymentStatus;
  startDate: string;
  endDate: string;
  notes: string;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

function emptyForm(): SubForm {
  return {
    subscriptionNumber: '',
    planId: '__none__',
    customerId: '',
    contactId: '',
    price: '',
    currency: 'USD',
    status: 'active',
    paymentStatus: 'pending',
    startDate: todayStr(),
    endDate: '',
    notes: '',
  };
}

const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  active: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  pending: 'border-violet-400/35 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  expired: 'border-pink-400/35 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  cancelled: 'border-border/70 bg-muted/50 text-muted-foreground',
};

const PAYMENT_BADGE: Record<PaymentStatus, string> = {
  paid: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  pending: 'border-violet-400/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  overdue: 'border-pink-400/30 bg-pink-500/10 text-pink-700 dark:text-pink-300',
};

function daysUntil(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(`${endDate}T00:00:00`).getTime();
  const now = new Date(todayStr() + 'T00:00:00').getTime();
  return Math.round((end - now) / 86400000);
}

export function SubscriptionsSection() {
  const t = useTranslations('Memberships');
  const { data, mutate } = useSWR<Subscription[]>('/api/plugins/memberships/subscriptions', fetcher);
  const { data: plansData } = useSWR<Plan[]>('/api/plugins/memberships/plans', fetcher);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubForm | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Subscription | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');

  const subs = data ?? [];
  const plans = plansData ?? [];

  const stats = useMemo(() => {
    const active = subs.filter((subscription) => subscription.status === 'active').length;
    const pendingPayment = subs.filter((subscription) => subscription.paymentStatus === 'pending').length;
    const overdue = subs.filter((subscription) => subscription.paymentStatus === 'overdue').length;
    const expiringSoon = subs.filter((subscription) => {
      const remaining = daysUntil(subscription.endDate);
      return subscription.status === 'active' && remaining != null && remaining >= 0 && remaining <= 7;
    }).length;
    return { active, pendingPayment, overdue, expiringSoon };
  }, [subs]);

  const filteredSubs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return subs.filter((subscription) => {
      if (statusFilter !== 'all' && subscription.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [
        subscription.subscriptionNumber,
        subscription.customer?.name,
        subscription.customer?.email,
        subscription.customer?.phone,
        subscription.contact?.name,
        subscription.plan?.name,
        subscription.planNameSnapshot,
        subscription.company?.name,
      ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [query, statusFilter, subs]);

  function nextNumber() {
    return `MEM-${String(subs.length + 1).padStart(3, '0')}`;
  }

  function handleNew() {
    setEditing({ ...emptyForm(), subscriptionNumber: nextNumber() });
    setFormOpen(true);
  }

  function handleEdit(s: Subscription) {
    setEditing({
      id: s.id,
      subscriptionNumber: s.subscriptionNumber,
      planId: s.planId != null ? String(s.planId) : '__none__',
      customerId: s.customerId != null ? String(s.customerId) : '',
      contactId: s.contactId != null ? String(s.contactId) : '',
      price: s.price ? (s.price / 100).toFixed(2) : '',
      currency: s.currency,
      status: s.status,
      paymentStatus: s.paymentStatus,
      startDate: s.startDate,
      endDate: s.endDate ?? '',
      notes: s.notes,
    });
    setFormOpen(true);
  }

  async function handleSave(form: SubForm) {
    if (!form.customerId && !form.contactId) {
      toast.error('Selecciona un cliente');
      return false;
    }
    const payload = {
      subscriptionNumber: form.subscriptionNumber,
      planId: form.planId === '__none__' ? null : parseInt(form.planId, 10),
      customerId: form.customerId ? parseInt(form.customerId, 10) : null,
      contactId: form.contactId ? parseInt(form.contactId, 10) : null,
      price: Math.round(parseFloat(form.price || '0') * 100),
      currency: form.currency,
      status: form.status,
      paymentStatus: form.paymentStatus,
      startDate: form.startDate,
      endDate: form.endDate || null,
      notes: form.notes,
    };
    const res = await fetch(
      form.id ? `/api/plugins/memberships/subscriptions/${form.id}` : '/api/plugins/memberships/subscriptions',
      {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      toast.error('No se pudo guardar la suscripción');
      return false;
    }
    toast.success(form.id ? 'Suscripción actualizada' : 'Suscripción creada');
    mutate();
    return true;
  }

  async function handleDelete() {
    if (!toDelete) return;
    const res = await fetch(`/api/plugins/memberships/subscriptions/${toDelete.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('No se pudo eliminar');
      return;
    }
    toast.success('Suscripción eliminada');
    mutate();
    setToDelete(null);
  }

  function customerName(subscription: Subscription) {
    return subscription.customer?.name?.trim() || subscription.contact?.name?.trim() || t('customer_not_linked');
  }

  function customerDetail(subscription: Subscription) {
    return subscription.customer?.email || subscription.customer?.phone || subscription.contact?.chat?.remoteJid?.split('@')[0] || '';
  }

  function initials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase();
  }

  const filters: Array<{ value: 'all' | SubscriptionStatus; label: string }> = [
    { value: 'all', label: t('filter_all') },
    { value: 'active', label: t('status_active_plural') },
    { value: 'pending', label: t('status_pending_plural') },
    { value: 'expired', label: t('status_expired_plural') },
    { value: 'cancelled', label: t('status_cancelled_plural') },
  ];

  return (
    <div className={`${styles.shell} font-[Inter,ui-sans-serif,system-ui] text-foreground`}>
      <div className={styles.content}>
        <div className={styles.metricGrid}>
          <SubscriptionMetric icon={CircleCheckBig} label={t('active_subscriptions_metric')} value={stats.active} />
          <SubscriptionMetric icon={CircleDollarSign} label={t('pending_payments_metric')} value={stats.pendingPayment} />
          <SubscriptionMetric icon={Clock3} label={t('overdue_payments_metric')} value={stats.overdue} />
          <SubscriptionMetric icon={CalendarClock} label={t('expiring_seven_days_metric')} value={stats.expiringSoon} />
        </div>

        <div className={styles.controls}>
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('search_subscriptions_placeholder')}
                className="h-11 rounded-2xl border-border/60 bg-background/45 pl-11 pr-11 text-sm shadow-inner backdrop-blur-xl focus-visible:ring-violet-500/60 dark:bg-background/25"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t('clear_search')}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <Button onClick={handleNew} className="h-11 rounded-2xl border border-white/25 bg-gradient-to-r from-[#5D34D0] via-[#A855F7] to-[#EC4899] px-5 text-white shadow-[0_12px_34px_rgba(168,85,247,0.28)] transition hover:scale-[1.02] hover:shadow-[0_16px_42px_rgba(236,72,153,0.34)]">
              <Plus className="mr-2 h-4 w-4" />
              {t('new_subscription_button')}
            </Button>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    statusFilter === filter.value
                      ? 'border-white/25 bg-gradient-to-r from-[#5D34D0] via-[#A855F7] to-[#EC4899] text-white shadow-[0_8px_24px_rgba(168,85,247,0.22)]'
                      : 'border-border/60 bg-background/35 text-muted-foreground backdrop-blur-xl hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-foreground dark:bg-background/20'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <p className="text-xs font-medium tabular-nums text-muted-foreground">
              {t('subscriptions_results_count', { count: filteredSubs.length })}
            </p>
          </div>
        </div>

        {data === undefined ? (
          <div className="grid min-h-72 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500 dark:text-cyan-300" aria-label={t('subscriptions_loading')} />
          </div>
        ) : subs.length === 0 ? (
          <SubscriptionEmpty
            title={t('subscriptions_empty_title')}
            description={t('subscriptions_empty_description')}
            actionLabel={t('new_subscription_button')}
            onAction={handleNew}
          />
        ) : filteredSubs.length === 0 ? (
          <SubscriptionEmpty
            title={t('subscriptions_filter_empty_title')}
            description={t('subscriptions_filter_empty_description')}
            actionLabel={t('clear_filters_button')}
            onAction={() => {
              setQuery('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <div className="grid gap-3 p-3 sm:p-4 2xl:grid-cols-2">
            {filteredSubs.map((subscription, index) => (
              <SubscriptionRow
                key={subscription.id}
                subscription={subscription}
                folio={index + 1}
                name={customerName(subscription)}
                detail={customerDetail(subscription)}
                initials={initials(customerName(subscription))}
                onEdit={() => handleEdit(subscription)}
                onDelete={() => setToDelete(subscription)}
              />
            ))}
          </div>
        )}

        <SubscriptionFormDialog open={formOpen} onOpenChange={setFormOpen} onSave={handleSave} initialData={editing} plans={plans} />

        {toDelete && (
          <Dialog open onOpenChange={(o) => !o && setToDelete(null)}>
            <DialogContent className="rounded-[28px] border-white/20 bg-background/80 shadow-2xl backdrop-blur-2xl sm:max-w-sm dark:bg-background/70">
              <DialogHeader>
                <DialogTitle>¿Eliminar la suscripción {toDelete.subscriptionNumber}?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setToDelete(null)}>Cancelar</Button>
                <Button size="sm" variant="destructive" className="rounded-xl" onClick={handleDelete}>Eliminar</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

function SubscriptionMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CircleCheckBig;
  label: string;
  value: number;
}) {
  return (
    <div className={`${styles.metric} flex items-end justify-between p-5`}>
      <div className="relative z-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="mt-4 bg-gradient-to-r from-[#5D34D0] via-[#A855F7] to-[#EC4899] bg-clip-text text-4xl font-semibold leading-none tracking-[-0.06em] text-transparent tabular-nums dark:from-[#00F0FF] dark:via-[#A855F7] dark:to-[#FF006E]">{String(value).padStart(2, '0')}</p>
      </div>
      <div className="relative z-10 grid h-11 w-11 place-items-center rounded-2xl border border-white/25 bg-gradient-to-br from-[#5D34D0]/20 via-[#A855F7]/15 to-[#EC4899]/20 text-violet-600 shadow-inner backdrop-blur-xl dark:text-cyan-300">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
    </div>
  );
}

function SubscriptionEmpty({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="grid min-h-80 place-items-center px-6 py-12 text-center">
      <div className="max-w-sm rounded-[28px] border border-border/50 bg-card/45 p-8 shadow-xl backdrop-blur-2xl dark:bg-card/25">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/25 bg-gradient-to-br from-[#5D34D0]/20 via-[#A855F7]/20 to-[#EC4899]/20 text-violet-600 dark:text-cyan-300">
          <UsersRound className="h-7 w-7" strokeWidth={1.5} />
        </div>
        <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <Button variant="outline" onClick={onAction} className="mt-5 rounded-2xl border-border/60 bg-background/40 backdrop-blur-xl hover:bg-violet-500/10">
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function SubscriptionRow({
  subscription,
  folio,
  name,
  detail,
  initials,
  onEdit,
  onDelete,
}: {
  subscription: Subscription;
  folio: number;
  name: string;
  detail: string;
  initials: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('Memberships');
  const remaining = daysUntil(subscription.endDate);
  const jid = subscription.contact?.chat?.remoteJid;
  const planName = subscription.plan?.name || subscription.planNameSnapshot || t('not_available');

  const dueLabel = !subscription.endDate
    ? t('no_expiration')
    : remaining == null
      ? ''
      : remaining < 0
        ? t('expired_days_ago', { count: -remaining })
        : remaining === 0
          ? t('expires_today')
          : t('expires_in_days', { count: remaining });

  return (
    <article className={`${styles.subscriptionCard} group`}>
      <div className="relative z-10 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 min-w-8 place-items-center rounded-xl border border-white/25 bg-background/35 px-2 text-[11px] font-bold tabular-nums text-muted-foreground shadow-inner backdrop-blur-xl dark:bg-background/20">
              {String(folio).padStart(2, '0')}
            </span>
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {subscription.subscriptionNumber}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] backdrop-blur-xl ${STATUS_BADGE[subscription.status]}`}>
              {t(`status_${subscription.status}`)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl border border-border/55 bg-background/35 text-muted-foreground backdrop-blur-xl hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-foreground dark:bg-background/20" aria-label={t('subscription_actions_column')}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-2xl border-border/60 bg-popover/90 text-popover-foreground shadow-2xl backdrop-blur-2xl">
                {subscription.customerId ? (
                  <DropdownMenuItem asChild className="rounded-xl">
                    <Link href={`/plugins/customers/${subscription.customerId}`}>
                      <ArrowUpRight className="mr-2 h-3.5 w-3.5" />
                      {t('view_customer_button')}
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={onEdit} className="rounded-xl">
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  {t('edit_button')}
                </DropdownMenuItem>
                {jid ? (
                  <DropdownMenuItem asChild className="rounded-xl">
                    <a href={`/dashboard/chat/${encodeURIComponent(jid)}`}>
                      <MessageCircle className="mr-2 h-3.5 w-3.5" />
                      {t('view_chat_button')}
                    </a>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="rounded-xl text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  {t('delete_button')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(180px,0.9fr)] md:items-center">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar className="h-12 w-12 shrink-0 rounded-2xl border border-white/25 shadow-[0_10px_28px_rgba(93,52,208,0.18)]">
              {subscription.customer?.profileImage ? <AvatarImage src={subscription.customer.profileImage} alt="" /> : null}
              <AvatarFallback className="rounded-2xl bg-gradient-to-br from-[#5D34D0] via-[#A855F7] to-[#EC4899] text-xs font-bold text-white">{initials || '—'}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {subscription.customerId ? (
                  <Link href={`/plugins/customers/${subscription.customerId}`} className="truncate text-base font-bold tracking-tight transition-colors hover:text-violet-600 dark:hover:text-cyan-300">
                    {name}
                  </Link>
                ) : (
                  <p className="truncate text-base font-bold tracking-tight">{name}</p>
                )}
                {subscription.customer?.source === 'aapp_space' || subscription.externalSource === 'aapp_space' ? (
                  <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-cyan-700 backdrop-blur-xl dark:text-cyan-300">
                    AApp Space
                  </span>
                ) : null}
              </div>
              {detail ? <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p> : null}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-border/45 bg-background/25 px-4 py-3 shadow-inner backdrop-blur-xl dark:bg-background/15">
            <p className="truncate text-sm font-semibold">{planName}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {subscription.company?.name || billingTypeLabel(subscription.billingType)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid overflow-hidden rounded-2xl border border-border/45 bg-background/20 shadow-inner backdrop-blur-xl sm:grid-cols-3 dark:bg-background/10">
          <div className="p-3.5 sm:border-r sm:border-border/45">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t('subscription_plan_column')}</p>
            <p className="mt-1.5 text-sm font-bold tabular-nums">{formatPrice(subscription.price, subscription.currency)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{billingTypeLabel(subscription.billingType)}</p>
          </div>

          <div className="border-t border-border/45 p-3.5 sm:border-r sm:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t('subscription_period_column')}</p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <time className="font-semibold text-foreground tabular-nums">{formatDate(subscription.startDate)}</time>
              <span>—</span>
              <time className="font-semibold text-foreground tabular-nums">{subscription.endDate ? formatDate(subscription.endDate) : t('no_expiration')}</time>
            </div>
            {subscription.status === 'active' && dueLabel ? (
              <p className={`mt-1 text-[11px] font-semibold ${remaining != null && remaining <= 7 ? 'text-pink-600 dark:text-pink-300' : 'text-muted-foreground'}`}>{dueLabel}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/45 p-3.5 sm:block sm:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t('subscription_status_column')}</p>
            <span className={`mt-1.5 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold backdrop-blur-xl ${PAYMENT_BADGE[subscription.paymentStatus]}`}>
              {t(`status_${subscription.paymentStatus}`)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function SubscriptionFormDialog({
  open,
  onOpenChange,
  onSave,
  initialData,
  plans,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: SubForm) => Promise<boolean>;
  initialData?: SubForm;
  plans: Plan[];
}) {
  const t = useTranslations('Memberships');
  const { data: contactsData } = useSWR<{ contacts: ContactOption[] }>(open ? '/api/contacts?limit=500' : null, fetcher);
  const contacts = contactsData?.contacts ?? [];
  const { data: customersData } = useSWR<CustomerOption[]>(open ? '/api/plugins/customers' : null, fetcher);
  const customers = customersData ?? [];

  const [form, setForm] = useState<SubForm>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initialData ?? emptyForm());
  }, [open, initialData]);

  function set<K extends keyof SubForm>(key: K, value: SubForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const selectedPlan = useMemo(
    () => (form.planId !== '__none__' ? plans.find((p) => p.id === parseInt(form.planId, 10)) : undefined),
    [form.planId, plans],
  );

  function selectPlan(planId: string) {
    if (planId === '__none__') {
      set('planId', '__none__');
      return;
    }
    const plan = plans.find((p) => p.id === parseInt(planId, 10));
    if (!plan) return;
    const endDate = computeDefaultEndDate(form.startDate, plan.billingType, plan.maintenanceIntervalMonths) ?? '';
    setForm((prev) => ({
      ...prev,
      planId,
      price: plan.price ? (plan.price / 100).toFixed(2) : '0.00',
      currency: plan.currency,
      endDate,
    }));
  }

  function onStartDateChange(value: string) {
    setForm((prev) => {
      const next = { ...prev, startDate: value };
      if (selectedPlan) {
        next.endDate = computeDefaultEndDate(value, selectedPlan.billingType, selectedPlan.maintenanceIntervalMonths) ?? '';
      }
      return next;
    });
  }

  function formatContact(c: ContactOption) {
    const phone = c.phone || (c.remoteJid ? c.remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '') : '');
    if (c.name && phone) return `${c.name} · ${phone}`;
    return c.name || phone || `Contacto #${c.id}`;
  }

  async function handleSave() {
    if (!form.subscriptionNumber.trim()) {
      alert('El número de suscripción es requerido');
      return;
    }
    setIsSaving(true);
    try {
      const ok = await onSave(form);
      if (ok) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[28px] border-white/20 bg-background/80 shadow-[0_30px_90px_rgba(15,23,42,0.24)] backdrop-blur-2xl sm:max-w-lg dark:bg-background/70 [&_input]:rounded-xl [&_textarea]:rounded-xl [&_[role=combobox]]:rounded-xl">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Editar suscripción' : 'Nueva suscripción'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cliente <span className="text-destructive">*</span></Label>
              <Select value={form.customerId || undefined} onValueChange={(v) => set('customerId', v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={form.subscriptionNumber} onChange={(e) => set('subscriptionNumber', e.target.value)} placeholder="MEM-001" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Contacto de WhatsApp (opcional)</Label>
            <Select value={form.contactId || '__none__'} onValueChange={(v) => set('contactId', v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Resolver desde el cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Resolver desde el cliente</SelectItem>
                {contacts.map((c) => <SelectItem key={c.id} value={String(c.id)}>{formatContact(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={form.planId} onValueChange={selectPlan}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Sin plan (precio manual)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin plan (precio manual)</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                    {p.company ? ` · ${p.company.name}` : ''}
                    {p.visibility === 'private' ? ` · ${t('visibility_private')}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Precio</Label>
              <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Inicio</Label>
              <Input type="date" value={form.startDate} onChange={(e) => onStartDateChange(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimiento</Label>
              <Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as SubscriptionStatus)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBSCRIPTION_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>{SUBSCRIPTION_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pago</Label>
              <Select value={form.paymentStatus} onValueChange={(v) => set('paymentStatus', v as PaymentStatus)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-2xl border border-border/45 bg-card/40 px-3 py-2 text-xs text-muted-foreground shadow-inner backdrop-blur-xl dark:bg-card/20">
            <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Deja el vencimiento vacío para planes gratis o de por vida. Los recordatorios se envían según las reglas configuradas.</span>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="resize-none text-sm" placeholder="Notas internas..." />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/50 pt-3">
          <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
          <Button size="sm" className="rounded-xl border border-white/20 bg-gradient-to-r from-[#5D34D0] via-[#A855F7] to-[#EC4899] text-white shadow-[0_10px_28px_rgba(168,85,247,0.24)]" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
