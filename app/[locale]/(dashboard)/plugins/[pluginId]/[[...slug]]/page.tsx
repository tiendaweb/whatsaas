import { notFound } from 'next/navigation';
import { getTeamForUser } from '@/lib/db/queries';
import { resolvePluginRouteForTeam } from '@/lib/plugins/core/dashboard-loader';

type PluginPageProps = {
  params: Promise<{
    pluginId: string;
    slug?: string[];
  }>;
};

export default async function PluginPage({ params }: PluginPageProps) {
  const { pluginId, slug } = await params;
  const team = await getTeamForUser();

  if (!team) {
    notFound();
  }

  const resolved = await resolvePluginRouteForTeam(team.id, pluginId, slug);

  if (!resolved) {
    notFound();
  }

  const PageRenderer = resolved.renderer;
  return <PageRenderer pluginId={pluginId} slug={slug} routeTitle={resolved.route.title} />;
}
