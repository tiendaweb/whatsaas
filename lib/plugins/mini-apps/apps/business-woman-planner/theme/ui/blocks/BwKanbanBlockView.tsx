'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Panel, SectionHeader, EmptyState } from '../../../components/shared';
import { TimelineView } from '../../../views/ProjectsView';
import { useBoardContext } from '../BoardContext';
import type { BwBlock } from '../../shared/schema';

type BwKanbanBlockType = Extract<BwBlock, { type: 'kanban' }>;

/**
 * Tablero embebido: reusa TAL CUAL `TimelineView` (el mismo componente que ya
 * usa la pestaña clásica "Proyectos" en su vista "flujo") con las columnas
 * de UN proyecto — mismo drag&drop, misma ficha de tarea al abrir una (con
 * checklist, notas, comentarios y vinculaciones), sin reimplementar nada.
 * Sólo se agrega arriba un alta rápida a la primera columna del proyecto.
 */
export function BwKanbanBlockView({ block }: { block: BwKanbanBlockType }) {
  const board = useBoardContext();
  const [newTitle, setNewTitle] = useState('');

  if (!board) return null;

  const project = board.projects.find((p) => p._recordId === block.projectId);
  const columns = board.columns.filter((c) => c.projectId === block.projectId).sort((a, b) => a.order - b.order);
  const firstColumnId = columns[0]?._recordId;

  if (!project || !columns.length) {
    return (
      <Panel className="p-4">
        {block.title && <SectionHeader title={block.title} />}
        <EmptyState>
          {project ? 'Este proyecto todavía no tiene columnas — creálas desde la pestaña "Proyectos".' : `No se encontró el proyecto "${block.projectId}".`}
        </EmptyState>
      </Panel>
    );
  }

  function handleCreate() {
    const title = newTitle.trim();
    if (!title || !firstColumnId) return;
    board!.onCreateTask(firstColumnId, title);
    setNewTitle('');
  }

  return (
    <Panel className="flex max-h-[70vh] flex-col overflow-hidden p-4">
      {block.title && <SectionHeader title={block.title} />}
      <div className="mb-2 flex shrink-0 gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={`Nueva tarea en "${columns[0].title}"…`}
          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-rose-300 focus:outline-none"
        />
        <button type="button" onClick={handleCreate} className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-3 py-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <TimelineView
        tasks={board.tasks}
        columns={columns}
        project={project}
        clients={board.clients}
        onOpenTask={board.onOpenTask}
        onMoveTask={board.onMoveTask}
      />
    </Panel>
  );
}
