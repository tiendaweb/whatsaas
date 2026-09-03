'use client';

import { useTranslations } from 'next-intl';
import {
  BadgeDollarSign,
  Bell,
  Building2,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompaniesSection } from './CompaniesSection';
import { PlansSection } from './PlansSection';
import { ReminderRulesSection } from './ReminderRulesSection';
import { SubscriptionsSection } from './SubscriptionsSection';

export type MembershipsSection = 'subscriptions' | 'plans' | 'companies';

const SECTION_ICON: Record<MembershipsSection, LucideIcon> = {
  subscriptions: CreditCard,
  plans: BadgeDollarSign,
  companies: Building2,
};

export function MembershipsDashboard({ section }: { section: MembershipsSection }) {
  const t = useTranslations('Memberships');
  const SectionIcon = SECTION_ICON[section];

  return (
    <div className="relative isolate flex h-full flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute -right-40 -top-48 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.18),rgba(0,240,255,0.06)_48%,transparent_72%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(168,85,247,0.22),rgba(255,0,110,0.08)_48%,transparent_72%)]" />
      <div className="pointer-events-none absolute -bottom-52 -left-40 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.12),rgba(236,72,153,0.05)_48%,transparent_72%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(0,240,255,0.10),rgba(93,52,208,0.10)_48%,transparent_72%)]" />

      <header className="relative z-10 border-b border-border/50 bg-background/55 px-4 py-4 shadow-[0_14px_42px_rgba(15,23,42,0.05)] backdrop-blur-2xl sm:px-6 dark:bg-background/35">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-gradient-to-br from-[#5D34D0]/20 via-[#A855F7]/20 to-[#EC4899]/20 text-violet-600 shadow-inner backdrop-blur-xl dark:text-cyan-300">
            <SectionIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{t(`${section}_title`)}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(`${section}_description`)}
            </p>
          </div>
        </div>

      </header>

      <div className="relative z-10 flex-1 overflow-auto p-4 sm:p-6">
        {section === 'subscriptions' ? (
          <Tabs defaultValue="subscriptions" className="gap-4">
            <TabsList className="h-auto w-full rounded-2xl border border-border/50 bg-card/45 p-1 shadow-[0_12px_34px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:w-auto dark:bg-card/25">
              <TabsTrigger value="subscriptions" className="rounded-xl px-4 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#5D34D0] data-[state=active]:via-[#A855F7] data-[state=active]:to-[#EC4899] data-[state=active]:text-white data-[state=active]:shadow-[0_8px_24px_rgba(168,85,247,0.24)]">
                <CreditCard className="h-3.5 w-3.5" />
                {t('subscriptions_title')}
              </TabsTrigger>
              <TabsTrigger value="reminders" className="rounded-xl px-4 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#5D34D0] data-[state=active]:via-[#A855F7] data-[state=active]:to-[#EC4899] data-[state=active]:text-white data-[state=active]:shadow-[0_8px_24px_rgba(168,85,247,0.24)]">
                <Bell className="h-3.5 w-3.5" />
                {t('reminders_title')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="subscriptions">
              <SubscriptionsSection />
            </TabsContent>
            <TabsContent value="reminders">
              <ReminderRulesSection />
            </TabsContent>
          </Tabs>
        ) : null}
        {section === 'plans' ? <PlansSection /> : null}
        {section === 'companies' ? <CompaniesSection /> : null}
      </div>
    </div>
  );
}
