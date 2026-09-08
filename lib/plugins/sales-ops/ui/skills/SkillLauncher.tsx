'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, Cpu, Inbox, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  EXECUTION_LABELS,
  allowsMode,
  defaultMode,
  missingVariables,
  renderSkillText,
  type RunMode,
  type Skill,
} from '../../shared/skills';
import { classifyRunError } from '../../shared/run-errors';
import { ApiError, launchSkill, type SkillRun } from './api';
import { FallaCorrida } from './FallaCorrida';
import { avisarEncolado } from '../components/eventos';
import { ResponsiveModal } from './ResponsiveModal';
import { VariableField } from './VariableField';
import { SKILL_ICON_COMPONENTS, CATEGORY_TONE, MOSTRAR_MODO_API } from './skill-meta';

type Target = { kind: 'team' | 'chat'; id?: number | null; name?: string | null };

type Props = {
  skill: Skill;
  target: Target;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunched?: (run: SkillRun) => void;
  /** Valores con los que arranca el formulario (los pre-llena la IA al sugerir la skill). */
  initialValues?: Record<string, string>;
  /** Nota de por qué se está sugiriendo esta skill para este chat. */
  reason?: string | null;
};

/**
 * Lanzar una skill: completar el formulario, ver el prompt final y decidir
 * quién lo ejecuta.
 *
 * La vista previa se arma con la MISMA función que usa el servidor
 * (`renderSkillText`), así lo que se copia es exactamente lo que se ejecuta.
 * Los huecos de las variables sin completar se ven como «Etiqueta»: un vacío
 * silencioso produce instrucciones sin sentido y nadie se entera hasta que el
 * conector contesta cualquier cosa.
 *
 * Tres salidas, y las tres dejan rastro menos "Copiar":
 *  - **IA del equipo**: corre acá y devuelve el texto. No tiene tools.
 *  - **Cola de conectores**: la toma Claude/ChatGPT/Grok, que sí tiene tools.
 *  - **Copiar**: para pegar el prompt donde uno quiera.
 */
export function SkillLauncher({ skill, target, open, onOpenChange, onLaunched, initialValues, reason }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    // Lo que la IA ya dedujo del chat gana sobre el default de la skill: por eso
    // se lanza con el precio y el plan que este cliente recibió, no en blanco.
    Object.fromEntries(skill.variables.map((v) => [v.name, initialValues?.[v.name] ?? v.defaultValue ?? ''])),
  );
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState<RunMode | null>(null);
  const [result, setResult] = useState<SkillRun | null>(null);
  const [copied, setCopied] = useState(false);

  const Icon = SKILL_ICON_COMPONENTS[skill.icon];
  const missing = useMemo(() => missingVariables(skill.variables, values), [skill.variables, values]);
  const preview = useMemo(() => {
    const body = renderSkillText(skill.text, skill.variables, values);
    const tools = skill.toolChain.length ? `\n\nTOOLS SUGERIDAS: ${skill.toolChain.join(' → ')}` : '';
    const contexto =
      target.kind === 'chat' && target.id
        ? `\n\nCONTEXTO: chat_id ${target.id}${target.name ? ` (${target.name})` : ''}. Usá whatspro_sales_dossier {chat_id: ${target.id}} si necesitás el historial.`
        : '';
    return [body, extra.trim()].filter(Boolean).join('\n\n') + tools + contexto;
  }, [skill, values, extra, target]);

  const canApi = MOSTRAR_MODO_API && allowsMode(skill, 'api');
  // Con el modo API oculto, la cola tiene que aceptar cualquier skill: si no,
  // una marcada como `api` se quedaría sin ningún botón para lanzarla.
  const canQueue = !MOSTRAR_MODO_API || allowsMode(skill, 'queue');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success('Prompt copiado con los datos ya completados.');
    } catch {
      toast.error('No se pudo copiar.');
    }
  };

  const launch = async (chosen: RunMode) => {
    if (missing.length) {
      toast.error(`Faltan datos: ${missing.map((v) => v.label).join(', ')}.`);
      return;
    }
    setBusy(chosen);
    setResult(null);
    try {
      const { run } = await launchSkill({
        skillId: skill.id,
        text: extra.trim() || null,
        targetKind: target.kind,
        targetId: target.kind === 'chat' ? (target.id ?? null) : null,
        variables: values,
        mode: chosen,
      });
      // Encolada o corrida, el contacto ya tiene algo hecho: las listas de
      // "Pendiente de verificación" lo sacan sin recargarse enteras.
      if (target.kind === 'chat') avisarEncolado(target.id);
      onLaunched?.(run);
      if (chosen === 'api') {
        setResult(run);
        if (run.status === 'failed') toast.error(classifyRunError(run.summary)?.title ?? 'La IA del equipo no pudo ejecutarla.');
        else toast.success('Listo. La respuesta quedó abajo y en la actividad del Studio.');
      } else {
        toast.success('En la cola. La toma el próximo conector que pida trabajo.');
        onOpenChange(false);
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'No se pudo lanzar.';
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', CATEGORY_TONE[skill.category])}>
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 truncate">{skill.title}</span>
        </span>
      }
      description={
        target.kind === 'chat' ? `Sobre ${target.name ?? `el chat ${target.id}`} · ${EXECUTION_LABELS[skill.execution]}` : `Todo el equipo · ${EXECUTION_LABELS[skill.execution]}`
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copy}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            Copiar
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {canQueue && (
              <Button
                type="button"
                variant={canApi ? 'outline' : 'default'}
                size="sm"
                className="gap-1.5"
                disabled={busy !== null || missing.length > 0}
                onClick={() => void launch('queue')}
              >
                {busy === 'queue' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Inbox className="size-4" aria-hidden />}
                A la cola
              </Button>
            )}
            {canApi && (
              <Button type="button" size="sm" className="gap-1.5" disabled={busy !== null || missing.length > 0} onClick={() => void launch('api')}>
                {busy === 'api' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Cpu className="size-4" aria-hidden />}
                Ejecutar con IA
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {reason && (
          <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
            <Sparkles className="mr-1 inline size-3 text-primary" aria-hidden />
            {reason}
          </p>
        )}
        {skill.description && <p className="text-sm text-muted-foreground">{skill.description}</p>}

        {skill.variables.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos de esta corrida</h3>
              {missing.length > 0 && <span className="text-[11px] text-amber-700 dark:text-amber-300">Faltan {missing.length}</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {skill.variables.map((variable) => (
                <VariableField
                  key={variable.name}
                  variable={variable}
                  value={values[variable.name] ?? ''}
                  onChange={(v) => setValues((prev) => ({ ...prev, [variable.name]: v }))}
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <Label htmlFor="skill-extra" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Indicación extra <span className="font-normal normal-case text-muted-foreground">(opcional)</span>
          </Label>
          <Textarea
            id="skill-extra"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            rows={2}
            placeholder="Algo puntual para esta corrida. Ej.: priorizá los que hablaron esta semana."
            className="resize-none text-sm"
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prompt final</h3>
            <span className="text-[11px] text-muted-foreground">{preview.length.toLocaleString('es-AR')} caracteres</span>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
            {preview}
          </pre>
          {MOSTRAR_MODO_API && skill.execution === 'both' && (
            <p className="text-[11px] text-muted-foreground">
              <Sparkles className="mr-1 inline size-3" aria-hidden />
              La IA del equipo contesta al instante pero no tiene tools; la cola tarda más y sí puede leer y escribir en WhatsPro.
            </p>
          )}
        </section>

        {result && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ChevronRight className="size-3.5" aria-hidden />
              Respuesta
            </h3>
            {result.status === 'failed' ? (
              <FallaCorrida run={result} onRetried={(nueva, mode) => { if (mode === 'api') setResult(nueva); else onOpenChange(false); }} />
            ) : (
              <div className="rounded-xl border border-border bg-card p-3 text-sm whitespace-pre-wrap">
                {result.output ?? result.summary ?? 'Sin salida.'}
              </div>
            )}
            {result.output && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  void navigator.clipboard.writeText(result.output ?? '').then(
                    () => toast.success('Respuesta copiada.'),
                    () => toast.error('No se pudo copiar.'),
                  );
                }}
              >
                <Copy className="size-3.5" aria-hidden />
                Copiar respuesta
              </Button>
            )}
          </section>
        )}
      </div>
    </ResponsiveModal>
  );
}
