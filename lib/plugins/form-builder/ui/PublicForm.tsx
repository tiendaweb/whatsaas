'use client';

import { FormEvent, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { FormField, FormStyle } from '../server/schema';

type PublicFormProps = {
  form: {
    publicId: string;
    name: string;
    description: string | null;
    fields: FormField[];
    style: FormStyle;
    submitButtonLabel: string;
    successMessage: string;
  };
};

export function PublicForm({ form }: PublicFormProps) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const accent = form.style.accentColor || undefined;
  const textColor = form.style.textColor || undefined;
  const background = form.style.background || undefined;
  const radius = form.style.borderRadius === 'none' ? 'rounded-none' : form.style.borderRadius === 'small' ? 'rounded-md' : form.style.borderRadius === 'large' ? 'rounded-2xl' : 'rounded-xl';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/forms/${form.publicId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar.');
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo enviar.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-background px-4 py-10" style={{ background }}>
        <div className={cn('mx-auto max-w-xl border bg-card p-6 text-center', radius)} style={{ color: textColor }}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Send className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">{form.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{form.successMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10" style={{ background }}>
      <form onSubmit={submit} className={cn('mx-auto max-w-xl border bg-card p-6 space-y-5', radius)} style={{ color: textColor }}>
        <div>
          <h1 className="text-2xl font-bold">{form.name}</h1>
          {form.description && <p className="mt-2 text-sm text-muted-foreground">{form.description}</p>}
        </div>

        {form.fields.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}{field.required ? ' *' : ''}</Label>
            <FieldInput
              field={field}
              value={data[field.key]}
              onChange={(value) => setData((current) => ({ ...current, [field.key]: value }))}
            />
          </div>
        ))}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" disabled={submitting} className="w-full gap-2" style={accent ? { backgroundColor: accent, borderColor: accent } : undefined}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {form.submitButtonLabel}
        </Button>
      </form>
    </main>
  );
}

function FieldInput(props: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { field, value, onChange } = props;

  if (field.type === 'textarea') {
    return (
      <Textarea
        id={field.key}
        required={field.required}
        placeholder={field.placeholder}
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <Select value={String(value ?? '')} onValueChange={onChange}>
        <SelectTrigger id={field.key}>
          <SelectValue placeholder={field.placeholder || 'Selecciona una opcion'} />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked === true)} />
        {field.placeholder || field.label}
      </label>
    );
  }

  return (
    <Input
      id={field.key}
      required={field.required}
      type={field.type === 'phone' ? 'tel' : field.type}
      placeholder={field.placeholder}
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
