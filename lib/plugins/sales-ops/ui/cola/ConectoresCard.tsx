'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Ban, ChevronDown, ChevronUp, Copy, ListPlus, Loader2, Plug, RefreshCw, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PROMPT_P9 } from '@/lib/plugins/sales-ops/shared/prompt-p9';
import { SALES_OPS_API } from '../components/format';
import { cancelRun, launchSkill, type SkillsPayload } from '../skills/api';
import { QUEUE_ENDPOINT } from './api';

type WorkKind = 'run_prompt' | 'classify' | 'execute_action' | 'classify_signal' | 'transcribe';
type WorkCounts = Record<WorkKind, number>;
type WorkItem = {
  kind: WorkKind;
  name: string;
  chatId?: number | null;
  runId?: number;
  actionId?: number;
  batchLabel?: string;
  actionKind?: string;
  title?: string;
  messageId?: string;
  reason?: string;
  excerpt?: string;
};
type WorkSkip = { kind: string; key: string; until: string | null; label?: string };
type WorkPayload = { generatedAt: string; counts: WorkCounts; items: WorkItem[]; rules: string[]; skips: WorkSkip[] };

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Error ${r.status}`))));

const LABELS: Record<WorkKind, string> = {
  run_prompt: 'Prompts encolados',
  execute_action: 'Aprobado sin ejecutar',
  classify: 'Chats por clasificar',
  classify_signal: 'Respuestas por clasificar',
  transcribe: 'Audios por transcribir',
};
const REASON: Record<string, string> = { sin_analisis: 'sin analizar', import: 'importado', stale: 'desactualizado', chat_changed: 'el chat cambió' };

/** La skill sembrada con ese mismo texto; "Encolar P9" la lanza a la cola de conectores. */
const SKILL_P9 = 'qa.p9-drenar-cola';

/** La clave con la que el servidor identifica un ítem para descartarlo. */
function keyOf(it: WorkItem): string {
  if (it.kind === 'run_prompt') return String(it.runId);
  if (it.kind === 'execute_action') return String(it.actionId);
  if (it.kind === 'classify') return String(it.chatId);
  return String(it.messageId);
}

/**
 * Lo que espera un conector (Claude / ChatGPT / Grok), ítem por ítem, y la
 * forma de sacar algo de esa cola: por esta vez (24 h) o para siempre.
 *
 * Antes era sólo un conteo, y para que un conector no clasificara un chat
 * que no correspondía había que excluirlo de todo el Command Center. Ahora se
 * descarta acá, sin tocar nada más: lo descartado no se le ofrece al conector
 * y sigue existiendo donde vive (el chat, el audio, la fila).
 */
export function ConectoresCard() {
  const { data, isLoading, error, mutate } = useSWR<WorkPayload>(`${SALES_OPS_API}/work?limit=100`, fetcher, { refreshInterval: 120_000 });
  const [refreshing, setRefreshing] = useState(false);
  const [abierto, setAbierto] = useState<WorkKind | null>(null);
  const [verExcluidos, setVerExcluidos] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_P9);
      toast.success('Prompt P9 copiado. Pegalo en Claude, ChatGPT o Grok con el conector de WhatsPro.');
    } catch {
      toast.error('No se pudo copiar. El P9 también existe como skill "qa.p9-drenar-cola": lanzala desde el Prompt Studio o con whatspro_sales_prompt_launch.');
    }
  };

  /** Deja el P9 en la cola de conectores como corrida de la skill sembrada, sin copiar nada a mano. */
  const encolarP9 = () =>
    correr('p9', async () => {
      const { skills } = (await fetcher(`${SALES_OPS_API}/prompts`)) as SkillsPayload;
      const skill = skills.find((s) => s.key === SKILL_P9);
      if (!skill) throw new Error('La skill qa.p9-drenar-cola no está sembrada en este equipo: lanzá el P9 desde el Prompt Studio.');
      await launchSkill({ skillId: skill.id, targetKind: 'team', mode: 'queue' });
    }, 'P9 encolado: el próximo conector que pida la cola lo va a tomar.');

  const correr = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setBusy(null);
    }
  };
  const post = async (url: string, body: unknown, method = 'POST') => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(json?.error ?? `Error ${res.status}`));
    return json;
  };
  const skip = (it: WorkItem, forever: boolean) =>
    correr(`${forever ? 'ex' : 'sk'}-${it.kind}-${keyOf(it)}`, () => post(`${SALES_OPS_API}/work`, { action: 'skip', kind: it.kind, key: keyOf(it), forever, label: it.name }), forever ? `${it.name}: excluido de la cola de conectores.` : `${it.name}: descartado por esta vez (24 h).`);

  /** Descartar según el tipo: lo que tiene estado propio se cancela o se quita; el resto se marca. */
  const descartar = (it: WorkItem) => {
    if (it.kind === 'run_prompt' && it.runId) return correr(`sk-${it.kind}-${it.runId}`, () => cancelRun(it.runId!), 'Corrida cancelada.');
    if (it.kind === 'execute_action' && it.actionId) {
      if (!window.confirm(`¿Quitar a ${it.name} del lote "${it.batchLabel ?? ''}"? La fila queda rechazada.`)) return Promise.resolve();
      return correr(`sk-${it.kind}-${it.actionId}`, () => post(`${QUEUE_ENDPOINT}/actions/${it.actionId}`, {}, 'DELETE'), `${it.name}: fuera del lote.`);
    }
    if (it.kind === 'transcribe' && it.messageId) {
      return correr(`sk-${it.kind}-${it.messageId}`, async () => {
        await post(`${SALES_OPS_API}/audios/${encodeURIComponent(it.messageId!)}`, { action: 'dequeue' });
        await post(`${SALES_OPS_API}/work`, { action: 'skip', kind: it.kind, key: it.messageId, forever: false, label: it.name });
      }, `${it.name}: audio fuera de la cola.`);
    }
    return skip(it, false);
  };
  const excluir = (it: WorkItem) => {
    if (it.kind === 'run_prompt' || it.kind === 'execute_action') return descartar(it);
    if (it.kind === 'transcribe' && it.chatId) {
      if (!window.confirm(`¿Nunca transcribir los audios de ${it.name}? Salen de la cola y de la vista Audios.`)) return Promise.resolve();
      return correr(`ex-${it.kind}-${it.messageId}`, () => post(`${SALES_OPS_API}/audios`, { action: 'nunca', chatId: it.chatId, nunca: true }), `${it.name}: nunca transcribir.`);
    }
    if (!window.confirm(`¿Excluir a ${it.name} de la cola de conectores para siempre? Se puede deshacer desde "Excluidos".`)) return Promise.resolve();
    return skip(it, true);
  };
  const unskip = (s: WorkSkip) => correr(`un-${s.kind}-${s.key}`, () => post(`${SALES_OPS_API}/work`, { action: 'unskip', kind: s.kind, key: s.key }), 'Vuelve a la cola de conectores.');

  const detalle = (it: WorkItem) => {
    if (it.kind === 'classify') return REASON[it.reason ?? ''] ?? it.reason ?? '';
    if (it.kind === 'classify_signal') return it.excerpt ? `“${it.excerpt.slice(0, 90)}”` : '';
    if (it.kind === 'run_prompt') return it.title ?? '';
    if (it.kind === 'execute_action') return `${it.actionKind ?? ''} · ${it.batchLabel ?? ''}`;
    return 'audio en cola';
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Plug className="size-3.5" aria-hidden />
            Cola de conectores
          </h2>
          <p className="mt-1 text-sm">
            {isLoading ? 'Calculando…' : error ? 'No se pudo cargar la cola.' : total === 0 ? 'Nada pendiente para los conectores.' : `${total} ítems esperan un conector.`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Lo que el servidor no puede hacer solo: pedidos que exigen leer el chat, clasificar y transcribir sin cuota, y lo aprobado que no pudo ejecutar (cobros, fallas). Tocá un tipo para ver los ítems y descartar lo que no corresponda.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="size-8 p-0" aria-label="Actualizar" onClick={async () => { setRefreshing(true); await mutate().finally(() => setRefreshing(false)); }}>
            <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={copy}>
            <Copy className="size-3.5" aria-hidden />
            Copiar prompt P9
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy !== null} onClick={() => void encolarP9()} title="Deja el P9 en la cola como corrida de la skill qa.p9-drenar-cola">
            {busy === 'p9' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ListPlus className="size-3.5" aria-hidden />}
            Encolar P9
          </Button>
        </div>
      </div>

      {data && (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(LABELS) as WorkKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setAbierto((a) => (a === kind ? null : kind))}
              aria-pressed={abierto === kind}
              disabled={data.counts[kind] === 0}
              className={cn('rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-50', abierto === kind ? 'bg-foreground text-background' : 'bg-muted/60 hover:bg-muted')}
            >
              <dt className={cn('text-[11px]', abierto === kind ? 'text-background/80' : 'text-muted-foreground')}>{LABELS[kind]}</dt>
              <dd className="flex items-center justify-between text-lg font-semibold tabular-nums">
                {data.counts[kind]}
                {data.counts[kind] > 0 && (abierto === kind ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5 opacity-60" aria-hidden />)}
              </dd>
            </button>
          ))}
        </dl>
      )}

      {data && abierto && (
        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1.5">
          {data.items.filter((it) => it.kind === abierto).length === 0 && <li className="p-2 text-xs text-muted-foreground">Los ítems de este tipo no entraron en los primeros 100; actualizá para ver más.</li>}
          {data.items
            .filter((it) => it.kind === abierto)
            .map((it) => {
              const k = keyOf(it);
              const ocupado = busy === `sk-${it.kind}-${k}` || busy === `ex-${it.kind}-${k}`;
              return (
                <li key={`${it.kind}-${k}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{it.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{detalle(it)}</span>
                  </span>
                  <button type="button" disabled={busy !== null} title={it.kind === 'run_prompt' ? 'Cancelar la corrida' : it.kind === 'execute_action' ? 'Quitar del lote' : 'Descartar por esta vez (24 h)'} onClick={() => void descartar(it)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                    {ocupado && busy?.startsWith('sk-') ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <X className="size-3" aria-hidden />}
                    {it.kind === 'run_prompt' ? 'Cancelar' : it.kind === 'execute_action' ? 'Quitar' : 'Esta vez'}
                  </button>
                  {it.kind !== 'run_prompt' && it.kind !== 'execute_action' && (
                    <button type="button" disabled={busy !== null} title={it.kind === 'transcribe' ? 'Nunca transcribir a este contacto' : 'Excluir para siempre de la cola de conectores'} onClick={() => void excluir(it)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                      {ocupado && busy?.startsWith('ex-') ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Ban className="size-3" aria-hidden />}
                      Siempre
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      {data && data.skips.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setVerExcluidos((v) => !v)} className="flex items-center gap-1.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
            <Ban className="size-3" aria-hidden />
            {verExcluidos ? 'Ocultar descartados' : `Descartados y excluidos · ${data.skips.length}`}
          </button>
          {verExcluidos && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {data.skips.map((s) => (
                <li key={`${s.kind}-${s.key}`} className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[11px]">
                  <span className="text-muted-foreground">{LABELS[s.kind as WorkKind] ?? s.kind}:</span>
                  <span className="max-w-40 truncate">{s.label ?? s.key}</span>
                  <span className={cn('rounded px-1 text-[9px] font-semibold uppercase', s.until ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-destructive/10 text-destructive')}>{s.until ? '24 h' : 'siempre'}</span>
                  <button type="button" disabled={busy !== null} title="Volver a la cola" onClick={() => void unskip(s)} className="text-muted-foreground hover:text-foreground">
                    {busy === `un-${s.kind}-${s.key}` ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Undo2 className="size-3" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
