'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode2,
  FileText,
  Gauge,
  Loader2,
  ScrollText,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import './radar.css';
import { humanize, INTENCION_LABEL, OBJECION_LABEL, PRIORIDAD_BADGE, RECUPERABILIDAD_LABEL } from './labels';
import { TASK_OS_API } from '@/lib/plugins/tasks/client/constants';
import { taskOsFetcher } from '@/lib/plugins/tasks/client/api';
import type { TaskWorkspace } from '@/lib/plugins/tasks/client/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type PriorityContact = {
  contactId: number;
  contactName: string;
  remoteJid: string | null;
  priority: 'P1' | 'P2' | 'P3' | 'descartado' | null;
  score: number | null;
  intencion: string | null;
  objecion: string | null;
  recuperabilidad: string | null;
  confianza: number | null;
  estrategia: string | null;
  fechaAnalisis: string | null;
  needsReview: boolean;
};

type RadarOverview = {
  counts: { analyzed: number; p1: number; p2: number; p3: number; descartado: number; needsReview: number };
  lastAnalysisAt: string | null;
  priorityContacts: PriorityContact[];
};

type ReportItem = { id: number; title: string; emoji: string | null; format: 'markdown' | 'html'; updatedAt: string };

type Tab = 'resumen' | 'prioridades' | 'informes' | 'seguimiento';

const TABS: { key: Tab; label: string; icon: typeof Gauge }[] = [
  { key: 'resumen', label: 'Resumen', icon: Gauge },
  { key: 'prioridades', label: 'Prioridades', icon: TrendingUp },
  { key: 'informes', label: 'Informes', icon: ScrollText },
  { key: 'seguimiento', label: 'Seguimiento', icon: CheckCircle2 },
];

export function RadarDashboard() {
  const [tab, setTab] = useState<Tab>('resumen');
  const { data, error, isLoading } = useSWR<RadarOverview>('/api/plugins/radar/overview', fetcher);

  return (
    <div className="radar-ui flex h-full min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <header className="border-b border-neutral-100 px-4 py-6 dark:border-neutral-800 sm:px-8 sm:py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-xl shadow-indigo-500/20 dark:shadow-none">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-black tracking-tight text-neutral-900 dark:text-white sm:text-4xl">
                Radar
              </h1>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Panel de control de la inteligencia comercial que generan los conectores de IA.
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-200 ${
                  tab === key
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando el panel de Radar…
            </div>
          )}

          {error && !isLoading && (
            <EmptyBlock
              icon={AlertTriangle}
              title="No se pudo cargar el panel"
              detail="Intentá recargar la página en un momento."
            />
          )}

          {data && !isLoading && !error && (
            <>
              {tab === 'resumen' && <ResumenTab data={data} />}
              {tab === 'prioridades' && <PrioridadesTab contacts={data.priorityContacts} />}
              {tab === 'informes' && <InformesTab />}
              {tab === 'seguimiento' && <SeguimientoTab />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resumen                                                             */
/* ------------------------------------------------------------------ */

function ResumenTab({ data }: { data: RadarOverview }) {
  const p1Urgent = data.priorityContacts
    .filter((c) => c.priority === 'P1')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Analizados" value={data.counts.analyzed} icon={Users} tint="bg-indigo-100 text-indigo-500 dark:bg-indigo-500/10" />
        <Kpi label="P1 · Hoy" value={data.counts.p1} icon={AlertTriangle} tint="bg-rose-100 text-rose-500 dark:bg-rose-500/10" />
        <Kpi label="P2 · Semana" value={data.counts.p2} icon={Clock} tint="bg-amber-100 text-amber-500 dark:bg-amber-500/10" />
        <Kpi label="P3 · Nutrición" value={data.counts.p3} icon={TrendingUp} tint="bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300" />
        <Kpi label="Para revisar" value={data.counts.needsReview} icon={Gauge} tint="bg-violet-100 text-violet-500 dark:bg-violet-500/10" />
      </div>

      <div className="rounded-3xl border border-neutral-100 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-800/60">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
          Último análisis
        </p>
        <p className="mt-1 font-bold text-neutral-800 dark:text-neutral-100">
          {data.lastAnalysisAt
            ? new Date(data.lastAnalysisAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
            : 'RADAR todavía no analizó ningún contacto.'}
        </p>
      </div>

      <section>
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
          Trabajar hoy (P1)
        </p>
        {p1Urgent.length === 0 ? (
          <EmptyBlock icon={CheckCircle2} title="Sin urgencias P1" detail="No hay contactos P1 pendientes en este momento." compact />
        ) : (
          <div className="space-y-2">
            {p1Urgent.map((c) => (
              <ContactRow key={c.contactId} contact={c} showStrategy />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tint }: { label: string; value: number; icon: typeof Gauge; tint: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-800/60">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">{label}</p>
        <p className="text-2xl font-black tabular-nums text-neutral-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Prioridades                                                         */
/* ------------------------------------------------------------------ */

const PRIORITY_FILTERS: { key: 'all' | 'P1' | 'P2' | 'P3' | 'descartado' | 'revisar'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'P1', label: 'P1' },
  { key: 'P2', label: 'P2' },
  { key: 'P3', label: 'P3' },
  { key: 'descartado', label: 'Descartado' },
  { key: 'revisar', label: 'Revisar' },
];

function PrioridadesTab({ contacts }: { contacts: PriorityContact[] }) {
  const [filter, setFilter] = useState<(typeof PRIORITY_FILTERS)[number]['key']>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return contacts;
    if (filter === 'revisar') return contacts.filter((c) => c.needsReview);
    return contacts.filter((c) => c.priority === filter);
  }, [contacts, filter]);

  const groups = useMemo(() => {
    const order: Array<PriorityContact['priority']> = ['P1', 'P2', 'P3', 'descartado'];
    return order
      .map((priority) => ({ priority, items: filtered.filter((c) => c.priority === priority) }))
      .filter((group) => group.items.length > 0);
  }, [filtered]);

  if (contacts.length === 0) {
    return (
      <EmptyBlock
        icon={Users}
        title="Todavía no hay contactos analizados"
        detail="Cuando RADAR analice conversaciones, las prioridades van a aparecer acá."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {PRIORITY_FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            aria-pressed={filter === option.key}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
              filter === option.key
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                : 'border-neutral-100 bg-neutral-50 text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <EmptyBlock icon={Users} title="Nada con este filtro" detail="Probá con otro filtro." compact />
      ) : (
        groups.map((group) => (
          <section key={group.priority}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
              {group.priority === 'descartado' ? 'Descartado' : group.priority} · {group.items.length}
            </p>
            <div className="space-y-2">
              {group.items.map((c) => (
                <ContactRow key={c.contactId} contact={c} showDetails />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ContactRow({
  contact,
  showStrategy,
  showDetails,
}: {
  contact: PriorityContact;
  showStrategy?: boolean;
  showDetails?: boolean;
}) {
  const badge = contact.priority ? PRIORIDAD_BADGE[contact.priority] : null;
  const chatHref = contact.remoteJid ? `/dashboard/chat/${encodeURIComponent(contact.remoteJid)}` : null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-neutral-100 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-800/60 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-bold text-neutral-900 dark:text-white">{contact.contactName}</span>
          {badge && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>}
          {contact.needsReview && (
            <span className="shrink-0 rounded-md bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold text-white">Revisar</span>
          )}
          {contact.score !== null && (
            <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
              Score {contact.score}
            </span>
          )}
        </div>

        {showStrategy && contact.estrategia && (
          <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{contact.estrategia}</p>
        )}

        {showDetails && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {contact.intencion && <span>{humanize(INTENCION_LABEL, contact.intencion)}</span>}
            {contact.objecion && <span>· {humanize(OBJECION_LABEL, contact.objecion)}</span>}
            {contact.recuperabilidad && <span>· Recuperabilidad {humanize(RECUPERABILIDAD_LABEL, contact.recuperabilidad)}</span>}
            {contact.confianza !== null && <span>· Confianza {contact.confianza}/100</span>}
            {contact.fechaAnalisis && <span>· {contact.fechaAnalisis}</span>}
          </div>
        )}
      </div>

      {chatHref ? (
        <a
          href={chatHref}
          className="flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-500 transition-all duration-200 hover:border-indigo-500 hover:text-indigo-500 dark:border-neutral-700 dark:text-neutral-400 sm:self-auto"
        >
          Abrir chat <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span
          title="Este contacto no tiene un chat vinculado"
          className="shrink-0 self-start rounded-xl border border-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-300 dark:border-neutral-700 dark:text-neutral-600 sm:self-auto"
        >
          Sin chat
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Informes                                                             */
/* ------------------------------------------------------------------ */

type ReportCategory = 'equipo' | 'generales';

function InformesTab() {
  const [category, setCategory] = useState<ReportCategory>('equipo');
  const { data, isLoading } = useSWR<{ reports: ReportItem[] }>(
    `/api/plugins/radar/reports?category=${category}`,
    fetcher,
  );
  const reports = data?.reports ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: 'equipo' as const, label: 'Equipo' },
            { key: 'generales' as const, label: 'Generales' },
          ]
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setCategory(option.key)}
            aria-pressed={category === option.key}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
              category === option.key
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                : 'border-neutral-100 bg-neutral-50 text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        Los informes por cliente viven en la carpeta del contacto y se ven desde la sección
        &quot;Informes&quot; dentro del panel Radar de ese chat — todavía no hay acá una vista que junte
        los de todos los clientes en un solo lugar.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando informes…
        </div>
      )}

      {!isLoading && reports.length === 0 && (
        <EmptyBlock icon={ScrollText} title="Todavía no hay informes acá" detail="Los conectores de IA pueden crearlos directamente en esta carpeta." compact />
      )}

      {!isLoading && reports.length > 0 && (
        <div className="space-y-1.5">
          {reports.map((report) => {
            const Icon = report.format === 'html' ? FileCode2 : FileText;
            return (
              <a
                key={report.id}
                href={`/plugins/documents/doc/${report.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm transition-all duration-200 hover:border-indigo-500 dark:border-neutral-800 dark:bg-neutral-800/60"
              >
                <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate font-bold text-neutral-800 dark:text-neutral-100">
                  {report.emoji ? `${report.emoji} ` : ''}{report.title}
                </span>
                {report.format === 'html' && (
                  <span className="shrink-0 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-500">HTML</span>
                )}
                <span className="hidden shrink-0 text-xs text-neutral-400 sm:block">
                  {new Date(report.updatedAt).toLocaleDateString('es-AR')}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seguimiento — tareas generadas por RADAR (proyecto "Contactos",     */
/* prefijo de título "RADAR ·"), reusando GET /api/plugins/tasks/      */
/* workspaces (ya existente) en vez de un endpoint nuevo.               */
/* ------------------------------------------------------------------ */

function SeguimientoTab() {
  const { data, isLoading } = useSWR<TaskWorkspace[]>(TASK_OS_API.workspaces, taskOsFetcher);

  const radarTasks = useMemo(() => {
    const workspaces = data ?? [];
    const items: Array<{ id: number; title: string; status: string; dueDate: string | null; completedAt: string | null }> = [];
    for (const ws of workspaces) {
      for (const project of ws.projects) {
        if (project.name !== 'Contactos') continue;
        for (const column of project.columns) {
          for (const item of column.items) {
            if (item?.title?.startsWith('RADAR ·')) {
              items.push({ id: item.id, title: item.title, status: item.status, dueDate: item.dueDate, completedAt: item.completedAt });
            }
          }
        }
      }
    }
    return items;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-24 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando seguimiento…
      </div>
    );
  }

  const open = radarTasks.filter((t) => t.status !== 'done');
  const done = radarTasks.filter((t) => t.status === 'done');
  const now = new Date();
  const isOverdue = (t: (typeof radarTasks)[number]) => t.status !== 'done' && t.dueDate !== null && new Date(t.dueDate) < now;

  if (radarTasks.length === 0) {
    return (
      <EmptyBlock
        icon={CheckCircle2}
        title="Sin tareas de Radar todavía"
        detail="Las tareas que RADAR crea para P1 y revisión humana van a aparecer acá."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Abiertas" value={open.length} icon={Clock} tint="bg-amber-100 text-amber-500 dark:bg-amber-500/10" />
        <Kpi label="Completadas" value={done.length} icon={CheckCircle2} tint="bg-emerald-100 text-emerald-500 dark:bg-emerald-500/10" />
        <Kpi label="Vencidas" value={open.filter(isOverdue).length} icon={AlertTriangle} tint="bg-rose-100 text-rose-500 dark:bg-rose-500/10" />
      </div>

      <div className="space-y-1.5">
        {radarTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-2.5 rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-800/60"
          >
            {task.status === 'done' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <Clock className={`h-4 w-4 shrink-0 ${isOverdue(task) ? 'text-rose-500' : 'text-neutral-300 dark:text-neutral-600'}`} />
            )}
            <span
              className={`min-w-0 flex-1 truncate font-bold ${
                task.status === 'done' ? 'text-neutral-400 line-through' : 'text-neutral-800 dark:text-neutral-100'
              }`}
            >
              {task.title}
            </span>
            {task.dueDate && (
              <span className={`shrink-0 text-xs ${isOverdue(task) ? 'font-bold text-rose-500' : 'text-neutral-400'}`}>
                {new Date(task.dueDate).toLocaleDateString('es-AR')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compartido                                                          */
/* ------------------------------------------------------------------ */

function EmptyBlock({
  icon: Icon,
  title,
  detail,
  compact,
}: {
  icon: typeof Gauge;
  title: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 text-center ${compact ? 'py-10' : 'py-20'}`}>
      <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{title}</p>
        <p className="mt-1 max-w-xs text-xs text-neutral-400">{detail}</p>
      </div>
    </div>
  );
}
