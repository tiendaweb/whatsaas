'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import type { RadarBlock, RadarSection } from '@/lib/plugins/radar/shared/blocks';
import { RadarBlocks } from '../blocks/RadarBlockView';
import { BlockEmpty, BlockLabel } from '../blocks/primitives';
import { SectionShell } from './SectionShell';
import type { RadarReportItem } from './types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type Category = { key: string; label: string };

const DEFAULT_CATEGORIES: Category[] = [
  { key: 'generales', label: 'Generales' },
  { key: 'equipo', label: 'Equipo' },
  { key: 'clientes', label: 'Clientes' },
];

/**
 * Los informes de Radar son documentos del plugin Documentos. Acá se listan y
 * se abren DENTRO del panel (`RadarDocumentProvider`), no en otra pestaña.
 * Sirve tanto para las categorías clásicas como para "Mejoras" y "Trabajos".
 */
export function InformesSection({
  editing,
  section = 'informes',
  categories = DEFAULT_CATEGORIES,
  intro,
}: {
  editing: boolean;
  section?: RadarSection;
  categories?: Category[];
  intro?: string;
}) {
  const [category, setCategory] = useState(categories[0]?.key ?? 'generales');
  const { data, isLoading } = useSWR<{ reports: RadarReportItem[] }>(
    `/api/plugins/radar/reports?category=${encodeURIComponent(category)}`,
    fetcher,
  );
  const reports = data?.reports ?? [];

  const blocks: RadarBlock[] = reports.length
    ? [{
        type: 'documents',
        // No 'ScrollText': ése es el icono de la sección Informes y quedaba
        // repetido con el del menú lateral en la misma pantalla. Una carpeta
        // abierta dice mejor lo que es: el listado de una carpeta de informes.
        icon: 'FolderOpen',
        tone: 'violet',
        items: reports.map((report) => ({
          id: report.id,
          title: report.title,
          emoji: report.emoji,
          format: report.format,
          updatedAt: report.updatedAt,
        })),
      }]
    : [];

  return (
    <SectionShell section={section} editing={editing}>
      <section className="space-y-3">
        {intro && (
          <p className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400">
            {intro}
          </p>
        )}

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setCategory(option.key)}
                aria-pressed={category === option.key}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                  category === option.key
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    : 'border-neutral-100 bg-white text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <BlockLabel>{reports.length} informe{reports.length === 1 ? '' : 's'}</BlockLabel>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando informes…
          </div>
        )}

        {!isLoading && blocks.length === 0 && (
          <BlockEmpty text="Todavía no hay informes en esta carpeta. Los conectores de IA pueden publicarlos con whatspro_radar_publish_report." />
        )}

        {!isLoading && blocks.length > 0 && <RadarBlocks blocks={blocks} />}
      </section>
    </SectionShell>
  );
}
