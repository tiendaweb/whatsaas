'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useTheme } from 'next-themes';
import { ModalTarea } from '@/lib/plugins/tasks/ui-nueva/components/ModalTarea';
import { useUniverso } from '@/lib/plugins/tasks/ui-nueva/hooks/useUniverso';
import { useMutaciones } from '@/lib/plugins/tasks/ui-nueva/hooks/useMutaciones';
import { useAjustes } from '@/lib/plugins/tasks/ui-nueva/hooks/useAjustes';
import { agruparProyectos } from '@/lib/plugins/tasks/ui-nueva/data/universo';
import { createTaskRelation, deleteTaskRelation, getTaskDetailsEndpoint } from '@/lib/plugins/tasks/client/api';
import type { TaskDetails } from '@/lib/plugins/tasks/client/types';
import '@/lib/plugins/tasks/ui-nueva/tareas.css';

type UserLite = { id: number };
type TeamLite = { id: number };
type PersonLite = { id: number; name: string };

// Tira en vez de devolver null/[] en un !ok: así SWR ve el error y reintenta solo
// (ver el mismo arreglo en taskOsFetcher) en vez de quedarse con un valor vacío para siempre.
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`fetch_failed:${url}`);
  return r.json();
});
const listFetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`fetch_failed:${url}`);
  return r.json();
});

/**
 * Abre el editor completo de una tarea (con su panel de relaciones) desde afuera de
 * Tareas OS — hoy lo usa el panel de tareas del chat, para poder vincular una tarea
 * de un contacto con otras tareas, proyectos, clientes o espacios sin salir del chat.
 */
export function ContactTaskDetailModal({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const { resolvedTheme } = useTheme();
  const [openId, setOpenId] = useState(taskId);
  const { data: user } = useSWR<UserLite>('/api/user', fetcher);
  const { data: team } = useSWR<TeamLite>('/api/team', fetcher);
  const { prefs } = useAjustes(team?.id ?? null, user?.id ?? null);
  const { universo, workspaces, mutate } = useUniverso();
  const { data: clientes = [] } = useSWR<PersonLite[]>('/api/plugins/customers', listFetcher, { revalidateOnFocus: false });
  const { data: contactos = [] } = useSWR<PersonLite[]>('/api/contacts/list', listFetcher, { revalidateOnFocus: false });
  const [detalles, setDetalles] = useState<TaskDetails | null>(null);

  const confirmar = useCallback(
    (_title: string, description: string) => Promise.resolve(window.confirm(description)),
    [],
  );

  const mutaciones = useMutaciones({
    workspaces,
    universo,
    mutate,
    escritura: prefs.escritura,
    etiquetasConfirmadas: prefs.etiquetasConfirmadas,
    onConfirmadas: () => {},
    confirmar,
  });

  const grupos = useMemo(
    () => agruparProyectos(universo.proyectos, universo.workspaces, universo.tareas),
    [universo],
  );
  const tarea = universo.tareas.find((t) => t.id === openId) ?? null;

  const cargarDetalles = useCallback((id: number) => {
    fetch(getTaskDetailsEndpoint(id))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TaskDetails | null) => setDetalles(data))
      .catch(() => setDetalles(null));
  }, []);

  useEffect(() => {
    cargarDetalles(openId);
  }, [openId, cargarDetalles]);

  const vinculados = (detalles?.relations ?? [])
    .filter((rel) => ['customer', 'contact'].includes(rel.sourceType) || ['customer', 'contact'].includes(rel.targetType))
    .map((rel) => {
      const esCliente = rel.sourceType === 'customer' || rel.targetType === 'customer';
      const id = ['customer', 'contact'].includes(rel.sourceType) ? rel.sourceId : rel.targetId;
      const name = esCliente
        ? clientes.find((c) => c.id === id)?.name ?? `#${id}`
        : contactos.find((c) => c.id === id)?.name ?? `#${id}`;
      return { id, name, relationId: rel.id, tipo: (esCliente ? 'cliente' : 'lead') as 'cliente' | 'lead' };
    });

  // Todavía cargando el universo de Tareas OS o la tarea no existe (ya se borró, etc).
  if (!tarea) return null;

  return (
    <div
      className="tareas-ui fixed inset-0 z-[60]"
      data-theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      style={{ ['--tareas-accent' as string]: prefs.acento }}
    >
      <ModalTarea
        tarea={tarea}
        grupos={grupos}
        escritura={prefs.escritura}
        clientes={clientes}
        vinculados={vinculados}
        leads={contactos}
        onVincularParte={async (parte) => {
          await createTaskRelation(parte.tipo === 'cliente'
            ? { sourceType: 'customer', sourceId: parte.id, targetType: 'task', targetId: tarea.id, relationType: 'related' }
            : { sourceType: 'task', sourceId: tarea.id, targetType: 'contact', targetId: parte.id, relationType: 'related' });
          cargarDetalles(tarea.id);
        }}
        onDesvincularCliente={async (relationId) => {
          await deleteTaskRelation(relationId);
          cargarDetalles(tarea.id);
        }}
        detalles={detalles}
        universo={universo}
        contactos={contactos}
        onVincularRelacion={async (rel) => {
          await createTaskRelation(rel);
          cargarDetalles(tarea.id);
        }}
        onAbrirTarea={(id) => setOpenId(id)}
        onAbrirCliente={() => {}}
        onFiltrarProyecto={() => {}}
        onActualizarRelaciones={() => cargarDetalles(tarea.id)}
        onClose={onClose}
        onSave={async (cambios) => {
          const { moveToProjectId, ...rest } = cambios;
          const updated = await mutaciones.actualizarTarea(tarea, rest);
          if (!updated) return false;
          if (moveToProjectId && moveToProjectId !== tarea.projectId) {
            const moved = await mutaciones.moverTarea(tarea, moveToProjectId);
            if (!moved) return false;
          }
          onClose();
          return true;
        }}
      />
    </div>
  );
}
