'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleCheck,
  CircleOff,
  CreditCard,
  Eye,
  ExternalLink,
  FileImage,
  FileText,
  Landmark,
  Loader2,
  Paperclip,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatMoney as formatMoneySeguro, formatMoneyFromCents } from '@/lib/format/money';

type Section = 'overview' | 'income' | 'expense' | 'recurring' | 'receipts' | 'treasury';
type Entry = {
  id: number; type: 'income' | 'expense'; title: string; description: string; category: string; amount: number; currency: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'; occurredOn: string; dueOn: string | null; paidOn: string | null;
  recurrence: 'none' | 'monthly' | 'annual'; recurrenceEndOn: string | null; nextDueOn: string | null; paymentMethod: string | null;
  counterparty: string | null; customerId: number | null; customerName: string | null; companyId: number | null; companyName: string | null;
  planId: number | null; planName: string | null; subscriptionId: number | null; subscriptionNumber: string | null; externalSource: string | null;
  accountId: number | null; costCenterId: number | null; saleId: number | null; projectId: number | null;
  createdAt: string;
};
type Receipt = { id: number; entryId: number | null; entryTitle: string | null; messageId: string | null; chatId: number | null; chatName: string | null; mediaUrl: string; mimeType: string | null; fileName: string | null; documentDate: string | null; paymentDate: string | null; tags: string[]; notes: string; createdAt: string };
type Option = { id: number; name: string };
type Account = { id: number; name: string; type: 'cash' | 'bank' | 'mercadopago' | 'stripe' | 'paypal' | 'other'; currency: string; openingBalance: number; isActive: boolean; notes: string; balance?: number };
type CostCenter = { id: number; name: string; code: string | null; description: string; isActive: boolean };
type Budget = { id: number; name: string; costCenterId: number | null; category: string | null; periodStart: string; periodEnd: string; amount: number; currency: string; notes: string; spent: number };
type EntryPayment = { id: number; entryId: number; accountId: number | null; amount: number; paidOn: string; method: string | null; notes: string; createdAt: string };
type Overview = {
  entries: Entry[];
  receipts: Receipt[];
  options: {
    customers: Option[];
    companies: Option[];
    plans: Array<Option & { companyId: number | null }>;
    subscriptions: Array<{ id: number; subscriptionNumber: string; planName: string; customerId: number | null; companyId: number | null; planId: number | null }>;
    accounts: Account[];
    costCenters: CostCenter[];
  };
  aappSpace: { connected: boolean; lastSyncedAt: string | null };
  treasury: {
    accountBalances: Array<Account & { balance: number }>;
    availableBalanceByCurrency: Record<string, number>;
    receivablesByCurrency: Record<string, number>;
    payablesByCurrency: Record<string, number>;
    expenseByCostCenter: Record<number, number>;
  };
};
type ChatMedia = { messageId: string; chatId: number; chatName: string | null; remoteJid: string; mediaUrl: string; mimeType: string | null; caption: string | null; timestamp: string; fileName: string };

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('request_failed');
  return response.json();
};

const entryFormSchema = z.object({
  type: z.enum(['income', 'expense']),
  title: z.string().trim().min(1),
  amount: z.string().trim().min(1).refine((value) => Number(value.replace(',', '.')) >= 0),
  currency: z.string().length(3),
  category: z.string().min(1),
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled']),
  occurredOn: z.string().min(1),
  dueOn: z.string(),
  paidOn: z.string(),
  recurrence: z.enum(['none', 'monthly', 'annual']),
  recurrenceEndOn: z.string(),
  nextDueOn: z.string(),
  paymentMethod: z.string(),
  counterparty: z.string(),
  customerId: z.string(),
  companyId: z.string(),
  planId: z.string(),
  subscriptionId: z.string(),
  accountId: z.string(),
  costCenterId: z.string(),
  description: z.string(),
});
type EntryForm = z.infer<typeof entryFormSchema>;

const receiptFormSchema = z.object({
  entryId: z.string(),
  documentDate: z.string(),
  paymentDate: z.string(),
  tags: z.string(),
  notes: z.string(),
});
type ReceiptForm = z.infer<typeof receiptFormSchema>;

const incomeCategories = ['sales', 'renewals', 'installments', 'memberships', 'services', 'advertising', 'product_load', 'other'];
const expenseCategories = ['operations', 'subscriptions', 'hosting', 'domains', 'codes', 'advertising', 'services', 'taxes', 'other'];
const translatedCategories = new Set([...incomeCategories, ...expenseCategories]);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function optionalId(value: string) {
  return value === 'none' ? null : Number(value);
}

export function FinanceDashboard() {
  const t = useTranslations('Finance');
  const locale = useLocale();
  const [section, setSection] = useState<Section>('overview');
  const [currency, setCurrency] = useState('ARS');
  const [query, setQuery] = useState('');
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const { data, error, isLoading, mutate } = useSWR<Overview>('/api/plugins/finance/overview', fetcher);

  const currencies = useMemo(() => Array.from(new Set(['ARS', 'USD', 'PYG', ...(data?.entries.map((entry) => entry.currency) ?? [])])), [data?.entries]);
  const currencyEntries = data?.entries.filter((entry) => entry.currency === currency && entry.status !== 'cancelled') ?? [];
  const paidIncome = currencyEntries.filter((entry) => entry.type === 'income' && entry.status === 'paid').reduce((sum, entry) => sum + entry.amount, 0);
  const paidExpenses = currencyEntries.filter((entry) => entry.type === 'expense' && entry.status === 'paid').reduce((sum, entry) => sum + entry.amount, 0);
  const pending = currencyEntries.filter((entry) => entry.status === 'pending' || entry.status === 'overdue').reduce((sum, entry) => sum + entry.amount, 0);

  const visibleEntries = (data?.entries ?? []).filter((entry) => {
    if (section === 'income' && entry.type !== 'income') return false;
    if (section === 'expense' && entry.type !== 'expense') return false;
    if (section === 'recurring' && entry.recurrence === 'none') return false;
    if (section === 'receipts') return false;
    if (entry.currency !== currency) return false;
    const haystack = `${entry.title} ${entry.description} ${entry.category} ${entry.customerName ?? ''} ${entry.companyName ?? ''} ${entry.counterparty ?? ''} ${entry.paymentMethod ?? ''} ${entry.planName ?? ''} ${entry.subscriptionNumber ?? ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const formatMoney = (amount: number) => formatMoneyFromCents(amount, currency, { locale, maximumFractionDigits: 2 });
  const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : t('no_date');
  const formatDateTime = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : t('no_date');
  const selectedEntry = data?.entries.find((entry) => entry.id === selectedEntryId) ?? null;

  const updateStatus = async (entry: Entry) => {
    const response = await fetch(`/api/plugins/finance/entries/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paid', paidOn: today() }) });
    if (!response.ok) return toast.error(t('save_error'));
    toast.success(t('marked_paid'));
    await mutate();
  };

  const deleteEntry = async (entry: Entry) => {
    if (!window.confirm(t('delete_entry_confirm', { title: entry.title }))) return;
    const response = await fetch(`/api/plugins/finance/entries/${entry.id}`, { method: 'DELETE' });
    if (!response.ok) return toast.error(t('delete_error'));
    toast.success(t('entry_deleted'));
    if (selectedEntryId === entry.id) setSelectedEntryId(null);
    await mutate();
  };

  const deleteReceipt = async (receipt: Receipt) => {
    if (!window.confirm(t('delete_receipt_confirm'))) return;
    const response = await fetch(`/api/plugins/finance/receipts/${receipt.id}`, { method: 'DELETE' });
    if (!response.ok) return toast.error(t('delete_error'));
    toast.success(t('receipt_deleted'));
    await mutate();
  };

  const syncAapp = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/plugins/finance/sync-aapp', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error();
      toast.success(t('sync_success', { count: payload.synced }));
      await mutate();
    } catch {
      toast.error(t('sync_error'));
    } finally {
      setSyncing(false);
    }
  };

  const sections: Array<{ id: Section; icon: LucideIcon; value: number }> = [
    { id: 'overview', icon: WalletCards, value: data?.entries.length ?? 0 },
    { id: 'income', icon: ArrowDownLeft, value: data?.entries.filter((entry) => entry.type === 'income').length ?? 0 },
    { id: 'expense', icon: ArrowUpRight, value: data?.entries.filter((entry) => entry.type === 'expense').length ?? 0 },
    { id: 'recurring', icon: CalendarClock, value: data?.entries.filter((entry) => entry.recurrence !== 'none').length ?? 0 },
    { id: 'receipts', icon: ReceiptText, value: data?.receipts.length ?? 0 },
    { id: 'treasury', icon: Landmark, value: data?.options.accounts.length ?? 0 },
  ];

  return (
    <div className="h-full w-full min-w-0 overflow-y-auto overflow-x-hidden bg-muted/30 text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex min-w-0 max-w-[1600px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><BadgeDollarSign className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-[-0.03em] sm:text-2xl">{t('title')}</h1>
              <p className="hidden truncate text-sm text-muted-foreground sm:block">{t('description')}</p>
            </div>
          </div>
          <Button onClick={() => setEntryDialogOpen(true)} className="min-h-11 shrink-0 gap-2 rounded-xl px-4 shadow-sm">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">{t('new_entry_button')}</span><span className="sm:hidden">{t('new_entry_short')}</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-[1600px] px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-8">
        {isLoading ? <LoadingState /> : error || !data ? <ErrorState message={t('load_error')} retry={() => mutate()} retryLabel={t('retry_button')} /> : (
          <div className="min-w-0 space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_220px]">
              <Metric label={t('balance')} value={formatMoney(paidIncome - paidExpenses)} detail={t('pending_amount', { amount: formatMoney(pending) })} icon={WalletCards} featured />
              <Metric label={t('paid_income')} value={formatMoney(paidIncome)} icon={ArrowDownLeft} />
              <Metric label={t('paid_expenses')} value={formatMoney(paidExpenses)} icon={ArrowUpRight} />
              <div className="flex min-h-36 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
                <Label htmlFor="finance-currency" className="text-xs font-semibold text-muted-foreground">{t('currency_label')}</Label>
                <Select value={currency} onValueChange={setCurrency}><SelectTrigger id="finance-currency" className="h-12 w-full rounded-xl text-lg font-bold"><SelectValue /></SelectTrigger><SelectContent>{currencies.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-4">
              <div className="flex min-w-0 items-center gap-3 px-1 py-2 text-sm text-muted-foreground sm:py-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">{data.aappSpace.connected ? <CircleCheck className="h-4 w-4 text-primary" /> : <CircleOff className="h-4 w-4" />}</span>
                <span className="min-w-0"><span className="block truncate font-medium text-foreground">{data.aappSpace.connected ? t('aapp_connected') : t('aapp_disconnected')}</span>{data.aappSpace.lastSyncedAt ? <span className="block truncate text-xs">{t('last_sync', { date: formatDateTime(data.aappSpace.lastSyncedAt) })}</span> : null}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:flex">
                <Button variant="outline" onClick={syncAapp} disabled={syncing || !data.aappSpace.connected} className="min-h-11 gap-2 rounded-xl">{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t('sync_aapp_button')}</Button>
                <Button variant="outline" onClick={() => setReceiptDialogOpen(true)} className="min-h-11 gap-2 rounded-xl"><Paperclip className="h-4 w-4" />{t('link_receipt_button')}</Button>
              </div>
            </section>

            <nav className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label={t('section_navigation')}>
              {sections.map(({ id, icon: Icon, value }) => (
                <button key={id} type="button" onClick={() => { setSection(id); setSelectedEntryId(null); }} aria-current={section === id ? 'page' : undefined} className={cn('flex min-h-11 min-w-fit snap-start items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted', section === id && 'border-primary bg-primary text-primary-foreground hover:bg-primary')}><Icon className="h-4 w-4" /><span>{t(`section_${id}`)}</span><span className="tabular-nums opacity-70">{value}</span></button>
              ))}
            </nav>

            {section === 'receipts' ? (
              <ReceiptsView receipts={data.receipts} onDelete={deleteReceipt} t={t} formatDate={formatDate} formatDateTime={formatDateTime} onAdd={() => setReceiptDialogOpen(true)} />
            ) : section === 'treasury' ? (
              <TreasuryView overview={data} currency={currency} formatMoney={formatMoney} mutate={mutate} t={t} />
            ) : (
              <EntriesWorkspace entries={visibleEntries} receipts={data.receipts} selectedEntry={selectedEntry} query={query} setQuery={setQuery} t={t} formatMoney={formatMoney} formatDate={formatDate} formatDateTime={formatDateTime} onSelect={(entry) => setSelectedEntryId(entry.id)} onClose={() => setSelectedEntryId(null)} onPaid={updateStatus} onDelete={deleteEntry} onAdd={() => setEntryDialogOpen(true)} onEntryChanged={() => mutate()} />
            )}
          </div>
        )}
      </main>

      {data ? <EntryDialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen} options={data.options} initialType={section === 'expense' ? 'expense' : 'income'} onSaved={mutate} /> : null}
      {data ? <ReceiptDialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen} entries={data.entries} onSaved={mutate} /> : null}
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon, featured = false }: { label: string; value: string; detail?: string; icon: LucideIcon; featured?: boolean }) {
  return <div className={cn('flex min-h-36 min-w-0 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm', featured && 'border-primary bg-primary text-primary-foreground shadow-md')}><div className={cn('flex items-center justify-between gap-2 text-xs font-semibold', featured ? 'text-primary-foreground/75' : 'text-muted-foreground')}><span>{label}</span><span className={cn('flex h-9 w-9 items-center justify-center rounded-full', featured ? 'bg-primary-foreground/10' : 'bg-muted')}><Icon className="h-4 w-4 shrink-0" /></span></div><div><p className="break-words text-2xl font-bold tracking-[-0.04em] tabular-nums sm:text-3xl">{value}</p>{detail ? <p className={cn('mt-1 break-words text-xs', featured ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{detail}</p> : null}</div></div>;
}

function LoadingState() {
  return <div className="mx-auto grid max-w-[1600px] gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="h-36 animate-pulse rounded-2xl bg-muted" /><div className="h-36 animate-pulse rounded-2xl bg-muted" /><div className="h-36 animate-pulse rounded-2xl bg-muted" /><div className="h-36 animate-pulse rounded-2xl bg-muted" /><div className="h-80 animate-pulse rounded-2xl bg-muted sm:col-span-2 xl:col-span-4" /></div>;
}

function ErrorState({ message, retry, retryLabel }: { message: string; retry: () => void; retryLabel: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center"><p className="text-sm text-muted-foreground">{message}</p><Button variant="outline" onClick={retry} className="mt-4 rounded-xl">{retryLabel}</Button></div>;
}

function EmptyState({ icon: Icon, title, description, action, actionLabel }: { icon: LucideIcon; title: string; description: string; action: () => void; actionLabel: string }) {
  return <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Icon className="h-5 w-5 text-muted-foreground" /></span><h2 className="mt-4 text-base font-semibold">{title}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p><Button onClick={action} className="mt-5 gap-2 rounded-xl"><Plus className="h-4 w-4" />{actionLabel}</Button></div>;
}

function EntriesWorkspace({ entries, receipts, selectedEntry, query, setQuery, t, formatMoney, formatDate, formatDateTime, onSelect, onClose, onPaid, onDelete, onAdd, onEntryChanged }: { entries: Entry[]; receipts: Receipt[]; selectedEntry: Entry | null; query: string; setQuery: (value: string) => void; t: ReturnType<typeof useTranslations<'Finance'>>; formatMoney: (amount: number) => string; formatDate: (date: string | null) => string; formatDateTime: (date: string | null) => string; onSelect: (entry: Entry) => void; onClose: () => void; onPaid: (entry: Entry) => void; onDelete: (entry: Entry) => void; onAdd: () => void; onEntryChanged: () => void }) {
  const linkedReceipts = selectedEntry ? receipts.filter((receipt) => receipt.entryId === selectedEntry.id) : [];
  const panel = selectedEntry ? <EntryDetailsPanel entry={selectedEntry} receipts={linkedReceipts} t={t} formatMoney={formatMoney} formatDate={formatDate} formatDateTime={formatDateTime} onClose={onClose} onPaid={onPaid} onDelete={onDelete} onEntryChanged={onEntryChanged} /> : <DetailsPlaceholder t={t} />;

  return <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-bold tracking-[-0.02em]">{t('movement_list_title')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('movement_count', { count: entries.length })}</p></div>
        <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search_placeholder')} aria-label={t('search_label')} className="min-h-11 rounded-xl bg-background pl-9" /></div>
      </header>
      {!entries.length ? <div className="p-5"><EmptyState icon={ReceiptText} title={t('entries_empty_title')} description={t('entries_empty_description')} action={onAdd} actionLabel={t('new_entry_button')} /></div> : <div>
        <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(140px,1fr)_120px_112px_140px_24px] border-b border-border bg-muted/40 px-5 py-3 text-xs font-semibold text-muted-foreground md:grid"><span>{t('entry_label')}</span><span>{t('relation_label')}</span><span>{t('date_label')}</span><span>{t('status_label')}</span><span className="text-right">{t('amount_label')}</span><span /></div>
        {entries.map((entry) => {
          const selected = selectedEntry?.id === entry.id;
          const relation = entry.customerName || entry.companyName || entry.counterparty || t('unassigned');
          return <button key={entry.id} type="button" onClick={() => onSelect(entry)} aria-pressed={selected} className={cn('group grid w-full min-w-0 gap-3 border-b border-b-border px-4 py-4 text-left transition last:border-b-0 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:grid-cols-[minmax(0,1.5fr)_minmax(140px,1fr)_120px_112px_140px_24px] md:items-center md:px-5', selected && 'bg-primary/5 ring-1 ring-inset ring-primary/30')}>
            <span className="flex min-w-0 items-center gap-3"><span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', entry.type === 'income' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{entry.type === 'income' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{entry.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{entryCategoryLabel(entry, t)}</span></span></span>
            <span className="hidden min-w-0 truncate text-sm md:block">{relation}</span>
            <span className="hidden text-sm text-muted-foreground md:block">{formatDate(entry.occurredOn)}</span>
            <span className="flex items-center justify-between md:block"><span className="text-xs text-muted-foreground md:hidden">{formatDate(entry.occurredOn)}</span><StatusBadge status={entry.status} t={t} /></span>
            <span className="flex items-center justify-between gap-4 md:justify-end"><span className={cn('text-lg font-bold tabular-nums md:text-sm', entry.type === 'income' ? 'text-primary' : 'text-foreground')}>{entry.type === 'expense' ? '−' : '+'}{formatMoney(entry.amount)}</span><ChevronRight className="h-4 w-4 text-muted-foreground md:hidden" /></span>
            <ChevronRight className="hidden h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 md:block" />
          </button>;
        })}
      </div>}
    </div>

    <div className="sticky top-[92px] hidden xl:block">{panel}</div>
    {selectedEntry ? <div className="fixed inset-0 z-40 xl:hidden"><button type="button" aria-label={t('close_details_button')} className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} /><div className="absolute inset-y-0 right-0 w-full max-w-[460px] p-2 sm:p-4">{panel}</div></div> : null}
  </section>;
}

function DetailsPlaceholder({ t }: { t: ReturnType<typeof useTranslations<'Finance'>> }) {
  return <aside className="flex min-h-[520px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-sm"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted"><CreditCard className="h-6 w-6 text-muted-foreground" /></span><h2 className="mt-5 font-semibold">{t('select_movement_title')}</h2><p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{t('select_movement_description')}</p></aside>;
}

function EntryDetailsPanel({ entry, receipts, t, formatMoney, formatDate, formatDateTime, onClose, onPaid, onDelete, onEntryChanged }: { entry: Entry; receipts: Receipt[]; t: ReturnType<typeof useTranslations<'Finance'>>; formatMoney: (amount: number) => string; formatDate: (date: string | null) => string; formatDateTime: (date: string | null) => string; onClose: () => void; onPaid: (entry: Entry) => void; onDelete: (entry: Entry) => void; onEntryChanged: () => void }) {
  const [previewReceipt, setPreviewReceipt] = useState<Receipt | null>(null);
  return <aside className="flex h-full max-h-[calc(100dvh-7rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
    <header className="flex items-start justify-between gap-4 border-b border-border p-5"><div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">{t('detail_panel_title')}</p><h2 className="mt-1 break-words text-xl font-bold tracking-tight">{entry.title}</h2></div><Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={onClose} aria-label={t('close_details_button')}><X className="h-4 w-4" /></Button></header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="border-b border-border p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-muted-foreground">{entry.type === 'income' ? t('section_income') : t('section_expense')}</p><p className={cn('mt-2 break-all text-3xl font-bold tracking-[-0.04em] tabular-nums', entry.type === 'income' ? 'text-primary' : 'text-foreground')}>{entry.type === 'expense' ? '−' : '+'}{formatMoney(entry.amount)}</p></div><StatusBadge status={entry.status} t={t} /></div><p className="mt-3 text-sm text-muted-foreground">{entryCategoryLabel(entry, t)}</p></div>
      <DetailGroup title={t('relationships_title')}>
        <DetailRow label={t('customer_label')} value={entry.customerName || t('not_provided')} />
        <DetailRow label={t('company_label')} value={entry.companyName || t('not_provided')} />
        <DetailRow label={t('plan_label')} value={entry.planName || t('not_provided')} />
        <DetailRow label={t('subscription_label')} value={entry.subscriptionNumber || t('not_provided')} />
        <DetailRow label={t('counterparty_label')} value={entry.counterparty || t('not_provided')} />
      </DetailGroup>
      <DetailGroup title={t('payment_details_title')}>
        <DetailRow label={t('payment_method_label')} value={entry.paymentMethod || t('not_provided')} />
        <DetailRow label={t('recurrence_label')} value={t(`recurrence_${entry.recurrence}`)} />
        <DetailRow label={t('source_label')} value={entry.externalSource === 'aapp_space' ? 'AAPP SPACE' : t('manual_source')} />
      </DetailGroup>
      <DetailGroup title={t('dates_title')}>
        <DetailRow label={t('date_label')} value={formatDate(entry.occurredOn)} />
        <DetailRow label={t('due_date_label')} value={formatDate(entry.dueOn)} />
        <DetailRow label={t('paid_date_label')} value={formatDate(entry.paidOn)} />
        <DetailRow label={t('next_due_label')} value={formatDate(entry.nextDueOn)} />
        <DetailRow label={t('recurrence_end_label')} value={formatDate(entry.recurrenceEndOn)} />
        <DetailRow label={t('created_at_label')} value={formatDateTime(entry.createdAt)} />
      </DetailGroup>
      <PaymentsSection entry={entry} t={t} formatMoney={formatMoney} formatDate={formatDate} onEntryChanged={onEntryChanged} />
      <div className="p-5"><p className="text-xs font-semibold text-muted-foreground">{t('notes_label')}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{entry.description || t('not_provided')}</p></div>
      {receipts.length ? <section className="border-t border-border p-5"><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-muted-foreground">{t('linked_receipts_title')}</h3><Badge variant="secondary" className="rounded-full tabular-nums">{receipts.length}</Badge></div><div className="mt-3 space-y-2">{receipts.map((receipt) => { const isPdf = receipt.mimeType === 'application/pdf' || receipt.fileName?.toLowerCase().endsWith('.pdf'); return <button key={receipt.id} type="button" onClick={() => setPreviewReceipt(receipt)} className="group flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{isPdf ? <FileText className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{receipt.fileName || t('receipt_fallback_name')}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{formatDate(receipt.documentDate || receipt.createdAt)}</span></span><Eye className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" /></button>; })}</div></section> : null}
    </div>
    <footer className="border-t border-border bg-card p-4"><EntryActions entry={entry} onPaid={onPaid} onDelete={onDelete} t={t} /></footer>
    <ReceiptPreviewDialog receipt={previewReceipt} onClose={() => setPreviewReceipt(null)} t={t} />
  </aside>;
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-border p-5"><h3 className="mb-1 text-xs font-semibold text-muted-foreground">{title}</h3><dl>{children}</dl></section>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-start justify-between gap-5 border-b border-border/60 py-3 last:border-b-0"><dt className="shrink-0 text-sm text-muted-foreground">{label}</dt><dd className="min-w-0 break-words text-right text-sm font-medium">{value}</dd></div>;
}

function entryCategoryLabel(entry: Entry, t: ReturnType<typeof useTranslations<'Finance'>>) {
  const category = translatedCategories.has(entry.category) ? t(`category_${entry.category}` as never) : entry.category;
  return `${category}${entry.recurrence !== 'none' ? ` · ${t(`recurrence_${entry.recurrence}`)}` : ''}${entry.externalSource === 'aapp_space' ? ' · AAPP SPACE' : ''}`;
}

function PaymentsSection({ entry, t, formatMoney, formatDate, onEntryChanged }: { entry: Entry; t: ReturnType<typeof useTranslations<'Finance'>>; formatMoney: (amount: number) => string; formatDate: (date: string | null) => string; onEntryChanged: () => void }) {
  const { data: payments = [], mutate: mutatePayments } = useSWR<EntryPayment[]>(`/api/plugins/finance/entries/${entry.id}/payments`, fetcher);
  const { data: accounts = [] } = useSWR<Account[]>('/api/plugins/finance/accounts', fetcher);
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [accountId, setAccountId] = useState('none');
  const [submitting, setSubmitting] = useState(false);

  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(entry.amount - totalPaid, 0);

  const submit = async () => {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    if (!cents || cents <= 0) return toast.error(t('save_error'));
    setSubmitting(true);
    try {
      const response = await fetch(`/api/plugins/finance/entries/${entry.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: cents, paidOn, accountId: optionalId(accountId), notes: '' }),
      });
      if (!response.ok) return toast.error(t('save_error'));
      toast.success(t('payment_saved'));
      setAmount(''); setFormOpen(false);
      await mutatePayments();
      onEntryChanged();
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="border-t border-border p-5">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xs font-semibold text-muted-foreground">{t('payments_title')}</h3>
      {entry.status !== 'paid' && entry.status !== 'cancelled' ? <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg" onClick={() => setFormOpen((v) => !v)}><Plus className="h-3.5 w-3.5" />{t('register_payment_button')}</Button> : null}
    </div>
    {entry.status !== 'paid' && entry.status !== 'cancelled' ? <p className="mt-2 text-xs text-muted-foreground">{t('remaining_amount', { amount: formatMoney(remaining) })}</p> : null}
    {formOpen ? <div className="mt-3 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <FormField label={t('amount_label')}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></FormField>
        <FormField label={t('date_label')}><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></FormField>
      </div>
      <FormSelect label={t('account_label')} value={accountId} onChange={setAccountId} options={[['none', t('unassigned')], ...accounts.map((a) => [String(a.id), a.name])]} />
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>{t('cancel_button')}</Button><Button type="button" size="sm" disabled={submitting} onClick={submit}>{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{t('save_button')}</Button></div>
    </div> : null}
    {payments.length ? <ul className="mt-3 space-y-2">
      {payments.map((payment) => <li key={payment.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"><span className="text-muted-foreground">{formatDate(payment.paidOn)}</span><span className="font-semibold tabular-nums">{formatMoney(payment.amount)}</span></li>)}
    </ul> : <p className="mt-3 text-xs text-muted-foreground">{t('no_payments')}</p>}
  </section>;
}

function EntryActions({ entry, onPaid, onDelete, t }: { entry: Entry; onPaid: (entry: Entry) => void; onDelete: (entry: Entry) => void; t: ReturnType<typeof useTranslations<'Finance'>> }) {
  return <div className="flex w-full flex-wrap gap-2">{entry.status !== 'paid' && entry.status !== 'cancelled' ? <Button variant="outline" className="min-h-10 flex-1 rounded-xl" onClick={() => onPaid(entry)}><Check className="h-4 w-4" />{t('mark_paid_button')}</Button> : null}<Button variant="ghost" className="min-h-10 flex-1 rounded-xl text-destructive hover:text-destructive" onClick={() => onDelete(entry)}><Trash2 className="h-4 w-4" />{t('delete_button')}</Button></div>;
}

function StatusBadge({ status, t }: { status: Entry['status']; t: ReturnType<typeof useTranslations<'Finance'>> }) {
  return <Badge variant="outline" className={cn('shrink-0 whitespace-nowrap rounded-full px-2.5 font-semibold', status === 'paid' && 'border-primary bg-primary text-primary-foreground', status === 'overdue' && 'border-destructive text-destructive', status === 'cancelled' && 'border-border text-muted-foreground')}>{t(`status_${status}`)}</Badge>;
}

function ReceiptsView({ receipts, onDelete, t, formatDate, formatDateTime, onAdd }: { receipts: Receipt[]; onDelete: (receipt: Receipt) => void; t: ReturnType<typeof useTranslations<'Finance'>>; formatDate: (date: string | null) => string; formatDateTime: (date: string | null) => string; onAdd: () => void }) {
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<Receipt | null>(null);
  if (!receipts.length) return <EmptyState icon={Paperclip} title={t('receipts_empty_title')} description={t('receipts_empty_description')} action={onAdd} actionLabel={t('link_receipt_button')} />;
  const closeDetails = () => setSelectedReceipt(null);
  const panel = selectedReceipt ? <ReceiptDetailsPanel receipt={selectedReceipt} t={t} formatDate={formatDate} formatDateTime={formatDateTime} onClose={closeDetails} onPreview={setPreviewReceipt} onDelete={(receipt) => { onDelete(receipt); closeDetails(); }} /> : <ReceiptPlaceholder t={t} />;

  return <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-border p-5"><div><h2 className="text-lg font-bold tracking-[-0.02em]">{t('section_receipts')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('receipt_count', { count: receipts.length })}</p></div><Button type="button" variant="outline" onClick={onAdd} className="min-h-10 shrink-0 gap-2 rounded-xl"><Plus className="h-4 w-4" /><span className="hidden sm:inline">{t('link_receipt_button')}</span></Button></header>
      <div>
        {receipts.map((receipt) => {
          const selected = selectedReceipt?.id === receipt.id;
          const isPdf = receipt.mimeType === 'application/pdf' || receipt.fileName?.toLowerCase().endsWith('.pdf');
          return <button key={receipt.id} type="button" onClick={() => setSelectedReceipt(receipt)} aria-pressed={selected} className={cn('group flex w-full min-w-0 items-center gap-3 border-b border-b-border p-4 text-left transition last:border-b-0 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:gap-4 sm:px-5', selected && 'bg-primary/5 ring-1 ring-inset ring-primary/30')}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">{isPdf ? <FileText className="h-5 w-5" /> : <FileImage className="h-5 w-5" />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{receipt.fileName || t('receipt_fallback_name')}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{receipt.chatName || t('unknown_chat')} · {formatDate(receipt.documentDate || receipt.createdAt)}</span></span>
            <span className="hidden max-w-[220px] truncate text-sm text-muted-foreground md:block">{receipt.entryTitle || t('unassigned')}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>;
        })}
      </div>
    </div>

    <div className="sticky top-[92px] hidden xl:block">{panel}</div>
    {selectedReceipt ? <div className="fixed inset-0 z-40 xl:hidden"><button type="button" aria-label={t('close_details_button')} className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={closeDetails} /><div className="absolute inset-y-0 right-0 w-full max-w-[460px] p-2 sm:p-4">{panel}</div></div> : null}

    <ReceiptPreviewDialog receipt={previewReceipt} onClose={() => setPreviewReceipt(null)} t={t} />
  </section>;
}

function ReceiptPlaceholder({ t }: { t: ReturnType<typeof useTranslations<'Finance'>> }) {
  return <aside className="flex min-h-[520px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-sm"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted"><ReceiptText className="h-6 w-6 text-muted-foreground" /></span><h2 className="mt-5 font-semibold">{t('select_receipt_title')}</h2><p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{t('select_receipt_description')}</p></aside>;
}

function ReceiptDetailsPanel({ receipt, t, formatDate, formatDateTime, onClose, onPreview, onDelete }: { receipt: Receipt; t: ReturnType<typeof useTranslations<'Finance'>>; formatDate: (date: string | null) => string; formatDateTime: (date: string | null) => string; onClose: () => void; onPreview: (receipt: Receipt) => void; onDelete: (receipt: Receipt) => void }) {
  const isPdf = receipt.mimeType === 'application/pdf' || receipt.fileName?.toLowerCase().endsWith('.pdf');
  return <aside className="flex h-full max-h-[calc(100dvh-7rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
    <header className="flex items-start justify-between gap-4 border-b border-border p-5"><div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">{isPdf ? <FileText className="h-5 w-5" /> : <FileImage className="h-5 w-5" />}</span><div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">{t('receipt_detail_title')}</p><h2 className="mt-1 break-all text-lg font-bold tracking-tight">{receipt.fileName || t('receipt_fallback_name')}</h2><p className="mt-1 break-words text-xs text-muted-foreground">{receipt.mimeType || t('file_type_unknown')}</p></div></div><Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={onClose} aria-label={t('close_details_button')}><X className="h-4 w-4" /></Button></header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <DetailGroup title={t('relationships_title')}>
        <DetailRow label={t('chat_label')} value={receipt.chatName || t('unknown_chat')} />
        <DetailRow label={t('linked_entry_label')} value={receipt.entryTitle || t('unassigned')} />
      </DetailGroup>
      <DetailGroup title={t('dates_title')}>
        <DetailRow label={t('document_date_label')} value={formatDate(receipt.documentDate)} />
        <DetailRow label={t('payment_date_label')} value={formatDate(receipt.paymentDate)} />
        <DetailRow label={t('created_at_label')} value={formatDateTime(receipt.createdAt)} />
      </DetailGroup>
      <DetailGroup title={t('file_information_title')}>
        <DetailRow label={t('file_type_label')} value={receipt.mimeType || t('file_type_unknown')} />
        <DetailRow label={t('tags_label')} value={receipt.tags.length ? receipt.tags.join(', ') : t('not_provided')} />
        <DetailRow label={t('message_id_label')} value={receipt.messageId || t('not_provided')} />
        <DetailRow label={t('chat_id_label')} value={receipt.chatId ? String(receipt.chatId) : t('not_provided')} />
      </DetailGroup>
      <div className="p-5"><p className="text-xs font-semibold text-muted-foreground">{t('notes_label')}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{receipt.notes || t('not_provided')}</p></div>
    </div>
    <footer className="flex gap-2 border-t border-border bg-card p-4"><Button type="button" variant="outline" className="min-h-10 flex-1 rounded-xl" onClick={() => onPreview(receipt)}><Eye className="h-4 w-4" />{t('view_receipt_button')}</Button><Button type="button" variant="ghost" className="min-h-10 rounded-xl text-destructive hover:text-destructive" onClick={() => onDelete(receipt)} aria-label={t('delete_button')}><Trash2 className="h-4 w-4" /></Button></footer>
  </aside>;
}

function ReceiptPreviewDialog({ receipt, onClose, t }: { receipt: Receipt | null; onClose: () => void; t: ReturnType<typeof useTranslations<'Finance'>> }) {
  const isPdf = receipt?.mimeType === 'application/pdf' || receipt?.fileName?.toLowerCase().endsWith('.pdf');
  return <Dialog open={Boolean(receipt)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:h-[min(90dvh,900px)]">
      <DialogHeader className="shrink-0 border-b border-border p-4 pr-12 sm:p-5 sm:pr-12"><DialogTitle className="break-all">{receipt?.fileName || t('receipt_fallback_name')}</DialogTitle><DialogDescription>{t('receipt_preview_description')}</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 bg-muted p-2 sm:p-4">{receipt ? isPdf ? <iframe src={receipt.mediaUrl} title={receipt.fileName || t('receipt_fallback_name')} className="h-full w-full rounded-xl border border-border bg-background" /> : <div className="flex h-full w-full items-center justify-center overflow-auto">{/* Los comprobantes son archivos dinámicos del usuario y no tienen dimensiones conocidas para next/image. */}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={receipt.mediaUrl} alt={receipt.fileName || t('receipt_fallback_name')} className="max-h-full max-w-full rounded-xl object-contain" /></div> : null}</div>
      <DialogFooter className="shrink-0 border-t border-border p-3 sm:p-4">{receipt ? <Button asChild variant="outline" className="w-full rounded-xl sm:w-auto"><a href={receipt.mediaUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{t('open_original_button')}</a></Button> : null}</DialogFooter>
    </DialogContent>
  </Dialog>;
}

function TreasuryView({ overview, currency, formatMoney, mutate, t }: { overview: Overview; currency: string; formatMoney: (amount: number) => string; mutate: () => Promise<unknown>; t: ReturnType<typeof useTranslations<'Finance'>> }) {
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [costCenterDialogOpen, setCostCenterDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const { data: budgets = [], mutate: mutateBudgets } = useSWR<Budget[]>('/api/plugins/finance/budgets', fetcher);
  const { data: cashflow } = useSWR<{ currency: string; currentBalance: number; projection: Array<{ period: string; income: number; expense: number; projectedBalance: number }> }>(`/api/plugins/finance/cashflow?currency=${currency}&days=90`, fetcher);

  const accounts = overview.treasury.accountBalances.filter((account) => account.currency === currency);
  const costCenters = overview.options.costCenters;
  const chartData = (cashflow?.projection ?? []).map((row) => ({ ...row, balance: row.projectedBalance / 100, income: row.income / 100, expense: row.expense / 100 }));

  return <div className="min-w-0 space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold tracking-[-0.02em]">{t('cashflow_title')}</h2><span className="text-sm text-muted-foreground">{t('current_balance', { amount: formatMoney(cashflow?.currentBalance ?? 0) })}</span></div>
      <div className="mt-4 h-64 w-full">
        {chartData.length ? <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value) => formatMoney(Number(value) * 100)} />
            <Bar dataKey="income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer> : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('cashflow_empty')}</p>}
      </div>
    </section>

    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border p-5"><h2 className="text-lg font-bold tracking-[-0.02em]">{t('accounts_title')}</h2><Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setAccountDialogOpen(true)}><Plus className="h-4 w-4" />{t('new_account_button')}</Button></header>
      {!accounts.length ? <p className="p-5 text-sm text-muted-foreground">{t('accounts_empty')}</p> : <ul className="divide-y divide-border">
        {accounts.map((account) => <li key={account.id} className="flex items-center justify-between gap-3 px-5 py-3"><span className="flex items-center gap-3 min-w-0"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"><Landmark className="h-4 w-4 text-muted-foreground" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{account.name}</span><span className="block truncate text-xs text-muted-foreground">{t(`account_type_${account.type}` as never)}</span></span></span><span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(account.balance)}</span></li>)}
      </ul>}
    </section>

    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border p-5"><h2 className="text-lg font-bold tracking-[-0.02em]">{t('cost_centers_title')}</h2><Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setCostCenterDialogOpen(true)}><Plus className="h-4 w-4" />{t('new_cost_center_button')}</Button></header>
      {!costCenters.length ? <p className="p-5 text-sm text-muted-foreground">{t('cost_centers_empty')}</p> : <ul className="divide-y divide-border">
        {costCenters.map((costCenter) => <li key={costCenter.id} className="flex items-center justify-between gap-3 px-5 py-3"><span className="flex items-center gap-3 min-w-0"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"><Building2 className="h-4 w-4 text-muted-foreground" /></span><span className="min-w-0 truncate text-sm font-semibold">{costCenter.name}</span></span><span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(overview.treasury.expenseByCostCenter[costCenter.id] ?? 0)}</span></li>)}
      </ul>}
    </section>

    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border p-5"><h2 className="text-lg font-bold tracking-[-0.02em]">{t('budgets_title')}</h2><Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setBudgetDialogOpen(true)}><Plus className="h-4 w-4" />{t('new_budget_button')}</Button></header>
      {!budgets.length ? <p className="p-5 text-sm text-muted-foreground">{t('budgets_empty')}</p> : <ul className="divide-y divide-border">
        {budgets.map((budget) => { const pct = budget.amount > 0 ? Math.min(100, Math.round((budget.spent / budget.amount) * 100)) : 0; return <li key={budget.id} className="px-5 py-4"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-3 min-w-0"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"><PiggyBank className="h-4 w-4 text-muted-foreground" /></span><span className="min-w-0 truncate text-sm font-semibold">{budget.name}</span></span><span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatMoney(budget.spent)} / {formatMoney(budget.amount)}</span></div><div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', pct >= 100 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${pct}%` }} /></div></li>; })}
      </ul>}
    </section>

    <AccountDialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen} onSaved={mutate} t={t} />
    <CostCenterDialog open={costCenterDialogOpen} onOpenChange={setCostCenterDialogOpen} onSaved={mutate} t={t} />
    <BudgetDialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen} costCenters={costCenters} onSaved={() => mutateBudgets()} t={t} />
  </div>;
}

function AccountDialog({ open, onOpenChange, onSaved, t }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<unknown> | unknown; t: ReturnType<typeof useTranslations<'Finance'>> }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currency, setCurrency] = useState('ARS');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error(t('save_error'));
    setSubmitting(true);
    try {
      const response = await fetch('/api/plugins/finance/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, type, currency, openingBalance: Math.round(Number(openingBalance.replace(',', '.')) * 100) }) });
      if (!response.ok) return toast.error(t('save_error'));
      toast.success(t('account_saved'));
      setName(''); setOpeningBalance('0'); onOpenChange(false); await onSaved();
    } finally { setSubmitting(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{t('new_account_button')}</DialogTitle><DialogDescription>{t('account_dialog_description')}</DialogDescription></DialogHeader>
    <div className="space-y-4"><FormField label={t('title_label')}><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField><FormSelect label={t('account_type_label')} value={type} onChange={setType} options={['cash', 'bank', 'mercadopago', 'stripe', 'paypal', 'other'].map((item) => [item, t(`account_type_${item}` as never)])} /><div className="grid grid-cols-2 gap-3"><FormSelect label={t('currency_label')} value={currency} onChange={setCurrency} options={['ARS', 'USD', 'PYG', 'EUR'].map((item) => [item, item])} /><FormField label={t('opening_balance_label')}><Input inputMode="decimal" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} /></FormField></div></div>
    <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel_button')}</Button><Button type="button" disabled={submitting} onClick={submit}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('save_button')}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function CostCenterDialog({ open, onOpenChange, onSaved, t }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<unknown> | unknown; t: ReturnType<typeof useTranslations<'Finance'>> }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error(t('save_error'));
    setSubmitting(true);
    try {
      const response = await fetch('/api/plugins/finance/cost-centers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code: code || null }) });
      if (!response.ok) return toast.error(response.status === 409 ? t('duplicate_code_error') : t('save_error'));
      toast.success(t('cost_center_saved'));
      setName(''); setCode(''); onOpenChange(false); await onSaved();
    } finally { setSubmitting(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{t('new_cost_center_button')}</DialogTitle><DialogDescription>{t('cost_center_dialog_description')}</DialogDescription></DialogHeader>
    <div className="space-y-4"><FormField label={t('title_label')}><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField><FormField label={t('code_label')}><Input value={code} onChange={(e) => setCode(e.target.value)} /></FormField></div>
    <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel_button')}</Button><Button type="button" disabled={submitting} onClick={submit}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('save_button')}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function BudgetDialog({ open, onOpenChange, costCenters, onSaved, t }: { open: boolean; onOpenChange: (open: boolean) => void; costCenters: CostCenter[]; onSaved: () => Promise<unknown> | unknown; t: ReturnType<typeof useTranslations<'Finance'>> }) {
  const [name, setName] = useState('');
  const [costCenterId, setCostCenterId] = useState('none');
  const [periodStart, setPeriodStart] = useState(today());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim() || !amount) return toast.error(t('save_error'));
    setSubmitting(true);
    try {
      const response = await fetch('/api/plugins/finance/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, costCenterId: optionalId(costCenterId), periodStart, periodEnd, amount: Math.round(Number(amount.replace(',', '.')) * 100), currency }) });
      if (!response.ok) return toast.error(t('save_error'));
      toast.success(t('budget_saved'));
      setName(''); setAmount(''); onOpenChange(false); await onSaved();
    } finally { setSubmitting(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{t('new_budget_button')}</DialogTitle><DialogDescription>{t('budget_dialog_description')}</DialogDescription></DialogHeader>
    <div className="space-y-4"><FormField label={t('title_label')}><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField><FormSelect label={t('cost_center_label')} value={costCenterId} onChange={setCostCenterId} options={[['none', t('unassigned')], ...costCenters.map((c) => [String(c.id), c.name])]} /><div className="grid grid-cols-2 gap-3"><FormField label={t('period_start_label')}><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></FormField><FormField label={t('period_end_label')}><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></FormField></div><div className="grid grid-cols-2 gap-3"><FormField label={t('amount_label')}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></FormField><FormSelect label={t('currency_label')} value={currency} onChange={setCurrency} options={['ARS', 'USD', 'PYG', 'EUR'].map((item) => [item, item])} /></div></div>
    <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel_button')}</Button><Button type="button" disabled={submitting} onClick={submit}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('save_button')}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function EntryDialog({ open, onOpenChange, options, initialType, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; options: Overview['options']; initialType: 'income' | 'expense'; onSaved: () => Promise<unknown> | unknown }) {
  const t = useTranslations('Finance');
  const form = useForm<EntryForm>({ resolver: zodResolver(entryFormSchema), defaultValues: { type: initialType, title: '', amount: '', currency: 'ARS', category: 'sales', status: 'pending', occurredOn: today(), dueOn: '', paidOn: '', recurrence: 'none', recurrenceEndOn: '', nextDueOn: '', paymentMethod: '', counterparty: '', customerId: 'none', companyId: 'none', planId: 'none', subscriptionId: 'none', accountId: 'none', costCenterId: 'none', description: '' } });
  const type = form.watch('type');
  const recurrence = form.watch('recurrence');
  const categories = type === 'income' ? incomeCategories : expenseCategories;

  const submit = form.handleSubmit(async (values) => {
    const response = await fetch('/api/plugins/finance/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, amount: Math.round(Number(values.amount.replace(',', '.')) * 100), dueOn: values.dueOn || null, paidOn: values.paidOn || null, recurrenceEndOn: values.recurrenceEndOn || null, nextDueOn: values.nextDueOn || null, paymentMethod: values.paymentMethod || null, counterparty: values.counterparty || null, customerId: optionalId(values.customerId), companyId: optionalId(values.companyId), planId: optionalId(values.planId), subscriptionId: optionalId(values.subscriptionId), accountId: optionalId(values.accountId), costCenterId: optionalId(values.costCenterId) }) });
    if (!response.ok) return toast.error(t('save_error'));
    toast.success(t('entry_saved'));
    form.reset({ ...form.formState.defaultValues, type: values.type, occurredOn: today(), category: values.type === 'income' ? 'sales' : 'operations' } as EntryForm);
    onOpenChange(false);
    await onSaved();
  });

  return <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (next) { form.setValue('type', initialType); form.setValue('category', initialType === 'income' ? 'sales' : 'operations'); } }}><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[800px] overflow-y-auto p-4 sm:p-6"><DialogHeader><DialogTitle>{t('entry_dialog_title')}</DialogTitle><DialogDescription>{t('entry_dialog_description')}</DialogDescription></DialogHeader><form onSubmit={submit} className="min-w-0 space-y-5"><div className="grid min-w-0 gap-4 sm:grid-cols-2"><FormSelect label={t('type_label')} value={type} onChange={(value) => { form.setValue('type', value as EntryForm['type']); form.setValue('category', value === 'income' ? 'sales' : 'operations'); }} options={[['income', t('section_income')], ['expense', t('section_expense')]]} /><FormField label={t('title_label')} error={form.formState.errors.title?.message}><Input {...form.register('title')} /></FormField><FormField label={t('amount_label')} error={form.formState.errors.amount?.message}><Input inputMode="decimal" {...form.register('amount')} /></FormField><FormSelect label={t('currency_label')} value={form.watch('currency')} onChange={(value) => form.setValue('currency', value)} options={['ARS', 'USD', 'PYG', 'EUR'].map((item) => [item, item])} /><FormSelect label={t('category_label')} value={form.watch('category')} onChange={(value) => form.setValue('category', value)} options={categories.map((item) => [item, t(`category_${item}` as never)])} /><FormSelect label={t('status_label')} value={form.watch('status')} onChange={(value) => form.setValue('status', value as EntryForm['status'])} options={['pending', 'paid', 'overdue', 'cancelled'].map((item) => [item, t(`status_${item}` as never)])} /><FormField label={t('date_label')}><Input type="date" {...form.register('occurredOn')} /></FormField><FormField label={t('due_date_label')}><Input type="date" {...form.register('dueOn')} /></FormField><FormSelect label={t('recurrence_label')} value={recurrence} onChange={(value) => form.setValue('recurrence', value as EntryForm['recurrence'])} options={['none', 'monthly', 'annual'].map((item) => [item, t(`recurrence_${item}` as never)])} />{recurrence !== 'none' ? <FormField label={t('next_due_label')}><Input type="date" {...form.register('nextDueOn')} /></FormField> : <div />}<FormSelect label={t('customer_label')} value={form.watch('customerId')} onChange={(value) => form.setValue('customerId', value)} options={[['none', t('unassigned')], ...options.customers.map((item) => [String(item.id), item.name])]} /><FormSelect label={t('company_label')} value={form.watch('companyId')} onChange={(value) => form.setValue('companyId', value)} options={[['none', t('unassigned')], ...options.companies.map((item) => [String(item.id), item.name])]} /><FormSelect label={t('plan_label')} value={form.watch('planId')} onChange={(value) => form.setValue('planId', value)} options={[['none', t('unassigned')], ...options.plans.map((item) => [String(item.id), item.name])]} /><FormSelect label={t('subscription_label')} value={form.watch('subscriptionId')} onChange={(value) => form.setValue('subscriptionId', value)} options={[['none', t('unassigned')], ...options.subscriptions.map((item) => [String(item.id), `${item.subscriptionNumber}${item.planName ? ` · ${item.planName}` : ''}`])]} /><FormSelect label={t('account_label')} value={form.watch('accountId')} onChange={(value) => form.setValue('accountId', value)} options={[['none', t('unassigned')], ...options.accounts.map((item) => [String(item.id), item.name])]} /><FormSelect label={t('cost_center_label')} value={form.watch('costCenterId')} onChange={(value) => form.setValue('costCenterId', value)} options={[['none', t('unassigned')], ...options.costCenters.map((item) => [String(item.id), item.name])]} /><FormField label={t('counterparty_label')}><Input {...form.register('counterparty')} /></FormField><FormField label={t('payment_method_label')}><Input {...form.register('paymentMethod')} /></FormField></div><FormField label={t('notes_label')}><Textarea rows={3} {...form.register('description')} /></FormField><DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel_button')}</Button><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('save_button')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ReceiptDialog({ open, onOpenChange, entries, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; entries: Entry[]; onSaved: () => Promise<unknown> | unknown }) {
  const t = useTranslations('Finance');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const { data: media = [], isLoading } = useSWR<ChatMedia[]>(open ? '/api/plugins/finance/chat-media' : null, fetcher);
  const form = useForm<ReceiptForm>({ resolver: zodResolver(receiptFormSchema), defaultValues: { entryId: 'none', documentDate: '', paymentDate: '', tags: '', notes: '' } });
  const filtered = media.filter((item) => `${item.fileName} ${item.chatName ?? ''} ${item.caption ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));

  const submit = form.handleSubmit(async (values) => {
    if (!selectedMessageId) return toast.error(t('select_media_error'));
    const response = await fetch('/api/plugins/finance/receipts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: selectedMessageId, entryId: optionalId(values.entryId), documentDate: values.documentDate || null, paymentDate: values.paymentDate || null, tags: values.tags.split(',').map((item) => item.trim()).filter(Boolean), notes: values.notes }) });
    if (!response.ok) return toast.error(response.status === 409 ? t('receipt_duplicate_error') : t('save_error'));
    toast.success(t('receipt_saved'));
    setSelectedMessageId(null); form.reset(); onOpenChange(false); await onSaved();
  });

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[800px] overflow-y-auto p-4 sm:p-6"><DialogHeader><DialogTitle>{t('receipt_dialog_title')}</DialogTitle><DialogDescription>{t('receipt_dialog_description')}</DialogDescription></DialogHeader><form onSubmit={submit} className="min-w-0 space-y-5"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('media_search_placeholder')} aria-label={t('media_search_label')} className="pl-9" /></div><div className="max-h-[40dvh] overflow-y-auto overscroll-y-contain border border-border [scrollbar-width:thin]">{isLoading ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : !filtered.length ? <p className="p-6 text-center text-sm text-muted-foreground">{t('media_empty')}</p> : filtered.map((item) => { const selected = item.messageId === selectedMessageId; const isPdf = item.mimeType === 'application/pdf' || item.fileName.toLowerCase().endsWith('.pdf'); return <button key={item.messageId} type="button" onClick={() => setSelectedMessageId(item.messageId)} className={cn('flex w-full items-center gap-3 border-b border-border p-3 text-left last:border-0 hover:bg-muted', selected && 'bg-primary text-primary-foreground hover:bg-primary')}><div className={cn('flex h-9 w-9 shrink-0 items-center justify-center border', selected ? 'border-primary-foreground/30' : 'border-border bg-muted')}>{isPdf ? <FileText className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.fileName}</p><p className={cn('truncate text-xs', selected ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{item.chatName || item.remoteJid} · {new Date(item.timestamp).toLocaleDateString()}</p></div>{selected ? <Check className="h-4 w-4" /> : null}</button>; })}</div><div className="grid min-w-0 gap-4 sm:grid-cols-2"><FormSelect label={t('entry_label')} value={form.watch('entryId')} onChange={(value) => form.setValue('entryId', value)} options={[['none', t('unassigned')], ...entries.map((entry) => [String(entry.id), entry.title])]} /><FormField label={t('tags_label')}><Input {...form.register('tags')} placeholder={t('tags_placeholder')} /></FormField><FormField label={t('document_date_label')}><Input type="date" {...form.register('documentDate')} /></FormField><FormField label={t('payment_date_label')}><Input type="date" {...form.register('paymentDate')} /></FormField></div><FormField label={t('notes_label')}><Textarea rows={3} {...form.register('notes')} /></FormField><DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel_button')}</Button><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('link_button')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-2"><Label>{label}</Label>{children}{error ? <p className="break-words text-xs text-destructive">{error}</p> : null}</div>;
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <div className="min-w-0 space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger className="w-full min-w-0"><SelectValue className="truncate" /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]">{options.map(([id, text]) => <SelectItem key={id} value={id} className="max-w-[calc(100vw-3rem)]"><span className="truncate">{text}</span></SelectItem>)}</SelectContent></Select></div>;
}
