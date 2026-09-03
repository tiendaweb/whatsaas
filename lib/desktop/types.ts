export const DESKTOP_WIDGET_IDS = [
  // Widgets del rediseño.
  'kpi-cards',
  'forecast',
  'pipeline',
  'recent-deals',
  'activity-feed',
  'quick-actions',
  'upcoming',
  // Widgets anteriores. NO se borran: hay equipos con layouts guardados que los
  // referencian, y `normalizeDesktopLayout` descarta en silencio todo id que no
  // esté en esta lista. Vienen ocultos por defecto en el layout nuevo.
  'focus',
  'conversations',
  'customers',
  'revenue',
  'marketing',
  'infrastructure',
  'knowledge',
  'business-woman',
  'apps',
] as const;

/** Los que se muestran de entrada. El resto arranca oculto. */
export const DEFAULT_VISIBLE_WIDGETS = [
  'kpi-cards',
  'forecast',
  'pipeline',
  'recent-deals',
  'activity-feed',
  'quick-actions',
  'upcoming',
] as const;

export const HEADER_POSITIONS = ['top', 'left', 'right'] as const;
export type HeaderPosition = (typeof HEADER_POSITIONS)[number];

export const DESKTOP_PERIOD_IDS = ['30d', '3m', '6m', '1y', 'all'] as const;
export type DesktopPeriodId = (typeof DESKTOP_PERIOD_IDS)[number];

/** Categorías del diálogo "Personalizar escritorio". */
export const WIDGET_CATEGORY: Record<string, 'metrics' | 'charts' | 'lists' | 'activity'> = {
  'kpi-cards': 'metrics',
  forecast: 'charts',
  pipeline: 'charts',
  'recent-deals': 'lists',
  'activity-feed': 'activity',
  'quick-actions': 'lists',
  upcoming: 'activity',
  focus: 'activity',
  conversations: 'lists',
  customers: 'lists',
  revenue: 'metrics',
  marketing: 'metrics',
  infrastructure: 'metrics',
  knowledge: 'lists',
  'business-woman': 'activity',
  apps: 'lists',
};

export type DesktopWidgetId = (typeof DESKTOP_WIDGET_IDS)[number];

export type DesktopLayout = {
  version: 2;
  order: DesktopWidgetId[];
  pinned: DesktopWidgetId[];
  hidden: DesktopWidgetId[];
  headerPosition: HeaderPosition;
  period: DesktopPeriodId;
};

export const DEFAULT_DESKTOP_LAYOUT: DesktopLayout = {
  version: 2,
  order: [...DESKTOP_WIDGET_IDS],
  pinned: [],
  hidden: DESKTOP_WIDGET_IDS.filter(
    (id) => !(DEFAULT_VISIBLE_WIDGETS as readonly string[]).includes(id),
  ),
  headerPosition: 'left',
  period: '30d',
};

export type DesktopApp = {
  id: string;
  name: string;
  href: string;
  icon?: string;
};

export type DesktopNowItem = {
  id: string;
  kind: 'task' | 'agenda' | 'chat' | 'membership' | 'domain' | 'scheduled';
  title: string;
  detail: string;
  href: string;
  at: string | null;
  urgent: boolean;
  action?: { type: 'complete-task' | 'mark-chat-read'; id: number };
};

export type DesktopKpi = {
  value: number;
  changePct: number;
  trend: 'up' | 'down';
  progress: number;
};

export type DesktopTrendPoint = { month: string; revenue: number; target: number };

export type DesktopPipelineSlice = {
  stage: string;
  count: number;
  value: number;
  pct: number;
};

export type DesktopTopDeal = {
  id: number;
  title: string;
  company: string;
  value: number;
  currency: string;
  stage: string;
  probability: number;
  href: string;
};

export type DesktopActivityItem = {
  id: string;
  kind: string;
  title: string;
  description: string;
  at: string | null;
  tone: 'success' | 'info' | 'warning' | 'neutral';
};

export type DesktopUpcomingItem = {
  id: string;
  title: string;
  kind: 'meeting' | 'call' | 'task';
  at: string | null;
  priority: string;
  href: string;
};

export type DesktopOverview = {
  generatedAt: string;
  user: { id: number; name: string; email: string; teamName: string };
  permissions: { tasksWrite: boolean; contacts: boolean; dealsRead: boolean; dealsWrite: boolean; salesRead: boolean };
  layout: DesktopLayout;
  apps: DesktopApp[];
  summary: {
    openTasks: number;
    overdueTasks: number;
    unreadChats: number;
    customers: number;
    activeMemberships: number;
    expiringDomains: number;
    metaSpend30d: number;
    metaResults30d: number;
    metaCurrency: string;
  };
  now: DesktopNowItem[];
  taskTarget: { columnId: number; projectName: string } | null;
  tasks: Array<{ id: number; title: string; project: string; column: string; dueAt: string | null; overdue: boolean }>;
  conversations: Array<{ id: number; name: string; preview: string; unread: number; at: string | null; href: string }>;
  customers: Array<{ id: number; name: string; status: string; source: string; updatedAt: string }>;
  memberships: { active: number; pending: number; overdue: number; expiring: number };
  revenue: { paid: number; pending: number; currency: string; recentSales: number };
  marketing: { accounts: number; activeCampaigns: number; spend: number; results: number; clicks: number; currency: string };
  infrastructure: { domains: number; expiring: number; autoRenew: number; hostingerAccounts: number; hostingerErrors: number; lastSync: string | null };
  knowledge: { documents: number; notes: number; forms: number; submissions: number; recentDocuments: Array<{ id: number; title: string; updatedAt: string }> };
  businessWoman: { agenda: Array<{ id: string; title: string; date: string | null; status: string }>; home: number; growth: number; links: number; videos: number };
  period: DesktopPeriodId;
  kpis: {
    revenue: DesktopKpi & { currency: string };
    leads: DesktopKpi;
    dealsClosed: DesktopKpi;
    conversion: DesktopKpi;
  };
  revenueTrend: DesktopTrendPoint[];
  pipeline: DesktopPipelineSlice[];
  topDeals: DesktopTopDeal[];
  activity: DesktopActivityItem[];
  upcoming: DesktopUpcomingItem[];
};

export type DesktopSearchResult = {
  id: string;
  type: 'task' | 'conversation' | 'contact' | 'customer' | 'document' | 'note' | 'domain' | 'personal';
  title: string;
  subtitle: string;
  href: string;
};
