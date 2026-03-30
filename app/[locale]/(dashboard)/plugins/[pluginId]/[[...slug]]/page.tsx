import { notFound } from 'next/navigation';
import { getTeamForUser } from '@/lib/db/queries';
import { resolvePluginRouteForTeam } from '@/lib/plugins/core/dashboard-loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

  const path = `/plugins/${pluginId}${slug?.length ? `/${slug.join('/')}` : ''}`;
  const resolved = await resolvePluginRouteForTeam(team.id, path);

  if (!resolved) {
    notFound();
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{resolved.route.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Plugin <strong>{resolved.plugin.manifest.displayName}</strong> cargado desde el runtime dinámico.
        </CardContent>
      </Card>
    </div>
  );
}
