export type TaskLabel = { id: string; name: string; color: string };

export type ChecklistItem = { id: string; text: string; completed: boolean };

export type ChecklistItemWithSource = ChecklistItem & {
  sourceTaskId?: number;
  sourceSnapshot?: { title: string; notes?: string; dueDate?: string | null };
};

export type TaskMedia = {
  id: number | string;
  ownerType: string;
  ownerId: number;
  url: string;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  source: string;
  inheritedFrom?: string;
};

export type TaskRelation = {
  id: number;
  sourceType: string;
  sourceId: number;
  targetType: string;
  targetId: number;
  relationType: string;
};

export type TaskDependency = {
  id: number;
  taskId: number;
  dependsOnTaskId: number;
};

export type TaskLocation = {
  id: number;
  projectId: number;
  columnId: number;
  isPrimary: boolean;
};

export type TaskDetails = {
  relations: TaskRelation[];
  dependencies: TaskDependency[];
  dependents: TaskDependency[];
  locations: TaskLocation[];
  media: TaskMedia[];
};

export type TaskItem = {
  id: number;
  title: string;
  notes: string;
  /** Instrucciones para la IA sobre esta tarea (ver schema.ts). */
  aiPrompt?: string;
  aiNextStep?: string;
  aiContextQuestion?: string;
  aiContextAnswer?: string;
  aiReadyAt?: string | null;
  /** Producción OS: tipo y estado del pedido. NULL = tarea común. */
  workKind?: string | null;
  workStatus?: string | null;
  labelIds: string[];
  checklist: ChecklistItemWithSource[];
  status: string;
  completedAt: string | null;
  parentTaskId: number | null;
  dueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  columnId: number;
  projectId: number;
  primaryProjectId?: number;
  primaryColumnId?: number;
  locationId?: number;
  isPrimaryLocation?: boolean;
  commentCount: number;
  order: number;
  color?: string | null;
  icon?: string | null;
  coverMediaId?: number | null;
  coverUrl?: string | null;
  createdBy?: number | null;
  assigneeId?: number | null;
};

export type TaskColumn = {
  id: number;
  projectId: number;
  title: string;
  order: number;
  color?: string | null;
  icon?: string | null;
  items: TaskItem[];
};

export type TaskProject = {
  id: number;
  workspaceId: number | null;
  name: string;
  aiPrompt?: string;
  backgroundUrl: string | null;
  labels: TaskLabel[];
  order: number;
  color?: string | null;
  icon?: string | null;
  columns: TaskColumn[];
};

export type TaskWorkspace = {
  id: number;
  name: string;
  aiPrompt?: string;
  order: number;
  color?: string | null;
  icon?: string | null;
  projects: TaskProject[];
};

export type PickerAction =
  | 'share_project'
  | 'related_task'
  | 'related_project'
  | 'related_workspace'
  | 'parent_task'
  | 'dependency'
  | 'checklist_source';

export type TaskComment = {
  id: number;
  text: string;
  createdAt: string;
};

export type TaskTemplate = {
  id: number;
  name: string;
  payload: { labels?: TaskLabel[] };
};

export type TaskMediaOwnerType = 'workspace' | 'project' | 'task';

export type CreateTaskInput = {
  columnId: number;
  title: string;
  notes?: string;
  aiPrompt?: string;
  aiNextStep?: string;
  aiContextQuestion?: string;
  aiContextAnswer?: string;
  aiReadyAt?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  labelIds?: string[];
  checklist?: ChecklistItemWithSource[];
  status?: string;
};

export type PatchTaskInput = Partial<{
  title: string;
  notes: string;
  aiPrompt: string;
  aiNextStep: string;
  aiContextQuestion: string;
  aiContextAnswer: string;
  aiReadyAt: string | null;
  labelIds: string[];
  checklist: ChecklistItemWithSource[];
  dueDate: string | null;
  startDate?: string | null;
  endDate?: string | null;
  columnId: number;
  projectId: number;
  makePrimary: boolean;
  order: number;
  status: string;
  parentTaskId: number | null;
  color: string | null;
  icon: string | null;
  coverMediaId: number | null;
  assigneeId: number | null;
}>;

export type TaskRelationInput = {
  sourceType: string;
  sourceId: number;
  targetType: string;
  targetId: number;
  relationType?: string;
};

export type ProjectTemplatePayload = {
  type: 'project';
  name: string;
  payload: {
    name: string;
    labels: TaskLabel[];
    columns: Array<{
      title: string;
      color?: string | null;
      icon?: string | null;
      tasks: Array<{
        title: string;
        notes: string;
        checklist: ChecklistItemWithSource[];
        labelIds: string[];
        status: string;
        color?: string | null;
        icon?: string | null;
      }>;
    }>;
  };
};

export type TaskTemplatePayload = {
  type: 'task';
  name: string;
  payload: {
    title: string;
    notes: string;
    checklist: ChecklistItemWithSource[];
    labelIds: string[];
    dueDate: string | null;
    startDate?: string | null;
    endDate?: string | null;
    color?: string | null;
    icon?: string | null;
  };
};

export type LabelTemplatePayload = {
  type: 'labels';
  name: string;
  payload: { labels: TaskLabel[] };
};

/** @deprecated Use TaskColumn — kept for incremental migration */
export type Column = TaskColumn;

/** @deprecated Use TaskProject */
export type Project = TaskProject;

/** @deprecated Use TaskWorkspace */
export type Workspace = TaskWorkspace;
