'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Cpu, Inbox, Loader2, MessageSquare, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  EXECUTION_LABELS,
  RECURRENCE_LABELS,
  allowsMode,
  allowsTarget,
  missingVariables,
  renderSkillText,
  type RunMode,
  type Skill,
} from '../../shared/skills';
import { classifyRunError } from '../../shared/run-errors';
import { ApiError, launchSkill, type SkillRun } from '../skills/api';
import { FallaCorrida } from '../skills/FallaCorrida';
import { VariableField } from '../skills/VariableField';
import { CATEGORY_TONE, MOSTRAR_MODO_API, SKILL_ICON_COMPONENTS } from '../skills/skill-meta';

type Props = {
  skills: Skill[];
  /** Skill abierta. La manda el shell para que el rail y la URL manden lo mismo. */
  seleccionada: Skill | null;
  onSeleccionar: (skill: Skill) => void;
  onEditar: (skill: Skill) => void;
  onLanzada: () => void;
};

/**
 * Componer: armar la corrida de una skill viendo el prompt final al lado.
 *
 * Es la pantalla que la maqueta llama "organizador de prompts" y resuelve algo
 * que el modal de Lanzar hacía apretado: con seis variables, el formulario y la
 * vista previa no entran juntos y uno completa a ciegas. Acá los datos están a
 * la izquierda y el texto resultante a la derecha, fijo, actualizándose con
 * cada tecla.
 *
 * La vista previa usa `renderSkillText`, la MISMA función que el servidor: lo
 * que se lee es exactamente lo que se va a ejecutar. Las variables sin
 * completar se ven como «Etiqueta» en vez de quedar vacías, porque un hueco
 * silencioso se cuela hasta el conector.
 */
export function ComponerView({ skills, seleccionada, onSeleccionar, onEditar, onLanzada }: Props) {
  const [query, setQuery] = useState('');

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) => `${s.title} ${s.description ?? ''} ${s.key}`.toLowerCase().includes(q));
  }, [skills, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      {/* Selector de skill. En el teléfono es una fila que scrollea; en el
          escritorio, la columna de la maqueta. */}
      <div className="flex shrink-0 flex-col gap-2 lg:w-[250px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="h-9 pl-8 text-sm" aria-label="Buscar una skill" />
        </div>
        <div className="flex max-h-[38vh] gap-1 overflow-x-auto pb-1 lg:max-h-none lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
          {lista.map((skill) => {
            const Icon = SKILL_ICON_COMPONENTS[skill.icon];
            const active = seleccionada?.id === skill.id;
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => onSeleccionar(skill)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[12.5px] transition-colors lg:w-full lg:shrink',
                  active ? 'bg-[var(--ps-accent-wash)] font-semibold text-foreground' : 'text-muted-foreground hover:bg-white/5',
                )}
              >
                <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{skill.title}</span>
                {skill.variables.length > 0 && (
                  <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--ps-dim)]">{skill.variables.length}</span>
                )}
              </button>
            );
          })}
          {lista.length === 0 && <p className="px-2 py-3 text-[11px] text-muted-foreground">Ninguna skill con ese nombre.</p>}
        </div>
      </div>

      {!seleccionada && (
        <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-border p-10 text-center">
          <div>
            <p className="text-sm font-medium">Elegí una skill</p>
            <p className="mt-1 text-xs text-muted-foreground">Completás los datos de un lado y ves el prompt final del otro.</p>
          </div>
        </div>
      )}

      {seleccionada && (
        /* `key`: el formulario vive adentro y se remonta al cambiar de skill.
           Con un efecto que reseteaba los valores, cualquier revalidación de
           SWR traía un objeto nuevo y borraba lo que se estaba escribiendo. */
        <PanelDeSkill key={seleccionada.id} skill={seleccionada} onEditar={onEditar} onLanzada={onLanzada} />
      )}
    </div>
  );
}

/**
 * El panel de una skill: formulario a la izquierda, prompt final a la derecha.
 *
 * Tiene su propio estado —valores, indicación extra, resultado— y se remonta
 * entero cuando cambia la skill, así los datos de una no se cuelan en otra.
 */
function PanelDeSkill({ skill, onEditar, onLanzada }: { skill: Skill; onEditar: (skill: Skill) => void; onLanzada: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(skill.variables.map((v) => [v.name, v.defaultValue ?? ''])),
  );
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState<RunMode | null>(null);
  const [result, setResult] = useState<SkillRun | null>(null);
  const [copied, setCopied] = useState(false);

  const missing = useMemo(() => missingVariables(skill.variables, values), [skill.variables, values]);

  const preview = useMemo(() => {
    const body = renderSkillText(skill.text, skill.variables, values);
    const tools = skill.toolChain.length ? `\n\nTOOLS SUGERIDAS: ${skill.toolChain.join(' → ')}` : '';
    return [body, extra.trim()].filter(Boolean).join('\n\n') + tools;
  }, [skill, values, extra]);

  // El servidor rechaza lanzar una skill de chat contra el equipo, así que acá
  // ni se ofrece: se arma el texto, se copia, y se lanza desde la ficha.
  const paraElEquipo = allowsTarget(skill, 'team');
  const canApi = MOSTRAR_MODO_API && paraElEquipo && allowsMode(skill, 'api');
  const canQueue = paraElEquipo && (!MOSTRAR_MODO_API || allowsMode(skill, 'queue'));

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success('Prompt copiado con los datos ya completados.');
    } catch {
      toast.error('No se pudo copiar.');
    }
  };

  const lanzar = async (mode: RunMode) => {
    if (missing.length) {
      toast.error(`Faltan datos: ${missing.map((v) => v.label).join(', ')}.`);
      return;
    }
    setBusy(mode);
    setResult(null);
    try {
      const { run } = await launchSkill({
        skillId: skill.id,
        text: extra.trim() || null,
        targetKind: 'team',
        targetId: null,
        variables: values,
        mode,
      });
      onLanzada();
      if (mode === 'api') {
        setResult(run);
        if (run.status === 'failed') toast.error(classifyRunError(run.summary)?.title ?? 'La IA del equipo no pudo ejecutarla.');
        else toast.success('Listo. La respuesta quedó abajo y en Actividad.');
      } else {
        toast.success('En la cola. La toma el próximo conector que pida trabajo.');
      }
    } catch (error) {
      toast.error(error instanceof ApiError || error instanceof Error ? error.message : 'No se pudo lanzar.');
    } finally {
      setBusy(null);
    }
  };

  const Icon = SKILL_ICON_COMPONENTS[skill.icon];

  return (
    <div className="min-w-0 flex-1 space-y-4">
      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', CATEGORY_TONE[skill.category])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight">{skill.title}</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {CATEGORY_LABELS[skill.category]} · {RECURRENCE_LABELS[skill.recurrence]} · {EXECUTION_LABELS[skill.execution]} · v{skill.version}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onEditar(skill)}>
          <SlidersHorizontal className="size-4" aria-hidden />
          Editar skill
        </Button>
      </header>

      {skill.description && <p className="text-sm text-muted-foreground">{skill.description}</p>}

      {!paraElEquipo && (
        <p className="flex items-start gap-2 rounded-xl border border-[var(--ps-line-strong)] bg-[var(--ps-accent-wash)] px-3 py-2 text-xs">
          <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-[var(--ps-accent-soft)]" aria-hidden />
          Esta skill es de un chat: acá se arma y se copia el texto, pero para lanzarla contra un contacto se usa el botón de la ficha, en el Command Center.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Completá los campos</h3>
            {missing.length > 0 && <span className="text-[11px] text-amber-300">Faltan {missing.length}</span>}
          </div>
          {skill.variables.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
              Esta skill no pide datos: el texto sale tal cual está guardado.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {skill.variables.map((variable) => (
              <VariableField
                key={variable.name}
                idPrefix="componer"
                variable={variable}
                value={values[variable.name] ?? ''}
                onChange={(v) => setValues((prev) => ({ ...prev, [variable.name]: v }))}
              />
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="componer-extra" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Indicación extra <span className="font-normal normal-case tracking-normal">(opcional)</span>
            </Label>
            <Textarea
              id="componer-extra"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={2}
              placeholder="Algo puntual para esta corrida. Ej.: priorizá los que hablaron esta semana."
              className="resize-none text-sm"
            />
          </div>
        </section>

        <section className="space-y-2 xl:sticky xl:top-0 xl:self-start">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Prompt final</h3>
            <span className="text-[11px] text-[var(--ps-dim)]">{preview.length.toLocaleString('es-AR')} caracteres</span>
          </div>
          <pre className="max-h-[46vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--ps-line-strong)] bg-card p-3.5 font-mono text-[12px] leading-relaxed text-foreground/90">
            {preview}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copiar()}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              Copiar
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {canQueue && (
                <Button type="button" variant={canApi ? 'outline' : 'default'} size="sm" className="gap-1.5" disabled={busy !== null || missing.length > 0} onClick={() => void lanzar('queue')}>
                  {busy === 'queue' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Inbox className="size-4" aria-hidden />}
                  A la cola
                </Button>
              )}
              {canApi && (
                <Button type="button" size="sm" className="gap-1.5" disabled={busy !== null || missing.length > 0} onClick={() => void lanzar('api')}>
                  {busy === 'api' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Cpu className="size-4" aria-hidden />}
                  Ejecutar con IA
                </Button>
              )}
            </div>
          </div>

          {result && (
            <div className="space-y-2 pt-1">
              <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Sparkles className="size-3.5" aria-hidden />
                Respuesta
              </h4>
              {result.status === 'failed' ? (
                <FallaCorrida run={result} onRetried={(nueva, mode) => (mode === 'api' ? setResult(nueva) : setResult(null))} />
              ) : (
                <div className="whitespace-pre-wrap rounded-xl border border-border bg-card p-3 text-sm">{result.output ?? result.summary ?? 'Sin salida.'}</div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
