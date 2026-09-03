'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { TasksOSDashboard } from '@/lib/plugins/tasks/ui/TasksOSDashboard';
import { escribirFlag, leerFlag } from './data/preferencias';
import type { TasksUi } from './data/tipos';
import { ES } from './i18n/es';
import { TareasApp } from './TareasApp';

type TeamLite = { id: number };
type UserLite = { id: number };

// Ver el comentario en TareasApp.tsx: sin chequear `r.ok`, un fallo pasajero queda
// cacheado como éxito y SWR nunca reintenta — esto decide qué interfaz montar.
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`fetch_failed:${url}`);
  return r.json();
});

function resolverUi(urlParam: string | null, teamId: number | null, userId: number | null): TasksUi {
  if (urlParam === 'nuevo' || urlParam === 'clasico') return urlParam;
  return leerFlag(teamId, userId) ?? 'nuevo';
}

function TasksPluginSurfaceInner() {
  const searchParams = useSearchParams();
  const urlParam = searchParams.get('ui');
  const { data: user } = useSWR<UserLite>('/api/user', fetcher);
  const { data: team } = useSWR<TeamLite>('/api/team', fetcher);
  const teamId = team?.id ?? null;
  const userId = user?.id ?? null;
  const [ui, setUi] = useState<TasksUi>(() => resolverUi(urlParam, null, null));

  useEffect(() => {
    setUi(resolverUi(urlParam, teamId, userId));
  }, [urlParam, teamId, userId]);

  const persist = (next: TasksUi) => {
    if (teamId && userId) escribirFlag(teamId, userId, next);
    const url = new URL(window.location.href);
    url.searchParams.set('ui', next);
    window.history.replaceState({}, '', url.toString());
    setUi(next);
  };

  if (ui === 'nuevo') return <TareasApp />;

  return (
    <>
      <button
        type="button"
        onClick={() => persist('nuevo')}
        className="fixed bottom-4 right-4 z-[60] rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-indigo-700"
      >
        {ES.clasico.probar}
      </button>
      <TasksOSDashboard />
    </>
  );
}

export function TasksPluginSurface() {
  return (
    <Suspense fallback={null}>
      <TasksPluginSurfaceInner />
    </Suspense>
  );
}
