'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type BillingCycle = 'month' | 'year';

type LandingPlan = {
  id: number;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: string;
  stripePriceId: string;
  maxUsers: number;
  maxContacts: number;
  maxInstances: number;
  isAiEnabled: boolean;
  isFlowBuilderEnabled: boolean;
  trialDays: number;
};

export function LandingPricingSection({ plans }: { plans: LandingPlan[] }) {
  const locale = useLocale();
  const t = useTranslations('LandingPage');
  const availableCycles = useMemo(
    () => ({
      month: plans.some((plan) => plan.interval === 'month'),
      year: plans.some((plan) => plan.interval === 'year'),
    }),
    [plans]
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(() => (availableCycles.month ? 'month' : 'year'));
  const visiblePlans = plans.filter((plan) => plan.interval === billingCycle);

  const formatCurrency = (amount: number, currency: string) => {
    if (amount === 0) return t('pricing.free');
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100);
  };

  return (
    <section id="pricing" className="py-24 bg-muted/30 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('pricing.title')}</h2>
          <p className="text-muted-foreground text-lg">{t('pricing.subtitle')}</p>
        </div>

        <div className="mb-12 flex justify-center">
          <div className="relative inline-flex rounded-full border border-border bg-background p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setBillingCycle('month')}
              disabled={!availableCycles.month}
              className={cn(
                'relative z-10 h-10 w-32 rounded-full text-sm font-medium transition-colors',
                billingCycle === 'month' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                !availableCycles.month && 'cursor-not-allowed opacity-40'
              )}
            >
              {t('pricing.billing_monthly')}
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('year')}
              disabled={!availableCycles.year}
              className={cn(
                'relative z-10 h-10 w-32 rounded-full text-sm font-medium transition-colors',
                billingCycle === 'year' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                !availableCycles.year && 'cursor-not-allowed opacity-40'
              )}
            >
              {t('pricing.billing_yearly')}
            </button>
            <div
              className={cn(
                'absolute bottom-1 left-1 top-1 w-32 rounded-full border border-border/60 bg-muted transition-transform duration-300',
                billingCycle === 'year' && 'translate-x-full'
              )}
            />
          </div>
        </div>

        {visiblePlans.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">{t('pricing.no_plans_for_interval')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {visiblePlans.map((plan, index) => {
              const isPopular = index === 1;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    'relative flex flex-col rounded-2xl border bg-card p-8 transition-all duration-300 hover:shadow-xl',
                    isPopular ? 'z-10 scale-105 border-primary shadow-lg shadow-primary/10' : 'border-border'
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm">
                      {t('pricing.most_popular')}
                    </div>
                  )}
                  <h3 className="mb-2 text-xl font-semibold">{plan.name}</h3>
                  {plan.trialDays > 0 ? (
                    <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <Sparkles className="h-3.5 w-3.5" />
                      {t('pricing.trial_days_free', { count: plan.trialDays })}
                    </div>
                  ) : null}
                  <div className="mb-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{formatCurrency(plan.amount, plan.currency)}</span>
                    {plan.amount > 0 ? (
                      <span className="text-muted-foreground">
                        /{plan.interval === 'month' ? t('pricing.interval_month') : t('pricing.interval_year')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mb-6 min-h-[40px] text-sm text-muted-foreground">
                    {plan.description || t('pricing.default_description')}
                  </p>

                  <ul className="mb-8 flex-1 space-y-3">
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> {t('pricing.features.users', { count: plan.maxUsers })}
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> {t('pricing.features.connections', { count: plan.maxInstances })}
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> {t('pricing.features.contacts', { count: plan.maxContacts.toLocaleString() })}
                    </li>
                    {plan.isAiEnabled && (
                      <li className="flex items-center gap-3 text-sm">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> {t('pricing.features.ai')}
                      </li>
                    )}
                    {plan.isFlowBuilderEnabled && (
                      <li className="flex items-center gap-3 text-sm">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> {t('pricing.features.flow')}
                      </li>
                    )}
                  </ul>

                  <Link href={`/sign-up?priceId=${plan.stripePriceId}`}>
                    <Button
                      className={cn(
                        'h-11 w-full rounded-full text-sm font-semibold',
                        isPopular ? 'bg-primary hover:bg-primary/90' : 'bg-secondary text-foreground hover:bg-secondary/80'
                      )}
                    >
                      {t('pricing.get_started')}
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
