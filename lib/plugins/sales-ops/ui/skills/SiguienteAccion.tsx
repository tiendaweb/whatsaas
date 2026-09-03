'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronRight, Cpu, Inbox, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Skill } from '../../shared/skills';
import { classifyRunError } from '../../shared/run-errors';
import { SALES_OPS_API, fetcher, tiempoRelativo } from '../components/format';
import { ApiError, launchSkill, type SkillRun } from './api';
import { SkillLauncher } from './SkillLauncher';
import { CATEGORY_TONE, SKILL_ICON_COMPONENTS } from './skill-meta';

/** Lo que devuelve `GET /prompts/recommended?chatId=`. */
type AiSuggestion = {
  skillKey: string | null;
  skillId: number | null;
  title: string;
  why: string;
  icon: keyof typeof SKILL_ICON_COMPONENTS;
  category: keyof typeof CATEGORY_TONE;
  variables: Record<string, string>;
  prompt: string | null;
};

type Payload = {
  suggestions: AiSuggestion[];
  generatedAt: string | null;
  recommendations: Array<{ skill: Skill; reason: string; score: number }>;
  situation: { gate: string | null; status: string | null; signals: string[] };
  unavailable: string | null;
};

/** Una fila de la lista, venga de la IA o de una regla. */
type Fila = {
  id: string;
  title: string;
  reason: string;
  icon: keyof typeof SKILL_ICON_COMPONENTS;
  category: keyof typeof CATEGORY_TONE;
  origen: 'ia' | 'regla';
  skill: Skill | null;
  variables: Record<string, string>;
  prompt: string | null;
  execution: Skill['execution'] | 'connector';
};

type Props = {
  chatId: number;
  chatName?: string | null;
  /** Acción recomendada por el análisis, en una línea. Es el encabezado del bloque. */
  recommendedAction?: string | null;
  ownerLabel?: string | null;
  statusLabel?: string | null;
  onLaunched?: () => void;
  className?: string;
};

/**
 * "Siguiente acción" de la ficha: qué hacer con este cliente y el botón que lo hace.
 *
 * Antes eran dos bloques que no se hablaban: arriba tres botones apagados con
 * el cartel "Fase 6" iguales para los 1.057 chats, y más abajo una lista aparte
 * de skills recomendadas. Ahora es uno solo y todo se ve igual —ícono de skill,
 * mismo lanzador—, porque para quien lo usa son la misma cosa: acciones que
 * puede disparar ahora.
 *
 * Dos fuentes, mezcladas y deduplicadas:
 *  - **IA**: leyó el expediente de ESTE chat y eligió del catálogo, con el
 *    formulario ya pre-llenado (el plan que eligió, el precio que recibió).
 *  - **Regla**: skills cuyo `recommendFor` coincide con el gate o la última
 *    señal. Son el piso: existen aunque no haya cuota de IA.
 *
 * Compacto a propósito: en el panel de 440 px esto compite con el expediente,
 * así que es una fila por acción y el detalle vive en el lanzador.
 */
export function SiguienteAccion({ chatId, chatName, recommendedAction, ownerLabel, statusLabel, onLaunched, className }: Props) {
  const { data, isLoading, mutate } = useSWR<Payload>(`${SALES_OPS_API}/prompts/recommended?chatId=${chatId}`, fetcher, { revalidateOnFocus: false });
  const [abierta, setAbierta] = useState<Fila | null>(null);
  const [lanzando, setLanzando] = useState<string | null>(null);
  const [regenerando, setRegenerando] = useState(false);

  const filas = useMemo<Fila[]>(() => {
    if (!data) return [];
    const porSkill = new Map(data.recommendations.map((r) => [r.skill.key, r.skill]));
    const out: Fila[] = [];
    const vistas = new Set<string>();

    for (const s of data.suggestions) {
      const skill = s.skillKey ? (porSkill.get(s.skillKey) ?? null) : null;
      const id = s.skillKey ?? `ia:${s.title}`;
      if (vistas.has(id)) continue;
      vistas.add(id);
      out.push({
        id,
        title: s.title,
        reason: s.why,
        icon: skill?.icon ?? s.icon,
        category: skill?.category ?? s.category,
        origen: 'ia',
        skill,
        variables: s.variables ?? {},
        prompt: s.prompt,
        execution: skill?.execution ?? 'connector',
      });
    }

    for (const r of data.recommendations) {
      if (vistas.has(r.skill.key)) continue;
      vistas.add(r.skill.key);
      out.push({
        id: r.skill.key,
        title: r.skill.title,
        reason: r.reason,
        icon: r.skill.icon,
        category: r.skill.category,
        origen: 'regla',
        skill: r.skill,
        variables: {},
        prompt: null,
        execution: r.skill.execution,
      });
    }
    return out.slice(0, 6);
  }, [data]);

  /**
   * Una sugerencia de la IA sin skill del catálogo es un prompt suelto: no hay
   * formulario que completar, así que se encola de un toque en vez de abrir un
   * diálogo con un solo botón adentro.
   */
  const lanzarPromptSuelto = async (fila: Fila) => {
    if (!fila.prompt) return;
    setLanzando(fila.id);
    try {
      const { run } = await launchSkill({ text: fila.prompt, title: fila.title, targetKind: 'chat', targetId: chatId, mode: 'queue' });
      toast.success('En la cola. La toma el próximo conector que pida trabajo.');
      onLaunched?.();
      return run;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo encolar.');
    } finally {
      setLanzando(null);
    }
  };

  const regenerar = async () => {
    setRegenerando(true);
    try {
      const res = await fetch(`${SALES_OPS_API}/prompts/recommended?chatId=${chatId}&force=1`, { cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      await mutate(body, { revalidate: false });
      toast.success(body.suggestions.length ? `${body.suggestions.length} sugerencias nuevas.` : 'La IA no encontró una acción clara para este chat.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron generar las sugerencias.');
    } finally {
      setRegenerando(false);
    }
  };

  return (
    <section className={cn('rounded-xl border border-primary/30 bg-primary/5 p-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Siguiente acción</p>
          <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">{recommendedAction || '—'}</p>
          {(ownerLabel || statusLabel) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {ownerLabel && <>Responsable <span className="text-foreground">{ownerLabel}</span></>}
              {ownerLabel && statusLabel && ' · '}
              {statusLabel && <>Destino <span className="text-foreground">{statusLabel}</span></>}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          title={data?.generatedAt ? `Sugerencias de ${tiempoRelativo(data.generatedAt)}. Regenerar con IA.` : 'Generar sugerencias con IA'}
          aria-label="Regenerar sugerencias"
          disabled={regenerando}
          onClick={() => void regenerar()}
        >
          {regenerando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
        </Button>
      </div>

      {isLoading && <div className="mt-2 h-8 animate-pulse rounded-lg bg-muted/60" />}

      {!isLoading && filas.length > 0 && (
        <ul className="mt-2 space-y-1">
          {filas.map((fila) => {
            const Icon = SKILL_ICON_COMPONENTS[fila.icon] ?? Sparkles;
            const ocupada = lanzando === fila.id;
            return (
              <li key={fila.id}>
                <button
                  type="button"
                  disabled={ocupada}
                  onClick={() => (fila.skill ? setAbierta(fila) : void lanzarPromptSuelto(fila))}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-left transition-colors hover:border-foreground/25 hover:bg-muted/50 disabled:opacity-60"
                >
                  <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', CATEGORY_TONE[fila.category] ?? CATEGORY_TONE.general)}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="min-w-0 truncate text-xs font-medium">{fila.title}</span>
                      {fila.origen === 'ia' && <Sparkles className="size-2.5 shrink-0 text-primary" aria-label="Sugerida por IA" />}
                    </span>
                    {fila.reason && <span className="block truncate text-[10px] text-muted-foreground">{fila.reason}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                    {ocupada ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : (
                      /* Todo sale por la cola de conectores: distinguir motores
                         acá era ofrecer una diferencia que ya no existe. */
                      <Inbox className="size-3" aria-hidden />
                    )}
                    <ChevronRight className="size-3.5" aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!isLoading && filas.length === 0 && <SinSugerencias motivo={data?.unavailable ?? null} onGenerar={() => void regenerar()} />}

      {abierta?.skill && (
        <SkillLauncher
          key={abierta.id}
          skill={abierta.skill}
          target={{ kind: 'chat', id: chatId, name: chatName ?? null }}
          initialValues={abierta.variables}
          reason={abierta.origen === 'ia' ? abierta.reason : null}
          open
          onOpenChange={(o) => !o && setAbierta(null)}
          onLaunched={() => {
            onLaunched?.();
            void mutate();
          }}
        />
      )}
    </section>
  );
}

export type { SkillRun };

/**
 * Por qué no hay sugerencias.
 *
 * El motivo puede venir siendo el error crudo del proveedor de IA —el 429 de
 * Gemini son 900 caracteres de JSON— y eso, tal cual, ocupaba media ficha sin
 * decir nada. Se pasa por el mismo clasificador que usa la Actividad: si es
 * cuota, se dice que es cuota y se ofrece el camino que sí funciona.
 */
function SinSugerencias({ motivo, onGenerar }: { motivo: string | null; onGenerar: () => void }) {
  const falla = motivo ? classifyRunError(motivo) : null;

  if (falla && falla.kind !== 'other') {
    return (
      <div className="mt-2 rounded-lg border border-border bg-background px-2.5 py-2">
        <p className="text-[11px] font-medium text-foreground">{falla.title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{falla.hint}</p>
        <button type="button" className="mt-1 text-[11px] underline underline-offset-2 hover:text-foreground" onClick={onGenerar}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <p className="mt-2 text-[11px] text-muted-foreground">
      {motivo && motivo.length < 160 ? motivo : 'Todavía no hay sugerencias para este chat.'}{' '}
      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onGenerar}>
        Generar con IA
      </button>
    </p>
  );
}
