import type { ReactElement } from 'react';

export type PluginPageRendererProps = {
  pluginId: string;
  slug?: string[];
  routeTitle: string;
};

export type PluginPageRenderer = (props: PluginPageRendererProps) => ReactElement;

const defaultPluginPageRenderer: PluginPageRenderer = ({ routeTitle }) => (
  <div className="p-6 text-sm text-muted-foreground">{routeTitle}</div>
);

type PluginRouteRenderer = {
  routeMatcher: (slug?: string[]) => boolean;
  loadRenderer: () => Promise<PluginPageRenderer>;
};

const pluginRouteRegistry: Record<string, PluginRouteRenderer[]> = {
  notes: [
    {
      routeMatcher: (slug) => slug?.[0] === 'settings',
      loadRenderer: async () => {
        const { NotesSettings } = await import('@/lib/plugins/notes/ui/NotesSettings');
        return () => <NotesSettings />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { NotesDashboard } = await import('@/lib/plugins/notes/ui/NotesDashboard');
        return () => <NotesDashboard />;
      },
    },
  ],
  calendar: [
    {
      routeMatcher: (slug) => slug?.[0] === 'settings',
      loadRenderer: async () => {
        const { CalendarSettings } = await import('@/lib/plugins/calendar/ui/CalendarSettings');
        return () => <CalendarSettings />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { CalendarDashboard } = await import('@/lib/plugins/calendar/ui/CalendarDashboard');
        return () => <CalendarDashboard />;
      },
    },
  ],
  marketplace: [
    {
      routeMatcher: (slug) => slug?.[0] === 'app' && Boolean(slug?.[1]),
      loadRenderer: async () => {
        const { MarketplaceDetailPage } = await import('@/lib/plugins/marketplace/ui/MarketplaceDetailPage');
        return ({ slug }) => <MarketplaceDetailPage slug={slug} />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { MarketplaceListPage } = await import('@/lib/plugins/marketplace/ui/MarketplaceListPage');
        return () => <MarketplaceListPage />;
      },
    },
  ],
  domains: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { DomainsDashboard } = await import('@/lib/plugins/domains/ui/DomainsDashboard');
        return () => <DomainsDashboard />;
      },
    },
  ],
  articles: [
    {
      routeMatcher: (slug) => slug?.[0] === 'types',
      loadRenderer: async () => {
        const { ArticleTypesSettings } = await import('@/lib/plugins/articles/ui/ArticleTypesSettings');
        return () => <ArticleTypesSettings />;
      },
    },
    {
      routeMatcher: (slug) => slug?.[0] === 'attributes',
      loadRenderer: async () => {
        const { ArticleAttributesSettings } = await import('@/lib/plugins/articles/ui/ArticleAttributesSettings');
        return () => <ArticleAttributesSettings />;
      },
    },
    {
      routeMatcher: (slug) => slug?.[0] === 'new',
      loadRenderer: async () => {
        const { ArticleEditor } = await import('@/lib/plugins/articles/ui/ArticleEditor');
        return () => <ArticleEditor mode="new" />;
      },
    },
    {
      routeMatcher: (slug) => Boolean(slug?.[0]) && slug?.[1] === 'edit' && !isNaN(Number(slug?.[0])),
      loadRenderer: async () => {
        const { ArticleEditor } = await import('@/lib/plugins/articles/ui/ArticleEditor');
        return ({ slug }) => <ArticleEditor mode="edit" articleId={Number(slug?.[0])} />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { ArticlesDashboard } = await import('@/lib/plugins/articles/ui/ArticlesDashboard');
        return () => <ArticlesDashboard />;
      },
    },
  ],
  sales: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { SalesDashboard } = await import('@/lib/plugins/sales/ui/SalesDashboard');
        return () => <SalesDashboard />;
      },
    },
  ],
  gemini: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { GeminiKeysDashboard } = await import('@/lib/plugins/gemini/ui/GeminiKeysDashboard');
        return () => <GeminiKeysDashboard />;
      },
    },
  ],
  'sales-ops': [
    {
      routeMatcher: () => true,
      loadRenderer: async () => {
        const { SalesOpsApp } = await import('@/lib/plugins/sales-ops/ui/SalesOpsApp');
        return ({ slug }) => <SalesOpsApp slug={slug ?? []} />;
      },
    },
  ],
  deals: [
    {
      routeMatcher: (slug) => Boolean(slug?.[0]),
      loadRenderer: async () => {
        const { DealDetail } = await import('@/lib/plugins/deals/ui/DealDetail');
        return ({ slug }) => <DealDetail dealId={Number(slug?.[0])} />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { DealsBoard } = await import('@/lib/plugins/deals/ui/DealsBoard');
        return () => <DealsBoard />;
      },
    },
  ],
  customers: [
    {
      routeMatcher: (slug) => Boolean(slug?.[0]),
      loadRenderer: async () => {
        const { CustomerDetail } = await import('@/lib/plugins/customers/ui/CustomerDetail');
        return ({ slug }) => <CustomerDetail customerId={Number(slug?.[0])} />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { CustomersList } = await import('@/lib/plugins/customers/ui/CustomersList');
        return () => <CustomersList />;
      },
    },
  ],
  'aapp-space': [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { AappSpaceDashboard } = await import('@/lib/plugins/aapp-space/ui/AappSpaceDashboard');
        return () => <AappSpaceDashboard />;
      },
    },
  ],
  memberships: [
    {
      routeMatcher: (slug) => slug?.[0] === 'companies' && !Number.isNaN(Number(slug?.[1])),
      loadRenderer: async () => {
        const { CompanyDetail } = await import('@/lib/plugins/memberships/ui/CompanyDetail');
        return ({ slug }) => <CompanyDetail companyId={Number(slug?.[1])} />;
      },
    },
    {
      routeMatcher: (slug) => slug?.[0] === 'companies' && slug.length === 1,
      loadRenderer: async () => {
        const { MembershipsDashboard } = await import('@/lib/plugins/memberships/ui/MembershipsDashboard');
        return () => <MembershipsDashboard section="companies" />;
      },
    },
    {
      routeMatcher: (slug) => slug?.[0] === 'plans' && slug.length === 1,
      loadRenderer: async () => {
        const { MembershipsDashboard } = await import('@/lib/plugins/memberships/ui/MembershipsDashboard');
        return () => <MembershipsDashboard section="plans" />;
      },
    },
    {
      routeMatcher: (slug) => slug?.[0] === 'subscriptions' && slug.length === 1,
      loadRenderer: async () => {
        const { MembershipsDashboard } = await import('@/lib/plugins/memberships/ui/MembershipsDashboard');
        return () => <MembershipsDashboard section="subscriptions" />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { MembershipsDashboard } = await import('@/lib/plugins/memberships/ui/MembershipsDashboard');
        return () => <MembershipsDashboard section="subscriptions" />;
      },
    },
  ],
  tasks: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { TasksPluginSurface } = await import('@/lib/plugins/tasks/ui-nueva/TasksPluginSurface');
        return () => <TasksPluginSurface />;
      },
    },
  ],
  'scheduled-messages': [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { ScheduledMessagesDashboard } = await import('@/lib/plugins/scheduled-messages/ui/ScheduledMessagesDashboard');
        return () => <ScheduledMessagesDashboard />;
      },
    },
  ],
  'mini-apps': [
    {
      routeMatcher: (slug) => slug?.[0] === 'business-woman-planner',
      loadRenderer: async () => {
        const { BusinessWomanPlanner } = await import('@/lib/plugins/mini-apps/apps/business-woman-planner');
        return ({ slug }) => <BusinessWomanPlanner initialView={slug?.[1]} />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { MiniAppsDashboard } = await import('@/lib/plugins/mini-apps/ui/MiniAppsDashboard');
        return () => <MiniAppsDashboard />;
      },
    },
  ],
  'app-maker': [
    {
      routeMatcher: (slug) => slug?.[0] === 'apps' && Boolean(slug?.[1]),
      loadRenderer: async () => {
        const { AppMakerStudio } = await import('@/lib/plugins/app-maker/ui/AppMakerStudio');
        return ({ slug }) => <AppMakerStudio slug={slug?.[1] ?? ''} />;
      },
    },
    {
      routeMatcher: (slug) => slug?.[0] === 'run' && Boolean(slug?.[1]),
      loadRenderer: async () => {
        const { AppMakerRuntime } = await import('@/lib/plugins/app-maker/ui/AppMakerRuntime');
        return ({ slug }) => <AppMakerRuntime slug={slug?.[1] ?? ''} />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { AppMakerDashboard } = await import('@/lib/plugins/app-maker/ui/AppMakerDashboard');
        return () => <AppMakerDashboard />;
      },
    },
  ],
  'social-publisher': [
    {
      routeMatcher: (slug) => slug?.[0] === 'settings',
      loadRenderer: async () => {
        const { AccountsSettings } = await import('@/lib/plugins/social-publisher/ui/AccountsSettings');
        return () => <AccountsSettings />;
      },
    },
    {
      routeMatcher: (slug) => slug?.[0] === 'new',
      loadRenderer: async () => {
        const { PostComposer } = await import('@/lib/plugins/social-publisher/ui/PostComposer');
        return () => <PostComposer />;
      },
    },
    {
      routeMatcher: (slug) => slug?.[0] === 'edit' && Boolean(slug?.[1]),
      loadRenderer: async () => {
        const { PostComposer } = await import('@/lib/plugins/social-publisher/ui/PostComposer');
        return ({ slug }) => <PostComposer postId={Number(slug?.[1])} />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { SocialPublisherDashboard } = await import('@/lib/plugins/social-publisher/ui/SocialPublisherDashboard');
        return () => <SocialPublisherDashboard />;
      },
    },
  ],
  'form-builder': [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { FormBuilderDashboard } = await import('@/lib/plugins/form-builder/ui/FormBuilderDashboard');
        return () => <FormBuilderDashboard />;
      },
    },
  ],
  hostinger: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { HostingerDashboard } = await import('@/lib/plugins/hostinger/ui/HostingerDashboard');
        return () => <HostingerDashboard />;
      },
    },
  ],
  'meta-ads': [
    {
      routeMatcher: (slug) => slug?.[0] === 'cuentas',
      loadRenderer: async () => {
        const { MetaAdsAccountsSettings } = await import('@/lib/plugins/meta-ads/ui/MetaAdsAccountsSettings');
        return () => <MetaAdsAccountsSettings />;
      },
    },
    {
      routeMatcher: (slug) => slug?.[0] === 'campana' && !Number.isNaN(Number(slug?.[1])),
      loadRenderer: async () => {
        const { CampaignPage } = await import('@/lib/plugins/meta-ads/ui/CampaignPage');
        return ({ slug }) => <CampaignPage campaignId={Number(slug?.[1])} />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { MetaAdsDashboard } = await import('@/lib/plugins/meta-ads/ui/MetaAdsDashboard');
        return () => <MetaAdsDashboard />;
      },
    },
  ],
  documents: [
    {
      routeMatcher: (slug) => slug?.[0] === 'doc' && !Number.isNaN(Number(slug?.[1])),
      loadRenderer: async () => {
        const { DocumentsApp } = await import('@/lib/plugins/documents/ui/DocumentsApp');
        return ({ slug }) => <DocumentsApp documentId={Number(slug?.[1])} />;
      },
    },
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { DocumentsApp } = await import('@/lib/plugins/documents/ui/DocumentsApp');
        return () => <DocumentsApp />;
      },
    },
  ],
  files: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { FilesDashboard } = await import('@/lib/plugins/files/ui/FilesDashboard');
        return () => <FilesDashboard />;
      },
    },
  ],
  sites: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { SitesDashboard } = await import('@/lib/plugins/sites/ui/SitesDashboard');
        return () => <SitesDashboard />;
      },
    },
  ],
  'grok-connector': [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { GrokConnectorDashboard } = await import('@/lib/plugins/grok-connector/ui/GrokConnectorDashboard');
        return () => <GrokConnectorDashboard />;
      },
    },
  ],
  'claude-code-connector': [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { ClaudeCodeConnectorDashboard } = await import('@/lib/plugins/claude-code-connector/ui/ClaudeCodeConnectorDashboard');
        return () => <ClaudeCodeConnectorDashboard />;
      },
    },
  ],
  'chatgpt-connector': [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { ChatGPTConnectorDashboard } = await import('@/lib/plugins/chatgpt-connector/ui/ChatGPTConnectorDashboard');
        return () => <ChatGPTConnectorDashboard />;
      },
    },
  ],
  finance: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { FinanceDashboard } = await import('@/lib/plugins/finance/ui/FinanceDashboard');
        return () => <FinanceDashboard />;
      },
    },
  ],
  purchases: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { PurchasesDashboard } = await import('@/lib/plugins/purchases/ui/PurchasesDashboard');
        return () => <PurchasesDashboard />;
      },
    },
  ],
  hr: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { HrDashboard } = await import('@/lib/plugins/hr/ui/HrDashboard');
        return () => <HrDashboard />;
      },
    },
  ],
  support: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { SupportDashboard } = await import('@/lib/plugins/support/ui/SupportDashboard');
        return () => <SupportDashboard />;
      },
    },
  ],
  contracts: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { ContractsDashboard } = await import('@/lib/plugins/contracts/ui/ContractsDashboard');
        return () => <ContractsDashboard />;
      },
    },
  ],
  intelligence: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { IntelligenceDashboard } = await import('@/lib/plugins/intelligence/ui/IntelligenceDashboard');
        return () => <IntelligenceDashboard />;
      },
    },
  ],
  radar: [
    {
      routeMatcher: (slug) => !slug?.length,
      loadRenderer: async () => {
        const { RadarApp } = await import('@/lib/plugins/radar/ui/RadarApp');
        return () => <RadarApp />;
      },
    },
  ],
};

export async function resolvePluginPageRenderer(pluginId: string, slug?: string[]): Promise<PluginPageRenderer | null> {
  const registry = pluginRouteRegistry[pluginId];
  if (!registry?.length) {
    return defaultPluginPageRenderer;
  }

  const entry = registry.find((item) => item.routeMatcher(slug));
  return entry ? entry.loadRenderer() : null;
}
