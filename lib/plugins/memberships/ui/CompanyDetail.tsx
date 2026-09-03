'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeDollarSign,
  Building2,
  CalendarDays,
  CreditCard,
  ExternalLink,
  FileText,
  Globe2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import type { CompanyDetailData, Plan } from './shared';

const detailFetcher = async (url: string): Promise<CompanyDetailData> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
};

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

function stateVariant(value: string): BadgeVariant {
  if (['active', 'paid'].includes(value)) return 'default';
  if (['expired', 'cancelled', 'overdue', 'archived'].includes(value)) return 'destructive';
  if (value === 'pending') return 'secondary';
  return 'outline';
}

export function CompanyDetail({ companyId }: { companyId: number }) {
  const t = useTranslations('Memberships');
  const locale = useLocale();
  const { data, error, mutate, isValidating } = useSWR<CompanyDetailData>(
    `/api/plugins/memberships/companies/${companyId}`,
    detailFetcher,
  );

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }),
    [locale],
  );

  function formatDate(value: string | null | undefined, dateOnly = false) {
    if (!value) return t('not_available');
    const parsed = new Date(dateOnly ? `${value}T00:00:00` : value);
    return Number.isNaN(parsed.getTime()) ? t('not_available') : dateFormatter.format(parsed);
  }

  function formatMoney(value: number, currency: string) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
      }).format(value / 100);
    } catch {
      return `${(value / 100).toFixed(2)} ${currency}`;
    }
  }

  function statusLabel(value: string) {
    const labels: Record<string, string> = {
      active: t('status_active'),
      archived: t('status_archived'),
      pending: t('status_pending'),
      paid: t('status_paid'),
      overdue: t('status_overdue'),
      expired: t('status_expired'),
      cancelled: t('status_cancelled'),
    };
    return labels[value] ?? value;
  }

  function billingLabel(plan: Plan) {
    if (plan.billingType === 'custom' && plan.billingLabel) return plan.billingLabel;
    return t(`billing_${plan.billingType}`);
  }

  if (error) {
    return (
      <div className="flex h-full min-h-96 items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">{t('company_error_title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('company_error_description')}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void mutate()}>
            <RefreshCw className="h-4 w-4" />
            {t('retry_button')}
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return <CompanyDetailLoading label={t('company_loading')} />;

  return (
    <div className="h-full overflow-y-auto bg-muted/20 text-foreground">
      <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
        <div className="mb-4 flex min-h-9 items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-9 px-2 text-xs">
            <Link href="/plugins/memberships/companies">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('back_to_companies')}
            </Link>
          </Button>
          {isValidating ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              {t('updating')}
            </span>
          ) : null}
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="p-5 sm:p-7 lg:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <Avatar className="h-20 w-20 shrink-0 rounded-xl border border-border sm:h-24 sm:w-24">
                  <AvatarImage src={data.logoUrl ?? undefined} alt={data.name} />
                  <AvatarFallback className="rounded-xl bg-muted">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={stateVariant(data.status)}>{statusLabel(data.status)}</Badge>
                    {data.externalSource ? <Badge variant="outline">{data.externalSource}</Badge> : null}
                  </div>
                  <h1 className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl">
                    {data.name}
                  </h1>
                  {data.description ? (
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {data.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between border-t border-border bg-muted/30 p-5 lg:border-l lg:border-t-0 lg:p-6">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('company_id_label')}</p>
                <p className="mt-2 text-4xl font-bold leading-none tabular-nums tracking-tight">
                  {String(data.id).padStart(4, '0')}
                </p>
              </div>
              <div className="mt-8 grid gap-2">
                {data.website ? (
                  <Button asChild className="h-11 w-full justify-between">
                    <a href={data.website} target="_blank" rel="noreferrer">
                      {t('open_website_button')}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
                {data.email ? (
                  <Button asChild variant="outline" className="h-11 w-full justify-between bg-background">
                    <a href={`mailto:${data.email}`}>
                      {t('send_email_button')}
                      <Mail className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid border-t border-border sm:grid-cols-2 xl:grid-cols-4">
            <Metric value={data.metrics.activeSubscriptions} label={t('active_subscriptions_metric')} />
            <Metric value={data.metrics.customers} label={t('customers_metric')} />
            <Metric value={data.metrics.activePlans} label={t('active_plans_metric')} />
            <Metric value={data.metrics.overdueSubscriptions} label={t('overdue_metric')} />
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)] xl:items-start">
          <div className="min-w-0 space-y-6">
            <SectionCard icon={BadgeDollarSign} title={t('company_plans_title')} count={data.plans.length}>
              {data.plans.length ? (
                <div className="divide-y divide-border">
                  {data.plans.map((plan) => (
                    <article key={plan.id} className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">{plan.name}</h3>
                          <Badge variant={stateVariant(plan.status)}>{statusLabel(plan.status)}</Badge>
                        </div>
                        {plan.description ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {plan.description}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('features_count', { count: plan.features.length })}
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {plan.billingType === 'free' ? t('billing_free') : formatMoney(plan.price, plan.currency)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{billingLabel(plan)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState icon={BadgeDollarSign} title={t('company_plans_empty_title')} description={t('company_plans_empty_description')} />
              )}
            </SectionCard>

            <SectionCard icon={CreditCard} title={t('company_subscriptions_title')} count={data.subscriptions.length}>
              {data.subscriptions.length ? (
                <div className="divide-y divide-border">
                  {data.subscriptions.map((subscription) => {
                    const customerName = subscription.customer?.name || subscription.contact?.name || t('unnamed_customer');
                    const chatJid = subscription.contact?.chat?.remoteJid;
                    return (
                      <article key={subscription.id} className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.6fr)_auto] sm:items-center sm:px-5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{customerName}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {subscription.subscriptionNumber} · {subscription.plan?.name || subscription.planNameSnapshot || t('not_available')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium tabular-nums">
                            {subscription.endDate ? formatDate(subscription.endDate, true) : t('no_expiration')}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatMoney(subscription.price, subscription.currency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 sm:justify-end">
                          <Badge variant={stateVariant(subscription.paymentStatus)}>
                            {statusLabel(subscription.paymentStatus)}
                          </Badge>
                          {subscription.customerId ? (
                            <Button asChild variant="ghost" size="icon" className="h-9 w-9">
                              <Link href={`/plugins/customers/${subscription.customerId}`} aria-label={t('open_customer_named', { name: customerName })}>
                                <ArrowUpRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          ) : chatJid ? (
                            <Button asChild variant="ghost" size="icon" className="h-9 w-9">
                              <Link href={`/dashboard/chat/${encodeURIComponent(chatJid)}`} aria-label={t('open_chat_named', { name: customerName })}>
                                <MessageCircle className="h-4 w-4" />
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={CreditCard} title={t('company_subscriptions_empty_title')} description={t('company_subscriptions_empty_description')} />
              )}
            </SectionCard>
          </div>

          <aside className="min-w-0 space-y-6">
            <SectionCard icon={Building2} title={t('company_information_title')}>
              <CardContent className="divide-y divide-border px-4 sm:px-5">
                {data.website ? <InfoRow icon={Globe2} label={t('website_label')} value={data.website} href={data.website} external /> : null}
                {data.email ? <InfoRow icon={Mail} label={t('email_label')} value={data.email} href={`mailto:${data.email}`} /> : null}
                {data.phone ? <InfoRow icon={Phone} label={t('phone_label')} value={data.phone} href={`tel:${data.phone}`} /> : null}
                {data.address ? <InfoRow icon={MapPin} label={t('address_label')} value={data.address} /> : null}
                {!data.website && !data.email && !data.phone && !data.address ? (
                  <EmptyState icon={Building2} title={t('company_contact_empty_title')} description={t('company_contact_empty_description')} compact />
                ) : null}
              </CardContent>
            </SectionCard>

            <SectionCard icon={FileText} title={t('internal_notes_title')}>
              <CardContent className="p-4 sm:p-5">
                {data.notes ? (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{data.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('internal_notes_empty')}</p>
                )}
              </CardContent>
            </SectionCard>

            <SectionCard icon={CalendarDays} title={t('record_information_title')}>
              <CardContent className="grid gap-4 p-4 text-xs sm:grid-cols-2 sm:p-5 xl:grid-cols-1 2xl:grid-cols-2">
                <RecordField label={t('company_id_label')} value={String(data.id)} />
                <RecordField label={t('status_label')} value={statusLabel(data.status)} />
                <RecordField label={t('source_label')} value={data.externalSource || t('source_manual')} />
                <RecordField label={t('created_at_label')} value={formatDate(data.createdAt)} />
                <RecordField label={t('updated_at_label')} value={formatDate(data.updatedAt)} />
              </CardContent>
            </SectionCard>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-b border-r border-border px-5 py-5 last:border-r-0 sm:px-6">
      <p className="text-3xl font-bold leading-none tabular-nums tracking-tight">{value}</p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
        {typeof count === 'number' ? (
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
  external,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="mt-1 block break-words text-sm font-medium">{value}</span>
      </span>
      {href ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
    </>
  );

  if (href) {
    return (
      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="flex gap-3 py-4 transition-colors hover:text-primary">
        {content}
      </a>
    );
  }

  return <div className="flex gap-3 py-4">{content}</div>;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6' : 'px-5 py-10'}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function RecordField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium text-foreground">{value}</p>
    </div>
  );
}

function CompanyDetailLoading({ label }: { label: string }) {
  return (
    <div className="h-full overflow-hidden bg-background p-4 sm:p-6" aria-label={label}>
      <div className="mx-auto max-w-[1500px] animate-pulse">
        <div className="h-9 w-28 rounded-md bg-muted" />
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <div className="flex items-center gap-5 p-6 sm:p-8">
            <div className="h-24 w-24 shrink-0 rounded-xl bg-muted" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-5 w-24 rounded-md bg-muted" />
              <div className="h-9 max-w-md rounded-md bg-muted" />
              <div className="h-4 max-w-xl rounded-md bg-muted" />
            </div>
          </div>
          <div className="grid border-t border-border sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 border-r border-border bg-muted/40" />
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
          <div className="h-80 rounded-xl border border-border bg-muted/40" />
          <div className="h-80 rounded-xl border border-border bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
