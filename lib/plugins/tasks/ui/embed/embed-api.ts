'use client';

import type { PatchTaskInput, TaskComment, TaskProject } from '@/lib/plugins/tasks/client/types';

/** Client bound to a single embed token. All calls hit the public /api/task-embed surface. */
export function createEmbedApi(token: string) {
  const base = `/api/task-embed/${token}`;

  async function req(path: string, init: RequestInit) {
    const res = await fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  }

  return {
    createTask: (columnId: number, title: string) =>
      req('/items', { method: 'POST', body: JSON.stringify({ columnId, title }) }),
    patchTask: (taskId: number, patch: PatchTaskInput) =>
      req(`/items/${taskId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteTask: (taskId: number) => req(`/items/${taskId}`, { method: 'DELETE' }),
    listComments: (taskId: number): Promise<TaskComment[]> => req(`/items/${taskId}/comments`, { method: 'GET' }),
    addComment: (taskId: number, text: string) =>
      req(`/items/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
    createColumn: (projectId: number, title: string) =>
      req('/columns', { method: 'POST', body: JSON.stringify({ projectId, title }) }),
    patchColumn: (columnId: number, patch: { title?: string; order?: number; color?: string | null; icon?: string | null }) =>
      req(`/columns/${columnId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteColumn: (columnId: number) => req(`/columns/${columnId}`, { method: 'DELETE' }),
    createProject: (name: string): Promise<TaskProject> =>
      req('/projects', { method: 'POST', body: JSON.stringify({ name }) }),
    patchProject: (projectId: number, patch: { name?: string; order?: number; labels?: unknown[]; color?: string | null; icon?: string | null }) =>
      req(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteProject: (projectId: number) => req(`/projects/${projectId}`, { method: 'DELETE' }),
  };
}

export type EmbedApi = ReturnType<typeof createEmbedApi>;
