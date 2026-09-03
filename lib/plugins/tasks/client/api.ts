import { TASK_OS_API } from './constants';
import type {
  CreateTaskInput,
  LabelTemplatePayload,
  PatchTaskInput,
  ProjectTemplatePayload,
  TaskMediaOwnerType,
  TaskItem,
  TaskProject,
  TaskRelationInput,
  TaskTemplatePayload,
  TaskWorkspace,
} from './types';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | null;
};

async function taskOsRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const init: RequestInit = {
    cache: 'no-store',
    ...rest,
    headers: body && !(body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...headers }
      : headers,
  };

  if (body !== undefined) {
    init.body = body instanceof FormData || typeof body === 'string'
      ? body
      : JSON.stringify(body);
  }

  const response = await fetch(path, init);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!response.ok) {
    let message = `Task request failed (${response.status})`;
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string };
        message = parsed.error || parsed.message || message;
      } catch {
        message = text.slice(0, 180);
      }
    }
    throw new Error(message);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** SWR-compatible fetcher — mirrors legacy `fetch().then(r => r.json())` behavior. */
export function taskOsFetcher<T = unknown>(url: string): Promise<T> {
  // Sin chequear `r.ok`, un 401/500 pasajero (típico al navegar, con la sesión
  // rotando) queda cacheado por SWR como si hubiese cargado bien — como nunca hay
  // `error`, SWR no vuelve a reintentar solo y todo queda "colgado" hasta recargar
  // la página a mano. Tirar acá deja que el reintento automático de SWR actúe.
  return fetch(url, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`task_os_fetch_failed:${url}`);
    return r.json();
  }) as Promise<T>;
}

export function getTaskMediaEndpoint(ownerType: TaskMediaOwnerType, ownerId: number) {
  return `${TASK_OS_API.media}?ownerType=${ownerType}&ownerId=${ownerId}`;
}

export function getTaskCommentsEndpoint(taskId: number) {
  return `${TASK_OS_API.items}/${taskId}/comments`;
}

export function getTaskDetailsEndpoint(taskId: number) {
  return `${TASK_OS_API.items}/${taskId}/details`;
}

export function getLabelTemplatesEndpoint() {
  return `${TASK_OS_API.templates}?type=labels`;
}

// ── Workspaces ──

export function fetchWorkspaces() {
  return taskOsRequest<TaskWorkspace[]>(TASK_OS_API.workspaces);
}

export function createWorkspace(name: string) {
  return taskOsRequest<TaskWorkspace>(TASK_OS_API.workspaces, {
    method: 'POST',
    body: { name },
  });
}

export function renameWorkspace(workspaceId: number, name: string) {
  return taskOsRequest(`${TASK_OS_API.workspaces}/${workspaceId}`, {
    method: 'PATCH',
    body: { name },
  });
}

export function deleteWorkspace(workspaceId: number) {
  return taskOsRequest(`${TASK_OS_API.workspaces}/${workspaceId}`, { method: 'DELETE' });
}

export function patchWorkspace(workspaceId: number, body: Record<string, unknown>) {
  return taskOsRequest(`${TASK_OS_API.workspaces}/${workspaceId}`, {
    method: 'PATCH',
    body,
  });
}

// ── Projects ──

export function createProject(name: string, workspaceId: number) {
  return taskOsRequest<TaskProject>(TASK_OS_API.projects, {
    method: 'POST',
    body: { name, workspaceId },
  });
}

function taskProjectEndpoint(projectId: number) {
  return `/api/plugins/tasks/projects/${projectId}`;
}

export function patchProject(projectId: number, body: Record<string, unknown>) {
  return taskOsRequest(taskProjectEndpoint(projectId), {
    method: 'PATCH',
    body,
  });
}

export function deleteProject(projectId: number) {
  return taskOsRequest(taskProjectEndpoint(projectId), { method: 'DELETE' });
}

export function duplicateProject(projectId: number, targetWorkspaceId?: number | null) {
  return taskOsRequest<TaskProject>(`${taskProjectEndpoint(projectId)}/duplicate`, {
    method: 'POST',
    body: targetWorkspaceId ? { targetWorkspaceId } : undefined,
  });
}

export function convertProjectToTask(projectId: number) {
  return taskOsRequest(`${taskProjectEndpoint(projectId)}/convert-to-task`, {
    method: 'POST',
  });
}

export function reorderProject(projectId: number, order: number) {
  return patchProject(projectId, { order });
}

export function moveProjectToWorkspace(projectId: number, workspaceId: number) {
  return patchProject(projectId, { workspaceId });
}

// ── Columns ──

export function createColumn(projectId: number, title: string) {
  return taskOsRequest(TASK_OS_API.columns, {
    method: 'POST',
    body: { projectId, title },
  });
}

export function patchColumn(columnId: number, body: Record<string, unknown>) {
  return taskOsRequest(`${TASK_OS_API.columns}/${columnId}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteColumn(columnId: number) {
  return taskOsRequest(`${TASK_OS_API.columns}/${columnId}`, { method: 'DELETE' });
}

export function reorderColumn(columnId: number, order: number) {
  return patchColumn(columnId, { order });
}

// ── Tasks ──

export function createTaskItem(input: CreateTaskInput) {
  return taskOsRequest(TASK_OS_API.items, {
    method: 'POST',
    body: input,
  });
}

export function patchTaskItem(taskId: number, body: PatchTaskInput) {
  return taskOsRequest(`${TASK_OS_API.items}/${taskId}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteTaskItem(taskId: number) {
  return taskOsRequest(`${TASK_OS_API.items}/${taskId}`, { method: 'DELETE' });
}

export function moveTaskToLocation(taskId: number, projectId: number, columnId: number) {
  return patchTaskItem(taskId, { projectId, columnId, makePrimary: true });
}

export function copyTaskToLocation(taskId: number, projectId: number, columnId: number) {
  return taskOsRequest<TaskItem>(`${TASK_OS_API.items}/${taskId}/duplicate`, {
    method: 'POST',
    body: { projectId, columnId },
  });
}

export function shareTaskToLocation(taskId: number, projectId: number, columnId: number) {
  return taskOsRequest(`${TASK_OS_API.items}/${taskId}/share`, {
    method: 'POST',
    body: { projectId, columnId },
  });
}

export function postChecklistSource(targetTaskId: number, sourceTaskId: number) {
  return taskOsRequest(`${TASK_OS_API.items}/${targetTaskId}/checklist-source`, {
    method: 'POST',
    body: { sourceTaskId },
  });
}

export function postTaskEndpoint(path: string, body?: Record<string, unknown>) {
  return taskOsRequest(path, {
    method: 'POST',
    body: body ?? null,
  });
}

// ── Comments ──

export function createTaskComment(taskId: number, text: string) {
  return taskOsRequest(getTaskCommentsEndpoint(taskId), {
    method: 'POST',
    body: { text },
  });
}

export function deleteTaskComment(taskId: number, commentId: number) {
  return taskOsRequest(`${TASK_OS_API.items}/${taskId}/comments/${commentId}`, {
    method: 'DELETE',
  });
}

// ── Relations & dependencies ──

export function createTaskRelation(body: TaskRelationInput) {
  return taskOsRequest(TASK_OS_API.relations, {
    method: 'POST',
    body: { relationType: 'related', ...body },
  });
}

export function deleteTaskRelation(relationId: number) {
  return taskOsRequest(`${TASK_OS_API.relations}/${relationId}`, { method: 'DELETE' });
}

export function createTaskDependency(taskId: number, dependsOnTaskId: number) {
  return taskOsRequest(TASK_OS_API.dependencies, {
    method: 'POST',
    body: { taskId, dependsOnTaskId },
  });
}

export function deleteTaskDependency(dependencyId: number) {
  return taskOsRequest(`${TASK_OS_API.dependencies}/${dependencyId}`, { method: 'DELETE' });
}

// ── Media ──

export function uploadTaskMedia(formData: FormData) {
  return taskOsRequest(TASK_OS_API.media, {
    method: 'POST',
    body: formData,
  });
}

// ── Templates ──

export function createLabelTemplate(payload: LabelTemplatePayload) {
  return taskOsRequest(TASK_OS_API.templates, {
    method: 'POST',
    body: payload,
  });
}

export function createProjectTemplate(payload: ProjectTemplatePayload) {
  return taskOsRequest(TASK_OS_API.templates, {
    method: 'POST',
    body: payload,
  });
}

export function createTaskTemplate(payload: TaskTemplatePayload) {
  return taskOsRequest(TASK_OS_API.templates, {
    method: 'POST',
    body: payload,
  });
}
