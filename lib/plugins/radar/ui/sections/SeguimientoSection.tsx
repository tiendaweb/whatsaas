'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { TASK_OS_API } from '@/lib/plugins/tasks/client/constants';
import { taskOsFetcher } from '@/lib/plugins/tasks/client/api';
import type { TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { RadarBlocks } from '../blocks/RadarBlockView';
import { BlockEmpty, BlockLabel } from '../blocks/primitives';
import { SectionShell } from './SectionShell';

type RadarTask = {
  id: number;
  title: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  projectName: string;
};

/**
 * Tareas que Radar deja abiertas. Se leen del tablero de Tareas OS ya
 * existente (prefijo de título "RADAR ·") en vez de duplicar un endpoint.
 */
export function SeguimientoSection({ editing }: { editing: boolean }) {
  const { data, isLoading } = useSWR<TaskWorkspace[]>(TASK_OS_API.workspaces, taskOsFetcher);

  const tasks = useMemo<RadarTask[]>(() => {
    const items: RadarTask[] = [];
    for (const workspace of data ?? []) {
      for (const project of workspace.projects) {
        for (const column of project.columns) {
          for (const item of column.items) {
            if (!item?.title?.startsWith('RADAR ·')) continue;
            items.push({
              id: item.id,
              title: item.title,
              status: item.status,
              dueDate: item.dueDate,
              completedAt: item.completedAt,
              projectName: project.name,
            });
          }
        }
      }
    }
    return items;
  }, [data]);

  const blocks = useMemo<RadarBlock[]>(() => {
    if (!tasks.length) return [];
    const now = Date.now();
    const open = tasks.filter((task) => task.status !== 'done');
    const done = tasks.filter((task) => task.status === 'done');
    const overdue = open.filter((task) => task.dueDate !== null && new Date(task.dueDate).getTime() < now);

    return [
      {
        type: 'kpi',
        columns: 3,
        items: [
          { label: 'Abiertas', value: open.length, icon: 'Clock', tone: 'amber' },
          { label: 'Vencidas', value: overdue.length, icon: 'AlertTriangle', tone: 'rose' },
          { label: 'Completadas', value: done.length, icon: 'CheckCircle2', tone: 'emerald' },
        ],
      },
      {
        type: 'progress',
        title: 'Avance del seguimiento',
        icon: 'Activity',
        tone: 'emerald',
        items: [{ label: 'Tareas completadas', value: done.length, max: tasks.length, tone: 'emerald', showRaw: true }],
      },
      {
        type: 'table',
        title: 'Tareas de Radar',
        icon: 'ClipboardList',
        tone: 'indigo',
        highlightKey: 'estado',
        columns: [
          { key: 'tarea', label: 'Tarea' },
          { key: 'proyecto', label: 'Proyecto' },
          { key: 'estado', label: 'Estado', format: 'badge' },
          { key: 'vence', label: 'Vence', align: 'right' },
        ],
        rows: [...open, ...done].map((task) => ({
          // Sólo la celda va limpia: el filtro de arriba sigue mirando
          // `item.title` con el prefijo, que es lo que arma esta lista.
          tarea: radarTaskTitle(task.title),
          proyecto: task.projectName,
          estado: task.status === 'done'
            ? 'Hecha'
            : task.dueDate && new Date(task.dueDate).getTime() < now
              ? 'Vencida'
              : 'Abierta',
          vence: task.dueDate ? new Date(task.dueDate).toLocaleDateString('es-AR') : '—',
        })),
      },
    ];
  }, [tasks]);

  return (
    <SectionShell section="seguimiento" editing={editing}>
      <section className="space-y-3">
        <BlockLabel>Tareas generadas por Radar</BlockLabel>

        {isLoading && (
          <div className="flex items-center gap-2 py-10 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando seguimiento…
          </div>
        )}

        {!isLoading && blocks.length === 0 && (
          <BlockEmpty text="Las tareas que Radar crea para P1 y revisión humana van a aparecer acá." />
        )}

        {!isLoading && blocks.length > 0 && <RadarBlocks blocks={blocks} />}
      </section>
    </SectionShell>
  );
}
