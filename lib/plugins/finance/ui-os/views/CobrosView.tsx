'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { CalendarClock, ChevronDown, ChevronRight, CircleDollarSign, Loader2, Plus, ReceiptText, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FIN_API, finFetcher } from '../api';
import { EstadoBadge, EstadoVacio } from '../componentes';
import { F } from '../estilo';
import { fmtDate, fmtMoney, fmtMoneyMap, fmtUnits } from '../format';
import type { financeOsCobros } from '@/lib/plugins/finance/server/os';

type Cobros = Awaited<ReturnType<typeof financeOsCobros>>;
type FinancingPlan = Cobros['financing']['plans'][number];
type Installment = FinancingPlan['installments'][number];

const today = () => new Date().toISOString().slice(0, 10);
const minorUnits = (value: string) => Math.round(Number(value.trim().replace(',', '.')) * 100);
const knownErrors = new Set([
  'invalid_sale', 'invalid_customer', 'invalid_project', 'sale_currency_mismatch', 'sale_without_customer',
  'sale_customer_mismatch', 'plan_has_payments', 'completed_plan', 'payment_exceeds_outstanding',
  'account_currency_mismatch', 'entry_cancelled', 'server_error',
]);
const errorCode = (value: unknown) => typeof value === 'string' && knownErrors.has(value) ? value : 'request_failed';

/** Cuotas de servicios y proyectos, más el libro general y las pasarelas. */
export function CobrosView({ onAbrirCliente }: { onAbrirCliente: (id: number) => void }) {
  const t = useTranslations('Finance.financing');
  const { data, isLoading, mutate } = useSWR<Cobros>(FIN_API.cobros, finFetcher);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{ plan: FinancingPlan; installment: Installment } | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);

  if (isLoading || !data) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  const cancelPlan = async (plan: FinancingPlan) => {
    if (!window.confirm(t('cancel_confirm', { title: plan.title }))) return;
    const response = await fetch(`/api/plugins/finance/financing-plans/${plan.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(t(`error_${errorCode(payload.error)}` as never));
    toast.success(t('cancelled_success'));
    await mutate();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className={`${F.card} overflow-hidden`} aria-labelledby="financing-title">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 id="financing-title" className="text-base font-black tracking-tight">{t('title')}</h2>
            <p className="mt-1 max-w-2xl text-xs font-medium text-muted-foreground">{t('description')}</p>
          </div>
          <Button className="min-h-10 shrink-0 gap-2 rounded-xl" onClick={() => setCreateOpen(true)}><Plus className="size-4" />{t('new_plan')}</Button>
        </div>

        {Object.keys(data.financing.summary).length > 0 && (
          <div className="grid divide-y divide-border bg-muted/30 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {Object.entries(data.financing.summary).map(([currency, summary]) => (
              <div key={currency} className="p-4">
                <p className={F.rotulo}>{currency} · {t('outstanding')}</p>
                <p className="mt-2 text-xl font-black tabular-nums">{fmtMoney(summary.outstanding, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('paid_of_total', { paid: fmtMoney(summary.paid, currency), total: fmtMoney(summary.total, currency) })}</p>
                {summary.overdue > 0 && <p className="mt-1 text-xs font-bold text-destructive">{t('overdue_count', { count: summary.overdue })}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="divide-y divide-border">
          {data.financing.plans.length === 0 && <div className="p-8"><EstadoVacio>{t('empty')}</EstadoVacio></div>}
          {data.financing.plans.map((plan) => {
            const expanded = expandedPlanId === plan.id;
            const progress = plan.totalAmount > 0 ? Math.min(100, Math.round((plan.paidAmount / plan.totalAmount) * 100)) : 0;
            return (
              <article key={plan.id} className="bg-card">
                <button type="button" className="grid w-full min-w-0 gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset md:grid-cols-[minmax(0,1.4fr)_160px_180px_28px] md:items-center" onClick={() => setExpandedPlanId(expanded ? null : plan.id)} aria-expanded={expanded}>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-black">{plan.title}</span><EstadoBadge estado={plan.status} />
                      {plan.overdueCount > 0 && <span className="text-[11px] font-bold text-destructive">{t('overdue_count', { count: plan.overdueCount })}</span>}
                    </span>
                    <span className="mt-1 block truncate text-xs font-medium text-muted-foreground">
                      {plan.customerId ? (plan.customerName ?? t('customer')) : t('unassigned')}
                      {plan.saleNumber ? ` · ${plan.saleNumber}` : ''}{plan.projectName ? ` · ${plan.projectName}` : ''}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-muted-foreground md:text-center">{t(`frequency_${plan.frequency}` as never)} · {t('installments_count', { count: plan.installmentCount })}</span>
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"><span>{progress}%</span><span className="font-black text-foreground tabular-nums">{fmtMoney(plan.outstandingAmount, plan.currency)}</span></span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></span>
                  </span>
                  {expanded ? <ChevronDown className="hidden size-4 text-muted-foreground md:block" /> : <ChevronRight className="hidden size-4 text-muted-foreground md:block" />}
                </button>

                {expanded && (
                  <div className="border-t border-border bg-muted/20 px-4 pb-4">
                    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">{t('schedule_help', { date: fmtDate(plan.firstDueOn) })}</p>
                      {plan.status === 'active' && plan.paidAmount === 0 && <Button variant="ghost" size="sm" className="h-9 justify-start gap-2 text-destructive hover:text-destructive" onClick={() => cancelPlan(plan)}><XCircle className="size-4" />{t('cancel_plan')}</Button>}
                    </div>
                    <div className="overflow-hidden rounded-xl border border-border bg-background">
                      <div className="hidden grid-cols-[70px_130px_1fr_1fr_110px] gap-3 border-b border-border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground sm:grid"><span>{t('installment')}</span><span>{t('due')}</span><span>{t('amount')}</span><span>{t('balance')}</span><span className="text-right">{t('action')}</span></div>
                      <div className="divide-y divide-border">
                        {plan.installments.map((installment) => (
                          <div key={installment.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[70px_130px_1fr_1fr_110px] sm:items-center sm:gap-3">
                            <span className="text-xs font-black">#{installment.installmentNumber}</span>
                            <span className={`text-xs font-bold ${installment.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>{fmtDate(installment.dueOn)}</span>
                            <span className="text-sm font-black tabular-nums">{fmtMoney(installment.amount, plan.currency)}</span>
                            <span className="flex items-center justify-between gap-2 sm:block"><EstadoBadge estado={installment.overdue ? 'overdue' : installment.status} /><span className="ml-2 text-xs font-bold tabular-nums text-muted-foreground">{fmtMoney(installment.outstandingAmount, plan.currency)}</span></span>
                            <span className="sm:text-right">{plan.status === 'active' && installment.outstandingAmount > 0 ? <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl" onClick={() => setPaymentTarget({ plan, installment })}><ReceiptText className="size-3.5" />{t('collect')}</Button> : <span className="text-xs font-bold text-muted-foreground">{installment.status === 'paid' ? t('paid') : '—'}</span>}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <LedgerCard title="Por cobrar · otros conceptos" total={fmtMoneyMap(data.receivables.totalByCurrency)} empty="Nada adicional por cobrar.">
          {data.receivables.rows.map((entry) => <LedgerRow key={entry.id} title={entry.title} subtitle={<>{entry.customerId ? <button type="button" className="underline decoration-dotted" onClick={() => onAbrirCliente(entry.customerId!)}>{entry.customerName ?? 'Cliente'}</button> : (entry.counterparty ?? 'Sin cliente')} · vence {fmtDate(entry.dueOn ?? entry.occurredOn)}</>} status={entry.status} overdue={entry.overdue} amount={fmtMoney(entry.amount, entry.currency)} />)}
        </LedgerCard>
        <LedgerCard title="Por pagar" total={fmtMoneyMap(data.payables.totalByCurrency)} empty="Nada por pagar.">
          {data.payables.rows.map((entry) => <LedgerRow key={entry.id} title={entry.title} subtitle={`${entry.counterparty ?? entry.category} · vence ${fmtDate(entry.dueOn ?? entry.occurredOn)}`} status={entry.status} overdue={entry.overdue} amount={fmtMoney(entry.amount, entry.currency)} />)}
        </LedgerCard>
      </div>

      <div className={`${F.card} p-4`}><span className={F.rotulo}>Renovaciones de membresías ({data.renovaciones.count})</span><div className="mt-2 divide-y divide-border/60">{data.renovaciones.rows.length === 0 && <EstadoVacio>Sin renovaciones próximas ni pagos pendientes.</EstadoVacio>}{data.renovaciones.rows.map((subscription) => <LedgerRow key={subscription.id} title={subscription.customerName ?? 'Sin cliente'} subtitle={`${subscription.planName || 'Plan'} · ${subscription.endDate ? `vence ${fmtDate(subscription.endDate)}` : 'sin vencimiento'}${typeof subscription.daysLeft === 'number' && subscription.daysLeft >= 0 ? ` (${subscription.daysLeft} días)` : ''}`} status={subscription.paymentStatus} amount={fmtMoney(subscription.price, subscription.currency)} onTitle={subscription.customerId ? () => onAbrirCliente(subscription.customerId!) : undefined} />)}</div></div>

      <div className={`${F.card} p-4`}><span className={F.rotulo}>Últimos pagos por pasarela</span><p className="mt-1 text-[11px] font-bold text-muted-foreground">Mercado Pago, transferencias y pagos offline importados. Los importes vienen de la pasarela tal cual (en unidades).</p><div className="mt-2 divide-y divide-border/60">{data.pasarela.length === 0 && <EstadoVacio>Sin transacciones de pasarela.</EstadoVacio>}{data.pasarela.map((transaction) => <LedgerRow key={transaction.id} title={transaction.customerName ?? 'Sin cliente'} subtitle={`${transaction.gateway || 'Pasarela'} · ${transaction.date ? fmtDate(new Date(transaction.date)) : '—'}`} status={transaction.paymentStatus ?? ''} amount={fmtUnits(transaction.amountUnits, transaction.currency)} onTitle={transaction.customerId ? () => onAbrirCliente(transaction.customerId!) : undefined} />)}</div></div>

      <CreateFinancingDialog open={createOpen} onOpenChange={setCreateOpen} data={data} onSaved={mutate} />
      <PaymentDialog key={paymentTarget?.installment.id ?? 'closed'} target={paymentTarget} onOpenChange={(open) => { if (!open) setPaymentTarget(null); }} accounts={data.financing.options.accounts} onSaved={mutate} />
    </div>
  );
}

function LedgerCard({ title, total, empty, children }: { title: string; total: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div className={`${F.card} p-4`}><div className="flex items-center justify-between gap-3"><span className={F.rotulo}>{title}</span><span className="text-sm font-black tabular-nums">{total}</span></div><div className="mt-2 divide-y divide-border/60">{hasChildren ? children : <EstadoVacio>{empty}</EstadoVacio>}</div></div>;
}

function LedgerRow({ title, subtitle, status, overdue, amount, onTitle }: { title: string; subtitle: React.ReactNode; status: string; overdue?: boolean; amount: string; onTitle?: () => void }) {
  return <div className="flex items-center gap-2 py-2"><div className="min-w-0 flex-1">{onTitle ? <button type="button" className="truncate text-sm font-bold hover:underline" onClick={onTitle}>{title}</button> : <p className="truncate text-sm font-bold">{title}</p>}<p className="text-[11px] font-bold text-muted-foreground">{subtitle}</p></div><EstadoBadge estado={status} overdue={overdue} /><span className="text-sm font-black tabular-nums">{amount}</span></div>;
}

function CreateFinancingDialog({ open, onOpenChange, data, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; data: Cobros; onSaved: () => Promise<unknown> | unknown }) {
  const t = useTranslations('Finance.financing');
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('none');
  const [saleId, setSaleId] = useState('none');
  const [projectId, setProjectId] = useState('none');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD' | 'PYG'>('ARS');
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [installmentCount, setInstallmentCount] = useState('1');
  const [firstDueOn, setFirstDueOn] = useState(today());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const installmentPreview = useMemo(() => { const total = minorUnits(amount); const count = Number(installmentCount); return total > 0 && Number.isInteger(count) && count > 0 ? Math.floor(total / count) : 0; }, [amount, installmentCount]);

  const selectSale = (value: string) => {
    setSaleId(value);
    if (value === 'none') return;
    const sale = data.financing.options.sales.find((item) => item.id === Number(value));
    if (!sale) return;
    const saleCurrency = sale.currency.toUpperCase();
    if (['ARS', 'USD', 'PYG'].includes(saleCurrency)) setCurrency(saleCurrency as typeof currency);
    setAmount(String(sale.total / 100));
    if (sale.customerId) setCustomerId(String(sale.customerId));
    if (!title.trim()) setTitle(`${t('sale')} ${sale.saleNumber}`);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const totalAmount = minorUnits(amount); const count = Number(installmentCount);
    if (!title.trim() || (customerId === 'none' && saleId === 'none') || !Number.isSafeInteger(totalAmount) || totalAmount <= 0 || !Number.isInteger(count) || count < 1) return toast.error(t('complete_required'));
    setSubmitting(true);
    try {
      const response = await fetch('/api/plugins/finance/financing-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), totalAmount, currency, frequency, installmentCount: count, firstDueOn, customerId: customerId === 'none' ? null : Number(customerId), saleId: saleId === 'none' ? null : Number(saleId), projectId: projectId === 'none' ? null : Number(projectId), notes }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(t(`error_${errorCode(payload.error)}` as never));
      toast.success(t('created_success'));
      setTitle(''); setCustomerId('none'); setSaleId('none'); setProjectId('none'); setAmount(''); setCurrency('ARS'); setFrequency('monthly'); setInstallmentCount('1'); setFirstDueOn(today()); setNotes(''); onOpenChange(false); await onSaved();
    } finally { setSubmitting(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{t('new_plan')}</DialogTitle><DialogDescription>{t('dialog_description')}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2">
    <Field label={t('sale')}><Select value={saleId} onValueChange={selectSale}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('unassigned')}</SelectItem>{data.financing.options.sales.filter((sale) => ['ARS', 'USD', 'PYG'].includes(sale.currency.toUpperCase())).map((sale) => <SelectItem key={sale.id} value={String(sale.id)}>{sale.saleNumber} · {fmtMoney(sale.total, sale.currency.toUpperCase())}</SelectItem>)}</SelectContent></Select></Field>
    <Field label={t('customer')}><Select value={customerId} onValueChange={setCustomerId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('unassigned')}</SelectItem>{data.financing.options.customers.map((customer) => <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>)}</SelectContent></Select></Field>
    <Field label={t('service_title')} className="sm:col-span-2"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('service_placeholder')} /></Field>
    <Field label={t('project')}><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('unassigned')}</SelectItem>{data.financing.options.projects.map((project) => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}</SelectContent></Select></Field>
    <Field label={t('currency')}><Select value={currency} onValueChange={(value) => setCurrency(value as typeof currency)} disabled={saleId !== 'none'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['ARS', 'USD', 'PYG'].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
    <Field label={t('total_amount')}><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></Field>
    <Field label={t('installment_count')}><Input type="number" min={1} max={260} value={installmentCount} onChange={(event) => setInstallmentCount(event.target.value)} /></Field>
    <Field label={t('frequency')}><Select value={frequency} onValueChange={(value) => setFrequency(value as typeof frequency)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">{t('frequency_weekly')}</SelectItem><SelectItem value="biweekly">{t('frequency_biweekly')}</SelectItem><SelectItem value="monthly">{t('frequency_monthly')}</SelectItem></SelectContent></Select></Field>
    <Field label={t('first_due')}><Input type="date" value={firstDueOn} onChange={(event) => setFirstDueOn(event.target.value)} /></Field>
  </div>{installmentPreview > 0 && <div className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3 text-sm"><CalendarClock className="size-5 text-primary" /><span>{t('preview', { count: Number(installmentCount), amount: fmtMoney(installmentPreview, currency) })}</span></div>}<Field label={t('notes')}><Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field><DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('close')}</Button><Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{t('create')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function PaymentDialog({ target, onOpenChange, accounts, onSaved }: { target: { plan: FinancingPlan; installment: Installment } | null; onOpenChange: (open: boolean) => void; accounts: Cobros['financing']['options']['accounts']; onSaved: () => Promise<unknown> | unknown }) {
  const t = useTranslations('Finance.financing');
  const [amount, setAmount] = useState(''); const [paidOn, setPaidOn] = useState(today()); const [method, setMethod] = useState('transfer'); const [accountId, setAccountId] = useState('none'); const [notes, setNotes] = useState(''); const [submitting, setSubmitting] = useState(false);
  const shownAmount = amount || (target ? String(target.installment.outstandingAmount / 100) : '');
  const compatibleAccounts = target ? accounts.filter((account) => account.currency.toUpperCase() === target.plan.currency) : [];
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!target) return;
    const paymentAmount = minorUnits(shownAmount);
    if (!Number.isSafeInteger(paymentAmount) || paymentAmount <= 0 || paymentAmount > target.installment.outstandingAmount) return toast.error(t('invalid_payment'));
    setSubmitting(true);
    try {
      const response = await fetch(`/api/plugins/finance/entries/${target.installment.entryId}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: paymentAmount, paidOn, method, notes, accountId: accountId === 'none' ? null : Number(accountId) }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(t(`error_${errorCode(payload.error)}` as never));
      toast.success(t('payment_success')); setAmount(''); setPaidOn(today()); setMethod('transfer'); setAccountId('none'); setNotes(''); onOpenChange(false); await onSaved();
    } finally { setSubmitting(false); }
  };
  return <Dialog open={Boolean(target)} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{t('collect_installment', { number: target?.installment.installmentNumber ?? 0 })}</DialogTitle><DialogDescription>{target ? `${target.plan.title} · ${fmtMoney(target.installment.outstandingAmount, target.plan.currency)}` : ''}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><Field label={t('payment_amount')}><Input inputMode="decimal" value={shownAmount} onChange={(event) => setAmount(event.target.value)} /></Field><div className="grid grid-cols-2 gap-3"><Field label={t('payment_date')}><Input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} /></Field><Field label={t('method')}><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="transfer">{t('method_transfer')}</SelectItem><SelectItem value="cash">{t('method_cash')}</SelectItem><SelectItem value="mercadopago">Mercado Pago</SelectItem><SelectItem value="card">{t('method_card')}</SelectItem><SelectItem value="other">{t('method_other')}</SelectItem></SelectContent></Select></Field></div><Field label={t('account')}><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('unassigned')}</SelectItem>{compatibleAccounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name} · {account.currency}</SelectItem>)}</SelectContent></Select></Field><Field label={t('notes')}><Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field><DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('close')}</Button><Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="size-4 animate-spin" /> : <CircleDollarSign className="size-4" />}{t('confirm_payment')}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}><Label>{label}</Label>{children}</div>;
}
