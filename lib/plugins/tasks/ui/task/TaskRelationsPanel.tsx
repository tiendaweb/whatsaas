'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, CheckSquare, FolderKanban,
  GitBranch, Link2, MapPin, User, X,
} from 'lucide-react';
import { buildTaskEntityIndex } from '@/lib/plugins/tasks/client/entity-index';
import { taskOsFetcher } from '@/lib/plugins/tasks/client/api';
import type { TaskDetails, TaskItem, TaskRelation, Workspace } from '@/lib/plugins/tasks/client/types';
import { formatDate, isOverdue } from '@/lib/plugins/tasks/client/utils';
import {
  taskOsCardInteractive,
  taskOsChip,
  taskOsMuted,
  taskOsMutedDim,
  taskOsPanel,
  taskOsText,
  taskOsTextSecondary,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { cn } from '@/lib/utils';

type ContactListItem = { id: number; name: string; phone?: string | null };

export type TaskRelationsPanelProps = {
  taskId: number;
  parentTaskId: number | null;
  workspaces: Workspace[];
  details?: TaskDetails;
  compact?: boolean;
  editable?: boolean;
  onOpenTask?: (taskId: number) => void;
  onOpenProject?: (projectId: number) => void;
  onOpenWorkspace?: (workspaceId: number) => void;
  onOpenContact?: (contactId: number) => void;
  onRemoveRelation?: (relation: TaskRelation) => void;
  onRemoveDependency?: (dependency: TaskDetails['dependencies'][number]) => void;
  onClearParent?: () => void;
};

type RelationCard = {
  key: string;
  kind: 'task' | 'project' | 'workspace' | 'contact' | 'dependency-in' | 'dependency-out' | 'location' | 'parent';
  title: string;
  subtitle: string;
  badge?: string;
  onClick?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
};

const KIND_STYLES: Record<RelationCard['kind'], { icon: typeof CheckSquare; iconBg: string; iconColor: string }> = {
  task: { icon: CheckSquare, iconBg: 'bg-sky-500/15', iconColor: 'text-sky-400' },
  project: { icon: FolderKanban, iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400' },
  workspace: { icon: FolderKanban, iconBg: 'bg-indigo-500/15', iconColor: 'text-indigo-400' },
  contact: { icon: User, iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400' },
  'dependency-in': { icon: ArrowDownLeft, iconBg: 'bg-orange-500/15', iconColor: 'text-orange-400' },
  'dependency-out': { icon: ArrowUpRight, iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400' },
  location: { icon: MapPin, iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400' },
  parent: { icon: GitBranch, iconBg: 'bg-fuchsia-500/15', iconColor: 'text-fuchsia-400' },
};

export function TaskRelationsPanel({
  taskId,
  parentTaskId,
  workspaces,
  details,
  compact = false,
  editable = false,
  onOpenTask,
  onOpenProject,
  onOpenWorkspace,
  onOpenContact,
  onRemoveRelation,
  onRemoveDependency,
  onClearParent,
}: TaskRelationsPanelProps) {
  const index = useMemo(() => buildTaskEntityIndex(workspaces), [workspaces]);

  const hasContactRelations = (details?.relations ?? []).some(
    (r) => r.sourceType === 'contact' || r.targetType === 'contact',
  );
  const { data: contacts = [] } = useSWR<ContactListItem[]>(
    hasContactRelations ? '/api/contacts/list' : null,
    taskOsFetcher,
  );
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const cards = useMemo(() => {
    const out: RelationCard[] = [];

    if (parentTaskId) {
      const resolved = index.findTask(parentTaskId);
      out.push({
        key: `parent-${parentTaskId}`,
        kind: 'parent',
        title: resolved ? radarTaskTitle(resolved.task.title) : `Tarea #${parentTaskId}`,
        subtitle: resolved ? `${resolved.workspace.name} · ${resolved.project.name}` : 'Tarea padre',
        badge: resolved?.task.status === 'done' ? 'Hecha' : undefined,
        onClick: onOpenTask ? () => onOpenTask(parentTaskId) : undefined,
        onRemove: editable && onClearParent ? onClearParent : undefined,
        removeLabel: 'Quitar tarea padre',
      });
    }

    for (const loc of details?.locations ?? []) {
      const resolved = index.findProject(loc.projectId);
      const column = resolved?.project.columns.find((c) => c.id === loc.columnId);
      out.push({
        key: `loc-${loc.id}`,
        kind: 'location',
        title: resolved?.project.name ?? `Proyecto #${loc.projectId}`,
        subtitle: column?.title ?? `Columna #${loc.columnId}`,
        badge: loc.isPrimary ? 'Principal' : 'Copia',
        onClick: onOpenProject ? () => onOpenProject(loc.projectId) : undefined,
      });
    }

    for (const rel of details?.relations ?? []) {
      const card = relationToCard(rel, taskId, index, contactMap, {
        onOpenTask,
        onOpenProject,
        onOpenWorkspace,
        onOpenContact,
        onRemoveRelation: editable ? onRemoveRelation : undefined,
      });
      if (card) out.push(card);
    }

    for (const dep of details?.dependencies ?? []) {
      const resolved = index.findTask(dep.dependsOnTaskId);
      out.push({
        key: `dep-in-${dep.id}`,
        kind: 'dependency-in',
        title: resolved ? radarTaskTitle(resolved.task.title) : `Tarea #${dep.dependsOnTaskId}`,
        subtitle: resolved ? `${resolved.project.name} · ${resolved.columnTitle}` : 'Esta tarea depende de',
        badge: resolved?.task.status === 'done' ? 'Hecha' : 'Bloqueante',
        onClick: onOpenTask ? () => onOpenTask(dep.dependsOnTaskId) : undefined,
        onRemove: editable && onRemoveDependency ? () => onRemoveDependency(dep) : undefined,
        removeLabel: 'Quitar dependencia',
      });
    }

    for (const dep of details?.dependents ?? []) {
      const resolved = index.findTask(dep.taskId);
      out.push({
        key: `dep-out-${dep.id}`,
        kind: 'dependency-out',
        title: resolved ? radarTaskTitle(resolved.task.title) : `Tarea #${dep.taskId}`,
        subtitle: resolved ? `${resolved.project.name} · ${resolved.columnTitle}` : 'Depende de esta tarea',
        onClick: onOpenTask ? () => onOpenTask(dep.taskId) : undefined,
        onRemove: editable && onRemoveDependency ? () => onRemoveDependency(dep) : undefined,
        removeLabel: 'Quitar dependencia',
      });
    }

    return out;
  }, [
    contactMap,
    details,
    editable,
    index,
    onClearParent,
    onOpenContact,
    onOpenProject,
    onOpenTask,
    onOpenWorkspace,
    onRemoveDependency,
    onRemoveRelation,
    parentTaskId,
    taskId,
  ]);

  if (cards.length === 0) {
    return (
      <div className={cn(taskOsPanel, 'border-dashed px-4 py-8 text-center', compact && 'py-5')}>
        <Link2 className={cn('mx-auto mb-2 h-5 w-5', taskOsMutedDim)} />
        <p className={cn('text-sm', taskOsMuted)}>Sin vínculos todavía</p>
        <p className={cn('mt-1 text-[11px]', taskOsMutedDim)}>Relaciona tareas, proyectos o contactos desde la pestaña Enlaces</p>
      </div>
    );
  }

  const grouped = {
    hierarchy: cards.filter((c) => c.kind === 'parent' || c.kind === 'location'),
    links: cards.filter((c) => ['task', 'project', 'workspace', 'contact'].includes(c.kind)),
    flow: cards.filter((c) => c.kind === 'dependency-in' || c.kind === 'dependency-out'),
  };

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {grouped.hierarchy.length > 0 && <RelationGroup title="Ubicación" cards={grouped.hierarchy} compact={compact} />}
      {grouped.links.length > 0 && <RelationGroup title="Vinculado con" cards={grouped.links} compact={compact} />}
      {grouped.flow.length > 0 && <RelationGroup title="Dependencias" cards={grouped.flow} compact={compact} />}
    </div>
  );
}

function RelationGroup({ title, cards, compact }: { title: string; cards: RelationCard[]; compact?: boolean }) {
  return (
    <div>
      <p className={cn('mb-2 text-[10px] font-medium uppercase tracking-wider', taskOsMutedDim)}>{title}</p>
      <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1')}>
        {cards.map((card) => (
          <RelationCardView key={card.key} card={card} />
        ))}
      </div>
    </div>
  );
}

function RelationCardView({ card }: { card: RelationCard }) {
  const { icon: Icon, iconBg, iconColor } = KIND_STYLES[card.kind];
  const clickable = Boolean(card.onClick);

  return (
    <div
      onClick={card.onClick}
      onKeyDown={(event) => {
        if (!clickable) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          card.onClick?.();
        }
      }}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={cn(
        'flex w-full items-start gap-3 p-3 text-left',
        clickable ? taskOsCardInteractive : taskOsPanel,
        !clickable && 'cursor-default',
      )}
    >
      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconBg, iconColor)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('truncate text-sm font-medium', taskOsText)}>{card.title}</p>
          {card.badge && (
            <span className={cn('shrink-0 px-2 py-0.5 text-[9px]', taskOsChip)}>{card.badge}</span>
          )}
          {card.onRemove && (
            <button
              type="button"
              title={card.removeLabel ?? 'Quitar relación'}
              onClick={(event) => {
                event.stopPropagation();
                card.onRemove?.();
              }}
              className="shrink-0 rounded-md p-1 text-[#6b6b76] hover:bg-red-500/10 hover:text-red-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className={cn('mt-0.5 truncate text-[11px]', taskOsMuted)}>{card.subtitle}</p>
      </div>
    </div>
  );
}

function relationToCard(
  rel: TaskRelation,
  currentTaskId: number,
  index: ReturnType<typeof buildTaskEntityIndex>,
  contactMap: Map<number, ContactListItem>,
  handlers: {
    onOpenTask?: (id: number) => void;
    onOpenProject?: (id: number) => void;
    onOpenWorkspace?: (id: number) => void;
    onOpenContact?: (id: number) => void;
    onRemoveRelation?: (relation: TaskRelation) => void;
  },
): RelationCard | null {
  const isSource = rel.sourceType === 'task' && rel.sourceId === currentTaskId;
  const peerType = isSource ? rel.targetType : rel.sourceType;
  const peerId = isSource ? rel.targetId : rel.sourceId;

  if (peerType === 'task') {
    const resolved = index.findTask(peerId);
    const overdue = resolved?.task.dueDate ? isOverdue(resolved.task.dueDate) : false;
    return {
      key: `rel-task-${rel.id}`,
      kind: 'task',
      title: resolved ? radarTaskTitle(resolved.task.title) : `Tarea #${peerId}`,
      subtitle: resolved
        ? `${resolved.workspace.name} · ${resolved.project.name}`
        : 'Tarea relacionada',
      badge: resolved?.task.status === 'done'
        ? 'Hecha'
        : overdue
          ? 'Vencida'
          : resolved?.task.dueDate
            ? formatDate(resolved.task.dueDate) ?? undefined
            : undefined,
      onClick: handlers.onOpenTask ? () => handlers.onOpenTask!(peerId) : undefined,
      onRemove: handlers.onRemoveRelation ? () => handlers.onRemoveRelation!(rel) : undefined,
      removeLabel: 'Quitar tarea vinculada',
    };
  }

  if (peerType === 'project') {
    const resolved = index.findProject(peerId);
    return {
      key: `rel-proj-${rel.id}`,
      kind: 'project',
      title: resolved?.project.name ?? `Proyecto #${peerId}`,
      subtitle: resolved?.workspace.name ?? 'Proyecto relacionado',
      onClick: handlers.onOpenProject ? () => handlers.onOpenProject!(peerId) : undefined,
      onRemove: handlers.onRemoveRelation ? () => handlers.onRemoveRelation!(rel) : undefined,
      removeLabel: 'Quitar proyecto vinculado',
    };
  }

  if (peerType === 'workspace') {
    const ws = index.findWorkspace(peerId);
    return {
      key: `rel-ws-${rel.id}`,
      kind: 'workspace',
      title: ws?.name ?? `Espacio de trabajo #${peerId}`,
      subtitle: `${ws?.projects.length ?? 0} proyectos`,
      onClick: handlers.onOpenWorkspace ? () => handlers.onOpenWorkspace!(peerId) : undefined,
      onRemove: handlers.onRemoveRelation ? () => handlers.onRemoveRelation!(rel) : undefined,
      removeLabel: 'Quitar espacio de trabajo vinculado',
    };
  }

  if (peerType === 'contact') {
    const contact = contactMap.get(peerId);
    return {
      key: `rel-contact-${rel.id}`,
      kind: 'contact',
      title: contact?.name ?? `Contacto #${peerId}`,
      subtitle: contact?.phone ?? 'Ver datos CRM',
      onClick: handlers.onOpenContact ? () => handlers.onOpenContact!(peerId) : undefined,
      onRemove: handlers.onRemoveRelation ? () => handlers.onRemoveRelation!(rel) : undefined,
      removeLabel: 'Quitar contacto vinculado',
    };
  }

  return null;
}

export function TaskRelationChip({ task }: { task: TaskItem }) {
  const done = task.status === 'done';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px]',
      done ? 'bg-emerald-500/15 text-emerald-400' : cn(taskOsChip, taskOsTextSecondary),
    )}>
      {done ? <CheckCircle2 className="h-3 w-3" /> : <CheckSquare className="h-3 w-3" />}
      {radarTaskTitle(task.title)}
    </span>
  );
}
