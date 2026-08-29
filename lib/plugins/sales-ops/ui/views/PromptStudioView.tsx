'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Copy, Play, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SALES_OPS_API, fetcher, tiempoRelativo } from '../components/format';

type QuickAction = { id: number; key: string; title: string; version: number; status: string; text: string; toolChain: string[]; notes: string | null; updatedAt: string };
type PromptsPayload = { quickActions: QuickAction[] };
type Run = { id: number; title: string; promptKey: string; status: string; targetKind: string; targetId: string; targetName: string | null; summary: string | null; connector: string; createdAt: string; completedAt: string | null };

const STATUS_LABEL: Record<string, string> = { queued: 'en cola', in_progress: 'en curso', completed: 'hecho', failed: 'falló', blocked: 'bloqueado', cancelled: 'cancelado' };

async function post(url: string, body: unknown, method = 'POST') {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(data?.error ?? `Error ${r.status}`));
  return data;
}

/**
 * Prompt Studio: acciones rápidas que los conectores ejecutan con un botón.
 * "Encolar" deja la corrida en la cola de trabajo (`whatspro_sales_work_queue`,
 * kind run_prompt); "Copiar" sirve para pegarla a mano en Claude/ChatGPT/Grok.
 */
export function PromptStudioView({ onOpen }: { onOpen?: (chatId: number) => void }) {
  const { data, isLoading, error, mutate } = useSWR<PromptsPayload>(`${SALES_OPS_API}/prompts`, fetcher);
  const runs = useSWR<{ runs: Run[] }>(`${SALES_OPS_API}/prompts/queue?status=all`, fetcher, { refreshInterval: 30_000 });
  const [editing, setEditing] = useState<QuickAction | null | 'new'>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const actions = data?.quickActions ?? [];
  const openRuns = (runs.data?.runs ?? []).filter((r) => r.status === 'queued' || r.status === 'in_progress');
  const doneRuns = (runs.data?.runs ?? []).filter((r) => r.status !== 'queued' && r.status !== 'in_progress').slice(0, 12);

  const enqueue = async (qa: QuickAction) => {
    setBusyKey(qa.key);
    try {
      await post(`${SALES_OPS_API}/prompts/queue`, { promptId: qa.id, targetKind: 'team' });
      toast.success(`"${qa.title}" quedó en la cola de conectores.`);
      void runs.mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setBusyKey(null);
    }
  };

  const copy = async (qa: QuickAction) => {
    try {
      await navigator.clipboard.writeText(qa.text);
      toast.success('Prompt copiado. Pegalo en Claude, ChatGPT o Grok con el conector de WhatsPro.');
    } catch {
      toast.error('No se pudo copiar.');
    }
  };

  const retire = async (qa: QuickAction) => {
    if (!window.confirm(`¿Retirar "${qa.title}"? Las corridas ya encoladas no se tocan.`)) return;
    try {
      await post(`${SALES_OPS_API}/prompts?key=${encodeURIComponent(qa.key)}`, {}, 'DELETE');
      toast.success('Acción retirada.');
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo retirar.');
    }
  };

  const cancelRun = async (run: Run) => {
    try {
      await post(`${SALES_OPS_API}/prompts/queue/${run.id}`, { status: 'cancelled' }, 'PATCH');
      void runs.mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cancelar.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Wand2 className="size-3.5" aria-hidden />
              Acciones rápidas
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Un botón = una corrida en la cola de conectores. Se ejecutan desde Claude, ChatGPT o Grok con el prompt P9.</p>
          </div>
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            Nueva acción
          </Button>
        </div>
        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{String(error.message)}</div>}
        {isLoading && (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        )}
        {!isLoading && actions.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Todavía no hay acciones rápidas. Creá la primera o corré el seed del Prompt Studio.</div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map((qa) => (
            <article key={qa.key} className="flex flex-col rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium">{qa.title}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    v{qa.version} · {qa.key} · {tiempoRelativo(qa.updatedAt)}
                  </p>
                </div>
                <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Retirar" onClick={() => retire(qa)}>
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
              <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{qa.text.replace(/^REGLAS DEL COMMAND CENTER COMERCIAL[^\n]*\n+/, '')}</p>
              {qa.toolChain.length > 0 && (
                <p className="mt-2 truncate text-[10px] text-muted-foreground">{qa.toolChain.join(' → ')}</p>
              )}
              <div className="mt-3 flex items-center gap-1.5">
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busyKey === qa.key} onClick={() => enqueue(qa)}>
                  <Play className="size-3.5" aria-hidden />
                  {busyKey === qa.key ? 'Encolando…' : 'Encolar'}
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => copy(qa)}>
                  <Copy className="size-3.5" aria-hidden />
                  Copiar
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditing(qa)}>
                  Editar
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Corridas en cola</h2>
        {openRuns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nada en cola. Encolá una acción o dejá un prompt desde la ficha de un chat.</div>
        ) : (
          <ul className="space-y-1.5">
            {openRuns.map((run) => (
              <RunRow key={run.id} run={run} onOpen={onOpen} onCancel={() => cancelRun(run)} />
            ))}
          </ul>
        )}
      </section>

      {doneRuns.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Últimas corridas</h2>
          <ul className="space-y-1.5">
            {doneRuns.map((run) => (
              <RunRow key={run.id} run={run} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <EditorDialog
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function RunRow({ run, onOpen, onCancel }: { run: Run; onOpen?: (chatId: number) => void; onCancel?: () => void }) {
  const chatId = run.targetKind === 'chat' ? Number(run.targetId) : null;
  return (
    <li className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
      <div className="min-w-0">
        <p className="truncate font-medium">{run.title}</p>
        <p className="mt-0.5 text-muted-foreground">
          {chatId ? (
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpen?.(chatId)}>
              {run.targetName ?? `chat ${chatId}`}
            </button>
          ) : (
            'equipo'
          )}
          {' · '}
          {tiempoRelativo(run.createdAt)}
          {run.connector && run.connector !== 'pending' && ` · ${run.connector}`}
        </p>
        {run.summary && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{run.summary}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px]',
            run.status === 'completed' && 'bg-primary/10 text-foreground',
            run.status === 'queued' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
            run.status === 'in_progress' && 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
            (run.status === 'failed' || run.status === 'blocked') && 'bg-destructive/10 text-destructive',
            run.status === 'cancelled' && 'bg-muted text-muted-foreground',
          )}
        >
          {STATUS_LABEL[run.status] ?? run.status}
        </span>
        {onCancel && run.status === 'queued' && (
          <button type="button" className="text-muted-foreground hover:text-destructive" aria-label="Cancelar" onClick={onCancel}>
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

function EditorDialog({ initial, onClose, onSaved }: { initial: QuickAction | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [tools, setTools] = useState(initial?.toolChain.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (title.trim().length < 3 || text.trim().length < 5) {
      toast.error('Título (3+) y prompt (5+) son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      await post(`${SALES_OPS_API}/prompts`, {
        key: initial?.key,
        title: title.trim(),
        text: text.trim(),
        toolChain: tools.split(',').map((t) => t.trim()).filter(Boolean),
      });
      toast.success(initial ? 'Nueva versión guardada.' : 'Acción creada.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? `Editar · ${initial.title}` : 'Nueva acción rápida'}</DialogTitle>
          <DialogDescription>El texto es lo que el conector va a ejecutar tal cual. Guardar crea una versión nueva; las anteriores quedan retiradas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ej.: Reactivar G4 con precio conocido)" />
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="font-mono text-xs" placeholder="Instrucciones para el conector. Podés citar tools whatspro_* y las reglas del Command Center." />
          <Input value={tools} onChange={(e) => setTools(e.target.value)} placeholder="Cadena de tools sugerida, separada por comas (opcional)" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
