import { notFound } from 'next/navigation';
import { getTeamForUser } from '@/lib/db/queries';
import { resolvePluginRouteForTeam } from '@/lib/plugins/core/dashboard-loader';
import { NotesDashboard } from '@/lib/plugins/notes/ui/NotesDashboard';
import { NotesSettings } from '@/lib/plugins/notes/ui/NotesSettings';
import { CalendarDashboard } from '@/lib/plugins/calendar/ui/CalendarDashboard';
import { CalendarSettings } from '@/lib/plugins/calendar/ui/CalendarSettings';
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
      if (!item || !item.isActive) notFound();
      return <MarketplaceItemDetail item={item} />;
    }

    const [items, categories] = await Promise.all([
      getMarketplaceItems({ activeOnly: true }),
      getMarketplaceCategories(),
    ]);
    return <MarketplaceDashboard items={items} categories={categories} />;
  }

  const path = `/plugins/${pluginId}${slug?.length ? `/${slug.join('/')}` : ''}`;
  const resolved = await resolvePluginRouteForTeam(team.id, path);

  if (!resolved) {
    notFound();
  }

  if (pluginId === 'notes') {
    return slug?.[0] === 'settings' ? <NotesSettings /> : <NotesDashboard />;
  }

  if (pluginId === 'calendar') {
    return slug?.[0] === 'settings' ? <CalendarSettings /> : <CalendarDashboard />;
  }

  return <div className="p-6 text-sm text-muted-foreground">{resolved.route.title}</div>;
}

