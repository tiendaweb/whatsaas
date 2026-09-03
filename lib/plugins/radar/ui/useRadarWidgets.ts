'use client';

import useSWR, { useSWRConfig } from 'swr';
import { useCallback } from 'react';
import { toast } from 'sonner';
import type { RadarSectionId, RadarWidget, RadarWidgetSize } from '@/lib/plugins/radar/shared/blocks';
import type { WidgetMutations } from './WidgetGrid';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type WidgetsResponse = { widgets?: RadarWidget[]; error?: string };

/** Key SWR del banco. Se comparte para poder revalidarlo al archivar. */
export const RADAR_BANK_KEY = '/api/plugins/radar/widgets/bank';

/**
 * Widgets de una sección. Las mutaciones son optimistas: mover o redimensionar
 * un widget tiene que sentirse inmediato, y si el PATCH falla se revalida y
 * vuelve el estado real del servidor.
 */
export function useRadarWidgets(params: {
  /** Builtin o slug de una sección personalizada. */
  section?: RadarSectionId;
  surface?: 'dashboard' | 'chat' | 'both';
  contactId?: number | null;
}) {
  const query = new URLSearchParams();
  if (params.section) query.set('section', params.section);
  if (params.surface) query.set('surface', params.surface);
  if (params.contactId) query.set('contactId', String(params.contactId));

  const key = `/api/plugins/radar/widgets?${query.toString()}`;
  const { data, isLoading, mutate } = useSWR<WidgetsResponse>(key, fetcher);
  const { mutate: globalMutate } = useSWRConfig();
  const widgets = data?.widgets ?? [];

  const patch = useCallback(
    async (widgetKey: string, body: Record<string, unknown>, optimistic: (widget: RadarWidget) => RadarWidget) => {
      await mutate(
        async (current) => {
          const response = await fetch(`/api/plugins/radar/widgets/${encodeURIComponent(widgetKey)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!response.ok) throw new Error('patch_failed');
          return current;
        },
        {
          optimisticData: (current) => ({
            ...current,
            widgets: (current?.widgets ?? []).map((widget) => (widget.key === widgetKey ? optimistic(widget) : widget)),
          }),
          rollbackOnError: true,
          revalidate: true,
        },
      ).catch(() => toast.error('No se pudo guardar el cambio del widget.'));
    },
    [mutate],
  );

  const mutations: WidgetMutations = {
    onResize: (widgetKey, size: RadarWidgetSize) =>
      patch(widgetKey, { size }, (widget) => ({ ...widget, size })),

    onToggle: (widgetKey, enabled) =>
      patch(widgetKey, { enabled }, (widget) => ({ ...widget, enabled })),

    onMove: async (widgetKey, direction) => {
      const ordered = [...widgets].sort((a, b) => a.position - b.position || a.id - b.id);
      const index = ordered.findIndex((widget) => widget.key === widgetKey);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return;
      // Intercambiar posiciones en vez de reindexar todo: es un PATCH y el
      // orden relativo del resto no se toca.
      const position = ordered[target].position;
      await patch(widgetKey, { position }, (widget) => ({ ...widget, position }));
    },

    // El DELETE ya no borra: archiva en el banco. Sale de la grilla igual, pero
    // el mensaje tiene que dejar claro que se puede recuperar.
    onArchive: async (widgetKey) => {
      let ok = false;
      await mutate(
        async (current) => {
          const response = await fetch(`/api/plugins/radar/widgets/${encodeURIComponent(widgetKey)}`, { method: 'DELETE' });
          if (!response.ok) throw new Error('archive_failed');
          ok = true;
          return current;
        },
        {
          optimisticData: (current) => ({
            ...current,
            widgets: (current?.widgets ?? []).filter((widget) => widget.key !== widgetKey),
          }),
          rollbackOnError: true,
          revalidate: true,
        },
      ).catch(() => toast.error('No se pudo guardar el widget en el banco.'));

      if (ok) {
        toast.success('Guardado en el banco.');
        // Sin esto el banco muestra datos viejos hasta que se recargue la app.
        void globalMutate(RADAR_BANK_KEY);
      }
    },
  };

  return { widgets, isLoading, mutations, refresh: mutate };
}

/**
 * Banco de widgets: los archivados del equipo. Devuelve las acciones que solo
 * existen acá — restaurar, duplicar como plantilla y borrar de verdad.
 */
export function useRadarBank() {
  const { data, isLoading, mutate } = useSWR<WidgetsResponse>(RADAR_BANK_KEY, fetcher);
  const { mutate: globalMutate } = useSWRConfig();
  const widgets = data?.widgets ?? [];

  /** Los listados por sección son claves SWR distintas: se revalidan todas. */
  const refreshSections = useCallback(
    () => globalMutate((key) => typeof key === 'string' && key.startsWith('/api/plugins/radar/widgets?')),
    [globalMutate],
  );

  const restore = useCallback(
    async (widgetKey: string, section?: RadarSectionId) => {
      const response = await fetch(`/api/plugins/radar/widgets/${encodeURIComponent(widgetKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', ...(section ? { section } : {}) }),
      });
      if (!response.ok) {
        toast.error('No se pudo restaurar el widget.');
        return false;
      }
      toast.success('Widget restaurado.');
      await mutate();
      void refreshSections();
      return true;
    },
    [mutate, refreshSections],
  );

  const duplicate = useCallback(
    async (widgetKey: string, newKey: string, options?: { title?: string; section?: RadarSectionId }) => {
      const response = await fetch(RADAR_BANK_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: widgetKey, newKey, ...options }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(payload?.error ?? 'No se pudo duplicar el widget.');
        return false;
      }
      toast.success('Copia creada y publicada.');
      await mutate();
      void refreshSections();
      return true;
    },
    [mutate, refreshSections],
  );

  const purge = useCallback(
    async (widgetKey: string) => {
      const response = await fetch(
        `/api/plugins/radar/widgets/${encodeURIComponent(widgetKey)}?permanent=1`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        toast.error('No se pudo eliminar el widget.');
        return false;
      }
      toast.success('Widget eliminado definitivamente.');
      await mutate();
      return true;
    },
    [mutate],
  );

  return { widgets, isLoading, restore, duplicate, purge, refresh: mutate };
}
