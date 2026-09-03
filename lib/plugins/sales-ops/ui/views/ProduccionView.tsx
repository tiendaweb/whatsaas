'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { BookOpen, Bot, Building2, Check, ChevronDown, ChevronUp, ExternalLink, Globe, Loader2, Pencil, Plus, Save, UserSquare2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ProdItem, ProdProject, ProduccionPayload } from '../../server/produccion';
import { ErrorState } from '../components/States';
import { FichaDock, type DockItem } from '../components/FichaDock';
import { SALES_OPS_API, fetcher, fmtInt, tiempoRelativo } from '../components/format';

type Tab = 'demos' | 'clientes' | 'cc';
const TASKS_API = '/api/plugins/tasks';

const ESTADO_LABEL: Record<ProdProject['estado'], string> = { sin_empezar: 'Sin empezar', en_ejecucion: 'En ejecución', hecho: 'Hecho' };
const ESTADO_TONE: Record<ProdProject['estado'], string> = {
  sin_empezar: 'bg-muted text-muted-foreground',
  en_ejecucion: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  hecho: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
};
const IA_LABEL: Record<string, string> = { pending: 'IA pendiente', done: 'IA hecha', not_applicable: 'IA no aplica' };
const IA_TONE: Record<string, string> = { pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', not_applicable: 'bg-muted text-muted-foreground' };

async function patchTask(id: number, patch: Record<string, unknown>) {
  const res = await fetch(`${TASKS_API}/items/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
  return body;
}

/**
 * Producción: demos y proyectos de cliente en Tareas OS, con su avance, y la
 * bitácora del Command Center.
 *
 * Tareas OS sigue siendo el tablero; esto es la vista de quien produce y de
 * quien supervisa: cuánto avanzó cada demo y cada cliente, qué está en
 * ejecución, qué corre con IA y en qué estado quedó. Se edita ahí mismo
 * (título, notas, checklist, columna) con las mismas rutas del tablero, y
 * "Abrir en Tareas OS" lleva al proyecto para lo que la vista no cubre.
 */
export function ProduccionView({ onOpen }: { onOpen?: (chatId: number) => void }) {
  const { data, error, isLoading, mutate } = useSWR<ProduccionPayload>(`${SALES_OPS_API}/produccion`, fetcher, { refreshInterval: 60_000 });
  const [tab, setTab] = useState<Tab>('demos');
  const refrescar = () => void mutate();

  const tabs: Array<DockItem<Tab>> = [
    { id: 'demos', label: 'Demos', icon: Globe, badge: data?.demos?.projects.filter((p) => p.estado !== 'hecho').length },
    { id: 'clientes', label: 'Clientes', icon: Building2, badge: data?.clientes?.projects.filter((p) => p.estado !== 'hecho').length },
    { id: 'cc', label: 'Command Center', icon: BookOpen, badge: data?.commandCenter.projects.reduce((s, p) => s + (p.total - p.hechas), 0) },
  ];

  if (error) return <ErrorState message={String((error as Error).message ?? error)} onRetry={refrescar} />;

  const ws = tab === 'demos' ? data?.demos : tab === 'clientes' ? data?.clientes : data?.commandCenter;
  const resumen = ws ? { proyectos: ws.projects.length, enEjecucion: ws.projects.filter((p) => p.estado === 'en_ejecucion').length, hechos: ws.projects.filter((p) => p.estado === 'hecho').length, ia: ws.projects.reduce((s, p) => s + p.iaPendientes, 0) } : null;

  return (
    <div className="flex min-h-[60dvh] flex-col gap-3">
      <FichaDock items={tabs} active={tab} onChange={setTab} className="rounded-xl border border-border" />

      {isLoading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}

      {data && (
        <>
          {resumen && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label={tab === 'cc' ? 'Proyectos' : tab === 'demos' ? 'Demos' : 'Clientes'} n={resumen.proyectos} />
              <Kpi label="En ejecución" n={resumen.enEjecucion} tono="text-sky-600 dark:text-sky-300" />
              <Kpi label="Hechos" n={resumen.hechos} tono="text-emerald-600 dark:text-emerald-300" />
              <Kpi label="IA pendiente" n={resumen.ia} tono={resumen.ia ? 'text-amber-600 dark:text-amber-300' : undefined} />
            </div>
          )}

          {tab === 'cc' && <DocumentarPaso onCreated={refrescar} />}

          {!ws || ws.projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <p className="text-sm font-medium">{tab === 'demos' ? 'Todavía no hay demos' : tab === 'clientes' ? 'Todavía no hay proyectos de cliente' : 'La bitácora está vacía'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tab === 'demos'
                  ? 'Se crean al ejecutar un lote "Demo web" o cuando un conector usa whatspro_sales_tareas_from_chat (demo).'
                  : tab === 'clientes'
                    ? 'Se crean con "Pedir demo web / proyecto" desde la ficha, o cuando un conector usa whatspro_sales_tareas_from_chat (project).'
                    : 'Documentá el primer paso arriba.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {ws.projects.map((p) => (
                <li key={p.id}>
                  <ProyectoCard project={p} onOpen={onOpen} onChanged={refrescar} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, n, tono }: { label: string; n: number; tono?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', tono)}>{fmtInt(n)}</p>
    </div>
  );
}

function DocumentarPaso({ onCreated }: { onCreated: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const guardar = async () => {
    if (title.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await fetch(`${SALES_OPS_API}/produccion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'documentar', title: title.trim(), notes: notes.trim() || undefined }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      toast.success('Paso documentado en la Bitácora.');
      setTitle('');
      setNotes('');
      setAbierto(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };
  if (!abierto) {
    return (
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 self-start text-xs" onClick={() => setAbierto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Documentar un paso
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl border border-primary/40 bg-primary/5 p-3">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué se hizo o se decidió (ej.: Publicada demo de Fe Em Deus en AAPP SPACE)" className="h-9 text-sm" autoFocus />
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Detalle, links, qué falta. Si es de un chat, escribí «Chat #id» para que quede vinculado." className="text-xs" />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAbierto(false)}>Cancelar</Button>
        <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || title.trim().length < 2} onClick={() => void guardar()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
          Guardar paso
        </Button>
      </div>
    </div>
  );
}

function ProyectoCard({ project, onOpen, onChanged }: { project: ProdProject; onOpen?: (chatId: number) => void; onChanged: () => void }) {
  const [abierto, setAbierto] = useState(project.estado === 'en_ejecucion');
  const [nueva, setNueva] = useState('');
  const [creando, setCreando] = useState(false);
  const pct = Math.round(project.progress * 100);
  const chatId = useMemo(() => project.items.find((i) => i.chatId)?.chatId ?? null, [project.items]);

  const crearTarea = async () => {
    const t = nueva.trim();
    if (t.length < 2 || !project.columns[0]) return;
    setCreando(true);
    try {
      const res = await fetch(`${TASKS_API}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: project.columns[0].id, title: t }) });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setNueva('');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear.');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button type="button" className="flex w-full items-start gap-3 p-3 text-left" onClick={() => setAbierto((v) => !v)}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{project.name}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', ESTADO_TONE[project.estado])}>{ESTADO_LABEL[project.estado]}</span>
            {project.iaPendientes > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                <Bot className="size-3" aria-hidden />
                {project.iaPendientes} con IA pendiente
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full', project.estado === 'hecho' ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {project.hechas} de {project.total} tareas · {tiempoRelativo(project.updatedAt)}
          </p>
        </div>
        {abierto ? <ChevronUp className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </button>

      {abierto && (
        <div className="space-y-2 border-t border-border/60 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {chatId && onOpen && (
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => onOpen(chatId)}>
                <UserSquare2 className="size-3" aria-hidden />
                Abrir la ficha
              </Button>
            )}
            <a href={`/plugins/tasks?proyecto=${project.id}`} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
              <ExternalLink className="size-3" aria-hidden />
              Abrir en Tareas OS
            </a>
          </div>

          <ul className="space-y-1.5">
            {project.items.map((it) => (
              <li key={it.id}>
                <TareaRow item={it} columns={project.columns} onOpen={onOpen} onChanged={onChanged} />
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1.5">
            <Input value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void crearTarea()} placeholder="Nueva tarea en este proyecto" className="h-8 text-xs" />
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-[11px]" disabled={creando || nueva.trim().length < 2} onClick={() => void crearTarea()}>
              {creando ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Plus className="size-3" aria-hidden />}
              Agregar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TareaRow({ item, columns, onOpen, onChanged }: { item: ProdItem; columns: ProdProject['columns']; onOpen?: (chatId: number) => void; onChanged: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  const [busy, setBusy] = useState(false);
  const pct = Math.round(item.progress * 100);

  const correr = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setBusy(false);
    }
  };

  const toggleDone = () => {
    const hechoCol = columns.find((c) => c.done);
    const primera = columns[0];
    const patch: Record<string, unknown> = item.done ? { status: 'open', ...(primera ? { columnId: primera.id } : {}) } : { status: 'done', ...(hechoCol ? { columnId: hechoCol.id } : {}) };
    void correr(() => patchTask(item.id, patch));
  };
  const toggleCheck = (id: string) => {
    const checklist = item.checklist.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c));
    void correr(() => patchTask(item.id, { checklist }));
  };
  const mover = (columnId: number) => void correr(() => patchTask(item.id, { columnId }));
  const guardar = () => void correr(() => patchTask(item.id, { title: title.trim() || item.title, notes }), 'Guardado.').then(() => setEditando(false));

  return (
    <div className={cn('rounded-xl border px-2.5 py-2', item.done ? 'border-border/60 bg-muted/30' : 'border-border bg-background')}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggleDone}
          disabled={busy}
          aria-pressed={item.done}
          className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border', item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border hover:border-foreground')}
          title={item.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        >
          {item.done && <Check className="size-3" aria-hidden />}
        </button>
        <div className="min-w-0 flex-1">
          {editando ? (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-7 text-xs" />
          ) : (
            <button type="button" className={cn('w-full truncate text-left text-xs font-medium', item.done && 'text-muted-foreground line-through')} onClick={() => setAbierta((v) => !v)}>
              {item.title}
            </button>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <select value={item.columnId} disabled={busy} onChange={(e) => mover(Number(e.target.value))} className="h-5 rounded border border-border bg-background px-1 text-[10px]">
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            {item.checklist.length > 0 && <span className="tabular-nums">{item.checklist.filter((c) => c.completed).length}/{item.checklist.length} · {pct}%</span>}
            {item.dueDate && <span>vence {item.dueDate}</span>}
            {item.ia && <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', IA_TONE[item.ia.status])}>{IA_LABEL[item.ia.status]}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {item.chatId && onOpen && (
            <Button type="button" variant="ghost" size="icon" className="size-6" title="Abrir la ficha" onClick={() => onOpen(item.chatId!)}>
              <UserSquare2 className="size-3" aria-hidden />
            </Button>
          )}
          {editando ? (
            <Button type="button" variant="ghost" size="icon" className="size-6" title="Guardar" disabled={busy} onClick={guardar}>
              {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Save className="size-3" aria-hidden />}
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="icon" className="size-6" title="Editar" onClick={() => { setEditando(true); setAbierta(true); }}>
              <Pencil className="size-3" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      {abierta && (
        <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
          {editando ? (
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="text-xs" placeholder="Notas" />
          ) : (
            item.notes && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-foreground/85">{item.notes}</pre>
          )}
          {item.checklist.length > 0 && (
            <ul className="space-y-1">
              {item.checklist.map((c) => (
                <li key={c.id}>
                  <button type="button" disabled={busy} onClick={() => toggleCheck(c.id)} className="flex w-full items-start gap-1.5 text-left text-[11px]">
                    <span className={cn('mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border', c.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border')}>{c.completed && <Check className="size-2.5" aria-hidden />}</span>
                    <span className={cn(c.completed && 'text-muted-foreground line-through')}>{c.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {item.ia && (
            <details className="rounded-lg border border-border/60 bg-muted/40 p-2">
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Prompt IA · {IA_LABEL[item.ia.status]}{item.ia.note ? ` · ${item.ia.note}` : ''}
              </summary>
              <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted-foreground">{item.ia.prompt}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

