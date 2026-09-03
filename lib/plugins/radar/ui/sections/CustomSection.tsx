'use client';

import { Loader2 } from 'lucide-react';
import type { RadarSectionId } from '@/lib/plugins/radar/shared/blocks';
import { WidgetGrid } from '../WidgetGrid';
import { useRadarWidgets } from '../useRadarWidgets';

/**
 * Sección PERSONALIZADA del menú: no tiene vista fija — su contenido son
 * exclusivamente los widgets que se le asignen (`section: <slug>`). Es lo que
 * convierte a Radar en una UI construible: una IA crea la sección con
 * whatspro_radar_manage_section y la va llenando con whatspro_radar_upsert_widget.
 */
export function CustomSection({
  section,
  editing,
  intro,
}: {
  section: RadarSectionId;
  editing: boolean;
  intro?: string | null;
}) {
  const { widgets, isLoading, mutations } = useRadarWidgets({ section, surface: 'dashboard' });

  return (
    <div className="space-y-5">
      {intro && <p className="max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">{intro}</p>}
      {isLoading && !widgets.length ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando widgets…
        </div>
      ) : (
        <WidgetGrid
          widgets={widgets}
          editing={editing}
          mutations={mutations}
          emptyText={`Esta sección todavía está vacía. Pedile a la IA que cree widgets acá con whatspro_radar_upsert_widget (section: "${section}").`}
        />
      )}
    </div>
  );
}
