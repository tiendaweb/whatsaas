'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { TASK_OS_API } from '@/lib/plugins/tasks/client/constants';
import { taskOsFetcher } from '@/lib/plugins/tasks/client/api';
import type { TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';

const TASK_OS_DEVICE_LOCATION_KEY = 'task-os:last-location:v1';

type StoredTaskOsLocation = {
  workspaceId?: number | null;
  projectId?: number | null;
};

export function useTaskOsBoard() {
  const searchParams = useSearchParams();
  const requestedProjectId = Number(searchParams.get('projectId')) || null;
  const { data = [], mutate, isLoading } = useSWR<TaskWorkspace[]>(TASK_OS_API.workspaces, taskOsFetcher);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [restoredLocation, setRestoredLocation] = useState(false);

  const workspaces = data;
  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) ?? workspaces[0] ?? null;
  const projects = selectedWorkspace?.projects ?? [];
  const selectedProject: TaskProject | null = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TASK_OS_DEVICE_LOCATION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredTaskOsLocation;
        if (typeof parsed.workspaceId === 'number') setSelectedWorkspaceId(parsed.workspaceId);
        if (!requestedProjectId && typeof parsed.projectId === 'number') setSelectedProjectId(parsed.projectId);
      }
    } catch {
      // Ignore corrupted local state; the board falls back to the first available project.
    } finally {
      setRestoredLocation(true);
    }
  }, [requestedProjectId]);

  useEffect(() => {
    if (!requestedProjectId || workspaces.length === 0) return;
    const workspace = workspaces.find((candidate) =>
      candidate.projects.some((project) => project.id === requestedProjectId),
    );
    if (!workspace) return;
    setSelectedWorkspaceId(workspace.id);
    setSelectedProjectId(requestedProjectId);
  }, [requestedProjectId, workspaces]);

  useEffect(() => {
    if (!restoredLocation) return;
    if (!selectedWorkspaceId && workspaces[0]) setSelectedWorkspaceId(workspaces[0].id);
    if (selectedWorkspaceId && !workspaces.some((w) => w.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(workspaces[0]?.id ?? null);
    }
  }, [restoredLocation, selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (!restoredLocation) return;
    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0].id);
    if (selectedProjectId && !projects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]?.id ?? null);
    }
  }, [projects, restoredLocation, selectedProjectId]);

  useEffect(() => {
    if (!restoredLocation) return;
    window.localStorage.setItem(TASK_OS_DEVICE_LOCATION_KEY, JSON.stringify({
      workspaceId: selectedWorkspaceId,
      projectId: selectedProjectId,
    }));
  }, [restoredLocation, selectedProjectId, selectedWorkspaceId]);

  return {
    workspaces,
    selectedWorkspace,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    mutate,
    isLoading,
  };
}
