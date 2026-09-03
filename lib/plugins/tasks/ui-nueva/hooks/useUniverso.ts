'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { TASK_OS_API } from '@/lib/plugins/tasks/client/constants';
import { taskOsFetcher } from '@/lib/plugins/tasks/client/api';
import type { TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { construirUniverso } from '../data/universo';

export function useUniverso() {
  const { data, mutate, isLoading, error } = useSWR<TaskWorkspace[]>(
    TASK_OS_API.workspaces,
    taskOsFetcher,
    { revalidateOnFocus: false },
  );

  const universo = useMemo(() => construirUniverso(data), [data]);

  return {
    workspaces: data,
    universo,
    mutate,
    isLoading: isLoading && !data,
    error,
  };
}
