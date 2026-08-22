'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  UserCircle,
  X,
} from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import { patchTaskItem } from '@/lib/plugins/tasks/client/api';
import type { ChecklistItemWithSource, TaskItem, TaskProject } from '@/lib/plugins/tasks/client/types';
import { TaskOsBottomDock } from '@/lib/plugins/tasks/ui/shared/TaskOsBottomDock';
import { TaskOsIconDock } from '@/lib/plugins/tasks/ui/shared/TaskOsIconDock';
import { TaskOsMarkdown } from '@/lib/plugins/tasks/ui/shared';
import { TaskNotesEditor } from '@/lib/plugins/tasks/ui/task/TaskNotesEditor';
import { formatDate } from '@/lib/plugins/tasks/client/utils';
import {
  taskOsBg,
  taskOsBorder,
  taskOsBtn,
  taskOsBtnActive,
  taskOsMuted,
  taskOsPanel,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type CalendarInspectorView = 'details' | 'checklists' | 'profile' | 'calendar';

type CalendarTaskInspectorProps = {
  task: TaskItem;
  project: TaskProject;
  onClose?: () => void;
  onSaved: () => void;
  onScheduleChange?: (startDate: string | null, endDate: string | null) => void;
  className?: string;
  mobileSheet?: boolean;
};

export function CalendarTaskInspector({
  task,
  project,
  onClose,
  onSaved,
  onScheduleChange,
  className,
  mobileSheet,
}: CalendarTaskInspectorProps) {
  const router = useRouter();
  const [view, setView] = useState<CalendarInspectorView>('details');
  const [notes, setNotes] = useState(task.notes);
  const [checklist, setChecklist] = useState<ChecklistItemWithSource[]>(task.checklist);
  const [startDate, setStartDate] = useState(task.startDate?.split('T')[0] ?? '');
  const [endDate, setEndDate] = useState(task.endDate?.split('T')[0] ?? (task.dueDate?.split('T')[0] ?? ''));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(task.notes);
    setChecklist(task.checklist);
    setStartDate(task.startDate?.split('T')[0] ?? '');
    setEndDate(task.endDate?.split('T')[0] ?? (task.dueDate?.split('T')[0] ?? ''));
  }, [task.id, task.notes, task.checklist, task.startDate, task.endDate, task.dueDate]);

  const TaskIcon = resolveTaskIcon(task.icon);
  const columnTitle = project.columns.find((c) => c.id === task.columnId)?.title ?? '—';
  const done = checklist.filter((c) => c.completed).length;

  const dockItems = useMemo(() => [
    { id: 'details' as const, label: 'Descripción', icon: FileText },
    { id: 'checklists' as const, label: 'Checklist', icon: ListChecks, badge: checklist.length },
    { id: 'profile' as const, label: 'Perfil', icon: UserCircle },
    { id: 'calendar' as const, label: 'Calendario', icon: CalendarDays },
  ], [checklist.length]);

  const save = async (patch: Partial<TaskItem>) => {
    setSaving(true);
    await patchTaskItem(task.id, patch);
    setSaving(false);
    onSaved();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (notes !== task.notes) void save({ notes });
    }, 700);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (JSON.stringify(checklist) !== JSON.stringify(task.checklist)) void save({ checklist });
    }, 500);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklist]);

  const applyDates = async () => {
    const start = startDate ? `${startDate}T12:00:00.000Z` : null;
    const end = endDate ? `${endDate}T12:00:00.000Z` : null;
    await save({ startDate: start, endDate: end, dueDate: end });
    onScheduleChange?.(start, end);
  };

  const toggleCheck = (id: string) => {
    setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c)));
  };

  return (
    <div
      className={cn(
        'flex min-h-0',
        mobileSheet ? 'max-h-[78vh] flex-col rounded-t-2xl border-t shadow-2xl' : 'h-full flex-row border-l',
        taskOsBorder,
        taskOsBg,
        className,
      )}
    >
      <TaskOsIconDock
        items={dockItems}
        active={view}
        onChange={setView}
        className={cn(mobileSheet ? 'hidden' : 'flex')}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={cn('flex items-center justify-between gap-2 border-b px-3 py-2.5', taskOsBorder)}>
          <div className="min-w-0 flex-1">
            <p className={cn('truncate text-sm font-semibold', taskOsText)}>{task.title}</p>
            <p className={cn('truncate text-[10px]', taskOsMuted)}>{project.name} · {columnTitle}</p>
          </div>
          {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#8b8b96]" />}
          {onClose && (
            <button type="button" onClick={onClose} className={cn('shrink-0 p-1.5', taskOsBtn)}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {view === 'details' && (
            <section>
              <p className={cn('mb-2 text-[11px] font-medium uppercase tracking-wide', taskOsMuted)}>Descripción y checklist</p>
              <TaskNotesEditor value={notes} onChange={setNotes} />
              {checklist.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-[#2a2a30] pt-3">
                  {checklist.slice(0, 6).map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm text-[#a8a8b3]">
                      <span className={cn('h-1.5 w-1.5 rounded-full', c.completed ? 'bg-emerald-500' : 'bg-[#5c5c66]')} />
                      <span className={cn(c.completed && 'line-through opacity-60')}>{c.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {view === 'checklists' && (
            <ul className="space-y-1.5">
              {checklist.length === 0 && <p className={cn('text-sm', taskOsMuted)}>Sin ítems</p>}
              {checklist.map((c) => (
                <li key={c.id} className={cn(taskOsPanel, 'flex items-center gap-2 px-2 py-2')}>
                  <button type="button" onClick={() => toggleCheck(c.id)}>
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded border', c.completed ? 'border-emerald-500 bg-emerald-500' : 'border-[#3a3a42]')} />
                  </button>
                  <span className={cn('text-sm', c.completed && 'line-through text-[#6b6b76]')}>{c.text}</span>
                </li>
              ))}
            </ul>
          )}

          {view === 'profile' && (
            <div className="space-y-4">
              <div className={cn(taskOsPanel, 'flex items-center gap-3 p-3')}>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#2a2a30]" style={task.color ? { backgroundColor: `${task.color}22` } : undefined}>
                  {TaskIcon ? <TaskIcon className="h-6 w-6" style={{ color: task.color ?? '#93c5fd' }} /> : <UserCircle className="h-6 w-6 text-[#6b6b76]" />}
                </div>
                <div className="min-w-0">
                  <p className={cn('font-semibold', taskOsText)}>{task.title}</p>
                  <p className={cn('text-xs', taskOsMuted)}>{task.status === 'done' ? 'Completada' : 'Abierta'}</p>
                </div>
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between"><dt className={taskOsMuted}>Proyecto</dt><dd className="text-[#c8c8d0]">{project.name}</dd></div>
                <div className="flex justify-between"><dt className={taskOsMuted}>Etapa</dt><dd className="text-[#c8c8d0]">{columnTitle}</dd></div>
                <div className="flex justify-between"><dt className={taskOsMuted}>Checklist</dt><dd className="text-[#c8c8d0]">{done}/{checklist.length}</dd></div>
              </dl>
              {task.notes && <TaskOsMarkdown content={task.notes.slice(0, 500)} className="text-sm text-[#a8a8b3]" />}
            </div>
          )}

          {view === 'calendar' && (
            <div className="space-y-4">
              <p className={cn('text-[11px] font-medium', taskOsMuted)}>Programación en calendario</p>
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-1 min-w-[7rem] flex-col gap-0.5 text-[10px] text-[#6b6b76]">
                  Inicio
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-[#2a2a30] bg-[#141416] px-2 py-1.5 text-xs [color-scheme:dark]" />
                </label>
                <label className="flex flex-1 min-w-[7rem] flex-col gap-0.5 text-[10px] text-[#6b6b76]">
                  Fin
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-[#2a2a30] bg-[#141416] px-2 py-1.5 text-xs [color-scheme:dark]" />
                </label>
              </div>
              <button type="button" onClick={() => void applyDates()} className={cn('w-full py-2 text-xs', taskOsBtnActive)}>
                Guardar fechas
              </button>
              <button
                type="button"
                onClick={() => router.push(`/plugins/calendar?task=${task.id}`)}
                className={cn('flex w-full items-center justify-center gap-1.5 py-2 text-xs', taskOsBtn)}
              >
                <ExternalLink className="h-3 w-3" />
                Abrir en plugin Calendario
              </button>
            </div>
          )}
        </div>

        {mobileSheet && (
          <TaskOsBottomDock items={dockItems} active={view} onChange={setView} />
        )}
      </div>
    </div>
  );
}