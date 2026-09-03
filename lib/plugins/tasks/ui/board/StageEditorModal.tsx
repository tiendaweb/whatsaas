'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, FileCode2, Loader2, Palette, Pencil, Trash2, X } from 'lucide-react';
import {
  composeAppearanceColor,
  getAppearanceBaseColor,
  getAppearanceOpacity,
  sameAppearanceBase,
} from '@/lib/plugins/tasks/client/appearance-color';
import { parseCascadeDocument, summarizeCascadeDocument } from '@/lib/plugins/tasks/client/cascade-dsl';
import { serializeCascadeForScope } from '@/lib/plugins/tasks/client/cascade-scope';
import { resolveTaskIcon, TASK_APPEARANCE_COLORS, TASK_APPEARANCE_ICONS } from '@/lib/plugins/tasks/client/task-appearance';
import { copyTaskToLocation, moveTaskToLocation, shareTaskToLocation } from '@/lib/plugins/tasks/client/api';
import type { TaskColumn, TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';
import { LocationActionModal, type TransferMode } from '@/lib/plugins/tasks/ui/shared/TaskTransferModals';
import {
  taskOsBtn,
  taskOsBtnActive,
  taskOsInput,
  taskOsMuted,
  taskOsPanel,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

type PreviewStats = {
  create: { workspaces: number; projects: number; columns: number; tasks: number };
  update: { tasks: number };
};

export type StageEditorModalProps = {
  column: TaskColumn;
  project: TaskProject;
  workspaces: TaskWorkspace[];
  onClose: () => void;
  onRename: (colId: number, title: string) => void;
  onSaveAppearance: (colId: number, patch: { color?: string | null; icon?: string | null }) => void;
  onDelete: (colId: number) => void;
  onApplied: () => void;
};

export function StageEditorModal({
  column,
  project,
  workspaces,
  onClose,
  onRename,
  onSaveAppearance,
  onDelete,
  onApplied,
}: StageEditorModalProps) {
  const [tab, setTab] = useState<'appearance' | 'cascade' | 'transfer'>('appearance');
  const [title, setTitle] = useState(column.title);
  const [baseColor, setBaseColor] = useState<string | null>(getAppearanceBaseColor(column.color));
  const [opacity, setOpacity] = useState(getAppearanceOpacity(column.color));
  const [icon, setIcon] = useState<string | null>(column.icon ?? null);
  const [document, setDocument] = useState('');
  const [preview, setPreview] = useState<PreviewStats | null>(null);
  const [loading, setLoading] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const Icon = resolveTaskIcon(icon) || Pencil;
  const composedColor = baseColor ? composeAppearanceColor(baseColor, opacity) : null;

  const localSummary = useMemo(() => {
    try {
      return summarizeCascadeDocument(parseCascadeDocument(document));
    } catch {
      return null;
    }
  }, [document]);

  useEffect(() => {
    setTitle(column.title);
    setBaseColor(getAppearanceBaseColor(column.color));
    setOpacity(getAppearanceOpacity(column.color));
    setIcon(column.icon ?? null);
    setDocument(serializeCascadeForScope(workspaces, { type: 'column', columnId: column.id, projectId: project.id }));
    setPreview(null);
    setError(null);
  }, [column.id, column.title, column.color, column.icon, project.id, workspaces]);

  const saveAppearance = () => {
    const cleanTitle = title.trim();
    if (cleanTitle && cleanTitle !== column.title) onRename(column.id, cleanTitle);
    onSaveAppearance(column.id, { color: composedColor, icon });
  };

  const reloadCascade = () => {
    setDocument(serializeCascadeForScope(workspaces, { type: 'column', columnId: column.id, projectId: project.id }));
    setPreview(null);
    setError(null);
  };

  const runCascade = async (mode: 'preview' | 'apply') => {
    setLoading(mode);
    setError(null);
    try {
      const res = await fetch('/api/plugins/tasks/cascade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document,
          mode,
          scope: { type: 'column', columnId: column.id, projectId: project.id },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al aplicar cascada');
      if (mode === 'preview') setPreview(data.preview);
      else {
        setPreview(null);
        onApplied();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(null);
    }
  };

  const runTransfer = async (input: { mode: TransferMode; projectId: number; columnId: number }) => {
    const tasks = column.items.filter(Boolean);
    await Promise.all(tasks.map((item) => {
      if (input.mode === 'move') return moveTaskToLocation(item.id, input.projectId, input.columnId);
      if (input.mode === 'copy') return copyTaskToLocation(item.id, input.projectId, input.columnId);
      return shareTaskToLocation(item.id, input.projectId, input.columnId);
    }));
    onApplied();
  };

  return (
    <>
    <TaskOsModal onClose={onClose} size="2xl" className="!max-w-[min(96vw,64rem)] max-h-[92vh] overflow-hidden">
      <TaskOsModalHeader title="Editar etapa" subtitle={project.name} onClose={onClose} />

      <div className="mb-4 flex gap-1 rounded-lg border border-[#2a2a30] bg-[#141416] p-1">
        {[
          { id: 'appearance' as const, label: 'Apariencia', icon: Palette },
          { id: 'cascade' as const, label: 'Cascada', icon: FileCode2 },
          { id: 'transfer' as const, label: 'Mover/copiar', icon: ArrowRightLeft },
        ].map(({ id, label, icon: TabIcon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
              tab === id ? taskOsBtnActive : 'text-[#8b8b96] hover:bg-[#222228] hover:text-[#e8e8ed]',
            )}
          >
            <TabIcon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'appearance' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className={cn('text-xs font-medium', taskOsText)}>Nombre</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={cn('w-full px-3 py-2 text-sm', taskOsInput)}
                placeholder="Nombre de la etapa"
              />
            </label>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className={cn('text-xs font-medium', taskOsText)}>Color</p>
                <button
                  type="button"
                  onClick={() => setBaseColor(null)}
                  className={cn('flex items-center gap-1 text-[11px]', taskOsMuted, 'hover:text-[#e8e8ed]')}
                >
                  <X className="h-3 w-3" />
                  Quitar
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {TASK_APPEARANCE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBaseColor(sameAppearanceBase(baseColor, color) ? null : color)}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-transform hover:scale-105',
                      sameAppearanceBase(baseColor, color) ? 'border-white' : 'border-transparent',
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
                <input
                  type="color"
                  value={baseColor ?? '#3b82f6'}
                  onChange={(e) => setBaseColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-[#2a2a30] bg-transparent"
                  title="Color personalizado"
                />
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className={cn('text-xs font-medium', taskOsText)}>Transparencia</p>
                <span className={cn('font-mono text-[11px]', taskOsMuted)}>{opacity}%</span>
              </div>
              <input
                type="range"
                min={15}
                max={100}
                step={5}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                disabled={!baseColor}
                className="w-full accent-[#3b82f6] disabled:opacity-40"
              />
            </section>

            <section className="space-y-2">
              <p className={cn('text-xs font-medium', taskOsText)}>Icono</p>
              <div className="flex flex-wrap gap-1">
                {TASK_APPEARANCE_ICONS.map(({ name, Icon: OptionIcon }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIcon(icon === name ? null : name)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                      icon === name
                        ? 'bg-[#2563eb]/20 text-[#93c5fd]'
                        : 'text-[#6b6b76] hover:bg-[#2a2a30] hover:text-[#d4d4dc]',
                    )}
                    title={name}
                  >
                    <OptionIcon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </section>

            <div className="flex items-center justify-between gap-2 border-t border-[#2a2a30] pt-3">
              <button
                type="button"
                onClick={() => onDelete(column.id)}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300 transition-colors hover:bg-red-500/15"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Borrar
              </button>
              <button type="button" onClick={saveAppearance} className={cn('px-4 py-2 text-xs font-medium', taskOsBtnActive)}>
                Guardar cambios
              </button>
            </div>
          </div>

          <aside className={cn('flex flex-col items-center justify-center gap-3 p-4', taskOsPanel)}>
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2a2a30]"
              style={baseColor ? { backgroundColor: composedColor ?? baseColor, borderColor: baseColor } : undefined}
            >
              <Icon className="h-7 w-7" style={baseColor ? { color: baseColor } : undefined} />
            </div>
            <div className="text-center">
              <p className={cn('text-sm font-semibold', taskOsText)}>{title || column.title}</p>
              <p className={cn('text-xs', taskOsMuted)}>Vista previa de etapa</p>
            </div>
          </aside>
        </div>
      ) : tab === 'cascade' ? (
        <div className="flex min-h-[28rem] flex-col gap-3 lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={reloadCascade} className={cn('px-3 py-1.5 text-xs', taskOsBtn)}>
                Recargar etapa
              </button>
              <button
                type="button"
                onClick={() => { setDocument(`#### Nueva tarea\n:::notes\nContexto y criterios de aceptacion.\n:::\n- Paso pendiente\n- [x] Paso listo`); setPreview(null); }}
                className={cn('px-3 py-1.5 text-xs', taskOsBtn)}
              >
                Plantilla
              </button>
            </div>
            <textarea
              value={document}
              onChange={(e) => { setDocument(e.target.value); setPreview(null); }}
              spellCheck={false}
              className={cn('min-h-[22rem] flex-1 resize-none font-mono text-xs leading-relaxed', taskOsInput, 'p-3')}
            />
            {localSummary && (
              <p className={cn('text-[11px]', taskOsMuted)}>
                {localSummary.columns} etapas · {localSummary.tasks} tareas · {localSummary.checklist} checklist
              </p>
            )}
          </div>

          <aside className={cn('flex w-full shrink-0 flex-col gap-3 lg:w-72', taskOsPanel, 'p-3')}>
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-[#93c5fd]" />
              <span className={cn('text-sm font-medium', taskOsText)}>Solo esta etapa</span>
            </div>
            <pre className={cn('overflow-auto rounded-lg border border-[#2a2a30] bg-[#141416] p-2 text-[10px] leading-relaxed', taskOsMuted)}>
{`#### Nueva tarea
:::notes
Contexto y criterios de aceptacion.
:::
- Paso pendiente
- [x] Paso listo`}
            </pre>
            <p className={cn('text-[10px]', taskOsMuted)}>
              En esta vista empieza con #### Tarea. Las notas van entre :::notes y :::, y los pasos van como checklist. No uses JSON ni explicaciones externas.
            </p>
            {preview && (
              <div className="space-y-1 text-xs text-[#c8c8d0]">
                <p className="font-medium text-[#e8e8ed]">Cambios previstos</p>
                <p>Crear: {preview.create.tasks} tareas</p>
                <p>Actualizar: {preview.update.tasks} tareas</p>
              </div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="mt-auto flex flex-col gap-2">
              <button type="button" disabled={loading !== null} onClick={() => void runCascade('preview')} className={cn('w-full py-2 text-xs', taskOsBtn)}>
                {loading === 'preview' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Previsualizar'}
              </button>
              <button type="button" disabled={loading !== null} onClick={() => void runCascade('apply')} className={cn('w-full py-2 text-xs font-medium', taskOsBtnActive)}>
                {loading === 'apply' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Aplicar en etapa'}
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={cn('p-4', taskOsPanel)}>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-[#93c5fd]" />
              <div>
                <p className={cn('text-sm font-medium', taskOsText)}>Aplicar a tareas de esta etapa</p>
                <p className={cn('text-xs', taskOsMuted)}>
                  {column.items.length} tarea{column.items.length === 1 ? '' : 's'} en {column.title}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              disabled={column.items.length === 0}
              className={cn('mt-4 flex items-center gap-2 px-4 py-2 text-xs font-medium disabled:opacity-50', taskOsBtnActive)}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Elegir destino y acción
            </button>
          </div>
        </div>
      )}
    </TaskOsModal>
    {transferOpen && (
      <LocationActionModal
        title="Tareas de etapa"
        subtitle={column.title}
        workspaces={workspaces}
        defaultProjectId={project.id}
        sourceProjectId={project.id}
        sourceColumnId={column.id}
        modes={['move', 'copy', 'share']}
        onClose={() => setTransferOpen(false)}
        onSubmit={runTransfer}
      />
    )}
    </>
  );
}
