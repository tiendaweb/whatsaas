'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { ArrowLeft, CheckCircle2, Clock, ExternalLink, Loader2 } from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { chatHrefFor } from '@/lib/plugins/radar/shared/chat-link';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from './RadarTag';
import { humanize, INTENCION_LABEL, OBJECION_LABEL, PRIORIDAD_BADGE, RECUPERABILIDAD_LABEL } from './labels';
import { RadarBlocks } from './blocks/RadarBlockView';
import { BlockEmpty, BlockLabel, BlockSurface } from './blocks/primitives';
import { WidgetGrid } from './WidgetGrid';
import { useRadarWidgets } from './useRadarWidgets';
import type { RadarClientDetail } from './sections/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Ficha Radar completa de un cliente. Es la misma pieza en los tres lugares
 * donde hace falta: el panel de Clientes del tablero, el modo pantalla completa
 * del chat y la ficha del contacto. Todo lo que dibuja son bloques del
 * contrato, así que un widget generado por IA convive con la ficha sin
 * distinguirse.
 */
export function RadarClientPanel({
  contactId,
  remoteJid,
  instanceId,
  onBack,
  editing = false,
}: {
  contactId: number;
  remoteJid?: string | null;
  instanceId?: number | null;
  onBack?: () => void;
  editing?: boolean;
}) {
  const { data, isLoading, error } = useSWR<RadarClientDetail>(
    `/api/plugins/radar/client/${contactId}`,
    fetcher,
  );
  const { widgets, mutations } = useRadarWidgets({ surface: 'chat', contactId });

  const fichaBlocks = useMemo<RadarBlock[]>(() => {
    if (!data?.analyzed) return [];
    const fields = data.fields ?? {};
    const score = Number(fields.radar_score);
    const confianza = Number(fields.radar_confianza);
    const blocks: RadarBlock[] = [];

    if (Number.isFinite(score)) {
      blocks.push({
        type: 'score',
        title: 'Score Radar',
        icon: 'Gauge',
        value: score,
        max: 100,
        caption: Number.isFinite(confianza) ? `Confianza del análisis ${confianza}/100` : undefined,
        thresholds: [
          { min: 0, tone: 'rose' },
          { min: 45, tone: 'amber' },
          { min: 70, tone: 'emerald' },
        ],
      });
    }

    const stats = [
      { label: 'Intención', value: humanize(INTENCION_LABEL, fields.radar_intencion), icon: 'Compass' as const },
      { label: 'Objeción', value: humanize(OBJECION_LABEL, fields.radar_objecion), icon: 'ShieldAlert' as const },
      { label: 'Recuperabilidad', value: humanize(RECUPERABILIDAD_LABEL, fields.radar_recuperabilidad), icon: 'Repeat' as const },
      { label: 'Último análisis', value: fields.radar_fecha_analisis, icon: 'History' as const },
    ].filter((item) => Boolean(item.value));

    if (stats.length) {
      blocks.push({
        type: 'stat',
        title: 'Ficha',
        icon: 'Radar',
        columns: 2,
        items: stats.map((item) => ({ label: item.label, value: String(item.value), icon: item.icon })),
      });
    }

    if (fields.radar_estrategia) {
      blocks.push({
        type: 'card',
        icon: 'Target',
        tone: 'indigo',
        title: 'Estrategia recomendada',
        description: fields.radar_estrategia,
      });
    }

    if (fields.radar_oportunidad_2) {
      blocks.push({
        type: 'card',
        icon: 'Lightbulb',
        tone: 'amber',
        title: 'Oportunidad secundaria',
        description: fields.radar_oportunidad_2,
      });
    }

    return blocks;
  }, [data]);

  const reportBlocks = useMemo<RadarBlock[]>(() => {
    const reports = data?.reports ?? [];
    // Si el cliente no tiene ningún informe vinculado, la sección entera no se
    // dibuja: una lista vacía sólo agrega ruido a la ficha.
    if (!reports.length) return [];
    return [{
      type: 'documents',
      title: 'Informes de este cliente',
      subtitle: `${reports.length} documento${reports.length === 1 ? '' : 's'}`,
      icon: 'ScrollText',
      tone: 'violet',
      items: reports.map((report) => ({
        id: report.id,
        title: report.title,
        emoji: report.emoji,
        format: report.format,
        updatedAt: report.updatedAt,
      })),
    }];
  }, [data]);

  const chatHref = chatHrefFor(remoteJid, instanceId);
  const badge = data?.fields?.radar_prioridad ? PRIORIDAD_BADGE[data.fields.radar_prioridad] : null;
  const openTasks = (data?.tasks ?? []).filter((task) => task.status !== 'done');
  const doneTasks = (data?.tasks ?? []).filter((task) => task.status === 'done');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="truncate text-xl font-black tracking-tight text-neutral-900 dark:text-white">
              {data?.contact?.name ?? 'Cliente'}
            </h2>
            {badge && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>}
          </div>
          {data?.noteHeader?.date && (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Último análisis {data.noteHeader.date}
              {data.noteHeader.isReview ? ' · revisión' : ''}
            </p>
          )}
        </div>
        {chatHref && (
          <a
            href={chatHref}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-neutral-100 bg-white px-3 py-2 text-xs font-bold text-neutral-500 transition-all duration-200 hover:border-indigo-500 hover:text-indigo-500 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400"
          >
            Abrir chat <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </header>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando la ficha…
        </div>
      )}

      {!isLoading && (error || data?.error) && <BlockEmpty text="No se pudo cargar la ficha de este cliente." />}

      {!isLoading && data && !data.error && !data.analyzed && (
        <BlockEmpty text="Radar todavía no analizó a este contacto." />
      )}

      {!isLoading && data && !data.error && data.analyzed && (
        <>
          {fichaBlocks.length > 0 && (
            <section className="space-y-3">
              <BlockLabel>Ficha Radar</BlockLabel>
              <RadarBlocks blocks={fichaBlocks} />
            </section>
          )}

          {data.noteBlocks.length > 0 && (
            <section className="space-y-3">
              <BlockLabel>Análisis</BlockLabel>
              <RadarBlocks blocks={data.noteBlocks} />
            </section>
          )}

          {(openTasks.length > 0 || doneTasks.length > 0) && (
            <section className="space-y-3">
              <BlockLabel>Tareas de este cliente · {openTasks.length} abiertas</BlockLabel>
              <BlockSurface>
                <div className="space-y-1.5">
                  {[...openTasks, ...doneTasks].map((task) => {
                    const done = task.status === 'done';
                    const overdue = !done && task.dueDate !== null && new Date(task.dueDate) < new Date();
                    return (
                      <div key={task.id} className="flex items-start gap-2.5 rounded-2xl border border-neutral-100 px-3 py-2.5 dark:border-neutral-800">
                        {done ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Clock className={`mt-0.5 h-4 w-4 shrink-0 ${overdue ? 'text-rose-500' : 'text-neutral-300 dark:text-neutral-600'}`} />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`flex min-w-0 items-center gap-1.5 break-words text-sm font-bold ${done ? 'text-neutral-400 line-through' : 'text-neutral-800 dark:text-neutral-100'}`}>
                            {isRadarTaskTitle(task.title) && <RadarTag size="xs" />}
                            <span className="min-w-0 break-words">{radarTaskTitle(task.title)}</span>
                          </p>
                          <p className="mt-0.5 text-[10px] text-neutral-400">
                            {task.projectName}
                            {task.columnName ? ` · ${task.columnName}` : ''}
                            {task.dueDate ? ` · vence ${new Date(task.dueDate).toLocaleDateString('es-AR')}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </BlockSurface>
            </section>
          )}

          {reportBlocks.length > 0 && (
            <section className="space-y-3">
              <BlockLabel>Informes</BlockLabel>
              <RadarBlocks blocks={reportBlocks} />
            </section>
          )}

          {(widgets.length > 0 || editing) && (
            <section className="space-y-3">
              <BlockLabel>Widgets de este cliente</BlockLabel>
              <WidgetGrid
                widgets={widgets}
                editing={editing}
                mutations={mutations}
                emptyText="La IA puede fijar widgets a este cliente con contact_id."
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
