'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Loader2, MessageCircle, Sparkles, ArrowRight, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  checkoutAction,
  joinFreePlanAction,
  customerPortalAction,
  submitManualPaymentProof,
} from '@/lib/payments/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBranding } from '@/providers/branding-provider';
import { brandName } from '@/lib/branding/constants';

type Plan = {
  id: number;
  name: string;
  description: string | null;
  amount: number;
  interval: string;
  currency: string;
  stripePriceId: string;
  maxUsers: number;
  maxContacts: number;
  maxInstances: number;
  isAiEnabled: boolean;
  isFlowBuilderEnabled: boolean;
  isCampaignsEnabled: boolean;
  isTemplatesEnabled: boolean;
  trialDays: number;
  pricingCustomItems?: Array<{ text: string; included: boolean }> | null;
};


type TeamData = {
  planId: number | null;
  subscriptionStatus: string | null;
};

export function PricingClient({
  allPlans,
  currentTeam,
  paymentProvider,
}: {
  allPlans: Plan[],
  currentTeam?: TeamData,
  paymentProvider: 'stripe' | 'manual' | 'mercadopago' | 'lemonsqueezy'
}) {
  const locale = useLocale();
  const t = useTranslations('LandingPage');
  const availableBillingCycles = useMemo(
    () => ({
      month: allPlans.some((plan) => plan.interval === 'month'),
      year: allPlans.some((plan) => plan.interval === 'year'),
    }),
    [allPlans]
  );
  const [billingCycle, setBillingCycle] = useState<'month' | 'year'>(() => (availableBillingCycles.month ? 'month' : 'year'));
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { branding } = useBranding();
  
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [selectedFreePlan, setSelectedFreePlan] = useState<Plan | null>(null);
  const searchParams = useSearchParams();
  const manualPaymentPending = searchParams.get('manualPayment') === 'pending';
  const manualPaymentSubmitted = searchParams.get('manualPayment') === 'submitted';
  const manualPaymentId = searchParams.get('paymentId');
  const paymentNotice = searchParams.get('payment_notice');

  const featuredPlanIndex = 1;
  const filteredPlans = allPlans.filter((plan) => plan.interval === billingCycle);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount / 100);
  };

  const handlePlanSelection = async (plan: Plan) => {
    setActionError(null);
    if (plan.amount === 0) {
      
      setSelectedFreePlan(plan);
      setIsConfirmationOpen(true);
    } else {
      
      setLoadingId(plan.id);
      const formData = new FormData();
      formData.append('priceId', plan.stripePriceId);
      formData.append('planId', plan.id.toString());
      try {
        await checkoutAction(formData);
      } catch (error) {
        console.error('Error iniciando checkout:', error);
        setActionError('No se pudo iniciar el checkout. Revisa la configuración de pagos e intenta nuevamente.');
        setLoadingId(null);
      }
    }
  };

  const confirmFreePlan = async () => {
    if (!selectedFreePlan) return;
    setActionError(null);
    setLoadingId(selectedFreePlan.id);
    const formData = new FormData();
    formData.append('planId', selectedFreePlan.id.toString());
    try {
      await joinFreePlanAction(formData);
    } catch (error) {
      console.error('Error cambiando al plan gratuito:', error);
      setActionError('No se pudo cambiar al plan gratuito. Intenta nuevamente.');
      setLoadingId(null);
    }
  };

  const handlePortalAccess = async () => {
    setIsPortalLoading(true);
    setActionError(null);
    try {
      await customerPortalAction(new FormData());
    } catch (error) {
      console.error('Error abriendo el portal de Stripe:', error);
      setActionError('No se pudo abrir el portal de facturación. Intenta nuevamente.');
      setIsPortalLoading(false);
    }
  };

  return (
    <div className="min-h-full w-full bg-background dark:bg-black py-16 px-4 sm:px-6 lg:px-8 overflow-y-auto font-sans">
      <div className="max-w-7xl mx-auto text-center mb-16">
        <div className="flex items-center justify-center gap-2 mb-4">
          <MessageCircle className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium tracking-wide uppercase text-primary">{brandName(branding)}</span>
        </div>
        
        <h1 className="text-4xl font-medium text-foreground sm:text-6xl tracking-tight mb-4">
          {t('pricing.dashboard_title_line1')}
          <br />
          <span className="text-muted-foreground/80">{t('pricing.dashboard_title_line2')}</span>
        </h1>
        
        <p className="max-w-xl mx-auto text-lg text-muted-foreground mb-10">
          {t('pricing.dashboard_subtitle')}
        </p>

        <div className="flex flex-col items-center gap-6">
            <div className="relative inline-flex bg-muted/50 dark:bg-zinc-900 border border-border p-1 rounded-full">
            <button
                onClick={() => setBillingCycle('month')}
                disabled={!availableBillingCycles.month}
                className={cn(
                "relative w-32 py-2 text-sm font-medium rounded-full z-10 transition-colors duration-200",
                billingCycle === 'month' ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                !availableBillingCycles.month && "cursor-not-allowed opacity-40"
                )}
            >
                {t('pricing.billing_monthly')}
            </button>
            <button
                onClick={() => setBillingCycle('year')}
                disabled={!availableBillingCycles.year}
                className={cn(
                "relative w-32 py-2 text-sm font-medium rounded-full z-10 transition-colors duration-200",
                billingCycle === 'year' ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                !availableBillingCycles.year && "cursor-not-allowed opacity-40"
                )}
            >
                {t('pricing.billing_yearly')}
            </button>
            <div
                className={cn(
                "absolute top-1 bottom-1 left-1 w-32 bg-background dark:bg-zinc-800 rounded-full shadow-sm transition-transform duration-300 ease-in-out border border-border/50",
                billingCycle === 'year' && "translate-x-full"
                )}
            />
            </div>

            {manualPaymentPending && (
                <div className="w-full max-w-xl rounded-xl border bg-card p-4 text-left">
                  <p className="text-sm font-medium">{t('pricing.manual_payment_pending')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('pricing.manual_payment_proof_help')}
                  </p>
                  {manualPaymentId ? (
                    <form action={submitManualPaymentProof} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                      <input type="hidden" name="paymentId" value={manualPaymentId} />
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="manual-proof">{t('pricing.manual_payment_proof_label')}</Label>
                        <Input
                          id="manual-proof"
                          name="proof"
                          type="file"
                          accept="application/pdf,image/png,image/jpeg,image/webp"
                          required
                        />
                      </div>
                      <Button type="submit">{t('pricing.manual_payment_proof_submit')}</Button>
                    </form>
                  ) : null}
                </div>
            )}
            {manualPaymentSubmitted ? (
              <p className="text-sm text-primary">{t('pricing.manual_payment_submitted')}</p>
            ) : null}
            {paymentNotice === 'stripe_not_configured' && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {t('pricing.stripe_not_configured')}
              </p>
            )}
            {actionError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {actionError}
              </p>
            )}

            {currentTeam && currentTeam.subscriptionStatus === 'active' && paymentProvider === 'stripe' && (
                <button 
                    onClick={handlePortalAccess}
                    disabled={isPortalLoading}
                    className="text-sm text-muted-foreground underline hover:text-foreground flex items-center gap-1"
                >
                    {isPortalLoading && <Loader2 className="h-3 w-3 animate-spin"/>}
                    {t('pricing.billing_portal_link')}
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto items-start pb-40">
        {filteredPlans.length === 0 ? (
          <div className="md:col-span-3 rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t('pricing.no_plans_for_interval')}
          </div>
        ) : filteredPlans.map((plan, index) => {
          const isFeatured = index === featuredPlanIndex;
          const isCurrentPlan = currentTeam?.planId === plan.id;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col p-8 transition-all duration-300 h-full",
                "rounded-[2.5rem] border",
                isFeatured 
                  ? "bg-zinc-900 border-primary shadow-[0_0_40px_-10px_hsl(var(--primary)/0.3)] dark:bg-zinc-900 dark:border-primary z-10 scale-105" 
                  : "bg-background border-border hover:border-foreground/20 dark:bg-black dark:border-zinc-800",
                
              )}
            >
              <div className="mb-8">
                <div className="h-12 w-12 rounded-full border border-border/50 bg-gradient-to-br from-background to-muted flex items-center justify-center mb-6">
                  <MessageCircle className={cn("h-6 w-6", isFeatured ? "text-primary" : "text-foreground")} />
                </div>
                
                <h3 className={cn("text-2xl font-medium mb-2", isFeatured ? "text-white" : "text-foreground")}>
                  {plan.name}
                  {isCurrentPlan && <span className="ml-2 text-xs bg-green-500/20 text-green-500 px-2 py-1 rounded-full border border-green-500/30">{t('pricing.active_badge')}</span>}
                </h3>
                <p className={cn("text-sm", isFeatured ? "text-zinc-400" : "text-muted-foreground")}>
                  {plan.description || t('pricing.default_description')}
                </p>
                {plan.trialDays > 0 && (
                  <div className={cn(
                    "mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                    isFeatured
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  )}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('pricing.trial_days_free', { count: plan.trialDays })}
                  </div>
                )}
              </div>

              <div className="mb-8 flex items-baseline gap-1">
                <span className={cn("text-5xl font-semibold tracking-tight", isFeatured ? "text-white" : "text-foreground")}>
                  {plan.amount === 0 ? t('pricing.free') : formatCurrency(plan.amount, plan.currency)}
                </span>
                {plan.amount > 0 && (
                  <span className={cn("text-sm", isFeatured ? "text-zinc-500" : "text-muted-foreground")}>
                    / {plan.interval === 'month' ? t('pricing.interval_month') : t('pricing.interval_year')}
                  </span>
                )}
              </div>

              <Button
                onClick={() => handlePlanSelection(plan)}
                disabled={loadingId === plan.id || isCurrentPlan}
                className={cn(
                  "w-full rounded-full h-12 font-medium text-sm mb-10 transition-all",
                  isFeatured
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 border-0 shadow-lg shadow-primary/20"
                    : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700",
                  isCurrentPlan && "opacity-50 cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted"
                )}
              >
                {loadingId === plan.id ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                ) : isCurrentPlan ? (
                    t('pricing.current_plan')
                ) : (
                    plan.amount === 0 ? t('pricing.downgrade_to_free') : t('pricing.upgrade_switch')
                )}
              </Button>

              <div className="space-y-6 flex-1">
                <p className={cn("text-sm font-medium", isFeatured ? "text-white" : "text-foreground")}>{t('pricing.included_title')}</p>
                <ul className="space-y-4">
                  <FeatureItem text={t('pricing.features_team_members', { count: plan.maxUsers })} isFeatured={isFeatured} />
                  <FeatureItem text={t('pricing.contacts_count', { count: plan.maxContacts })} isFeatured={isFeatured} />
                  <FeatureItem text={t('pricing.whatsapp_connections_count', { count: plan.maxInstances })} isFeatured={isFeatured} />
                  <FeatureItem text={t('pricing.features_ai_agent')} isEnabled={plan.isAiEnabled} isFeatured={isFeatured} />
                  <FeatureItem text={t('pricing.features_flow_builder')} isEnabled={plan.isFlowBuilderEnabled} isFeatured={isFeatured} />
                  <FeatureItem text={t('pricing.features_mass_campaigns')} isEnabled={plan.isCampaignsEnabled} isFeatured={isFeatured} />
                  <FeatureItem text={t('pricing.features_waba_templates')} isEnabled={plan.isTemplatesEnabled} isFeatured={isFeatured} />
                  {(plan.pricingCustomItems ?? []).map((item, customIndex) => (
                    <FeatureItem
                      key={`${plan.id}-custom-${customIndex}`}
                      text={item.text}
                      isEnabled={item.included}
                      isFeatured={isFeatured}
                    />
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('pricing.confirm_downgrade_title')}</DialogTitle>
            <DialogDescription>
              {t('pricing.confirm_downgrade_desc', { plan: selectedFreePlan?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
             <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{t('pricing.plan_limits')}</p>
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                        <li>{t('pricing.users_count', { count: selectedFreePlan?.maxUsers ?? 0 })}</li>
                        <li>{t('pricing.contacts_count', { count: selectedFreePlan?.maxContacts ?? 0 })}</li>
                        <li>{t('pricing.whatsapp_connections_count', { count: selectedFreePlan?.maxInstances ?? 0 })}</li>
                    </ul>
                </div>
             </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmationOpen(false)}>{t('pricing.cancel')}</Button>
            <Button onClick={confirmFreePlan} disabled={loadingId !== null}>
                {loadingId === selectedFreePlan?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                {t('pricing.confirm_switch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureItem({ text, isEnabled = true, isFeatured }: { text: string; isEnabled?: boolean; isFeatured: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <div className={cn(
        "flex items-center justify-center h-5 w-5 rounded-full border shrink-0",
        isEnabled 
          ? (isFeatured ? "border-primary text-primary bg-primary/10" : "border-foreground text-foreground")
          : (isFeatured ? "border-zinc-700 text-zinc-700" : "border-zinc-300 text-zinc-300 dark:border-zinc-800 dark:text-zinc-800")
      )}>
        {isEnabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </div>
      <span className={cn(
        "text-sm", 
        isEnabled 
          ? (isFeatured ? "text-zinc-300" : "text-muted-foreground")
          : (isFeatured ? "text-zinc-700 line-through" : "text-zinc-300 dark:text-zinc-800 line-through")
      )}>
        {text}
      </span>
    </li>
  );
}
