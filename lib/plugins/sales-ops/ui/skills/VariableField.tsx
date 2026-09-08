'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { SkillVariable } from '../../shared/skills';

/**
 * Un campo del formulario de una skill, según el tipo declarado.
 *
 * Vive aparte del lanzador porque ahora hay dos lugares que piden los mismos
 * datos con las mismas reglas: el modal de "Lanzar" y el panel Componer del
 * Prompt Studio. Dos copias del formulario serían dos criterios distintos para
 * lo mismo (qué es obligatorio, cómo se guarda un booleano) y la que quedara
 * desactualizada mandaría al servidor valores que el render no espera.
 *
 * `boolean` se guarda como `sí`/`no` en texto, no como true/false: el valor
 * termina interpolado dentro del prompt, y ahí lo que se lee es la palabra.
 */
export function VariableField({
  variable,
  value,
  onChange,
  idPrefix = 'var',
}: {
  variable: SkillVariable;
  value: string;
  onChange: (value: string) => void;
  /** Distingue los ids cuando dos formularios de la misma skill conviven en la pantalla. */
  idPrefix?: string;
}) {
  const id = `${idPrefix}-${variable.name}`;
  const label = (
    <Label htmlFor={id} className="text-xs">
      {variable.label}
      {variable.required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  );
  const help = variable.help ? <p className="text-[11px] text-muted-foreground">{variable.help}</p> : null;

  if (variable.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 sm:col-span-2">
        <div className="min-w-0">
          {label}
          {help}
        </div>
        <Switch id={id} checked={value === 'sí'} onCheckedChange={(checked) => onChange(checked ? 'sí' : 'no')} />
      </div>
    );
  }

  if (variable.type === 'select') {
    return (
      <div className="space-y-1.5">
        {label}
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-9 text-sm">
            <SelectValue placeholder={variable.placeholder ?? 'Elegí una opción'} />
          </SelectTrigger>
          <SelectContent>
            {(variable.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {help}
      </div>
    );
  }

  if (variable.type === 'textarea') {
    return (
      <div className="space-y-1.5 sm:col-span-2">
        {label}
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={variable.placeholder ?? ''} className="resize-none text-sm" />
        {help}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {label}
      <Input
        id={id}
        type={variable.type === 'number' ? 'number' : variable.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={variable.placeholder ?? ''}
        className="h-9 text-sm"
      />
      {help}
    </div>
  );
}
