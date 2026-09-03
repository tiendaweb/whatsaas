'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  CalendarClock, CheckCircle2, Clock, FileCode2, FileText, Loader2, Maximize2, Radar as RadarIcon,
} from 'lucide-react';

import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { humanize, INTENCION_LABEL, OBJECION_LABEL, PRIORIDAD_BADGE, RECUPERABILIDAD_LABEL } from '@/lib/plugins/radar/ui/labels';
import { RadarBlocks } from '@/lib/plugins/radar/ui/blocks/RadarBlockView';
import { RadarFullscreen } from '@/lib/plugins/radar/ui/RadarFullscreen';
import { RadarDocumentViewer } from '@/lib/plugins/radar/ui/RadarDocumentViewer';
import { RadarDocumentProvider } from '@/lib/plugins/radar/ui/blocks/radar-context';
import '@/lib/plugins/radar/ui/radar.css';

type ContactTask = {
  id: number;
  title: string;
  status: string;
  dueDate: string | null;
  projectName?: string;
};

type LinkedDocument = {
  id: number;
  title: string;
  emoji: string | null;
  format: 'markdown' | 'html';
  updatedAt: string;
  category: string;
};

async function jsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'server_error');
  return payload as T;
}

const RADAR_FIELDS = [
  'radar_score', 'radar_prioridad', 'radar_intencion', 'radar_objecion',
  'radar_recuperabilidad', 'radar_confianza', 'radar_fecha_analisis',
  'radar_estrategia', 'radar_oportunidad_2',
] as const;

function readField(data: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = data?.[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

/**
 * Bloque de la ficha completa del contacto: Radar primero, después las tareas
 * y los documentos vinculados.
 *
 * Las tareas antes no se veían acá porque la ficha del embudo directamente no
 * las pedía — sólo mostraba el contador de proyectos. Ahora consulta el mismo
 * endpoint que el panel del chat (`/api/chats/{chatId}/tasks`).
 */
export function ContactProfileExtras({
  contactId,
  chatId,
  remoteJid,
  instanceId,
  customData,
  labels,
}: {
  contactId: number;
  chatId: number;
  remoteJid: string | null;
  instanceId?: number | null;
  customData: Record<string, unknown> | null | undefined;
  labels: { tasks: string; documents: string; radar: string };
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [documentId, setDocumentId] = useState<number | null>(null);

  const { data: tasksData, error: tasksError, isLoading: tasksLoading } = useSWR<{ tasks: ContactTask[] }>(
    chatId ? `/api/chats/${chatId}/tasks` : null,
    jsonFetcher,
  );
  const { data: docsData } = useSWR<{ documents: LinkedDocument[] }>(
    `/api/contacts/${contactId}/documents`,
    jsonFetcher,
  );

  const tasks = tasksData?.tasks ?? [];
  const documents = docsData?.documents ?? [];

  const radarBlocks = useMemo<RadarBlock[]>(() => {
    const fields: Record<string, string | null> = {};
    for (const key of RADAR_FIELDS) fields[key] = readField(customData, key);
    if (!fields.radar_fecha_analisis) return [];

    const blocks: RadarBlock[] = [];
    const score = Number(fields.radar_score);
    const confianza = Number(fields.radar_confianza);

    if (Number.isFinite(score)) {
      blocks.push({
        type: 'score',
        title: 'Score Radar',
        icon: 'Gauge',
        value: score,
        max: 100,
        caption: Number.isFinite(confianza) ? `Confianza del análisis ${confianza}/100` : undefined,
        thresholds: [{ min: 0, tone: 'rose' }, { min: 45, tone: 'amber' }, { min: 70, tone: 'emerald' }],
      });
    }

    const stats = [
      { label: 'Intención', value: humanize(INTENCION_LABEL, fields.radar_intencion) },
      { label: 'Objeción', value: humanize(OBJECION_LABEL, fields.radar_objecion) },
      { label: 'Recuperabilidad', value: humanize(RECUPERABILIDAD_LABEL, fields.radar_recuperabilidad) },
      { label: 'Último análisis', value: fields.radar_fecha_analisis },
    ].filter((item) => Boolean(item.value));

    if (stats.length) {
      blocks.push({
        type: 'stat',
        columns: 2,
        items: stats.map((item) => ({ label: item.label, value: String(item.value) })),
      });
    }

    if (fields.radar_estrategia) {
      blocks.push({ type: 'card', icon: 'Target', tone: 'indigo', title: 'Estrategia recomendada', description: fields.radar_estrategia });
    }
    if (fields.radar_oportunidad_2) {
      blocks.push({ type: 'card', icon: 'Lightbulb', tone: 'amber', title: 'Oportunidad secundaria', description: fields.radar_oportunidad_2 });
    }

    return blocks;
  }, [customData]);

  const priority = readField(customData, 'radar_prioridad');
  const badge = priority ? PRIORIDAD_BADGE[priority] : null;
  const openTasks = tasks.filter((task) => task.status !== 'done');

  return (
    <RadarDocumentProvider open={setDocumentId}>
      <div className="radar-ui space-y-5">
        {radarBlocks.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <RadarIcon className="h-4 w-4 text-indigo-500" />
              <h3 className="text-xs font-bold uppercase tracking-[0.09em] text-neutral-600 dark:text-neutral-300">{labels.radar}</h3>
              {badge && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>}
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="ml-auto flex items-center gap-1.5 rounded-xl border border-neutral-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500 transition-all duration-200 hover:border-indigo-500 hover:text-indigo-500 dark:border-neutral-700 dark:text-neutral-400"
              >
                <Maximize2 className="h-3 w-3" /> Ver todo
              </button>
            </div>
            <RadarBlocks blocks={radarBlocks} />
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-indigo-500" />
            <h3 className="text-xs font-bold uppercase tracking-[0.09em] text-neutral-600 dark:text-neutral-300">{labels.tasks}</h3>
            {tasks.length > 0 && (
              <span className="text-[10px] font-bold tabular-nums text-neutral-400">
                {openTasks.length}/{tasks.length}
              </span>
            )}
          </div>

          {tasksLoading && (
            <div className="flex items-center gap-2 py-3 text-xs text-neutral-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando tareas…
            </div>
          )}

          {!tasksLoading && tasksError && (
            <p className="py-2 text-sm text-neutral-400">La gestión de tareas no está disponible para este equipo.</p>
          )}

          {!tasksLoading && !tasksError && tasks.length === 0 && (
            <p className="py-2 text-sm text-neutral-400">No hay tareas para este contacto.</p>
          )}

          {!tasksLoading && !tasksError && tasks.length > 0 && (
            <ul className="space-y-1.5">
              {tasks.map((task) => {
                const done = task.status === 'done';
                const overdue = !done && task.dueDate !== null && new Date(task.dueDate) < new Date();
                return (
                  <li
                    key={task.id}
                    className="flex items-start gap-2.5 rounded-2xl border border-neutral-100 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-800/60"
                  >
                    {done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Clock className={`mt-0.5 h-4 w-4 shrink-0 ${overdue ? 'text-rose-500' : 'text-neutral-300 dark:text-neutral-600'}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`flex min-w-0 items-center gap-1.5 break-words text-sm font-medium ${done ? 'text-neutral-400 line-through' : 'text-neutral-800 dark:text-neutral-100'}`}>
                        {isRadarTaskTitle(task.title) && <RadarTag size="xs" />}
                        <span className="min-w-0 break-words">{radarTaskTitle(task.title)}</span>
                      </p>
                      {(task.projectName || task.dueDate) && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400">
                          {task.dueDate && <CalendarClock className="h-3 w-3" />}
                          {task.projectName}
                          {task.dueDate ? ` · ${new Date(task.dueDate).toLocaleDateString('es-AR')}` : ''}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {documents.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-500" />
              <h3 className="text-xs font-bold uppercase tracking-[0.09em] text-neutral-600 dark:text-neutral-300">{labels.documents}</h3>
              <span className="text-[10px] font-bold tabular-nums text-neutral-400">{documents.length}</span>
            </div>
            <ul className="space-y-1.5">
              {documents.map((document) => {
                const Icon = document.format === 'html' ? FileCode2 : FileText;
                return (
                  <li key={document.id}>
                    <button
                      type="button"
                      onClick={() => setDocumentId(document.id)}
                      className="flex w-full items-center gap-2.5 rounded-2xl border border-neutral-100 bg-white px-3 py-2.5 text-sm transition-all duration-200 hover:border-indigo-500 dark:border-neutral-800 dark:bg-neutral-800/60"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-neutral-800 dark:text-neutral-100">
                        {document.emoji ? `${document.emoji} ` : ''}
                        {document.title}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase text-neutral-400">{document.category}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {documentId !== null && <RadarDocumentViewer documentId={documentId} onClose={() => setDocumentId(null)} />}

        {fullscreen && (
          <RadarFullscreen
            contactId={contactId}
            remoteJid={remoteJid}
            instanceId={instanceId}
            onClose={() => setFullscreen(false)}
          />
        )}
      </div>
    </RadarDocumentProvider>
  );
}
