import type { ReactElement } from 'react';
import { NotesDashboard } from '@/lib/plugins/notes/ui/NotesDashboard';
import { NotesSettings } from '@/lib/plugins/notes/ui/NotesSettings';
import { CalendarDashboard } from '@/lib/plugins/calendar/ui/CalendarDashboard';
import { CalendarSettings } from '@/lib/plugins/calendar/ui/CalendarSettings';
import { MarketplaceListPage } from '@/lib/plugins/marketplace/ui/MarketplaceListPage';
import { MarketplaceDetailPage } from '@/lib/plugins/marketplace/ui/MarketplaceDetailPage';
import { RadarIntro } from '@/lib/plugins/radar/ui/RadarIntro';

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
  renderer: PluginPageRenderer;
};

const pluginRouteRegistry: Record<string, PluginRouteRenderer[]> = {
  notes: [
    {
      routeMatcher: (slug) => slug?.[0] === 'settings',
      renderer: () => <NotesSettings />,
    },
    {
      routeMatcher: (slug) => !slug?.length,
      renderer: () => <NotesDashboard />,
    },
  ],
  calendar: [
    {
      routeMatcher: (slug) => slug?.[0] === 'settings',
      renderer: () => <CalendarSettings />,
    },
    {
      routeMatcher: (slug) => !slug?.length,
      renderer: () => <CalendarDashboard />,
    },
  ],
  radar: [
    {
      routeMatcher: (slug) => !slug?.length,
      renderer: () => <RadarIntro />,
    },
  ],
  marketplace: [
    {
      routeMatcher: (slug) => slug?.[0] === 'app' && Boolean(slug?.[1]),
      renderer: ({ slug }) => <MarketplaceDetailPage slug={slug} />,
    },
    {
      routeMatcher: (slug) => !slug?.length,
      renderer: () => <MarketplaceListPage />,
    },
  ],
};

export function resolvePluginPageRenderer(pluginId: string, slug?: string[]): PluginPageRenderer | null {
  const registry = pluginRouteRegistry[pluginId];
  if (!registry?.length) {
    return defaultPluginPageRenderer;
  }

  const entry = registry.find((item) => item.routeMatcher(slug));
  return entry?.renderer ?? null;
}
