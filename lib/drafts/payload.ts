type ParseSuccess = {
  ok: true;
  value: {
    title: string;
    content: string;
    categoryId: number | null;
    tagIds: number[];
    contactId: number | null;
    assignedUserId: number | null;
    departmentId: number | null;
    stages: {
      stages: Array<{ id: string; name: string; order: number; departmentId: number | null }>;
      tasks: Array<{
        id: string;
        stageId: string;
        name: string;
        order: number;
        type: 'task' | 'subtask' | 'group';
        parentTaskId: string | null;
      }>;
    } | null;
  };
};

type ParseFailure = { ok: false; error: string };

type ParseResult = ParseSuccess | ParseFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequiredText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseOptionalPositiveInt(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '' || value === 'null' || value === 'none') {
    return null;
  }

  if (typeof value !== 'string' && typeof value !== 'number') return 'invalid';
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 'invalid';
}

function parseTagIds(value: unknown): number[] | 'invalid' {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return 'invalid';

  const normalized = value
    .map((item) => {
      if (typeof item !== 'string' && typeof item !== 'number') return null;
      const parsed = Number(item);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    })
    .filter((item): item is number => item !== null);

  return Array.from(new Set(normalized));
}

function parseWorkflow(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return 'invalid' as const;

  const rawStages = Array.isArray(value.stages) ? value.stages : [];
  const rawTasks = Array.isArray(value.tasks) ? value.tasks : [];

  const stages = rawStages
    .map((stage: unknown, index: number) => {
      if (!isRecord(stage)) return null;
      const parsedDepartmentId = parseOptionalPositiveInt(stage.departmentId);
      if (parsedDepartmentId === 'invalid') return null;
      return {
        id: String(stage.id ?? `stage_${index}`),
        name: String(stage.name ?? '').trim(),
        order: Number.isFinite(Number(stage.order)) ? Number(stage.order) : index,
        departmentId: parsedDepartmentId,
      };
    })
    .filter(
      (stage): stage is { id: string; name: string; order: number; departmentId: number | null } =>
        stage !== null && stage.name.length > 0,
    )
    .sort((a, b) => a.order - b.order)
    .map((stage, index) => ({ ...stage, order: index }));

  const stageIds = new Set(stages.map((stage) => stage.id));
  const tasks = rawTasks
    .map((task: unknown, index: number) => {
      if (!isRecord(task)) return null;
      return {
        id: String(task.id ?? `task_${index}`),
        stageId: String(task.stageId ?? ''),
        name: String(task.name ?? '').trim(),
        order: Number.isFinite(Number(task.order)) ? Number(task.order) : index,
        type: task.type === 'group' || task.type === 'subtask' ? task.type : 'task',
        parentTaskId: task.parentTaskId ? String(task.parentTaskId) : null,
      };
    })
    .filter(
      (
        task,
      ): task is {
        id: string;
        stageId: string;
        name: string;
        order: number;
        type: 'task' | 'subtask' | 'group';
        parentTaskId: string | null;
      } => task !== null && task.name.length > 0 && stageIds.has(task.stageId),
    )
    .sort((a, b) => a.order - b.order)
    .map((task, index) => ({ ...task, order: index }));

  return { stages, tasks };
}

/**
 * Body contract for draft create/update:
 * - Required: title, content (non-empty strings).
 * - Optional relations: categoryId/contactId/assignedUserId/departmentId -> positive integer or null.
 * - Optional arrays: tagIds -> list of positive integers (defaults to []).
 * - Optional workflow: stages -> object { stages: [], tasks: [] } or null.
 */
export function parseDraftWritePayload(body: unknown): ParseResult {
  if (!isRecord(body)) {
    return { ok: false, error: 'Invalid JSON body. Expected an object payload.' };
  }

  const title = parseRequiredText(body.title);
  const content = parseRequiredText(body.content);
  if (!title || !content) {
    return { ok: false, error: 'title and content are required' };
  }

  const categoryId = parseOptionalPositiveInt(body.categoryId);
  if (categoryId === 'invalid') return { ok: false, error: 'categoryId must be a positive integer or null' };

  const contactId = parseOptionalPositiveInt(body.contactId);
  if (contactId === 'invalid') return { ok: false, error: 'contactId must be a positive integer or null' };

  const assignedUserId = parseOptionalPositiveInt(body.assignedUserId);
  if (assignedUserId === 'invalid') {
    return { ok: false, error: 'assignedUserId must be a positive integer or null' };
  }

  const departmentId = parseOptionalPositiveInt(body.departmentId);
  if (departmentId === 'invalid') {
    return { ok: false, error: 'departmentId must be a positive integer or null' };
  }

  const tagIds = parseTagIds(body.tagIds);
  if (tagIds === 'invalid') return { ok: false, error: 'tagIds must be an array of positive integers' };

  const stages = parseWorkflow(body.stages);
  if (stages === 'invalid') {
    return { ok: false, error: 'stages must be an object with stages/tasks arrays or null' };
  }

  return {
    ok: true,
    value: { title, content, categoryId, tagIds, contactId, assignedUserId, departmentId, stages },
  };
}
