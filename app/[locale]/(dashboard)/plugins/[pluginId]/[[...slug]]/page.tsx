import { notFound } from 'next/navigation';
import { getTeamForUser } from '@/lib/db/queries';
import { resolvePluginRouteForTeam } from '@/lib/plugins/core/dashboard-loader';
import { MarketplaceDashboard } from '@/lib/plugins/marketplace/ui/MarketplaceDashboard';
import { MarketplaceItemDetail } from '@/lib/plugins/marketplace/ui/MarketplaceItemDetail';
import {
  getMarketplaceItems,
  getMarketplaceCategories,
  getMarketplaceItemById,
} from '@/lib/plugins/marketplace/server/queries';

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

  // Marketplace: handle directly (supports dynamic item IDs in slug)
  if (pluginId === 'marketplace') {
    const itemId = slug?.[0] ? Number(slug[0]) : null;

    if (itemId && !Number.isNaN(itemId)) {
      const item = await getMarketplaceItemById(itemId);
      if (!item || item.status !== 'active') notFound();
      return <MarketplaceItemDetail item={item} />;
    }

    const [items, categories] = await Promise.all([
      getMarketplaceItems({ activeOnly: true }),
      getMarketplaceCategories(),
    ]);
    return <MarketplaceDashboard items={items} categories={categories} />;
  }

  const resolved = await resolvePluginRouteForTeam(team.id, pluginId, slug);

  if (!resolved) {
    notFound();
  }

  const PageRenderer = resolved.renderer;
  return <PageRenderer pluginId={pluginId} slug={slug} routeTitle={resolved.route.title} />;
}

