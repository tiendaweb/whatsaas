'use client';

import { useMemo, useState } from 'react';
import { GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  EXECUTION_LABELS,
  RECURRENCE_LABELS,
  SCOPE_LABELS,
  SKILL_CATEGORIES,
  SKILL_EXECUTIONS,
  SKILL_ICONS,
  SKILL_RECURRENCES,
  SKILL_SCOPES,
  SKILL_VARIABLE_TYPES,
  VARIABLE_TYPE_LABELS,
  extractVariableNames,
  normalizeVariableName,
  type Skill,
  type SkillCategory,
  type SkillExecution,
  type SkillIcon,
  type SkillRecurrence,
  type SkillScope,
  type SkillVariable,
  type SkillVariableType,
} from '../../shared/skills';
import { GATES, SIGNAL_KINDS, type Gate, type SignalKind } from '../../shared/taxonomy';
import { SIGNAL_LABELS } from '../components/format';
import { saveSkill } from './api';
import { ResponsiveModal } from './ResponsiveModal';
import { CATEGORY_TONE, SKILL_ICON_COMPONENTS } from './skill-meta';

type Props = {
  /** `null` = crear una skill nueva. */
  initial: Skill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (skill: Skill) => void;
};

const EMPTY_VARIABLE = (index: number): SkillVariable => ({
  name: `dato_${index + 1}`,
  label: `Dato ${index + 1}`,
  type: 'text',
  required: false,
  placeholder: null,
  help: null,
  defaultValue: null,
});

/**
 * Editor de skills: define qué hace, cómo se usa y qué datos pide.
 *
 * Tres pestañas porque son tres decisiones distintas y mezclarlas en un solo
 * formulario largo hace que nadie llegue al final: el **prompt** (lo que se
 * ejecuta), los **datos** (el formulario que se completa al lanzar) y **cuándo**
 * (rutina o puntual, quién lo ejecuta, en qué chats se recomienda solo).
 *
 * Guardar siempre crea una versión nueva; la anterior queda retirada pero
 * legible, y las corridas viejas siguen apuntando al texto con el que se
 * ejecutaron.
 */
export function SkillEditor({ initial, open, onOpenChange, onSaved }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [category, setCategory] = useState<SkillCategory>(initial?.category ?? 'general');
  const [icon, setIcon] = useState<SkillIcon>(initial?.icon ?? 'sparkles');
  const [recurrence, setRecurrence] = useState<SkillRecurrence>(initial?.recurrence ?? 'on_demand');
  const [execution, setExecution] = useState<SkillExecution>(initial?.execution ?? 'connector');
  const [scope, setScope] = useState<SkillScope>(initial?.scope ?? 'team');
  const [variables, setVariables] = useState<SkillVariable[]>(initial?.variables ?? []);
  const [gates, setGates] = useState<Gate[]>(initial?.recommendFor.gates ?? []);
  const [signals, setSignals] = useState<SignalKind[]>(initial?.recommendFor.signals ?? []);
  const [tools, setTools] = useState(initial?.toolChain.join(', ') ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [saving, setSaving] = useState(false);

  /** Variables escritas en el texto que todavía no están declaradas: se ofrecen para agregar de un toque. */
  const undeclared = useMemo(() => {
    const declared = new Set(variables.map((v) => v.name));
    return extractVariableNames(text).filter((n) => !declared.has(n));
  }, [text, variables]);

  const updateVariable = (index: number, patch: Partial<SkillVariable>) =>
    setVariables((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  const insertVariable = (name: string) => setText((prev) => `${prev}${prev.endsWith('\n') || !prev ? '' : ' '}{{${name}}}`);

  const save = async () => {
    if (title.trim().length < 3) {
      toast.error('El título necesita al menos 3 caracteres.');
      return;
    }
    if (text.trim().length < 5) {
      toast.error('El prompt necesita al menos 5 caracteres.');
      return;
    }
    setSaving(true);
    try {
      const skill = await saveSkill({
        key: initial?.key ?? null,
        title: title.trim(),
        text: text.trim(),
        description: description.trim() || null,
        category,
        icon,
        recurrence,
        execution,
        scope,
        variables,
        recommendFor: { gates: gates.length ? gates : undefined, signals: signals.length ? signals : undefined },
        toolChain: tools.split(',').map((t) => t.trim()).filter(Boolean),
        pinned,
      });
      toast.success(initial ? `Guardada como v${skill.version}.` : 'Skill creada.');
      onSaved(skill);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? `Editar · ${initial.title}` : 'Nueva skill'}
      description={initial ? `v${initial.version} · ${initial.key} · guardar crea una versión nueva` : 'Un prompt guardado que cualquiera del equipo —o un conector— puede lanzar'}
      footer={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={pinned} onCheckedChange={setPinned} />
            Fijar arriba
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="gap-1.5" disabled={saving} onClick={() => void save()}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      }
    >
      <Tabs defaultValue="prompt" className="space-y-4">
        <TabsList className="h-9 w-full justify-start">
          <TabsTrigger value="prompt" className="text-xs">
            Prompt
          </TabsTrigger>
          <TabsTrigger value="datos" className="text-xs">
            Datos{variables.length > 0 ? ` (${variables.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="cuando" className="text-xs">
            Cuándo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompt" className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="skill-title" className="text-xs">
              Título
            </Label>
            <Input id="skill-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Reactivar G4 con precio conocido" className="h-9" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skill-desc" className="text-xs">
              Qué hace <span className="text-muted-foreground">(una línea, es lo que se lee en la tarjeta)</span>
            </Label>
            <Input
              id="skill-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Redacta un mensaje que retoma el precio que ya recibió."
              className="h-9"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as SkillCategory)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ícono</Label>
              <div className="flex flex-wrap gap-1">
                {SKILL_ICONS.map((name) => {
                  const Icon = SKILL_ICON_COMPONENTS[name];
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setIcon(name)}
                      aria-label={name}
                      aria-pressed={icon === name}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-lg border transition-colors',
                        icon === name ? cn('border-transparent', CATEGORY_TONE[category]) : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skill-text" className="text-xs">
              Prompt <span className="text-muted-foreground">(se ejecuta tal cual; usá {'{{variable}}'} para los datos)</span>
            </Label>
            <Textarea
              id="skill-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="font-mono text-xs"
              placeholder="Instrucciones para quien la ejecute. Podés citar tools whatspro_* y las reglas del Command Center."
            />
            {variables.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-[11px] text-muted-foreground">Insertar:</span>
                {variables.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => insertVariable(v.name)}
                    className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {`{{${v.name}}}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skill-tools" className="text-xs">
              Cadena de tools sugerida <span className="text-muted-foreground">(opcional, separada por comas)</span>
            </Label>
            <Input
              id="skill-tools"
              value={tools}
              onChange={(e) => setTools(e.target.value)}
              placeholder="whatspro_sales_dossier, whatspro_sales_classification_write"
              className="h-9 font-mono text-xs"
            />
          </div>
        </TabsContent>

        <TabsContent value="datos" className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Cada dato es un campo del formulario que aparece al lanzar la skill, y una variable{' '}
            <code className="rounded bg-muted px-1 font-mono text-[11px]">{'{{nombre}}'}</code> dentro del prompt. Los conectores reciben este mismo formulario y lo completan ellos.
          </p>

          {undeclared.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                El prompt usa variables sin declarar. Sin declararlas nadie sabe qué hay que completar:
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {undeclared.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      setVariables((prev) => [...prev, { ...EMPTY_VARIABLE(prev.length), name, label: name.replace(/_/g, ' ') }])
                    }
                    className="rounded-full border border-amber-500/40 px-2 py-0.5 font-mono text-[10px] text-amber-800 hover:bg-amber-500/10 dark:text-amber-200"
                  >
                    + {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {variables.map((variable, index) => (
              <VariableRow
                key={index}
                variable={variable}
                onChange={(patch) => updateVariable(index, patch)}
                onRemove={() => setVariables((prev) => prev.filter((_, i) => i !== index))}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setVariables((prev) => [...prev, EMPTY_VARIABLE(prev.length)])}
          >
            <Plus className="size-4" aria-hidden />
            Agregar dato
          </Button>
        </TabsContent>

        <TabsContent value="cuando" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Frecuencia</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as SkillRecurrence)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_RECURRENCES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RECURRENCE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {recurrence === 'on_demand' ? 'Se lanza cuando alguien la pide.' : 'Rutina: los conectores la pueden correr solos con esa cadencia.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Quién la ejecuta</Label>
              <Select value={execution} onValueChange={(v) => setExecution(v as SkillExecution)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_EXECUTIONS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {EXECUTION_LABELS[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {execution === 'api'
                  ? 'El servidor la corre y devuelve texto. No tiene tools: sirve para redactar, resumir o analizar.'
                  : execution === 'connector'
                    ? 'Va a la cola. La toma un conector, que sí puede leer y escribir en WhatsPro.'
                    : 'Se elige al lanzar, según haga falta o no usar tools.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Sobre qué se lanza</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as SkillScope)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCOPE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <section className="space-y-2">
            <div>
              <Label className="text-xs">Recomendar como siguiente acción</Label>
              <p className="text-[11px] text-muted-foreground">
                En la ficha de un chat, la skill aparece sola cuando el contacto está en uno de estos gates o acaba de mandar una de estas señales.
                {scope === 'team' && <span className="text-amber-700 dark:text-amber-300"> Necesita que se pueda lanzar sobre un chat.</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {GATES.map((gate) => (
                <Chip key={gate} active={gates.includes(gate)} onClick={() => setGates((prev) => (prev.includes(gate) ? prev.filter((g) => g !== gate) : [...prev, gate]))}>
                  {gate}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {SIGNAL_KINDS.map((kind) => (
                <Chip key={kind} active={signals.includes(kind)} onClick={() => setSignals((prev) => (prev.includes(kind) ? prev.filter((s) => s !== kind) : [...prev, kind]))}>
                  {SIGNAL_LABELS[kind] ?? kind}
                </Chip>
              ))}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </ResponsiveModal>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
        active ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function VariableRow({ variable, onChange, onRemove }: { variable: SkillVariable; onChange: (patch: Partial<SkillVariable>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <GripVertical className="mt-2 size-4 shrink-0 text-muted-foreground/50" aria-hidden />
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Etiqueta</Label>
            <Input
              value={variable.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Precio acordado"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Variable</Label>
            <Input
              value={variable.name}
              onChange={(e) => onChange({ name: normalizeVariableName(e.target.value) })}
              placeholder="precio_acordado"
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Tipo</Label>
            <Select value={variable.type} onValueChange={(v) => onChange({ type: v as SkillVariableType })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKILL_VARIABLE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {VARIABLE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Ayuda / placeholder</Label>
            <Input
              value={variable.placeholder ?? ''}
              onChange={(e) => onChange({ placeholder: e.target.value || null })}
              placeholder="Lo que se ve dentro del campo"
              className="h-8 text-sm"
            />
          </div>
          {variable.type === 'select' && (
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Opciones (separadas por comas)</Label>
              <Input
                value={(variable.options ?? []).join(', ')}
                onChange={(e) => onChange({ options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                placeholder="Combo Full, Tienda, Sitio, Publicidad"
                className="h-8 text-sm"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
            <Switch checked={variable.required} onCheckedChange={(checked) => onChange({ required: checked })} />
            Obligatorio — sin este dato no se puede lanzar
          </label>
        </div>
        <button type="button" onClick={onRemove} className="mt-1 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Quitar ${variable.label}`}>
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
