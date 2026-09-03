'use client';

import { Loader2 } from 'lucide-react';
import type { RadarSectionId } from '@/lib/plugins/radar/shared/blocks';
import { WidgetGrid } from '../WidgetGrid';
import { useRadarWidgets } from '../useRadarWidgets';
import { BlockLabel } from '../blocks/primitives';

/**
 * Envoltorio común de cada sección: primero su vista fija, después los widgets
 * que la IA (o el usuario) le haya asignado a esa sección. Así cualquier
 * pantalla de Radar se puede extender sin tocar código.
 */
export function SectionShell({
  section,
  editing,
  children,
  onSelectContact,
}: {
  section: RadarSectionId;
  editing: boolean;
  children: React.ReactNode;
  onSelectContact?: (contactId: number) => void;
}) {
  const { widgets, isLoading, mutations } = useRadarWidgets({ section, surface: 'dashboard' });
  const hasWidgets = widgets.some((widget) => widget.enabled) || (editing && widgets.length > 0);

  return (
    <div className="space-y-7">
      {children}

      {(hasWidgets || editing) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <BlockLabel>Widgets de esta sección</BlockLabel>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-300" />}
          </div>
          <WidgetGrid
            widgets={widgets}
            editing={editing}
            mutations={mutations}
            onSelectContact={onSelectContact}
            emptyText="Todavía no hay widgets acá. Pedile a la IA que cree uno con whatspro_radar_upsert_widget."
          />
        </section>
      )}
    </div>
  );
}
