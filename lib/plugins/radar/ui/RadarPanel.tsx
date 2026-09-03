'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowLeft, Ban, Loader2, Maximize2, Radar as RadarIcon,
  MessageSquareText, RefreshCcw, TriangleAlert,
} from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import './radar.css';
import { humanize, INTENCION_LABEL, OBJECION_LABEL, PRIORIDAD_BADGE, RECUPERABILIDAD_LABEL } from './labels';
import { RadarBlocks } from './blocks/RadarBlockView';
import { RadarDocumentProvider } from './blocks/radar-context';
import { BlockLabel } from './blocks/primitives';
import { RadarDocumentViewer } from './RadarDocumentViewer';
import { RadarFullscreen } from './RadarFullscreen';
import type { RadarClientDetail } from './sections/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Radar dentro del chat. Muestra la ficha en formato de bloques — las mismas
 * cards que dibuja el tablero — y deja abrir todo en pantalla completa cuando
 * el panel lateral queda chico.
 */
export function RadarPanel({
  contactId,
  chatId,
  contactName,
  remoteJid,
  onBack,
  onUseSuggestion,
  onSuggestionsLoaded,
}: {
  contactId: number;
  chatId: number | null | undefined;
  contactName?: string | null;
  remoteJid?: string | null;
  onBack: () => void;
  onUseSuggestion: (text: string) => void;
  /** Levanta las variantes generadas al padre, para el chip sobre el composer. */
  onSuggestionsLoaded?: (suggestions: string[]) => void;
}) {
  const { data, error, isLoading } = useSWR<RadarClientDetail>(`/api/plugins/radar/client/${contactId}`, fetcher);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [documentId, setDocumentId] = useState<number | null>(null);

  async function loadSuggestions() {
    if (!chatId) return;
    setLoadingSuggestions(true);
    setSuggestError(null);
    try {
      const response = await fetch(`/api/chats/${chatId}/radar-suggest`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'No se pudieron generar sugerencias');
      const next: string[] = body.suggestions ?? [];
      setSuggestions(next);
      onSuggestionsLoaded?.(next);
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : 'No se pudieron generar sugerencias');
    } finally {
      setLoadingSuggestions(false);
    }
  }

  const fields = data?.fields ?? {};
  const badge = fields.radar_prioridad ? PRIORIDAD_BADGE[fields.radar_prioridad] : null;

  const blocks = useMemo<RadarBlock[]>(() => {
    if (!data?.analyzed) return [];
    const score = Number(fields.radar_score);
    const confianza = Number(fields.radar_confianza);
    const result: RadarBlock[] = [];

    const stats = [
      { label: 'Intención', value: humanize(INTENCION_LABEL, fields.radar_intencion), icon: 'Compass' as const, tone: 'indigo' as const },
      { label: 'Objeción', value: humanize(OBJECION_LABEL, fields.radar_objecion), icon: 'ShieldAlert' as const, tone: 'rose' as const },
      { label: 'Recuperabilidad', value: humanize(RECUPERABILIDAD_LABEL, fields.radar_recuperabilidad), icon: 'Repeat' as const, tone: 'emerald' as const },
      { label: 'Confianza', value: Number.isFinite(confianza) ? `${confianza}/100` : null, icon: 'Gauge' as const, tone: 'sky' as const },
    ].filter((item) => Boolean(item.value));

    if (Number.isFinite(score)) {
      result.push({
        type: 'score',
        title: 'Score Radar',
        icon: 'Gauge',
        value: score,
        max: 100,
        caption: fields.radar_fecha_analisis ? `Análisis del ${fields.radar_fecha_analisis}` : undefined,
        thresholds: [{ min: 0, tone: 'rose' }, { min: 45, tone: 'amber' }, { min: 70, tone: 'emerald' }],
      });
    }

    if (stats.length) {
      result.push({
        type: 'stat',
        columns: 1,
        items: stats.map((item) => ({
          label: item.label,
          value: String(item.value),
          icon: item.icon,
          tone: item.tone,
        })),
      });
    }

    result.push(...data.noteBlocks);

    // Los informes sólo aparecen si este cliente TIENE alguno vinculado: una
    // lista vacía en un panel angosto es puro ruido.
    if (data.reports.length) {
      result.push({
        type: 'documents',
        title: 'Informes de este cliente',
        icon: 'ScrollText',
        tone: 'violet',
        items: data.reports.map((report) => ({
          id: report.id,
          title: report.title,
          emoji: report.emoji,
          format: report.format,
          updatedAt: report.updatedAt,
        })),
      });
    }

    const openTasks = data.tasks.filter((task) => task.status !== 'done');
    if (openTasks.length) {
      result.push({
        type: 'list',
        title: 'Tareas abiertas',
        icon: 'ClipboardList',
        tone: 'amber',
        variant: 'checklist',
        items: openTasks.map((task) => ({
          text: radarTaskTitle(task.title),
          badge: task.dueDate ? { label: new Date(task.dueDate).toLocaleDateString('es-AR'), tone: 'neutral' as const } : undefined,
        })),
      });
    }

    return result;
  }, [data, fields]);

  return (
    <RadarDocumentProvider open={setDocumentId}>
      <div className="radar-ui flex h-full flex-col overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        <header className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2.5 dark:border-neutral-800">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-2xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 dark:shadow-none">
            <RadarIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">Radar</p>
            <p className="truncate text-[10px] text-neutral-400 dark:text-neutral-500">
              {data?.contact?.name ?? contactName ?? '…'}
            </p>
          </div>
          {badge && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>}
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            aria-label="Ver Radar en pantalla completa"
            title="Pantalla completa"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-indigo-500 dark:hover:bg-neutral-800"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando ficha Radar…
            </div>
          )}

          {!isLoading && (error || data?.error) && (
            <EmptyState icon={TriangleAlert} title="No se pudo cargar Radar" detail={data?.error || 'Intentá de nuevo en un momento.'} />
          )}

          {!isLoading && data && !data.error && !data.analyzed && (
            <EmptyState icon={Ban} title="Sin análisis todavía" detail="Este contacto todavía no fue analizado por Radar." />
          )}

          {!isLoading && data && !data.error && data.analyzed && (
            <div className="space-y-4">
              <RadarBlocks blocks={blocks} />

              <section className="space-y-2">
                <BlockLabel>Mensajes sugeridos</BlockLabel>
                {!suggestions && (
                  <button
                    type="button"
                    onClick={() => void loadSuggestions()}
                    disabled={loadingSuggestions || !chatId}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-100 bg-white px-3 py-2.5 text-xs font-bold text-neutral-500 transition-all duration-200 hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400"
                  >
                    {loadingSuggestions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}
                    Generar sugerencias
                  </button>
                )}
                {suggestError && <p className="text-xs text-rose-500">{suggestError}</p>}
                {suggestions && (
                  <div className="space-y-1.5">
                    {suggestions.map((suggestion, index) => (
                      <div key={index} className="rounded-2xl border border-neutral-100 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
                        <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">{suggestion}</p>
                        <button
                          type="button"
                          onClick={() => onUseSuggestion(suggestion)}
                          className="mt-2 rounded-xl bg-indigo-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-all duration-200 hover:bg-indigo-600"
                        >
                          Usar esta
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => void loadSuggestions()}
                      disabled={loadingSuggestions}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 transition-all duration-200 hover:text-indigo-500"
                    >
                      <RefreshCcw className="h-3 w-3" /> Regenerar
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {documentId !== null && <RadarDocumentViewer documentId={documentId} onClose={() => setDocumentId(null)} />}

        {fullscreen && (
          <RadarFullscreen
            contactId={contactId}
            remoteJid={remoteJid}
            onClose={() => setFullscreen(false)}
          />
        )}
      </div>
    </RadarDocumentProvider>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Ban; title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{title}</p>
        <p className="mt-1 max-w-[15rem] text-xs text-neutral-400">{detail}</p>
      </div>
    </div>
  );
}
