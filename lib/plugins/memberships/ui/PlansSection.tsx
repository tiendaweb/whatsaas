'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Archive,
  BadgeCheck,
  Building2,
  Check,
  CircleDollarSign,
  Eye,
  EyeOff,
  Globe2,
  Layers3,
  Loader2,
  LockKeyhole,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  BILLING_TYPES,
  FEATURE_TYPES,
  billingTypeLabel,
  type BillingType,
  type FeatureType,
  type PlanVisibility,
} from '../constants';
import {
  CURRENCIES,
  companyCurrencies,
  fetcher,
  formatPrice,
  planPriceIn,
  planPrices,
  preferredCurrency,
  type Company,
  type MembershipFeature,
  type Plan,
} from './shared';
import styles from './PlansSection.module.css';

type VisibilityFilter = PlanVisibility;

type PlanForm = {
  id?: number;
  companyId: string;
  name: string;
  description: string;
  billingType: BillingType;
  price: string;
  setupFee: string;
  maintenanceAmount: string;
  maintenanceIntervalMonths: string;
  billingLabel: string;
  currency: string;
  prices: Array<{ currency: string; price: string }>;
  features: MembershipFeature[];
  visibility: PlanVisibility;
  status: 'active' | 'archived';
};

function emptyPlanForm(): PlanForm {
  return {
    companyId: '__none__',
    name: '',
    description: '',
    billingType: 'monthly',
    price: '',
    setupFee: '',
    maintenanceAmount: '',
    maintenanceIntervalMonths: '',
    billingLabel: '',
    currency: 'USD',
    prices: [{ currency: 'USD', price: '' }],
    features: [],
    visibility: 'public',
    status: 'active',
  };
}

const FEATURE_ICON: Record<FeatureType, typeof Check> = {
  included: Check,
  excluded: X,
  quantity: Plus,
  custom: Minus,
};

export function PlansSection() {
  const t = useTranslations('Memberships');
  const { data, error, isLoading, mutate } = useSWR<Plan[]>('/api/plugins/memberships/plans', fetcher);
  const { data: companiesData } = useSWR<Company[]>('/api/plugins/memberships/companies', fetcher);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlanForm | undefined>();
  const [toDelete, setToDelete] = useState<Plan | null>(null);
  const [query, setQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('public');
  const [pricingPreview, setPricingPreview] = useState(false);
  // '' = mostrar cada plan en su moneda principal y listar las demás como chips.
  const [currency, setCurrency] = useState('');

  const plans = data ?? [];
  const companies = companiesData ?? [];
  const selectedCompany = companyFilter === 'all' ? null : companies.find((item) => item.id === Number(companyFilter)) ?? null;

  // Monedas del selector: las que configuró la empresa elegida, o todas las que
  // aparecen en el catálogo cuando se están viendo las empresas juntas.
  const currencyOptions = useMemo(() => {
    if (selectedCompany) return companyCurrencies(selectedCompany, plans);
    const found = new Set<string>();
    for (const company of companies) for (const item of company.currencies ?? []) found.add(item);
    for (const plan of plans) for (const price of planPrices(plan)) if (price.currency) found.add(price.currency);
    return [...found].sort();
  }, [companies, plans, selectedCompany]);

  // Al cambiar de empresa se abre en la moneda que ella muestra primero; si la
  // moneda elegida no la vende, se cae a la suya en vez de quedar en blanco.
  useEffect(() => {
    if (!selectedCompany) return;
    const options = companyCurrencies(selectedCompany, plans);
    if (!options.length) return;
    setCurrency((current) => (current && options.includes(current) ? current : preferredCurrency(selectedCompany, options)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id, plans.length]);

  const stats = useMemo(
    () => ({
      total: plans.length,
      public: plans.filter((plan) => plan.visibility !== 'private').length,
      private: plans.filter((plan) => plan.visibility === 'private').length,
      active: plans.filter((plan) => plan.status === 'active').length,
    }),
    [plans],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return plans.filter((plan) => {
      const visibility = plan.visibility ?? 'public';
      if (visibility !== visibilityFilter) return false;
      if (companyFilter !== 'all' && plan.companyId !== Number(companyFilter)) return false;
      if (!normalizedQuery) return true;
      return [plan.name, plan.description, plan.company?.name, plan.billingLabel].some((value) =>
        value?.toLocaleLowerCase().includes(normalizedQuery),
      );
    });
  }, [companyFilter, plans, query, visibilityFilter]);

  function handleNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function handleEdit(plan: Plan) {
    setEditing({
      id: plan.id,
      companyId: plan.companyId != null ? String(plan.companyId) : '__none__',
      name: plan.name,
      description: plan.description,
      billingType: plan.billingType,
      price: plan.price ? (plan.price / 100).toFixed(2) : '',
      setupFee: plan.setupFee ? (plan.setupFee / 100).toFixed(2) : '',
      maintenanceAmount: plan.maintenanceAmount ? (plan.maintenanceAmount / 100).toFixed(2) : '',
      maintenanceIntervalMonths: plan.maintenanceIntervalMonths ? String(plan.maintenanceIntervalMonths) : '',
      billingLabel: plan.billingLabel ?? '',
      currency: plan.currency,
      prices: (plan.prices?.length ? plan.prices : [{ currency: plan.currency, price: plan.price }]).map((item) => ({ currency: item.currency, price: (item.price / 100).toFixed(2) })),
      features: plan.features ?? [],
      visibility: plan.visibility ?? 'public',
      status: plan.status,
    });
    setFormOpen(true);
  }

  async function handleSave(form: PlanForm) {
    const toCents = (value: string) => Math.round(parseFloat(value || '0') * 100);
    // Una moneda sin importe no se guarda: un plan "a 0" en PYG se vería como
    // gratis en el catálogo. La moneda principal siempre entra en la lista.
    const rows = form.prices.filter((item) => item.currency && (item.price.trim() !== '' || item.currency === form.currency));
    const prices = rows.some((item) => item.currency === form.currency)
      ? rows
      : [...rows, { currency: form.currency, price: form.price }];
    const payload = {
      companyId: form.companyId === '__none__' ? null : parseInt(form.companyId, 10),
      name: form.name.trim(),
      description: form.description.trim(),
      billingType: form.billingType,
      price: form.billingType === 'free' ? 0 : toCents(form.price),
      setupFee: form.billingType === 'setup_maintenance' ? toCents(form.setupFee) : 0,
      maintenanceAmount: form.billingType === 'setup_maintenance' ? toCents(form.maintenanceAmount) : 0,
      maintenanceIntervalMonths:
        form.billingType === 'setup_maintenance' || form.billingType === 'custom'
          ? parseInt(form.maintenanceIntervalMonths || '0', 10) || null
          : null,
      billingLabel: form.billingType === 'custom' ? form.billingLabel.trim() : null,
      currency: form.currency,
      prices: form.billingType === 'free' ? [] : prices.map((item) => ({ currency: item.currency, price: toCents(item.price) })),
      features: form.features,
      visibility: form.visibility,
      status: form.status,
    };

    const response = await fetch(
      form.id ? `/api/plugins/memberships/plans/${form.id}` : '/api/plugins/memberships/plans',
      {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      toast.error(t('plan_save_error'));
      return false;
    }
    toast.success(form.id ? t('plan_updated_toast') : t('plan_created_toast'));
    await mutate();
    return true;
  }

  async function handleVisibilityChange(plan: Plan, visibility: PlanVisibility) {
    const response = await fetch(`/api/plugins/memberships/plans/${plan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    });
    if (!response.ok) {
      toast.error(t('plan_visibility_error'));
      return;
    }
    toast.success(visibility === 'public' ? t('plan_made_public_toast') : t('plan_made_private_toast'));
    await mutate();
  }

  async function handleDelete() {
    if (!toDelete) return;
    const response = await fetch(`/api/plugins/memberships/plans/${toDelete.id}`, { method: 'DELETE' });
    if (!response.ok) {
      toast.error(t('plan_delete_error'));
      return;
    }
    toast.success(t('plan_deleted_toast'));
    await mutate();
    setToDelete(null);
  }

  const hasFilters = Boolean(query.trim()) || companyFilter !== 'all' || visibilityFilter !== 'public';

  return (
    <div className={`${styles.shell} text-foreground`}>
      <div className={styles.content}>
        <div className={styles.metricGrid}>
          <PlanMetric icon={Layers3} label={t('plans_total_metric')} value={stats.total} />
          <PlanMetric icon={Globe2} label={t('plans_public_metric')} value={stats.public} />
          <PlanMetric icon={LockKeyhole} label={t('plans_private_metric')} value={stats.private} />
          <PlanMetric icon={BadgeCheck} label={t('plans_active_metric')} value={stats.active} />
        </div>

        <section className={styles.controls} aria-label={t('plans_filters_label')}>
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('search_plans_placeholder')}
                className="h-11 w-full rounded-2xl border-border/60 bg-background/45 pl-10 pr-10 shadow-none backdrop-blur-xl"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t('clear_search')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className={styles.segmentedControl}>
                {(['public', 'private'] as const).map((visibility) => (
                  <button
                    key={visibility}
                    type="button"
                    aria-pressed={visibilityFilter === visibility}
                    onClick={() => setVisibilityFilter(visibility)}
                    className={visibilityFilter === visibility ? styles.segmentActive : styles.segment}
                  >
                    {visibility === 'public' ? t('visibility_public_plural') : t('visibility_private_plural')}
                  </button>
                ))}
              </div>
              {companies.length > 0 ? (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-11 w-full rounded-2xl border-border/60 bg-background/45 shadow-none sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all_companies_filter')}</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button onClick={handleNew} className="h-11 rounded-2xl px-4 shadow-lg shadow-primary/15">
                <Plus className="h-4 w-4" />
                {t('new_plan_button')}
              </Button>
              {currencyOptions.length > 1 ? (
                <Select value={currency || '__all__'} onValueChange={(value) => setCurrency(value === '__all__' ? '' : value)}>
                  <SelectTrigger className="h-11 w-full rounded-2xl border-border/60 bg-background/45 shadow-none sm:w-36" aria-label="Moneda">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas las monedas</SelectItem>
                    {currencyOptions.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button variant={pricingPreview ? 'secondary' : 'outline'} onClick={() => setPricingPreview((value) => !value)} className="h-11 rounded-2xl">{pricingPreview ? 'Vista gestión' : 'Vista pricing'}</Button>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border/45 px-4 py-3 text-xs text-muted-foreground">
            <span>{t('plans_results_count', { count: filtered.length })}</span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <EyeOff className="h-3.5 w-3.5" />
              {t('private_plans_catalog_hint')}
            </span>
          </div>
        </section>

        <div className="px-4 pb-4">
          {isLoading ? (
            <PlanState icon={Loader2} title={t('plans_loading')} spinning />
          ) : error ? (
            <PlanState
              icon={CircleDollarSign}
              title={t('plans_error_title')}
              description={t('plans_error_description')}
              action={<Button variant="outline" onClick={() => mutate()}>{t('retry_button')}</Button>}
            />
          ) : filtered.length === 0 ? (
            <PlanState
              icon={hasFilters ? Search : Sparkles}
              title={hasFilters ? t('plans_filter_empty_title') : t('plans_empty_title')}
              description={hasFilters ? t('plans_filter_empty_description') : t('plans_empty_description')}
              action={
                hasFilters ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery('');
                      setCompanyFilter('all');
                      setVisibilityFilter('public');
                    }}
                  >
                    {t('clear_filters_button')}
                  </Button>
                ) : (
                  <Button onClick={handleNew}><Plus className="h-4 w-4" />{t('new_plan_button')}</Button>
                )
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onEdit={() => handleEdit(plan)}
                  onDelete={() => setToDelete(plan)}
                  onVisibilityChange={(visibility) => handleVisibilityChange(plan, visibility)}
                  pricingPreview={pricingPreview}
                  currency={currency}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <PlanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={handleSave}
        initialData={editing}
        companies={companies}
      />

      {toDelete ? (
        <Dialog open onOpenChange={(open) => !open && setToDelete(null)}>
          <DialogContent className="rounded-3xl border-border/60 bg-card/90 sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('delete_plan_title', { name: toDelete.name })}</DialogTitle>
              <DialogDescription>{t('delete_plan_description')}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setToDelete(null)}>{t('cancel_button')}</Button>
              <Button variant="destructive" onClick={handleDelete}>{t('delete_button')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function PlanMetric({ icon: Icon, label, value }: { icon: typeof Layers3; label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <div className="flex h-full items-start justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
        </div>
        <span className={styles.metricIcon}><Icon className="h-4 w-4" /></span>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  onEdit,
  onDelete,
  onVisibilityChange,
  pricingPreview,
  currency,
}: {
  plan: Plan;
  onEdit: () => void;
  onDelete: () => void;
  onVisibilityChange: (visibility: PlanVisibility) => void;
  pricingPreview: boolean;
  currency: string;
}) {
  const t = useTranslations('Memberships');
  const visibility = plan.visibility ?? 'public';
  const VisibilityIcon = visibility === 'public' ? Globe2 : LockKeyhole;
  const isFree = plan.billingType === 'free';
  const visibleFeatures = pricingPreview ? plan.features : plan.features.slice(0, 4);
  const prices = planPrices(plan);
  // Con una moneda elegida se muestra ese precio y nada más: mezclar monedas en
  // la misma tarjeta es justo lo que confunde al que está comparando planes.
  const selected = currency ? planPriceIn(plan, currency) : null;
  const missing = Boolean(currency) && !selected;
  const shown = selected ?? prices[0];

  return (
    <article className={`${styles.planCard} ${visibility === 'private' ? styles.privateCard : ''}`}>
      <div className="relative z-10 flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={visibility === 'public' ? styles.publicBadge : styles.privateBadge}>
                <VisibilityIcon className="h-3.5 w-3.5" />
                {visibility === 'public' ? t('visibility_public') : t('visibility_private')}
              </span>
              {plan.status === 'archived' ? (
                <span className={styles.archivedBadge}><Archive className="h-3.5 w-3.5" />{t('status_archived')}</span>
              ) : null}
            </div>
            <h2 className="truncate text-lg font-semibold tracking-tight">{plan.name}</h2>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground" aria-label={t('plan_actions_label', { name: plan.name })}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl">
              <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" />{t('edit_button')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onVisibilityChange(visibility === 'public' ? 'private' : 'public')}>
                {visibility === 'public' ? <LockKeyhole className="mr-2 h-3.5 w-3.5" /> : <Globe2 className="mr-2 h-3.5 w-3.5" />}
                {visibility === 'public' ? t('make_plan_private') : t('make_plan_public')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" />{t('delete_button')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-6">
          <div className="flex items-end gap-2">
            <span className={`text-3xl font-semibold tracking-[-0.05em] ${missing && !isFree ? 'text-muted-foreground/60' : ''}`}>
              {isFree ? t('billing_free') : missing ? `— ${currency}` : formatPrice(shown.price, shown.currency)}
            </span>
            {!isFree ? <span className="pb-1 text-xs text-muted-foreground">/ {localizedBillingLabel(t, plan.billingType, plan.billingLabel)}</span> : null}
          </div>
          {missing && !isFree ? (
            <p className="mt-1.5 text-xs text-muted-foreground">Este plan todavía no tiene precio en {currency}.</p>
          ) : null}
          {!currency && prices.length > 1 ? <div className="mt-2 flex flex-wrap gap-1.5">{prices.map((item) => <span key={item.currency} className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{item.currency} {formatPrice(item.price, item.currency)}</span>)}</div> : null}
          {plan.billingType === 'setup_maintenance' && !missing ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('plan_setup_summary', {
                setup: formatPrice(shown.setupFee ?? plan.setupFee, shown.currency),
                maintenance: formatPrice(shown.maintenanceAmount ?? plan.maintenanceAmount, shown.currency),
                months: plan.maintenanceIntervalMonths ?? 1,
              })}
            </p>
          ) : null}
        </div>

        {plan.description ? <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">{plan.description}</p> : null}

        <div className="my-5 h-px bg-border/50" />

        <div className="min-h-24 flex-1">
          {visibleFeatures.length > 0 ? (
            <ul className="space-y-2.5">
              {visibleFeatures.map((feature, index) => {
                const Icon = FEATURE_ICON[feature.type] ?? Check;
                const excluded = feature.type === 'excluded';
                return (
                  <li key={`${feature.label}-${index}`} className={`flex items-center gap-2.5 text-xs ${excluded ? 'text-muted-foreground/60 line-through' : 'text-foreground'}`}>
                    <span className={excluded ? styles.featureIconMuted : styles.featureIcon}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="truncate">
                      {feature.type === 'quantity' && feature.value ? `${feature.value} ` : ''}
                      {feature.label}
                      {feature.type === 'custom' && feature.value ? `: ${feature.value}` : ''}
                    </span>
                  </li>
                );
              })}
              {plan.features.length > visibleFeatures.length ? (
                <li className="pl-8 text-xs text-muted-foreground">{t('more_features_count', { count: plan.features.length - visibleFeatures.length })}</li>
              ) : null}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('plan_no_features')}</p>
          )}
        </div>

        <footer className="mt-5 flex items-center justify-between gap-3 border-t border-border/45 pt-4">
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{plan.company?.name ?? t('plan_without_company')}</span>
          </span>
          <Button variant="outline" size="sm" onClick={onEdit} className="h-8 rounded-xl bg-background/35">
            <Pencil className="h-3.5 w-3.5" />{t('edit_button')}
          </Button>
        </footer>
      </div>
    </article>
  );
}

function PlanState({
  icon: Icon,
  title,
  description,
  action,
  spinning = false,
}: {
  icon: typeof Layers3;
  title: string;
  description?: string;
  action?: ReactNode;
  spinning?: boolean;
}) {
  return (
    <div className={styles.state}>
      <span className={styles.stateIcon}><Icon className={`h-5 w-5 ${spinning ? 'animate-spin' : ''}`} /></span>
      <h2 className="mt-4 text-sm font-semibold">{title}</h2>
      {description ? <p className="mt-1 max-w-md text-center text-xs leading-5 text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function PlanFormDialog({
  open,
  onOpenChange,
  onSave,
  initialData,
  companies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: PlanForm) => Promise<boolean>;
  initialData?: PlanForm;
  companies: Company[];
}) {
  const t = useTranslations('Memberships');
  const [form, setForm] = useState<PlanForm>(emptyPlanForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initialData ?? emptyPlanForm());
  }, [initialData, open]);

  function set<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addFeature() {
    set('features', [...form.features, { label: '', type: 'included' }]);
  }

  function updateFeature(index: number, patch: Partial<MembershipFeature>) {
    set('features', form.features.map((feature, currentIndex) => (currentIndex === index ? { ...feature, ...patch } : feature)));
  }

  function removeFeature(index: number) {
    set('features', form.features.filter((_, currentIndex) => currentIndex !== index));
  }

  const planCompany = form.companyId === '__none__' ? null : companies.find((item) => item.id === Number(form.companyId)) ?? null;
  const companyOffers = planCompany?.currencies ?? [];

  /**
   * Cambiar de empresa completa las filas de precio con las monedas que esa
   * empresa vende, sin pisar los importes ya cargados: el caso real es el mismo
   * plan en ARS, PYG y USD y cargarlas a mano una por una se presta a olvidos.
   */
  function selectCompany(value: string) {
    const company = value === '__none__' ? null : companies.find((item) => item.id === Number(value)) ?? null;
    setForm((current) => {
      if (!company?.currencies?.length) return { ...current, companyId: value };
      const byCurrency = new Map(current.prices.map((item) => [item.currency, item]));
      const prices = company.currencies.map((currency) => byCurrency.get(currency) ?? { currency, price: '' });
      // Se conservan las monedas fuera del listado de la empresa que ya tenían precio.
      for (const item of current.prices) {
        if (!company.currencies.includes(item.currency) && item.price.trim()) prices.push(item);
      }
      return { ...current, companyId: value, prices, currency: company.defaultCurrency ?? company.currencies[0] ?? current.currency };
    });
  }

  function addPrice() {
    const used = new Set(form.prices.map((item) => item.currency));
    const next = companyOffers.find((item) => !used.has(item)) ?? CURRENCIES.find((item) => !used.has(item)) ?? 'USD';
    set('prices', [...form.prices, { currency: next, price: '' }]);
  }
  /**
   * `price`/`currency` (el precio principal) y la fila de esa misma moneda son
   * el mismo número: si se separan, el catálogo muestra uno y la suscripción
   * cobra el otro. Se sincronizan en los dos sentidos.
   */
  function updatePrice(index: number, patch: Partial<PlanForm['prices'][number]>) {
    setForm((current) => {
      const prices = current.prices.map((item, i) => (i === index ? { ...item, ...patch } : item));
      const principal = prices.find((item) => item.currency === current.currency);
      return { ...current, prices, ...(principal ? { price: principal.price } : {}) };
    });
  }

  function removePrice(index: number) { set('prices', form.prices.filter((_, i) => i !== index)); }

  function setPrincipalPrice(value: string) {
    setForm((current) => ({
      ...current,
      price: value,
      prices: current.prices.map((item) => (item.currency === current.currency ? { ...item, price: value } : item)),
    }));
  }

  function setPrincipalCurrency(value: string) {
    setForm((current) => {
      const row = current.prices.find((item) => item.currency === value);
      return { ...current, currency: value, ...(row ? { price: row.price } : {}) };
    });
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error(t('plan_name_required'));
      return;
    }
    if (form.billingType === 'custom' && !form.billingLabel.trim()) {
      toast.error(t('plan_custom_label_required'));
      return;
    }
    if (form.features.some((feature) => !feature.label.trim())) {
      toast.error(t('plan_feature_name_required'));
      return;
    }
    setIsSaving(true);
    try {
      const saved = await onSave(form);
      if (saved) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  const showPrice = form.billingType !== 'free';
  const showSetup = form.billingType === 'setup_maintenance';
  const showInterval = form.billingType === 'setup_maintenance' || form.billingType === 'custom';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-border/60 bg-card/90 p-0 backdrop-blur-2xl sm:max-w-2xl">
        <DialogHeader className="border-b border-border/50 px-6 py-5 text-left">
          <DialogTitle>{initialData?.id ? t('edit_plan_title') : t('new_plan_title')}</DialogTitle>
          <DialogDescription>{t('plan_form_description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          <section className="space-y-3">
            <div>
              <Label>{t('plan_visibility_label')}</Label>
              <p className="mt-1 text-xs text-muted-foreground">{t('plan_visibility_help')}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['public', 'private'] as const).map((visibility) => {
                const selected = form.visibility === visibility;
                const Icon = visibility === 'public' ? Globe2 : LockKeyhole;
                return (
                  <button
                    key={visibility}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set('visibility', visibility)}
                    className={`${styles.visibilityOption} ${selected ? styles.visibilityOptionActive : ''}`}
                  >
                    <span className={styles.visibilityOptionIcon}><Icon className="h-4 w-4" /></span>
                    <span className="text-left">
                      <span className="block text-sm font-semibold">{visibility === 'public' ? t('visibility_public') : t('visibility_private')}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        {visibility === 'public' ? t('visibility_public_help') : t('visibility_private_help')}
                      </span>
                    </span>
                    {selected ? <Check className="ml-auto h-4 w-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-background/30 p-4">
            <div className="flex items-center justify-between gap-3"><div><Label>Precios por moneda</Label><p className="mt-1 text-xs text-muted-foreground">Un mismo plan puede venderse en ARS, USD y PYG.</p></div><Button type="button" variant="outline" size="sm" onClick={addPrice} className="rounded-xl"><Plus className="h-3.5 w-3.5" />Agregar moneda</Button></div>
            <div className="space-y-2">{form.prices.map((item, index) => <div key={index} className="flex gap-2"><Select value={item.currency} onValueChange={(value) => updatePrice(index, { currency: value })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select><Input type="number" min="0" step="0.01" value={item.price} onChange={(event) => updatePrice(index, { price: event.target.value })} placeholder="0.00" className="flex-1" />{item.currency === form.currency ? <span className="self-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">principal</span> : null}{form.prices.length > 1 ? <Button type="button" variant="ghost" size="icon" onClick={() => removePrice(index)}><X className="h-4 w-4" /></Button> : null}</div>)}</div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-name">{t('plan_name_label')} <span className="text-destructive">*</span></Label>
              <Input id="plan-name" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder={t('plan_name_placeholder')} autoFocus className="w-full" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('company_label')}</Label>
              <Select value={form.companyId} onValueChange={selectCompany}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('plan_without_company')}</SelectItem>
                  {companies.map((company) => <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plan-description">{t('plan_description_label')}</Label>
              <Textarea id="plan-description" value={form.description} onChange={(event) => set('description', event.target.value)} rows={3} className="resize-none" placeholder={t('plan_description_placeholder')} />
            </div>
          </section>

          <section className="grid gap-4 rounded-2xl border border-border/50 bg-background/30 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('billing_type_label')}</Label>
              <Select value={form.billingType} onValueChange={(value) => set('billingType', value as BillingType)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_TYPES.map((type) => <SelectItem key={type} value={type}>{localizedBillingLabel(t, type)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('currency_label')}</Label>
              <Select value={form.currency} onValueChange={setPrincipalCurrency}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{(companyOffers.length ? companyOffers : CURRENCIES).map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {form.billingType === 'custom' ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="billing-label">{t('custom_billing_label')} <span className="text-destructive">*</span></Label>
                <Input id="billing-label" value={form.billingLabel} onChange={(event) => set('billingLabel', event.target.value)} placeholder={t('custom_billing_placeholder')} />
              </div>
            ) : null}

            {showPrice ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-price">{showSetup ? t('maintenance_fee_label') : t('price_label')}</Label>
                  <Input id="plan-price" type="number" min="0" step="0.01" value={showSetup ? form.maintenanceAmount : form.price} onChange={(event) => (showSetup ? set('maintenanceAmount', event.target.value) : setPrincipalPrice(event.target.value))} placeholder="0.00" />
                </div>
                {showSetup ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="setup-fee">{t('setup_fee_label')}</Label>
                    <Input id="setup-fee" type="number" min="0" step="0.01" value={form.setupFee} onChange={(event) => set('setupFee', event.target.value)} placeholder="0.00" />
                  </div>
                ) : null}
                {showInterval ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="renewal-months">{t('renewal_months_label')}</Label>
                    <Input id="renewal-months" type="number" min="1" step="1" value={form.maintenanceIntervalMonths} onChange={(event) => set('maintenanceIntervalMonths', event.target.value)} placeholder="1" />
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>{t('features_label')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t('features_help')}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addFeature} className="rounded-xl">
                <Plus className="h-3.5 w-3.5" />{t('add_feature_button')}
              </Button>
            </div>
            {form.features.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 py-5 text-center text-xs text-muted-foreground">{t('features_empty')}</div>
            ) : (
              <div className="space-y-2">
                {form.features.map((feature, index) => (
                  <div key={index} className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-background/25 p-3 sm:flex-row sm:items-center">
                    <Select value={feature.type} onValueChange={(value) => updateFeature(index, { type: value as FeatureType })}>
                      <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FEATURE_TYPES.map((type) => <SelectItem key={type} value={type}>{localizedFeatureLabel(t, type)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {(feature.type === 'quantity' || feature.type === 'custom') ? (
                      <Input value={feature.value ?? ''} onChange={(event) => updateFeature(index, { value: event.target.value })} placeholder={feature.type === 'quantity' ? t('feature_quantity_placeholder') : t('feature_value_placeholder')} className="w-full sm:w-24" />
                    ) : null}
                    <Input value={feature.label} onChange={(event) => updateFeature(index, { label: event.target.value })} placeholder={t('feature_name_placeholder')} className="min-w-0 flex-1" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)} className="h-9 w-9 self-end rounded-xl text-muted-foreground hover:text-destructive sm:self-auto" aria-label={t('remove_feature_label')}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-1.5">
            <Label>{t('status_label')}</Label>
            <Select value={form.status} onValueChange={(value) => set('status', value as PlanForm['status'])}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('status_active')}</SelectItem>
                <SelectItem value="archived">{t('status_archived')}</SelectItem>
              </SelectContent>
            </Select>
          </section>
        </div>

        <DialogFooter className="sticky bottom-0 flex-row justify-end gap-2 border-t border-border/50 bg-card/90 px-6 py-4 backdrop-blur-xl">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>{t('cancel_button')}</Button>
          <Button onClick={save} disabled={isSaving} className="rounded-xl px-5">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSaving ? t('saving_button') : t('save_plan_button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function localizedBillingLabel(
  t: ReturnType<typeof useTranslations<'Memberships'>>,
  type: BillingType,
  customLabel?: string | null,
) {
  if (type === 'custom' && customLabel?.trim()) return customLabel.trim();
  const keys: Record<BillingType, 'billing_free' | 'billing_monthly' | 'billing_annual' | 'billing_lifetime' | 'billing_setup_maintenance' | 'billing_custom'> = {
    free: 'billing_free',
    monthly: 'billing_monthly',
    annual: 'billing_annual',
    lifetime: 'billing_lifetime',
    setup_maintenance: 'billing_setup_maintenance',
    custom: 'billing_custom',
  };
  return t(keys[type]) || billingTypeLabel(type, customLabel);
}

function localizedFeatureLabel(t: ReturnType<typeof useTranslations<'Memberships'>>, type: FeatureType) {
  const keys: Record<FeatureType, 'feature_included' | 'feature_excluded' | 'feature_quantity' | 'feature_custom'> = {
    included: 'feature_included',
    excluded: 'feature_excluded',
    quantity: 'feature_quantity',
    custom: 'feature_custom',
  };
  return t(keys[type]);
}
