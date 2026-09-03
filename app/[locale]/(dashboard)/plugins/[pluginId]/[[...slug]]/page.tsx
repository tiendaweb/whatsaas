import { notFound } from 'next/navigation';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { resolvePluginRouteForTeam } from '@/lib/plugins/core/dashboard-loader';

type PluginPageProps = {
  params: Promise<{
    pluginId: string;
    slug?: string[];
  }>;
};

export default async function PluginPage({ params }: PluginPageProps) {
  const { pluginId, slug } = await params;
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);

  if (!team) {
    notFound();
  }

  const resolved = await resolvePluginRouteForTeam(team.id, pluginId, slug, user?.id);

  if (!resolved) {
    notFound();
  }

  const PageRenderer = resolved.renderer;
  return <PageRenderer pluginId={pluginId} slug={slug} routeTitle={resolved.route.title} />;
}
