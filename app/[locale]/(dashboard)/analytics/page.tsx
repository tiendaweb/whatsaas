import { getDashboardStats } from './actions';
import { TrafficHeatmap, FunnelLineChart, FunnelRadarChart, AgentList } from '@/components/dashboard/analytics-charts';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getUserWithTeam } from '@/lib/db/queries';
import { getTranslations } from 'next-intl/server';

export default async function AnalyticsPage() {
  const t = await getTranslations('Analytics');
  const session = await getSession();
  if (!session?.user) {
    redirect('/sign-in');
  }

  const userTeamData = await getUserWithTeam(session.user.id);
  
  if (!userTeamData || !userTeamData.teamId) {
    return (
        <div className="h-full min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 [scrollbar-gutter:stable] sm:px-6 md:pb-8 lg:px-8 lg:pt-6">
          <div className="flex min-h-full items-center justify-center">
            <p className="text-muted-foreground">{t('team_missing')}</p>
          </div>
        </div>
    );
  }

  const { funnelMetrics, agentMetrics, trafficMetrics } = await getDashboardStats(userTeamData.teamId);

  return (
    <div className="h-full min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 [scrollbar-gutter:stable] sm:px-6 md:pb-8 lg:px-8 lg:pt-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">{t('title')}</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <FunnelLineChart data={funnelMetrics} />
          <FunnelRadarChart data={funnelMetrics} />

          <AgentList data={agentMetrics} />
          <TrafficHeatmap data={trafficMetrics} />
        </div>
      </div>
    </div>
  );
}
