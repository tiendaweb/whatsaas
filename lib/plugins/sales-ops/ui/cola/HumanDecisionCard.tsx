'use client';

import { useState } from 'react';
import { ArrowRight, Bot, Check, CircleHelp, Code2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { HumanDecisionField } from '../../shared/human-decision';
import { answerRun, type SkillRun } from '../skills/api';
import { tiempoRelativo } from '../components/format';

const OTHER = '__human_other__';

type Props = {
  run: Pick<SkillRun, 'id' | 'connector' | 'humanRequest' | 'humanRequestedAt'>;
  onAnswered: (run: SkillRun) => void;
};

/**
 * Decisión humana generada por el conector.
 *
 * Cada campo se dibuja desde un contrato acotado, nunca desde HTML del modelo.
 * Al enviar, la API valida otra vez las opciones y devuelve la misma corrida a
 * la cola con la respuesta anexada al prompt original.
 */
export function HumanDecisionCard({ run, onAnswered }: Props) {
  const t = useTranslations('SalesOpsHumanDecision');
  const request = run.humanRequest;
  const [values, setValues] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!request) return null;

  const setValue = (id: string, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
    setErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const choose = (field: HumanDecisionField, value: string) => {
    const isOther = value === OTHER;
    setOther((current) => ({ ...current, [field.id]: isOther }));
    setValue(field.id, isOther ? '' : value);
  };

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    for (const field of request.fields) {
      if (field.required && !(values[field.id] ?? '').trim()) nextErrors[field.id] = t('requiredError');
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const updated = await answerRun(run.id, values);
      toast.success(t('answeredSuccess'));
      onAnswered(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  // `connector` es el valor con el que la tool MCP cierra cuando el conector
  // no dijo quién es: mostrarlo literal era leer "connector" en la tarjeta.
  const connector = run.connector && run.connector !== 'pending' && run.connector !== 'connector' ? run.connector : 'el conector';

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.035]">
      <div className="flex items-start gap-3 border-b border-primary/15 bg-primary/[0.055] px-3 py-3 sm:px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <CircleHelp className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{t('eyebrow')}</p>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Bot className="size-3" aria-hidden />
              {connector}
            </span>
          </div>
          <h3 className="mt-1 text-base font-semibold leading-snug text-foreground">{request.title}</h3>
          {request.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{request.description}</p>}
          {run.humanRequestedAt && <p className="mt-1 text-[10px] text-muted-foreground">{t('requestedAt', { time: tiempoRelativo(run.humanRequestedAt) })}</p>}
        </div>
      </div>

      <div className="space-y-5 px-3 py-4 sm:px-4">
        {request.fields.map((field) => (
          <DecisionField
            key={field.id}
            field={field}
            value={values[field.id] ?? ''}
            other={Boolean(other[field.id])}
            error={errors[field.id]}
            disabled={submitting}
            onChoose={(value) => choose(field, value)}
            onChange={(value) => setValue(field.id, value)}
            t={t}
          />
        ))}

        <div className="flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('resumeHint')}</p>
          <Button type="button" size="sm" className="min-h-10 w-full shrink-0 gap-2 sm:w-auto" disabled={submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
            {submitting ? t('sending') : request.submitLabel || t('submitDefault')}
          </Button>
        </div>
      </div>
    </section>
  );
}

function DecisionField({
  field,
  value,
  other,
  error,
  disabled,
  onChoose,
  onChange,
  t,
}: {
  field: HumanDecisionField;
  value: string;
  other: boolean;
  error?: string;
  disabled: boolean;
  onChoose: (value: string) => void;
  onChange: (value: string) => void;
  t: ReturnType<typeof useTranslations<'SalesOpsHumanDecision'>>;
}) {
  const fieldId = `human-decision-${field.id}`;
  const optionValue = other ? OTHER : value;

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <div>
        <legend className="text-xs font-semibold text-foreground">
          {field.label}
          {field.required && <span className="text-destructive" aria-hidden>*</span>}
        </legend>
        {field.description && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{field.description}</p>}
      </div>

      {field.type === 'buttons' && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {field.options?.map((option) => {
            const selected = !other && value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChoose(option.value)}
                className={cn(
                  'min-h-11 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-foreground hover:bg-muted',
                )}
              >
                <span className="flex items-center gap-2 text-xs font-medium">
                  <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                    {selected && <Check className="size-2.5" aria-hidden />}
                  </span>
                  {option.label}
                </span>
                {option.description && <span className="mt-1 block pl-6 text-[10px] leading-relaxed text-muted-foreground">{option.description}</span>}
              </button>
            );
          })}
          {field.allowOther && (
            <button
              type="button"
              aria-pressed={other}
              onClick={() => onChoose(OTHER)}
              className={cn(
                'min-h-11 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                other ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-foreground hover:bg-muted',
              )}
            >
              {t('otherOption')}
            </button>
          )}
        </div>
      )}

      {field.type === 'select' && (
        <Select value={optionValue || undefined} onValueChange={onChoose} disabled={disabled}>
          <SelectTrigger id={fieldId} className="w-full bg-background" aria-invalid={Boolean(error)}>
            <SelectValue placeholder={field.placeholder || t('chooseOption')} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            {field.allowOther && <SelectItem value={OTHER}>{t('otherOption')}</SelectItem>}
          </SelectContent>
        </Select>
      )}

      {(field.type === 'text' || ((field.type === 'buttons' || field.type === 'select') && other)) && (
        <Input
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={other ? t('otherPlaceholder') : field.placeholder}
          aria-invalid={Boolean(error)}
          maxLength={12_000}
          autoComplete="off"
        />
      )}

      {field.type === 'textarea' && (
        <Textarea id={fieldId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} rows={5} className="resize-y bg-background" aria-invalid={Boolean(error)} maxLength={12_000} />
      )}

      {field.type === 'code' && (
        <div className="overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
            <Code2 className="size-3" aria-hidden />
            {field.language || t('codeLabel')}
          </div>
          <Textarea id={fieldId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} rows={8} className="rounded-none border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0" aria-invalid={Boolean(error)} maxLength={12_000} spellCheck={false} />
        </div>
      )}

      {error && <p className="text-[11px] text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}
