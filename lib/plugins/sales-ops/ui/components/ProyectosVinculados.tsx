'use client';

import useSWR from 'swr';
import { ExternalLink, FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';

import { SALES_OPS_API, fetcher, fmtInt } from './format';

type Proyecto = {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  workspace: string | null;
  origen: 'contacto' | 'cliente' | 'tarea';
  abiertas: number;
  total: number;
};

type Payload = { projects: Proyecto[]; customer: { id: number; name: string } | null };

const ORIGEN_LABEL: Record<Proyecto['origen'], string> = {
  contacto: 'vinculado al contacto',
  cliente: 'por su cliente',
  tarea: 'por una tarea suya',
};

/**
 * Proyectos de Tareas OS del contacto, con acceso directo.
 *
 * El trabajo de un cliente vive en Tareas OS y la conversación en el Command
 * Center: para pasar de una cosa a la otra había que abrir Tareas, acordarse
 * del nombre del proyecto y buscarlo en la lista. Acá está el link, y de paso
 * se ve si hay algo abierto sin salir de la ficha.
 *
 * Sólo se dibuja si hay proyectos: un bloque vacío en cada ficha es ruido.
 */
export function ProyectosVinculados({ chatId }: { chatId: number }) {
  const { data } = useSWR<Payload>(`${SALES_OPS_API}/contacts/${chatId}/projects`, fetcher, { revalidateOnFocus: false });

  const proyectos = data?.projects ?? [];
  if (proyectos.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <FolderKanban className="size-3.5" aria-hidden />
        Proyectos
        {data?.customer && <span className="font-normal normal-case">· {data.customer.name}</span>}
      </h3>
      <ul className="space-y-1">
        {proyectos.map((p) => (
          <li key={p.id}>
            <a
              href={`/plugins/tasks?proyecto=${p.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 transition-colors hover:bg-muted"
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-sm"
                style={p.color ? { backgroundColor: `${p.color}22`, color: p.color } : undefined}
                aria-hidden
              >
                {p.icon || '📁'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {p.workspace ? `${p.workspace} · ` : ''}
                  {ORIGEN_LABEL[p.origen]}
                </span>
              </span>
              <span className={cn('shrink-0 text-[11px] tabular-nums', p.abiertas > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {fmtInt(p.abiertas)}/{fmtInt(p.total)}
              </span>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
