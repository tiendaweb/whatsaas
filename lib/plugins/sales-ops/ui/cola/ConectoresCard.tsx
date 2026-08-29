'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Copy, Plug, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SALES_OPS_API } from '../components/format';

type WorkCounts = { classify: number; execute_action: number; classify_signal: number; transcribe: number };
type WorkPayload = { generatedAt: string; counts: WorkCounts; items: Array<{ kind: keyof WorkCounts; name: string }>; rules: string[] };

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Error ${r.status}`))));

const LABELS: Record<keyof WorkCounts, string> = {
  execute_action: 'Envíos y acciones aprobadas',
  classify: 'Chats por clasificar',
  classify_signal: 'Respuestas por clasificar',
  transcribe: 'Audios por transcribir',
};

export const PROMPT_P9 = `Pedí whatspro_sales_work_queue. Trabajá los ítems en el orden en que vienen (los envíos aprobados primero, después clasificaciones del prefiltro de dinero, después respuestas nuevas, después audios). Por cada ítem seguí exactamente sus "steps" y cerrá con la tool de resultado antes de pasar al siguiente. No toques el CRM (etapas, etiquetas, campos, automatizaciones, clientes). Nunca reintentes un envío que dio timeout: reportalo como send_unknown con el chat. Cuando termines el lote, volvé a pedir la cola; si viene vacía, informá cuántos ítems hiciste por tipo. Límite por sesión: 30 ítems.`;

/**
 * Lo que espera un conector (Claude / ChatGPT / Grok): todo lo que el servidor
 * no puede hacer sin cuota de IA, más los envíos aprobados. Se ejecuta a
 * voluntad pegando el prompt P9 en el conector.
 */
export function ConectoresCard() {
  const { data, isLoading, error, mutate } = useSWR<WorkPayload>(`${SALES_OPS_API}/work?limit=50`, fetcher, { refreshInterval: 120_000 });
  const [refreshing, setRefreshing] = useState(false);
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_P9);
      toast.success('Prompt P9 copiado. Pegalo en Claude, ChatGPT o Grok con el conector de WhatsPro.');
    } catch {
      toast.error('No se pudo copiar. Abrí el documento "07 — Prompt Studio" y copiá el P9 a mano.');
    }
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
            Lo que el servidor no puede hacer sin cuota de IA (clasificar, transcribir) y los envíos aprobados quedan acá. Se ejecutan a voluntad desde Claude, ChatGPT o Grok con el prompt P9.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-8 p-0"
            aria-label="Actualizar"
            onClick={async () => {
              setRefreshing(true);
              await mutate().finally(() => setRefreshing(false));
            }}
          >
            <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={copy}>
            <Copy className="size-3.5" aria-hidden />
            Copiar prompt P9
          </Button>
        </div>
      </div>
      {data && total > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(LABELS) as Array<keyof WorkCounts>).map((kind) => (
            <div key={kind} className="rounded-lg bg-muted/60 px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">{LABELS[kind]}</dt>
              <dd className="text-lg font-semibold tabular-nums">{data.counts[kind]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
